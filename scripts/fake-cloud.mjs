// A small stand-in for Google's and Microsoft's sign-in and file APIs, for tests only. It speaks the
// subset of Google Drive v3 and Microsoft Graph (OneDrive app folder) that ClaimTidy uses, and the
// OAuth authorise/token endpoints. Everything is in memory.
//
//   node scripts/fake-cloud.mjs [port]     (default 54399)
//
// Routes: /google/auth, /google/token, /google/drive/v3/..., /google/upload/drive/v3/...
//         /microsoft/auth, /microsoft/token, /graph/me/drive/...
//         /__state (test inspection), /__reset
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const FOLDER = "application/vnd.google-apps.folder";

export function createFakeCloud() {
  /** Files per user (one fake user per refresh token family). */
  let files = new Map(); // id -> { id, name, folder, parent, content: Buffer, type, modified, provider }
  let tick = Date.parse("2026-10-01T00:00:00Z");
  const now = () => new Date((tick += 1000)).toISOString();
  const tokens = new Set();
  const revoked = new Set();
  let counter = 0;

  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
    });
  const authorised = (req) => tokens.has((req.headers.authorization ?? "").replace(/^Bearer /, ""));
  const issue = () => {
    const t = `fake-at-${++counter}`;
    tokens.add(t);
    return t;
  };

  async function token(req, res) {
    const form = new URLSearchParams((await readBody(req)).toString());
    if (!form.get("client_secret")) return json(res, 401, { error: "invalid_client" });
    if (form.get("grant_type") === "authorization_code") {
      if (!form.get("code")?.startsWith("fake-code-") || !form.get("code_verifier")) return json(res, 400, { error: "invalid_grant" });
      return json(res, 200, { access_token: issue(), expires_in: 3600, refresh_token: `fake-rt-${counter}` });
    }
    const rt = form.get("refresh_token");
    if (!rt || revoked.has(rt)) return json(res, 400, { error: "invalid_grant" });
    return json(res, 200, { access_token: issue(), expires_in: 3600 });
  }

  function authorise(url, res) {
    const redirect = new URL(url.searchParams.get("redirect_uri"));
    redirect.searchParams.set("code", `fake-code-${++counter}`);
    redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
    res.writeHead(302, { location: redirect.toString() });
    res.end();
  }

  // ---- Google Drive ----
  async function google(req, res, url) {
    const path = url.pathname.replace(/^\/google/, "");
    if (!authorised(req)) return json(res, 401, { error: { code: 401 } });
    const asGoogle = (f) => ({ id: f.id, name: f.name, mimeType: f.folder ? FOLDER : f.type, modifiedTime: f.modified });
    if (req.method === "GET" && path === "/drive/v3/files") {
      const q = url.searchParams.get("q") ?? "";
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const name = q.match(/name = '([^']+)'/)?.[1];
      const onlyFolders = q.includes(`mimeType = '${FOLDER}'`);
      const list = [...files.values()].filter(
        (f) => f.provider === "google" && f.parent === parent && (!name || f.name === name) && (!onlyFolders || f.folder),
      );
      return json(res, 200, { files: list.map(asGoogle) });
    }
    if (req.method === "POST" && path === "/drive/v3/files") {
      const meta = JSON.parse((await readBody(req)).toString());
      const f = { id: randomUUID(), name: meta.name, folder: meta.mimeType === FOLDER, parent: meta.parents?.[0] ?? "root", content: Buffer.alloc(0), type: meta.mimeType, modified: now(), provider: "google" };
      files.set(f.id, f);
      return json(res, 200, { id: f.id });
    }
    if (req.method === "POST" && path === "/upload/drive/v3/files") {
      const boundary = (req.headers["content-type"] ?? "").match(/boundary=(.+)$/)?.[1];
      const raw = await readBody(req);
      const parts = raw.toString("latin1").split(`--${boundary}`).slice(1, -1);
      const parse = (part) => {
        const split = part.indexOf("\r\n\r\n");
        const head = part.slice(0, split);
        const body = part.slice(split + 4).replace(/\r\n$/, "");
        return { type: head.match(/content-type: ([^\r\n;]+)/i)?.[1], body: Buffer.from(body, "latin1") };
      };
      const meta = JSON.parse(parse(parts[0]).body.toString());
      const media = parse(parts[1]);
      const f = { id: randomUUID(), name: meta.name, folder: false, parent: meta.parents?.[0], content: media.body, type: media.type, modified: now(), provider: "google" };
      files.set(f.id, f);
      return json(res, 200, { id: f.id });
    }
    const one = path.match(/^\/(upload\/)?drive\/v3\/files\/([^/]+)$/);
    const f = one && files.get(decodeURIComponent(one[2]));
    if (!f || f.provider !== "google") return json(res, 404, { error: { code: 404 } });
    if (req.method === "PATCH" && one[1]) {
      f.content = await readBody(req);
      f.modified = now();
      return json(res, 200, { id: f.id });
    }
    if (req.method === "GET" && url.searchParams.get("alt") === "media") {
      res.writeHead(200, { "content-type": f.type });
      return res.end(f.content);
    }
    if (req.method === "DELETE") {
      files.delete(f.id);
      res.writeHead(204);
      return res.end();
    }
    return json(res, 400, { error: "unsupported" });
  }

  // ---- Microsoft Graph (OneDrive app folder) ----
  async function graph(req, res, url) {
    const path = decodeURIComponent(url.pathname.replace(/^\/graph/, ""));
    if (!authorised(req)) return json(res, 401, { error: { code: "InvalidAuthenticationToken" } });
    const asItem = (f) => ({ id: f.id, name: f.name, lastModifiedDateTime: f.modified, ...(f.folder && { folder: {} }) });
    if (req.method === "GET" && path === "/me/drive/special/approot") {
      let root = [...files.values()].find((f) => f.provider === "microsoft" && f.parent === null);
      if (!root) {
        root = { id: randomUUID(), name: "ClaimTidy", folder: true, parent: null, modified: now(), provider: "microsoft" };
        files.set(root.id, root);
      }
      return json(res, 200, { id: root.id });
    }
    let m = path.match(/^\/me\/drive\/items\/([^/:]+)\/children$/);
    if (m) {
      const parent = m[1];
      if (req.method === "GET") return json(res, 200, { value: [...files.values()].filter((f) => f.provider === "microsoft" && f.parent === parent).map(asItem) });
      const body = JSON.parse((await readBody(req)).toString());
      if ([...files.values()].some((f) => f.parent === parent && f.name === body.name)) return json(res, 409, { error: { code: "nameAlreadyExists" } });
      const f = { id: randomUUID(), name: body.name, folder: true, parent, modified: now(), provider: "microsoft" };
      files.set(f.id, f);
      return json(res, 201, asItem(f));
    }
    m = path.match(/^\/me\/drive\/items\/([^/:]+):\/([^:]+):\/content$/);
    if (m && req.method === "PUT") {
      const [, parent, name] = m;
      let f = [...files.values()].find((x) => x.parent === parent && x.name === name);
      const content = await readBody(req);
      if (!f) {
        f = { id: randomUUID(), name, folder: false, parent, provider: "microsoft" };
        files.set(f.id, f);
      }
      Object.assign(f, { content, type: req.headers["content-type"], modified: now() });
      return json(res, 201, asItem(f));
    }
    m = path.match(/^\/me\/drive\/items\/([^/:]+)(\/content)?$/);
    const f = m && files.get(m[1]);
    if (!f || f.provider !== "microsoft") return json(res, 404, { error: { code: "itemNotFound" } });
    if (m[2] && req.method === "PUT") {
      Object.assign(f, { content: await readBody(req), modified: now() });
      return json(res, 200, asItem(f));
    }
    if (m[2] && req.method === "GET") {
      res.writeHead(200, { "content-type": f.type });
      return res.end(f.content);
    }
    if (req.method === "DELETE") {
      files.delete(f.id);
      res.writeHead(204);
      return res.end();
    }
    return json(res, 400, { error: "unsupported" });
  }

  const pathOf = (f) => {
    const names = [];
    for (let x = f; x; x = files.get(x.parent)) names.unshift(x.name);
    return names.join("/");
  };

  const server = createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "authorization, content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/__state")
        return json(res, 200, [...files.values()].filter((f) => !f.folder).map((f) => ({ provider: f.provider, path: pathOf(f), size: f.content?.length ?? 0, text: f.type === "application/json" ? f.content.toString() : undefined })));
      if (url.pathname === "/__reset") {
        files = new Map();
        return json(res, 200, {});
      }
      if (url.pathname === "/__revoke") {
        revoked.add(url.searchParams.get("token"));
        tokens.clear();
        return json(res, 200, {});
      }
      if (url.pathname === "/google/auth" || url.pathname === "/microsoft/auth") return authorise(url, res);
      if (url.pathname === "/google/token" || url.pathname === "/microsoft/token") return token(req, res);
      if (url.pathname.startsWith("/google/")) return google(req, res, url);
      if (url.pathname.startsWith("/graph/")) return graph(req, res, url);
      json(res, 404, { error: "not found" });
    } catch (error) {
      json(res, 500, { error: String(error) });
    }
  });
  return { server, issue, state: () => [...files.values()] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 54399);
  createFakeCloud().server.listen(port, "0.0.0.0", () => console.log(`fake cloud on ${port}`));
}
