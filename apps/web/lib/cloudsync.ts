import { CloudAuthError, type CloudDrive, type CloudItem } from "./cloud/drive";
import type { Receipt, Store } from "./store";

// Keeps the phone and the user's own Drive/OneDrive in step (v13).
//
// Layout in the cloud (under ClaimTidy's own folder):
//   Receipts/<YYYY-MM>/<id>.<jpg|png|pdf...>   the photo or PDF
//   Receipts/<YYYY-MM>/<id>.json               the receipt's details
//   settings.json                              categories and preferences
//
// One file per receipt means two devices never write the same file, so there's nothing to merge.
// Deleting a receipt removes its photo and replaces its details with a small "deleted" marker, so
// other devices delete it too. A receipt whose cloud files are simply missing (say the folder was
// removed in Drive) is uploaded again from the phone, never deleted from it.

export const RECEIPTS = "Receipts";
const SETTINGS_FILE = "settings.json";

export interface SyncResult {
  pushed: number;
  pulled: number;
  removed: number;
  stoppedBecause?: "offline" | "reauth" | "aborted";
}

interface ReceiptMeta {
  version: 1;
  id: string;
  createdAt: string;
  month: string;
  kind: "receipt";
  cardType: Receipt["cardType"];
  categoryId: string | null;
  contentType: string;
}

