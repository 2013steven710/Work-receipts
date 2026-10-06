import { openDB } from "idb";

// Android share target: the service worker parks the shared file here until the app picks it up.
// It stays on the device and is removed as soon as the app reads it.

const DB = "claimtidy-shared";

export interface SharedFile {
  blob: Blob;
  type: string;
  name: string;
}

async function db() {
  return openDB(DB, 1, {
    upgrade(database) {
      database.createObjectStore("files");
    },
  });
}

export async function putShared(file: SharedFile): Promise<void> {
  const d = await db();
  await d.put("files", file, "latest");
  d.close();
}

export async function takeShared(): Promise<SharedFile | undefined> {
  const d = await db();
  const file = (await d.get("files", "latest")) as SharedFile | undefined;
  await d.delete("files", "latest");
  d.close();
  return file;
}
