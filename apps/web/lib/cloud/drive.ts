// The user's own cloud storage (v13): ClaimTidy keeps receipts in a folder it creates in the
// user's Google Drive or OneDrive, and can see only what it created there.

export type CloudKind = "google" | "microsoft";

export interface CloudItem {
  id: string;
  name: string;
  folder: boolean;
  /** Last change, as an ISO time. */
  modified: string;
}

export interface CloudDrive {
  readonly kind: CloudKind;
  /** The folder at this path under ClaimTidy's own folder, created if missing. */
  folder(path: string[]): Promise<string>;
  list(folderId: string): Promise<CloudItem[]>;
  /** Creates a file, or replaces the content of `existingId`. Returns the file's ID. */
  upload(folderId: string, name: string, body: Blob, existingId?: string): Promise<string>;
  download(fileId: string): Promise<Blob>;
  /** Deleting a file that's already gone is fine. */
  remove(fileId: string): Promise<void>;
}

export class CloudAuthError extends Error {
  constructor(message = "cloud sign-in needed") {
    super(message);
  }
}

export class CloudError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A fetch that adds the bearer token and turns 401 into CloudAuthError. */
export function authorisedFetch(getToken: () => Promise<string>, doFetch: typeof fetch = fetch) {
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    const res = await doFetch(url, { ...init, headers });
    if (res.status === 401) throw new CloudAuthError();
    return res;
  };
}

export async function expectOk(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new CloudError(res.status, `${what} failed: ${res.status}`);
  return res;
}
