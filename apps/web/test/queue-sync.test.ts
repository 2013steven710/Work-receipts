import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { Queue, type QueuedItem } from "../lib/queue.js";
import { syncQueue } from "../lib/sync.js";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

function item(accountId: string, n: number): QueuedItem {
  return {
    clientUuid: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    accountId,
    region: "au",
    createdAt: new Date(2026, 9, 6, 0, n).toISOString(),
    kind: "receipt",
    cardType: "personal",
    categoryId: null,
    contentType: "image/jpeg",
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  };
}

/** A fake API + storage that records every call. */
function fakeServer(opts: { entriesStatus?: number[]; failPutOnce?: boolean } = {}) {
  const calls: { url: string; body?: unknown }[] = [];
  const entries = new Map<string, string>();
  const statuses = [...(opts.entriesStatus ?? [])];
  let failPut = opts.failPutOnce ?? false;
  const doFetch = (async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/v1/uploads")) {
      return Response.json({ path: `${body.clientUuid}/x.jpg`, token: "t" });
    }
    if (url.includes("/storage/v1/")) {
      if (failPut) {
        failPut = false;
        throw new TypeError("network down");
      }
      return new Response("{}", { status: 200 });
    }
    if (url.endsWith("/v1/entries")) {
      const status = statuses.shift() ?? 201;
      if (status >= 400) return Response.json({ error: status === 400 ? "bad_category" : "boom" }, { status });
      const id = entries.get(body.clientUuid) ?? `entry-${entries.size + 1}`;
      entries.set(body.clientUuid, id);
      return Response.json({ id, created: true }, { status });
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  return { calls, entries, doFetch };
}

const target = (accountId: string) => ({
  accountId,
  region: "au",
  apiUrl: "http://api",
  supabaseUrl: "http://sb",
  accessToken: async () => "token",
});

describe("offline queue", () => {
  it("keeps each account's items in its own database", async () => {
    const qa = await Queue.open(A, "au");
    const qb = await Queue.open(B, "au");
    expect(qa.name).not.toBe(qb.name);
    await qa.add(item(A, 1));
    expect(await qb.count()).toBe(0);
    await expect(qb.add(item(A, 2))).rejects.toThrow();
    await qa.remove(item(A, 1).clientUuid);
    qa.close();
    qb.close();
  });

  it("uploads in order and empties the queue; nothing of A's reaches B", async () => {
    const qa = await Queue.open(A, "au");
    for (let i = 10; i < 15; i++) await qa.add(item(A, i));
    qa.close();

    const forB = fakeServer();
    expect(await syncQueue(target(B), forB.doFetch)).toEqual({ synced: 0, remaining: 0 });
    expect(forB.calls).toHaveLength(0);

    const forA = fakeServer();
    const result = await syncQueue(target(A), forA.doFetch);
    expect(result).toEqual({ synced: 5, remaining: 0 });
    const order = forA.calls.filter((c) => c.url.endsWith("/v1/entries")).map((c) => (c.body as { clientUuid: string }).clientUuid);
    expect(order).toEqual([...order].sort());
    expect(forA.calls.every((c) => !c.body || (c.body as { accountId?: string }).accountId !== B)).toBe(true);
  });

  it("keeps items when the network drops, and doesn't re-upload an image already stored", async () => {
    const qa = await Queue.open(A, "au");
    await qa.add(item(A, 20));
    qa.close();

    const flaky = fakeServer({ failPutOnce: true });
    expect((await syncQueue(target(A), flaky.doFetch)).stoppedBecause).toBe("offline");

    const halfway = fakeServer({ entriesStatus: [503] });
    expect((await syncQueue(target(A), halfway.doFetch)).stoppedBecause).toBe("server");
    const q = await Queue.open(A, "au");
    expect((await q.list())[0]?.imagePath).toBeDefined();
    q.close();

    const ok = fakeServer();
    expect(await syncQueue(target(A), ok.doFetch)).toEqual({ synced: 1, remaining: 0 });
    expect(ok.calls.filter((c) => c.url.endsWith("/v1/uploads"))).toHaveLength(0);
  });

  it("marks permanently refused items and carries on", async () => {
    const qa = await Queue.open(A, "au");
    await qa.add(item(A, 30));
    await qa.add(item(A, 31));
    qa.close();
    const server = fakeServer({ entriesStatus: [400, 201] });
    expect(await syncQueue(target(A), server.doFetch)).toEqual({ synced: 1, remaining: 1 });
    const q = await Queue.open(A, "au");
    expect((await q.list())[0]?.error).toBe("bad_category");
    await q.remove(item(A, 30).clientUuid);
    q.close();
  });

  it("stops without a session, and when aborted (sign-out or account switch)", async () => {
    const qa = await Queue.open(A, "au");
    await qa.add(item(A, 40));
    qa.close();
    const server = fakeServer();
    expect((await syncQueue({ ...target(A), accessToken: async () => null }, server.doFetch)).stoppedBecause).toBe("unauthorized");
    const controller = new AbortController();
    controller.abort();
    expect((await syncQueue({ ...target(A), signal: controller.signal }, server.doFetch)).stoppedBecause).toBe("aborted");
    expect(server.calls).toHaveLength(0);
  });
});