interface DeletedMeta {
  version: 1;
  id: string;
  deleted: true;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const metaOf = (r: Receipt): ReceiptMeta => ({
  version: 1,
  id: r.id,
  createdAt: r.createdAt,
  month: r.month,
  kind: r.kind,
  cardType: r.cardType,
  categoryId: r.categoryId,
  contentType: r.contentType,
});

const ID_RE = /^([0-9a-f-]{36})\.(json|[a-z0-9]+)$/;

export async function syncCloud(store: Store, drive: CloudDrive, signal?: AbortSignal): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, removed: 0 };
  const check = () => {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  };
  try {
    // 1. Deletions made on this phone: photo removed, details replaced by a deletion marker.
    for (const r of (await store.all()).filter((x) => x.deleted)) {
      check();
      if (r.cloud?.photoId) await drive.remove(r.cloud.photoId);
      if (r.cloud?.metaId) {
        const marker: DeletedMeta = { version: 1, id: r.id, deleted: true };
        const folder = await drive.folder([RECEIPTS, r.month]);
        await drive.upload(folder, `${r.id}.json`, new Blob([JSON.stringify(marker)], { type: "application/json" }), r.cloud.metaId);
      }
      await store.purge(r.id);
    }

    // 2. New and changed receipts. Files an interrupted earlier sync already uploaded are reused,
    //    so closing the app mid-upload never leaves duplicates.
    const monthFiles = new Map<string, Map<string, string>>();
    const existing = async (folder: string, name: string) => {
      let names = monthFiles.get(folder);
      if (!names) {
        names = new Map((await drive.list(folder)).map((i) => [i.name, i.id]));
        monthFiles.set(folder, names);
      }
      return names.get(name);
    };
    for (const r of await store.all()) {
      check();
      const needsPhoto = !r.cloud?.photoId && r.data;
      if (r.deleted || (r.cloud?.metaId && !r.dirty && !needsPhoto)) continue;
      const folder = await drive.folder([RECEIPTS, r.month]);
      const cloud = { ...r.cloud };
      if (needsPhoto && r.data) {
        const name = `${r.id}.${EXTENSIONS[r.contentType] ?? "bin"}`;
        cloud.photoId = (await existing(folder, name)) ?? (await drive.upload(folder, name, new Blob([r.data], { type: r.contentType })));
      }
      const metaId = cloud.metaId ?? (await existing(folder, `${r.id}.json`));
      cloud.metaId = await drive.upload(folder, `${r.id}.json`, new Blob([JSON.stringify(metaOf(r))], { type: "application/json" }), metaId);
      delete cloud.metaModified;
      // Re-read: the user may have edited or deleted it while we uploaded.
      const latest = await store.get(r.id);
      if (latest) await store.put({ ...latest, cloud, dirty: Boolean(latest.dirty) && JSON.stringify(metaOf(latest)) !== JSON.stringify(metaOf(r)) });
      result.pushed++;
    }

    // 3. Settings.
    const root = await drive.folder([]);
    let settings = await store.settings();
    if (settings.settingsDirty) {
      const body = JSON.stringify({ version: 1, categories: settings.categories, defaultCard: settings.defaultCard });
      const id = await drive.upload(root, SETTINGS_FILE, new Blob([body], { type: "application/json" }), settings.settingsFileId);
      settings = await store.updateSettings((s) => {
        s.settingsFileId = id;
        delete s.settingsModified;
        s.settingsDirty = false;
      });
    }

    // 4. What other devices did.
    const rootItems = await drive.list(root);
    const remoteSettings = rootItems.find((i) => i.name === SETTINGS_FILE && !i.folder);
    if (remoteSettings && !settings.settingsDirty && remoteSettings.modified !== settings.settingsModified) {
      const text = await (await drive.download(remoteSettings.id)).text();
      const remote = JSON.parse(text) as { categories?: typeof settings.categories; defaultCard?: typeof settings.defaultCard };
      await store.updateSettings((s) => {
        if (Array.isArray(remote.categories) && remote.categories.length > 0) s.categories = remote.categories;
        if (remote.defaultCard === "personal" || remote.defaultCard === "company") s.defaultCard = remote.defaultCard;
        s.settingsFileId = remoteSettings.id;
        s.settingsModified = remoteSettings.modified;
      });
    }

    const receiptsFolder = rootItems.find((i) => i.name === RECEIPTS && i.folder);
    const remoteMetaIds = new Set<string>();
    if (receiptsFolder) {
      for (const month of (await drive.list(receiptsFolder.id)).filter((i) => i.folder)) {
        check();
        const items = await drive.list(month.id);
        const photos = new Map<string, CloudItem>();
        for (const item of items) {
          const m = item.name.match(ID_RE);
          if (m && m[2] !== "json") photos.set(m[1]!, item);
        }
        for (const item of items) {
          const m = item.name.match(ID_RE);
          if (!m || m[2] !== "json") continue;
          remoteMetaIds.add(item.id);
          const local = await store.get(m[1]!);
          if (local && (local.dirty || local.deleted || local.cloud?.metaModified === item.modified)) continue;
          const meta = JSON.parse(await (await drive.download(item.id)).text()) as ReceiptMeta | DeletedMeta;
          if (meta.version !== 1 || meta.id !== m[1]) continue;
          if ("deleted" in meta) {
            // Deleted on another device.
            if (local) {
              await store.purge(local.id);
              result.removed++;
            }
            continue;
          }
          const photo = photos.get(meta.id);
          await store.put({
            ...(local ?? {}),
            id: meta.id,
            accountId: store.accountId,
            createdAt: meta.createdAt,
            month: meta.month,
            kind: "receipt",
            cardType: meta.cardType,
            categoryId: meta.categoryId,
            contentType: meta.contentType,
            cloud: { ...local?.cloud, metaId: item.id, metaModified: item.modified, ...(photo && { photoId: photo.id }) },
            dirty: false,
          });
          if (!local) result.pulled++;
        }
      }
    }

    // 5. Receipts whose cloud files have gone missing: upload them again at the next sync.
    for (const r of await store.all()) {
      if (r.cloud?.metaId && !r.dirty && !r.deleted && !remoteMetaIds.has(r.cloud.metaId)) {
        await store.put({ ...r, cloud: {}, dirty: true });
      }
    }
    return result;
  } catch (error) {
    if (error instanceof CloudAuthError) return { ...result, stoppedBecause: "reauth" };
    if ((error as Error).name === "AbortError") return { ...result, stoppedBecause: "aborted" };
    if (error instanceof TypeError) return { ...result, stoppedBecause: "offline" };
    throw error;
  }
}

/** The photo for a receipt restored from the cloud, downloaded on first use. */
export async function ensurePhoto(store: Store, drive: CloudDrive, r: Receipt): Promise<ArrayBuffer | undefined> {
  if (r.data) return r.data;
  if (!r.cloud?.photoId) return undefined;
  const data = await (await drive.download(r.cloud.photoId)).arrayBuffer();
  const latest = await store.get(r.id);
  if (latest) await store.put({ ...latest, data });
  return data;
}
