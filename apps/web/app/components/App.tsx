"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudKind } from "../../lib/cloud/drive";
import { driveFor, finishLink, startLink } from "../../lib/cloud/link";
import { syncCloud } from "../../lib/cloudsync";
import { takeShared } from "../../lib/shared";
import { api, ApiError, supabase } from "../../lib/session";
import { type CardType, type Category, monthOf, type Receipt, type Settings, Store } from "../../lib/store";
import { CategoryPicker } from "./CategoryPicker";
import { Cropper } from "./Cropper";
import { CodeStep, CountryStep, EmailStep } from "./SignIn";
import { StorageStep } from "./StorageStep";

// v13: receipts live on this phone (one database per account) and in the user's own Google Drive
// or OneDrive. ClaimTidy's server only knows the account and the subscription.

type Screen =
  | { name: "loading" }
  | { name: "email" }
  | { name: "code"; email: string }
  | { name: "country" }
  | { name: "storage" }
  | { name: "home" }
  | { name: "crop"; file: Blob }
  | { name: "categorise"; blob: Blob; contentType: string; previewUrl: string }
  | { name: "edit"; id: string };

interface Me {
  accountId: string;
  profile: { country: string; home_currency: string } | null;
}

type SyncState = "idle" | "syncing" | "offline" | "reauth";

const meKey = (accountId: string) => `claimtidy.me.${accountId}`;
const PROVIDER_NAME: Record<CloudKind, string> = { google: "Google Drive", microsoft: "OneDrive" };

