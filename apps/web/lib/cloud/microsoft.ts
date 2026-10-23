import { authorisedFetch, type CloudDrive, type CloudItem, expectOk } from "./drive";

// OneDrive with `Files.ReadWrite.AppFolder`: the app has its own folder (Apps/ClaimTidy) and can't
// see anything else in the user's OneDrive.

interface GraphItem {
  id: string;
  name: string;
  folder?: object;
  lastModifiedDateTime: string;
}

export function oneDrive(apiBase: string, getToken: () => Promise<string>, doFetch: typeof fetch = fetch): CloudDrive {
  const http = authorisedFetch(getToken, doFetch);
  const folders = new Map<string, string>();

  async function root(): Promise<string> {
    const cached = folders.get("");
    if (cached) return cached;
    const res = await expectOk(await http(`${apiBase}/me/drive/special/approot?$select=id`), "app folder");
    const id = ((await res.json()) as { id: string }).id;
    folders.set("", id);
    return id;
  }

  async function children(folderId: string): Promise<GraphItem[]> {
    const out: GraphItem[] = [];
    let url: string | undefined = `${apiBase}/me/drive/items/${encodeURIComponent(folderId)}/children?$select=id,name,folder,lastModifiedDateTime&$top=999`;
    while (url) {
      const res = await expectOk(await http(url), "list");
      const json = (await res.json()) as { value: GraphItem[]; "@odata.nextLink"?: string };
      out.push(...json.value);
      url = json["@odata.nextLink"];
    }
    return out;
  }

  async function child(parent: string, name: string, key: string): Promise<string> {
    const cached = folders.get(key);
    if (cached) return cached;
    const res = await http(`${apiBase}/me/drive/items/${encodeURIComponent(parent)}/children`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    let id: string | undefined;
    if (res.status === 409) {
      id = (await children(parent)).find((c) => c.name === name && c.folder)?.id;
    } else {
      id = ((await (await expectOk(res, "create folder")).json()) as { id: string }).id;
    }
    if (!id) throw new Error(`folder ${name} not found`);
    folders.set(key, id);
    return id;
  }

  return {
    kind: "microsoft",
    async folder(path) {
      let id = await root();
      let key = "";
      for (const name of path) {
        key += `/${name}`;
        id = await child(id, name, key);
      }
      return id;
    },
    async list(folderId) {
      return (await children(folderId)).map((c): CloudItem => ({ id: c.id, name: c.name, folder: Boolean(c.folder), modified: c.lastModifiedDateTime }));
    },
    async upload(folderId, name, body, existingId) {
      const url = existingId
        ? `${apiBase}/me/drive/items/${encodeURIComponent(existingId)}/content`
        : `${apiBase}/me/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=replace`;
      const res = await expectOk(await http(url, { method: "PUT", headers: { "content-type": body.type || "application/octet-stream" }, body }), "upload");
      return ((await res.json()) as { id: string }).id;
    },
    async download(fileId) {
      const res = await expectOk(await http(`${apiBase}/me/drive/items/${encodeURIComponent(fileId)}/content`), "download");
      return res.blob();
    },
    async remove(fileId) {
      const res = await http(`${apiBase}/me/drive/items/${encodeURIComponent(fileId)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) await expectOk(res, "delete");
    },
  };
}
