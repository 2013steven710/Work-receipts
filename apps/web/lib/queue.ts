import { type IDBPDatabase, openDB } from "idb";

// The offline capture queue (build plan 6.1). Each account gets its own IndexedDB database, named
// from a hash of its account ID and hosting region, so one account's items are never visible to,
// or uploaded by, another account signed in on the same device.

export interface QueuedItem {
  clientUuid: string;
  accountId: string;
  region: string;
  createdAt: string;
  kind: "receipt";
  cardType: "personal" | "company";
  categoryId: string | null;
  contentType: string;
  blob: Blob;
  /** Set once the image is in storage, so a retry doesn't upload it again. */
  imagePath?: string;
  /** Set when the server refused the item for a reason a retry won't fix. */
  error?: string;
}

export async function queueName(accountId: string, region: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${accountId}|${region}`));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `claimtidy-queue-${hex.slice(0, 32)}`;
}

export class Queue {
  private constructor(
    readonly name: string,
    private readonly db: IDBPDatabase,
    readonly accountId: string,
    readonly region: string,
  ) {}

  static async open(accountId: string, region: string): Promise<Queue> {
    const name = await queueName(accountId, region);
    const db = await openDB(name, 1, {
      upgrade(database) {
        database.createObjectStore("items", { keyPath: "clientUuid" });
      },
    });
    return new Queue(name, db, accountId, region);
  }

  async add(item: QueuedItem): Promise<void> {
    if (item.accountId !== this.accountId || item.region !== this.region) throw new Error("item belongs to another account");
    await this.db.put("items", item);
  }

  async put(item: QueuedItem): Promise<void> {
    await this.add(item);
  }

  async get(clientUuid: string): Promise<QueuedItem | undefined> {
    return (await this.db.get("items", clientUuid)) as QueuedItem | undefined;
  }

  async list(): Promise<QueuedItem[]> {
    const items = (await this.db.getAll("items")) as QueuedItem[];
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async remove(clientUuid: string): Promise<void> {
    await this.db.delete("items", clientUuid);
  }

  async count(): Promise<number> {
    return this.db.count("items");
  }

  close(): void {
    this.db.close();
  }
}

// The signed-in session, shared with the service worker so Android Background Sync can upload
// while the app is closed. Cleared on sign-out, so the worker can't act for a signed-out account.

export interface StoredSession {
  accountId: string;
  region: string;
  apiUrl: string;
  supabaseUrl: string;
  accessToken: string;
  expiresAt: number;
}

const SESSION_DB = "claimtidy-session";

// One long-lived connection per page (and per worker): opening and closing it on every token
// refresh raced with sign-out in Chromium and could leave the open request waiting.
let sessionConnection: Promise<IDBPDatabase> | null = null;

function sessionDb(): Promise<IDBPDatabase> {
  sessionConnection ??= openDB(SESSION_DB, 1, {
    upgrade(database) {
      database.createObjectStore("current");
    },
    terminated() {
      sessionConnection = null;
    },
  });
  return sessionConnection;
}

export async function saveSession(session: StoredSession): Promise<void> {
  await (await sessionDb()).put("current", session, "session");
}

export async function loadSession(): Promise<StoredSession | undefined> {
  return (await (await sessionDb()).get("current", "session")) as StoredSession | undefined;
}

export async function clearSession(): Promise<void> {
  await (await sessionDb()).delete("current", "session");
}
