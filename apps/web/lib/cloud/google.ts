import { authorisedFetch, type CloudDrive, type CloudItem, expectOk } from "./drive";

// Google Drive with the `drive.file` scope: the app sees only files and folders it created.
// Everything lives under a top-level "ClaimTidy" folder.

const FOLDER = "application/vnd.google-apps.folder";
const ROOT_NAME = "ClaimTidy";

interface GoogleFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

export function googleDrive(apiBase: string, getToken: () => Promise<string>, doFetch: typeof fetch = fetch): CloudDrive {
  const http = authorisedFetch(getToken, doFetch);
  const folders = new Map<string, string>();
  const quote = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  async function query(q: string): Promise<GoogleFile[]> {
    const out: GoogleFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q,
        fields: "nextPageToken,files(id,name,mimeType,modifiedTime)",
        pageSize: "1000",
        spaces: "drive",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await expectOk(await http(`${apiBase}/drive/v3/files?${params}`), "list");
      const json = (await res.json()) as { files: GoogleFile[]; nextPageToken?: string };
      out.push(...json.files);
      pageToken = json.nextPageToken;
    } while (pageToken);
    return out;
  }

  async function child(parent: string, name: string): Promise<string> {
    const key = `${parent}/${name}`;
    const cached = folders.get(key);
    if (cached) return cached;
    const found = await query(`name = '${quote(name)}' and '${quote(parent)}' in parents and mimeType = '${FOLDER}' and trashed = false`);
    let id = found[0]?.id;
    if (!id) {
      const res = await expectOk(
        await http(`${apiBase}/drive/v3/files?fields=id`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
        }),
        "create folder",
      );
      id = ((await res.json()) as { id: string }).id;
    }
    folders.set(key, id);
    return id;
  }

  return {
    kind: "google",
    async folder(path) {
      let id = await child("root", ROOT_NAME);
      for (const name of path) id = await child(id, name);
      return id;
    },
    async list(folderId) {
      const files = await query(`'${quote(folderId)}' in parents and trashed = false`);
      return files.map((f): CloudItem => ({ id: f.id, name: f.name, folder: f.mimeType === FOLDER, modified: f.modifiedTime }));
    },
    async upload(folderId, name, body, existingId) {
      const type = body.type || "application/octet-stream";
      if (existingId) {
        const res = await expectOk(
          await http(`${apiBase}/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=media&fields=id`, {
            method: "PATCH",
            headers: { "content-type": type },
            body,
          }),
          "update",
        );
        return ((await res.json()) as { id: string }).id;
      }
      const boundary = `claimtidy-${crypto.randomUUID()}`;
      const multipart = new Blob(
        [
          `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n`,
          JSON.stringify({ name, parents: [folderId] }),
          `\r\n--${boundary}\r\ncontent-type: ${type}\r\n\r\n`,
          body,
          `\r\n--${boundary}--`,
        ],
        { type: `multipart/related; boundary=${boundary}` },
      );
      const res = await expectOk(
        await http(`${apiBase}/upload/drive/v3/files?uploadType=multipart&fields=id`, {
          method: "POST",
          headers: { "content-type": `multipart/related; boundary=${boundary}` },
          body: multipart,
        }),
        "upload",
      );
      return ((await res.json()) as { id: string }).id;
    },
    async download(fileId) {
      const res = await expectOk(await http(`${apiBase}/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`), "download");
      return res.blob();
    },
    async remove(fileId) {
      const res = await http(`${apiBase}/drive/v3/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) await expectOk(res, "delete");
    },
  };
}
