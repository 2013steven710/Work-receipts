import { DEFAULT_CATEGORIES } from "@claimtidy/core";
import { type IDBPDatabase, openDB } from "idb";
import type { CloudKind } from "./cloud/drive";

// Everything ClaimTidy knows about a user's receipts lives here, on the phone (v13), and in the
// user's own Google Drive or OneDrive when they've linked one. Each account gets its own database,
// named from a hash of its account ID, so one account never sees another's receipts on a shared
// phone.

export type CardType = "personal" | "company";

export interface Category {
  id: string;
  name: string;
  icon: string;
  colour: string;
}

export interface ReceiptCloud {
  photoId?: string;
  metaId?: string;
  /** Remote modification time of the details file we last saw. */
  metaModified?: string;
}

export interface Receipt {
  id: string;
  accountId: string;
  createdAt: string;
  /** YYYY-MM of createdAt, in the phone's time zone: the cloud folder it belongs in. */
  month: string;
  kind: "receipt";
  cardType: CardType;
  categoryId: string | null;
  contentType: string;
  /** Photo or PDF bytes. Absent on a device that restored the details but not the photo yet. */
  data?: ArrayBuffer;
  cloud?: ReceiptCloud;
  /** Details changed since the last upload. */
  dirty?: boolean;
  /** Deleted here; the cloud copy is removed at the next sync, then this record goes. */
  deleted?: boolean;
}

export interface CloudLink {
  kind: CloudKind;
  refreshToken: string;
  accessToken?: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
}

export interface Settings {
  categories: Category[];
  defaultCard: CardType;
  /** Where receipts are kept: "device" means this phone only. Unset until the user chooses. */
  storage?: CloudKind | "device";
  cloud?: CloudLink;
  /** The cloud settings file, and whether local settings changed since it was written. */
  settingsFileId?: string;
  settingsModified?: string;
  settingsDirty?: boolean;
}

export const defaultSettings = (): Settings => ({
  categories: DEFAULT_CATEGORIES.map((c) => ({ id: slug(c.name), name: c.name, icon: c.icon, colour: c.colour })),
  defaultCard: "personal",
});

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function storeName(accountId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`claimtidy|${accountId}`));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `claimtidy-account-${hex.slice(0, 32)}`;
}

export class Store {
  private constructor(
    private readonly db: IDBPDatabase,
    readonly accountId: string,
  ) {}

  static async open(accountId: string): Promise<Store> {
    const db = await openDB(await storeName(accountId), 1, {
      upgrade(database) {
        database.createObjectStore("receipts", { keyPath: "id" });
        database.createObjectStore("settings");
      },
    });
    return new Store(db, accountId);
  }

  async put(receipt: Receipt): Promise<void> {
    if (receipt.accountId !== this.accountId) throw new Error("receipt belongs to another account");
    await this.db.put("receipts", receipt);
  }

  async get(id: string): Promise<Receipt | undefined> {
    return (await this.db.get("receipts", id)) as Receipt | undefined;
  }

  /** Every record, including deletions waiting for the cloud. */
  async all(): Promise<Receipt[]> {
    return ((await this.db.getAll("receipts")) as Receipt[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** What the user sees: not deleted. */
  async list(): Promise<Receipt[]> {
    return (await this.all()).filter((r) => !r.deleted);
  }

  async purge(id: string): Promise<void> {
    await this.db.delete("receipts", id);
  }

  async settings(): Promise<Settings> {
    return ((await this.db.get("settings", "settings")) as Settings | undefined) ?? defaultSettings();
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.db.put("settings", settings, "settings");
  }

  async updateSettings(change: (s: Settings) => void): Promise<Settings> {
    const tx = this.db.transaction("settings", "readwrite");
    const current = ((await tx.store.get("settings")) as Settings | undefined) ?? defaultSettings();
    change(current);
    await tx.store.put(current, "settings");
    await tx.done;
    return current;
  }

  close(): void {
    this.db.close();
  }
}
