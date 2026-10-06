"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearSession, Queue, type QueuedItem, saveSession } from "../../lib/queue";
import { takeShared } from "../../lib/shared";
import {
  api,
  ApiError,
  apiUrl,
  clearRegionInfo,
  directory,
  forgetClient,
  getRegionInfo,
  regionalClient,
  type RegionInfo,
  setRegionInfo,
} from "../../lib/session";
import { syncQueue } from "../../lib/sync";
import type { CardType, EntryRow, Me } from "../../lib/types";
import { CategoryPicker } from "./CategoryPicker";
import { Cropper } from "./Cropper";
import { CodeStep, CountryStep, EmailStep } from "./SignIn";

type Screen =
  | { name: "loading" }
  | { name: "email" }
  | { name: "code"; email: string }
  | { name: "country"; ticket?: string }
  | { name: "home" }
  | { name: "crop"; file: Blob }
  | { name: "categorise"; blob: Blob; contentType: string; previewUrl: string }
  | { name: "edit"; clientUuid: string; previewUrl: string | null };

interface Toast {
  clientUuid: string;
  text: string;
}

interface Account {
  info: RegionInfo;
  client: SupabaseClient;
  accountId: string;
}

const CARD_KEY = "claimtidy.cardType";
const meKey = (accountId: string) => `claimtidy.me.${accountId}`;
const DAY_MS = 24 * 60 * 60 * 1000;

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  const [account, setAccount] = useState<Account | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [queued, setQueued] = useState<QueuedItem[]>([]);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [cardType, setCardType] = useState<CardType>("personal");
  const [signingOut, setSigningOut] = useState(false);
  const syncAbort = useRef<AbortController | null>(null);
  const syncedIds = useRef(new Map<string, string>());

  const openFile = useCallback((file: File) => {
    setError(null);
    if (file.type === "application/pdf") {
      setScreen({ name: "categorise", blob: file, contentType: "application/pdf", previewUrl: "" });
    } else {
      setScreen({ name: "crop", file });
    }
  }, []);

  // ---- Data ------------------------------------------------------------------------------------

  const refreshLists = useCallback(async (acc: Account) => {
    const queue = await Queue.open(acc.accountId, acc.info.region);
    setQueued(await queue.list());
    queue.close();
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const { data } = await acc.client
      .from("entries")
      .select("id, client_uuid, created_at, card_type, category_id, image_path")
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setEntries(data as EntryRow[]);
  }, []);

  const syncNow = useCallback(
    async (acc: Account) => {
      if (syncAbort.current) return; // one at a time from this page (the lock covers the worker)
      const controller = new AbortController();
      syncAbort.current = controller;
      try {
        await syncQueue({
          accountId: acc.accountId,
          region: acc.info.region,
          apiUrl: apiUrl(acc.info.region),
          supabaseUrl: acc.info.supabaseUrl,
          signal: controller.signal,
          accessToken: async () => (await acc.client.auth.getSession()).data.session?.access_token ?? null,
          onSynced: (clientUuid, id) => syncedIds.current.set(clientUuid, id),
        });
      } finally {
        if (syncAbort.current === controller) syncAbort.current = null;
        if (!controller.signal.aborted) await refreshLists(acc).catch(() => {});
      }
    },
    [refreshLists],
  );

  const loadMe = useCallback(async (acc: Account): Promise<Me | null> => {
    try {
      const fresh = await api<Me>(acc.client, acc.info.region, "/v1/me");
      localStorage.setItem(meKey(acc.accountId), JSON.stringify(fresh));
      return fresh;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // Offline: use the copy from the last sync so the category buttons still work.
      const cached = localStorage.getItem(meKey(acc.accountId));
      return cached ? (JSON.parse(cached) as Me) : null;
    }
  }, []);

  const enterAccount = useCallback(
    async (info: RegionInfo) => {
      const client = regionalClient(info);
      const { data } = await client.auth.getSession();
      const session = data.session;
      if (!session) {
        setScreen({ name: "email" });
        return;
      }
      const acc: Account = { info, client, accountId: session.user.id };
      setAccount(acc);
      const loaded = await loadMe(acc).catch(() => null);
      setMe(loaded);
      if (!loaded) {
        setError("Can't reach ClaimTidy. Check your connection and try again.");
        setScreen({ name: "email" });
        return;
      }
      if (!loaded.profile) {
        setScreen({ name: "country" });
        return;
      }
      setScreen({ name: "home" });
      await refreshLists(acc).catch(() => {});
      void syncNow(acc);
      // A receipt shared into the app (Android) goes straight to cropping or categorising.
      if (new URLSearchParams(location.search).has("shared")) {
        history.replaceState(null, "", "/");
        const shared = await takeShared().catch(() => undefined);
        if (shared) openFile(new File([shared.blob], shared.name, { type: shared.type }));
      }
    },
    [loadMe, refreshLists, syncNow, openFile],
  );

  // ---- Boot, connectivity, worker messages ----------------------------------------------------

  useEffect(() => {
    setOnline(navigator.onLine);
    try {
      const saved = localStorage.getItem(CARD_KEY);
      if (saved === "personal" || saved === "company") setCardType(saved);
    } catch {
      // ignore
    }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const info = getRegionInfo();
    if (info) void enterAccount(info);
    else setScreen({ name: "email" });
  }, [enterAccount]);

  useEffect(() => {
    if (!account) return;
    const goOnline = () => {
      setOnline(true);
      void syncNow(account);
    };
    const goOffline = () => setOnline(false);
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "claimtidy-sync") void syncNow(account);
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    const timer = setInterval(() => navigator.onLine && void syncNow(account), 30_000);

    // Share the live session with the service worker (Android Background Sync).
    const { data: sub } = account.client.auth.onAuthStateChange((_event, session) => {
      if (session && session.user.id === account.accountId) {
        void saveSession({
          accountId: account.accountId,
          region: account.info.region,
          apiUrl: apiUrl(account.info.region),
          supabaseUrl: account.info.supabaseUrl,
          accessToken: session.access_token,
          expiresAt: session.expires_at ?? 0,
        });
      }
    });
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      clearInterval(timer);
      sub.subscription.unsubscribe();
    };
  }, [account, syncNow]);

  // ---- Sign-in -------------------------------------------------------------------------------

  const signInToRegion = async (info: RegionInfo, tokenHash: string, tokenType: "magiclink" | "signup") => {
    setRegionInfo(info);
    const client = regionalClient(info);
    const { error: otpError } = await client.auth.verifyOtp({ token_hash: tokenHash, type: tokenType === "signup" ? "signup" : "magiclink" });
    if (otpError) throw new Error(otpError.message);
  };

  const onEmail = async (email: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await directory("/v1/email/start", { email });
      if (res.status !== 202) throw new Error();
      setScreen({ name: "code", email });
    } catch {
      setError("Couldn't send the code. Check the address and your connection.");
    } finally {
      setBusy(false);
    }
  };

  const onCode = async (email: string, code: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await directory<{ status?: string; ticket?: string; tokenHash?: string; tokenType?: "magiclink" | "signup" } & RegionInfo>(
        "/v1/email/verify",
        { email, code },
      );
      if (res.status === 400) {
        setError("That code isn't right, or it has expired.");
        return;
      }
      if (res.json.status === "new") {
        setScreen({ name: "country", ticket: res.json.ticket! });
        return;
      }
      await signInToRegion(res.json, res.json.tokenHash!, res.json.tokenType!);
      await enterAccount(res.json);
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onCountry = async (country: string, currency: string, ticket?: string) => {
    setBusy(true);
    setError(null);
    try {
      let info = getRegionInfo();
      if (ticket) {
        const res = await directory<RegionInfo & { tokenHash: string; tokenType: "magiclink" | "signup" }>("/v1/reserve", {
          ticket,
          country,
          homeCurrency: currency,
        });
        if (res.status !== 200) throw new Error("reserve");
        await signInToRegion(res.json, res.json.tokenHash, res.json.tokenType);
        info = res.json;
      }
      if (!info) throw new Error("no region");
      const client = regionalClient(info);
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      try {
        await api(client, info.region, "/v1/profile", { method: "POST", body: { country, homeCurrency: currency, timeZone } });
      } catch (e) {
        if (e instanceof ApiError && e.code === "wrong_region") {
          setError("Your account is stored in another region. Please choose a country in that region.");
          return;
        }
        throw e;
      }
      await enterAccount(info);
    } catch {
      setError("Couldn't finish setting up. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Capture -------------------------------------------------------------------------------

  const onFile = (file: File | undefined) => {
    if (file) openFile(file);
  };

  const onPick = async (blob: Blob, contentType: string, categoryId: string) => {
    if (!account) return;
    const item: QueuedItem = {
      clientUuid: crypto.randomUUID(),
      accountId: account.accountId,
      region: account.info.region,
      createdAt: new Date().toISOString(),
      kind: "receipt",
      cardType,
      categoryId,
      contentType,
      blob,
    };
    const queue = await Queue.open(account.accountId, account.info.region);
    await queue.add(item);
    queue.close();
    void navigator.storage?.persist?.();
    const category = me?.categories.find((c) => c.id === categoryId)?.name ?? "Receipt";
    setToast({ clientUuid: item.clientUuid, text: `Saved to ${category}` });
    setScreen({ name: "home" });
    await refreshLists(account);
    const reg = await navigator.serviceWorker?.ready.catch(() => undefined);
    await (reg as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined)?.sync
      ?.register("claimtidy-sync")
      .catch(() => {});
    if (navigator.onLine) void syncNow(account);
  };

  const entryIdFor = async (acc: Account, clientUuid: string): Promise<string | null> => {
    const known = syncedIds.current.get(clientUuid);
    if (known) return known;
    const { data } = await acc.client.from("entries").select("id").eq("client_uuid", clientUuid).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  };

  const undo = async (clientUuid: string) => {
    if (!account) return;
    setToast(null);
    // Stop an upload in flight so it can't land after the undo.
    syncAbort.current?.abort();
    syncAbort.current = null;
    const queue = await Queue.open(account.accountId, account.info.region);
    const stillQueued = await queue.get(clientUuid);
    if (stillQueued) await queue.remove(clientUuid);
    queue.close();
    const id = await entryIdFor(account, clientUuid);
    if (id) await api(account.client, account.info.region, `/v1/entries/${id}`, { method: "DELETE" }).catch(() => {});
    await refreshLists(account);
    void syncNow(account);
  };

  const applyEdit = async (clientUuid: string, categoryId: string) => {
    if (!account) return;
    const queue = await Queue.open(account.accountId, account.info.region);
    const item = await queue.get(clientUuid);
    if (item) {
      item.categoryId = categoryId;
      item.cardType = cardType;
      delete item.error;
      await queue.put(item);
    }
    queue.close();
    if (!item) {
      const id = await entryIdFor(account, clientUuid);
      if (id) await api(account.client, account.info.region, `/v1/entries/${id}`, { method: "PATCH", body: { categoryId, cardType } });
    }
    setScreen({ name: "home" });
    await refreshLists(account);
    void syncNow(account);
  };

  // ---- Sign-out ------------------------------------------------------------------------------

  const signOut = async (deleteUnsynced: boolean) => {
    if (!account) return;
    syncAbort.current?.abort();
    syncAbort.current = null;
    // Forget the account on this device first, synchronously, so even closing the app mid sign-out
    // can't reopen it signed in. Only its unsynced captures stay, in its own database.
    clearRegionInfo();
    forgetClient(account.info.region);
    localStorage.removeItem(meKey(account.accountId));
    syncedIds.current.clear();
    setAccount(null);
    setMe(null);
    setEntries([]);
    setQueued([]);
    setToast(null);
    setSigningOut(false);
    setScreen({ name: "email" });

    if (deleteUnsynced) {
      const queue = await Queue.open(account.accountId, account.info.region);
      for (const item of await queue.list()) await queue.remove(item.clientUuid);
      queue.close();
    }
    // Stop the service worker acting for this account, and end the session at the server.
    // Neither may hold the user on this screen.
    const limit = () => new Promise((r) => setTimeout(r, 3000));
    await Promise.race([clearSession().catch(() => {}), limit()]);
    await Promise.race([account.client.auth.signOut({ scope: "local" }).catch(() => {}), limit()]);
  };

  // ---- Render --------------------------------------------------------------------------------

  const categories = useMemo(() => me?.categories ?? [], [me]);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorised";
  const pending = queued.filter((q) => !q.error);
  const stale = pending.some((q) => Date.now() - Date.parse(q.createdAt) > DAY_MS);
  const rememberCard = (type: CardType) => {
    setCardType(type);
    try {
      localStorage.setItem(CARD_KEY, type);
    } catch {
      // ignore
    }
  };

  switch (screen.name) {
    case "loading":
      return <div className="screen center">Loading…</div>;
    case "email":
      return <EmailStep onSubmit={onEmail} busy={busy} error={error} />;
    case "code":
      return <CodeStep email={screen.email} onSubmit={(code) => onCode(screen.email, code)} onBack={() => setScreen({ name: "email" })} busy={busy} error={error} />;
    case "country":
      return <CountryStep onChoose={(country, currency) => onCountry(country, currency, screen.ticket)} busy={busy} error={error} />;
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
          cardType={cardType}
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
          previewUrl={screen.previewUrl}
          categories={categories}
          cardType={cardType}
          onCardType={rememberCard}
          onPick={(id) => void applyEdit(screen.clientUuid, id)}
          onCancel={() => setScreen({ name: "home" })}
        />
      );
    case "home":
      return (
        <div className="screen home">
          <header className="topbar">
            <span className="brand-sm">ClaimTidy</span>
            <span className={`pill ${!online ? "warn" : pending.length ? "busy" : "ok"}`} data-testid="sync-status">
              {!online ? `Offline · ${pending.length} waiting` : pending.length ? `${pending.length} uploading` : "All synced"}
            </span>
            <button className="link" onClick={() => (queued.length ? setSigningOut(true) : void signOut(false))}>
              Sign out
            </button>
          </header>

          <label className="capture primary">
            Snap receipt
            <input type="file" accept="image/*" capture="environment" hidden data-testid="snap" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <label className="capture secondary">
            Pick from Photos or Files
            <input type="file" accept="image/*,application/pdf" hidden data-testid="pick" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>

          {stale && <p className="warn-box">Some receipts have waited over a day to upload. Open ClaimTidy while you&apos;re online so they don&apos;t get lost.</p>}

          <h2>This month</h2>
          <ul className="entries" data-testid="entries">
            {queued.map((q) => (
              <li key={q.clientUuid} data-testid="entry" data-pending="true">
                <span>{categoryName(q.categoryId)}</span>
                <span className="meta">{q.cardType === "company" ? "Company card" : "Personal card"}</span>
                <span className={`badge ${q.error ? "error" : ""}`}>{q.error ? "Needs a check" : "Pending sync"}</span>
              </li>
            ))}
            {entries.map((e) => (
              <li key={e.id} data-testid="entry" data-pending="false">
                <span>{categoryName(e.category_id)}</span>
                <span className="meta">
                  {e.card_type === "company" ? "Company card" : "Personal card"} · {new Date(e.created_at).toLocaleDateString()}
                </span>
                <button className="link" onClick={() => setScreen({ name: "edit", clientUuid: e.client_uuid, previewUrl: null })}>
                  Edit
                </button>
              </li>
            ))}
            {queued.length === 0 && entries.length === 0 && <li className="empty">No receipts yet this month.</li>}
          </ul>

          {toast && (
            <div className="toast" role="status">
              <span>{toast.text}</span>
              <button className="link" onClick={() => void undo(toast.clientUuid)}>
                Undo
              </button>
              <button
                className="link"
                onClick={() => {
                  setToast(null);
                  setScreen({ name: "edit", clientUuid: toast.clientUuid, previewUrl: null });
                }}
              >
                Edit
              </button>
            </div>
          )}

          {signingOut && (
            <div className="dialog" role="dialog" aria-modal="true">
              <p>
                {queued.length} receipt{queued.length === 1 ? " hasn't" : "s haven't"} uploaded yet. They&apos;ll stay on this device and upload next time you sign in, or you can
                delete them now.
              </p>
              <button className="primary" onClick={() => void signOut(false)}>
                Keep them and sign out
              </button>
              <button className="secondary danger" onClick={() => void signOut(true)}>
                Delete them and sign out
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