const needsPush = (r: Receipt) => r.deleted || r.dirty || !r.cloud?.metaId || (!r.cloud.photoId && Boolean(r.data));

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  const [accountId, setAccountId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; text: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const syncing = useRef<AbortController | null>(null);
  const syncAgain = useRef(false);

  const withStore = useCallback(async <T,>(id: string, fn: (store: Store) => Promise<T>): Promise<T> => {
    const store = await Store.open(id);
    try {
      return await fn(store);
    } finally {
      store.close();
    }
  }, []);

  const refresh = useCallback(
    async (id: string) => {
      await withStore(id, async (store) => {
        const all = await store.all();
        setReceipts(all.filter((r) => !r.deleted && r.month === monthOf(new Date())));
        const s = await store.settings();
        setSettings(s);
        setPendingSync(s.storage && s.storage !== "device" ? all.filter(needsPush).length : 0);
      });
    },
    [withStore],
  );

  const syncNow = useCallback(
    async (id: string) => {
      if (syncing.current) {
        syncAgain.current = true;
        return;
      }
      const controller = new AbortController();
      syncing.current = controller;
      try {
        do {
          syncAgain.current = false;
          const link = await withStore(id, async (store) => (await store.settings()).cloud);
          if (!link) return;
          if (!navigator.onLine) {
            setSyncState("offline");
            return;
          }
          setSyncState("syncing");
          const result = await withStore(id, async (store) => {
            const drive = driveFor(link, async (updated) => {
              await store.updateSettings((s) => {
                s.cloud = updated;
              });
            });
            const run = () => syncCloud(store, drive, controller.signal);
            const locks = navigator.locks;
            return locks ? locks.request(`claimtidy-sync-${id}`, run) : run();
          });
          setSyncState(result.stoppedBecause === "reauth" ? "reauth" : result.stoppedBecause === "offline" ? "offline" : "idle");
        } while (syncAgain.current && !controller.signal.aborted);
      } catch {
        setSyncState("offline");
      } finally {
        if (syncing.current === controller) syncing.current = null;
        if (!controller.signal.aborted) await refresh(id).catch(() => {});
      }
    },
    [refresh, withStore],
  );

  const openFile = useCallback((file: File) => {
    setError(null);
    if (file.type === "application/pdf") setScreen({ name: "categorise", blob: file, contentType: "application/pdf", previewUrl: "" });
    else setScreen({ name: "crop", file });
  }, []);

  const loadMe = useCallback(async (id: string): Promise<Me | null> => {
    try {
      const fresh = await api<Me>("/v1/me");
      localStorage.setItem(meKey(id), JSON.stringify(fresh));
      return fresh;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // Offline: the copy from the last time we were online.
      const cached = localStorage.getItem(meKey(id));
      return cached ? (JSON.parse(cached) as Me) : null;
    }
  }, []);

  const enterAccount = useCallback(async () => {
    const { data } = await supabase().auth.getSession();
    const id = data.session?.user.id;
    if (!id) {
      setScreen({ name: "email" });
      return;
    }
    setAccountId(id);
    const me = await loadMe(id).catch(() => null);
    if (!me) {
      setError("Can't reach ClaimTidy. Check your connection and try again.");
      setScreen({ name: "email" });
      return;
    }
    if (!me.profile) {
      setScreen({ name: "country" });
      return;
    }

    // Back from Google or Microsoft after allowing access.
    if (location.pathname === "/cloud/callback") {
      const search = new URLSearchParams(location.search);
      history.replaceState(null, "", "/");
      try {
        const link = await finishLink(search, id);
        await withStore(id, (store) =>
          store.updateSettings((s) => {
            s.storage = link.kind;
            s.cloud = link;
            s.settingsDirty = true;
          }),
        );
      } catch (e) {
        setError((e as Error).message || "Couldn't link your storage. Please try again.");
        setScreen({ name: "storage" });
        return;
      }
    }

    const s = await withStore(id, (store) => store.settings());
    if (!s.storage) {
      setScreen({ name: "storage" });
      return;
    }
    setScreen({ name: "home" });
    await refresh(id);
    void syncNow(id);
    // A receipt shared into the app (Android) goes straight to cropping or categorising.
    if (new URLSearchParams(location.search).has("shared")) {
      history.replaceState(null, "", "/");
      const shared = await takeShared().catch(() => undefined);
      if (shared) openFile(new File([shared.blob], shared.name, { type: shared.type }));
    }
  }, [loadMe, openFile, refresh, syncNow, withStore]);

  // ---- Boot and connectivity ------------------------------------------------------------------

  useEffect(() => {
    setOnline(navigator.onLine);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    void enterAccount();
  }, [enterAccount]);

  useEffect(() => {
    if (!accountId) return;
    const goOnline = () => {
      setOnline(true);
      void syncNow(accountId);
    };
    const goOffline = () => {
      setOnline(false);
      setSyncState((s) => (s === "reauth" ? s : "offline"));
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = setInterval(() => navigator.onLine && void syncNow(accountId), 60_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
    };
  }, [accountId, syncNow]);

  // ---- Sign-in (Supabase email code) ----------------------------------------------------------

  const onEmail = async (email: string) => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setBusy(false);
    if (e) setError("Couldn't send the code. Check the address and your connection.");
    else setScreen({ name: "code", email });
  };

  const onCode = async (email: string, code: string) => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase().auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (e) setError("That code isn't right, or it has expired.");
    else await enterAccount();
  };

  const onCountry = async (country: string, currency: string) => {
    setBusy(true);
    setError(null);
    try {
      await api("/v1/profile", { method: "POST", body: { country, homeCurrency: currency, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      await enterAccount();
    } catch {
      setError("Couldn't finish setting up. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onStorage = async (choice: CloudKind | "device") => {
    if (!accountId) return;
    setError(null);
    if (choice === "device") {
      await withStore(accountId, (store) =>
        store.updateSettings((s) => {
          s.storage = "device";
        }),
      );
      setScreen({ name: "home" });
      await refresh(accountId);
      return;
    }
    setBusy(true);
    await startLink(choice, accountId); // leaves the page for Google or Microsoft
  };

  // ---- Capture, undo, edit ---------------------------------------------------------------------

  const onPick = async (blob: Blob, contentType: string, categoryId: string) => {
    if (!accountId || !settings) return;
    const now = new Date();
    const receipt: Receipt = {
      id: crypto.randomUUID(),
      accountId,
      createdAt: now.toISOString(),
      month: monthOf(now),
      kind: "receipt",
      cardType: settings.defaultCard,
      categoryId,
      contentType,
      data: await blob.arrayBuffer(),
    };
    await withStore(accountId, (store) => store.put(receipt));
    void navigator.storage?.persist?.();
    const name = settings.categories.find((c) => c.id === categoryId)?.name ?? "Receipt";
    setToast({ id: receipt.id, text: `Saved to ${name}` });
    setScreen({ name: "home" });
    await refresh(accountId);
    void syncNow(accountId);
  };

  const undo = async (id: string) => {
    if (!accountId) return;
    setToast(null);
    await withStore(accountId, async (store) => {
      const r = await store.get(id);
      if (!r) return;
      // Never reached the cloud: just forget it. Otherwise delete it there too at the next sync.
      if (!r.cloud?.metaId && !r.cloud?.photoId) await store.purge(id);
      else await store.put({ ...r, deleted: true });
    });
    await refresh(accountId);
    void syncNow(accountId);
  };

  const applyEdit = async (id: string, categoryId: string) => {
    if (!accountId || !settings) return;
    await withStore(accountId, async (store) => {
      const r = await store.get(id);
      if (r) await store.put({ ...r, categoryId, cardType: settings.defaultCard, dirty: true });
    });
    setScreen({ name: "home" });
    await refresh(accountId);
    void syncNow(accountId);
  };

  const rememberCard = async (card: CardType) => {
    if (!accountId) return;
    const s = await withStore(accountId, (store) =>
      store.updateSettings((x) => {
        x.defaultCard = card;
        x.settingsDirty = true;
      }),
    );
    setSettings(s);
  };

  // ---- Sign-out --------------------------------------------------------------------------------

  const signOut = async () => {
    if (!accountId) return;
    syncing.current?.abort();
    syncing.current = null;
    // Forget the account in this browser first, synchronously. Its receipts stay in its own
    // database on this phone (for "this phone only" they're the only copy), unseen by anyone else.
    localStorage.removeItem(meKey(accountId));
    setAccountId(null);
    setSettings(null);
    setReceipts([]);
    setPendingSync(0);
    setToast(null);
    setSigningOut(false);
    setSyncState("idle");
    setScreen({ name: "email" });
    try {
      localStorage.removeItem("claimtidy-auth");
    } catch {
      // ignore
    }
    await Promise.race([supabase().auth.signOut({ scope: "local" }).catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
  };

  // ---- Render ----------------------------------------------------------------------------------

  const categories: Category[] = settings?.categories ?? [];
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorised";
  const storage = settings?.storage;
  const cloudName = storage && storage !== "device" ? PROVIDER_NAME[storage] : null;

  const status = () => {
    if (!cloudName) return { text: "Saved on this phone", tone: "ok" };
    if (syncState === "reauth") return { text: `Reconnect ${cloudName}`, tone: "warn" };
    if (!online || syncState === "offline") return { text: `Offline · ${pendingSync} to sync`, tone: "warn" };
    if (pendingSync > 0) return { text: `${pendingSync} to sync`, tone: "busy" };
    return { text: `Synced to ${cloudName}`, tone: "ok" };
  };

  switch (screen.name) {
    case "loading":
      return <div className="screen center">Loading…</div>;
    case "email":
      return <EmailStep onSubmit={onEmail} busy={busy} error={error} />;
    case "code":
      return <CodeStep email={screen.email} onSubmit={(code) => onCode(screen.email, code)} onBack={() => setScreen({ name: "email" })} busy={busy} error={error} />;
    case "country":
      return <CountryStep onChoose={onCountry} busy={busy} error={error} />;
    case "storage":
      return <StorageStep onChoose={onStorage} busy={busy} error={error} />;
    case "crop":
      return (
        <Cropper
          file={screen.file}
          onCancel={() => setScreen({ name: "home" })}
          onUse={(blob) => setScreen({ name: "categorise", blob, contentType: "image/jpeg", previewUrl: URL.createObjectURL(blob) })}
        />
      );
    case "categorise":
      return (
        <CategoryPicker
          title="Which category?"
          previewUrl={screen.previewUrl || null}
          categories={categories}
          cardType={settings?.defaultCard ?? "personal"}
          onCardType={rememberCard}
          onPick={(id) => {
            if (screen.previewUrl) URL.revokeObjectURL(screen.previewUrl);
            void onPick(screen.blob, screen.contentType, id);
          }}
          onCancel={() => setScreen({ name: "home" })}
        />
      );
    case "edit":
      return (
        <CategoryPicker
          title="Change category"
          previewUrl={null}
          categories={categories}
          cardType={settings?.defaultCard ?? "personal"}
          onCardType={rememberCard}
          onPick={(id) => void applyEdit(screen.id, id)}
          onCancel={() => setScreen({ name: "home" })}
        />
      );
    case "home": {
      const st = status();
      return (
        <div className="screen home">
          <header className="topbar">
            <span className="brand-sm">ClaimTidy</span>
            {syncState === "reauth" && storage && storage !== "device" ? (
              <button className="pill warn" data-testid="sync-status" onClick={() => accountId && void startLink(storage, accountId)}>
                {st.text}
              </button>
            ) : (
              <span className={`pill ${st.tone}`} data-testid="sync-status">
                {st.text}
              </span>
            )}
            <button className="link" onClick={() => (pendingSync > 0 || storage === "device" ? setSigningOut(true) : void signOut())}>
              Sign out
            </button>
          </header>

          <label className="capture primary">
            Snap receipt
            <input type="file" accept="image/*" capture="environment" hidden data-testid="snap" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
          </label>
          <label className="capture secondary">
            Pick from Photos or Files
            <input type="file" accept="image/*,application/pdf" hidden data-testid="pick" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
          </label>

          <h2>This month</h2>
          <ul className="entries" data-testid="entries">
            {receipts.map((r) => (
              <li key={r.id} data-testid="entry" data-pending={cloudName && needsPush(r) ? "true" : "false"}>
                <span>{categoryName(r.categoryId)}</span>
                <span className="meta">
                  {r.cardType === "company" ? "Company card" : "Personal card"} · {new Date(r.createdAt).toLocaleDateString()}
                </span>
                <button className="link" onClick={() => setScreen({ name: "edit", id: r.id })}>
                  Edit
                </button>
              </li>
            ))}
            {receipts.length === 0 && <li className="empty">No receipts yet this month.</li>}
          </ul>

          {toast && (
            <div className="toast" role="status">
              <span>{toast.text}</span>
              <button className="link" onClick={() => void undo(toast.id)}>
                Undo
              </button>
              <button
                className="link"
                onClick={() => {
                  setToast(null);
                  setScreen({ name: "edit", id: toast.id });
                }}
              >
                Edit
              </button>
            </div>
          )}

          {signingOut && (
            <div className="dialog" role="dialog" aria-modal="true">
              <p>
                {storage === "device"
                  ? "Your receipts are kept only on this phone. They'll stay here, private to your account, for when you sign in again."
                  : `${pendingSync} receipt${pendingSync === 1 ? " hasn't" : "s haven't"} reached ${cloudName} yet. They'll stay on this phone and sync next time you sign in.`}
              </p>
              <button className="primary" onClick={() => void signOut()}>
                Sign out
              </button>
              <button className="link" onClick={() => setSigningOut(false)}>
                Cancel
              </button>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      );
    }
  }
}
