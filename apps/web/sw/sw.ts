/// <reference lib="webworker" />
// The service worker: offline app shell, and Android Background Sync of queued captures.
// Built to public/sw.js by scripts/build-sw.mjs. It never caches personal data.
import { loadSession } from "../lib/queue";
import { putShared } from "../lib/shared";
import { syncQueue } from "../lib/sync";

declare const self: ServiceWorkerGlobalScope;

const CACHE = "claimtidy-shell-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method === "POST" && url.origin === self.location.origin && url.pathname === "/share-target") {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // Network first; offline, the cached shell still opens the app.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === "/") void caches.open(CACHE).then((c) => c.put("/", res.clone()));
          return res;
        })
        .catch(async () => (await caches.match("/")) ?? Response.error()),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    // Hashed build files never change: cache first.
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) void caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
  }
});

interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}

self.addEventListener("sync", (event) => {
  const e = event as SyncEvent;
  if (e.tag === "claimtidy-sync") e.waitUntil(backgroundSync());
});

async function backgroundSync(): Promise<void> {
  // An open app syncs with its live session; the worker only acts when the app is closed.
  const windows = await self.clients.matchAll({ type: "window" });
  if (windows.length > 0) {
    for (const w of windows) w.postMessage({ type: "claimtidy-sync" });
    return;
  }
  const session = await loadSession();
  if (!session || session.expiresAt * 1000 < Date.now() + 30_000) return;
  const result = await syncQueue({ ...session, accessToken: async () => session.accessToken });
  // Ask the browser to try again later if we were cut off.
  if (result.remaining > 0 && result.stoppedBecause === "offline") throw new Error("retry later");
}

// Android share sheet → "ClaimTidy": keep the file, then open the app to categorise it.
async function receiveShare(req: Request): Promise<Response> {
  try {
    const form = await req.formData();
    const file = form.get("receipt");
    if (file instanceof File && (file.type.startsWith("image/") || file.type === "application/pdf")) {
      await putShared({ blob: file, type: file.type, name: file.name });
      return Response.redirect("/?shared=1", 303);
    }
  } catch {
    // fall through
  }
  return Response.redirect("/", 303);
}
