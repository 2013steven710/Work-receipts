import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error plain JS test helper
import { createFakeCloud } from "../../../scripts/fake-cloud.mjs";
import { CloudAuthError, type CloudDrive } from "../lib/cloud/drive";
import { googleDrive } from "../lib/cloud/google";
import { oneDrive } from "../lib/cloud/microsoft";
import { syncCloud } from "../lib/cloudsync";
import { monthOf, type Receipt, Store } from "../lib/store";

// The real Google Drive and OneDrive clients against a stand-in server, with two separate phones
// (each its own IndexedDB) for the same account.

const ACCOUNT = "aaaaaaaa-0000-4000-8000-000000000001";
const fake = createFakeCloud();
let base = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((resolve) => fake.server.close(resolve)));
beforeEach(async () => {
  await fetch(`${base}/__reset`);
});

/** A phone: its own IndexedDB. */
async function phone(): Promise<{ use<T>(fn: (store: Store) => Promise<T>): Promise<T> }> {
  const factory = new IDBFactory();
  return {
    async use(fn) {
      const previous = globalThis.indexedDB;
      globalThis.indexedDB = factory;
      const store = await Store.open(ACCOUNT);
      try {
        return await fn(store);
      } finally {
        store.close();
        globalThis.indexedDB = previous;
      }
    },
  };
}

const drives: Record<string, (token: () => Promise<string>) => CloudDrive> = {
  google: (t) => googleDrive(`${base}/google`, t),
  microsoft: (t) => oneDrive(`${base}/graph`, t),
};

async function state(): Promise<{ provider: string; path: string; size: number; text?: string }[]> {
  return (await fetch(`${base}/__state`)).json();
}

function receipt(n: number, bytes = 50): Receipt {
  const createdAt = new Date(2026, 9, n, 9, 0).toISOString();
  return {
    id: `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`,
    accountId: ACCOUNT,
    createdAt,
    month: monthOf(new Date(createdAt)),
    kind: "receipt",
    cardType: "personal",
    categoryId: "meals",
    contentType: "image/jpeg",
    data: new Uint8Array(bytes).fill(n).buffer,
  };
}

for (const kind of ["google", "microsoft"] as const) {
  describe(`sync with ${kind === "google" ? "Google Drive" : "OneDrive"}`, () => {
    const token = async () => fake.issue();
    const drive = () => drives[kind]!(token);

    it("uploads each receipt as a photo plus a details file, in its month's folder", async () => {
      const a = await phone();
      const result = await a.use(async (s) => {
        await s.put(receipt(1));
        await s.put(receipt(2, 70_000));
        return syncCloud(s, drive());
      });
      expect(result).toMatchObject({ pushed: 2 });
      const files = (await state()).filter((f) => f.provider === kind).map((f) => `${f.path}:${f.size}`).sort();
      const root = kind === "google" ? "ClaimTidy" : "ClaimTidy";
      expect(files).toEqual([
        `${root}/Receipts/2026-10/${receipt(1).id}.jpg:50`,
        `${root}/Receipts/2026-10/${receipt(1).id}.json:${files[1]!.split(":")[1]}`,
        `${root}/Receipts/2026-10/${receipt(2).id}.jpg:70000`,
        `${root}/Receipts/2026-10/${receipt(2).id}.json:${files[3]!.split(":")[1]}`,
      ]);
      // A second sync has nothing to do.
      expect(await a.use((s) => syncCloud(s, drive()))).toMatchObject({ pushed: 0, pulled: 0, removed: 0 });
    });

    it("restores on a new phone, then edits and deletions travel both ways", async () => {
      const a = await phone();
      const b = await phone();
      await a.use(async (s) => {
        await s.put(receipt(3));
        await s.put(receipt(4));
        await s.updateSettings((x) => {
          x.categories = [...x.categories, { id: "parking", name: "Parking", icon: "car", colour: "#000000" }];
          x.settingsDirty = true;
        });
        await syncCloud(s, drive());
      });

      // New phone: details and categories arrive; photos stay in the cloud until needed.
      expect(await b.use((s) => syncCloud(s, drive()))).toMatchObject({ pulled: 2 });
      const restored = await b.use((s) => s.list());
      expect(restored.map((r) => r.id).sort()).toEqual([receipt(3).id, receipt(4).id].sort());
      expect(restored.every((r) => r.data === undefined && r.cloud?.photoId)).toBe(true);
      expect((await b.use((s) => s.settings())).categories.some((c) => c.id === "parking")).toBe(true);

      // B changes a category; A picks it up.
      await b.use(async (s) => {
        const r = (await s.get(receipt(3).id))!;
        await s.put({ ...r, categoryId: "parking", dirty: true });
        await syncCloud(s, drive());
      });
      await a.use((s) => syncCloud(s, drive()));
      expect((await a.use((s) => s.get(receipt(3).id)))?.categoryId).toBe("parking");

      // A deletes one; B removes it at its next sync, and the photo is gone from the cloud.
      await a.use(async (s) => {
        const r = (await s.get(receipt(4).id))!;
        await s.put({ ...r, deleted: true });
        await syncCloud(s, drive());
      });
      expect(await b.use((s) => syncCloud(s, drive()))).toMatchObject({ removed: 1 });
      expect((await b.use((s) => s.list())).map((r) => r.id)).toEqual([receipt(3).id]);
      expect((await state()).some((f) => f.path.endsWith(`${receipt(4).id}.jpg`))).toBe(false);
    });

    it("never deletes from the phone when the cloud copy goes missing; it uploads again", async () => {
      const a = await phone();
      await a.use(async (s) => {
        await s.put(receipt(5));
        await syncCloud(s, drive());
      });
      await fetch(`${base}/__reset`); // the user deleted the ClaimTidy folder
      await a.use((s) => syncCloud(s, drive()));
      expect((await a.use((s) => s.list())).map((r) => r.id)).toEqual([receipt(5).id]);
      await a.use((s) => syncCloud(s, drive()));
      expect((await state()).filter((f) => f.provider === kind).length).toBe(2);
    });

    it("stops cleanly when access was revoked, keeping everything on the phone", async () => {
      const a = await phone();
      const revoked = drives[kind]!(async () => {
        throw new CloudAuthError();
      });
      const result = await a.use(async (s) => {
        await s.put(receipt(6));
        return syncCloud(s, revoked);
      });
      expect(result.stoppedBecause).toBe("reauth");
      expect((await a.use((s) => s.list())).length).toBe(1);
    });
  });
}

describe("interrupted uploads", () => {
  it("reuses files an interrupted sync already uploaded, so nothing is duplicated", async () => {
    const a = await phone();
    const drive = googleDrive(`${base}/google`, async () => fake.issue());
    // An earlier sync uploaded the photo, then the app closed before recording it.
    await a.use(async (s) => {
      const r = receipt(7);
      await s.put(r);
      const folder = await drive.folder(["Receipts", r.month]);
      await drive.upload(folder, `${r.id}.jpg`, new Blob([r.data!], { type: "image/jpeg" }));
    });
    await a.use((s) => syncCloud(s, drive));
    const files = (await state()).filter((f) => f.path.includes(receipt(7).id));
    expect(files.map((f) => f.path.split("/").pop()).sort()).toEqual([`${receipt(7).id}.jpg`, `${receipt(7).id}.json`]);
  });
});
