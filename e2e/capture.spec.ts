import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import pg from "pg";

// v13 acceptance: receipts are kept on the phone and in the user's own Google Drive or OneDrive
// (here a stand-in, scripts/fake-cloud.mjs), never on ClaimTidy's server.

const FAKE = "http://localhost:54399";
const MAILPIT = "http://127.0.0.1:54324";
const db = new pg.Pool({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
test.afterAll(async () => db.end());

const run = Date.now().toString(36);
const emailFor = (who: string, project: string) =>
  `${who}-${project}-${run}-${test.info().repeatEachIndex}-${test.info().retry}@e2e.claimtidy.test`;

interface CloudFile {
  provider: string;
  path: string;
  size: number;
  text?: string;
}
const cloudFiles = async (page: Page): Promise<CloudFile[]> => (await page.request.get(`${FAKE}/__state`)).json();
const cloudPhotos = async (page: Page) => (await cloudFiles(page)).filter((f) => /\.(jpg|pdf)$/.test(f.path));

/** The 6-digit code Supabase emailed (Mailpit catches it locally). */
async function latestCode(page: Page, email: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(async () => {
      const search = await (await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
      const id = (search.messages as { ID: string }[] | undefined)?.[0]?.ID;
      if (!id) return undefined;
      const message = await (await page.request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
      code = String(message.HTML ?? message.Text ?? "").match(/\b(\d{6})\b/)?.[1];
      return code;
    })
    .toBeTruthy();
  return code!;
}

async function signIn(page: Page, email: string, opts: { country?: string; storage?: "Google Drive" | "OneDrive" | "phone" } = {}) {
  await page.goto("/");
  // Clear earlier codes for this address, so the code read below is the one just sent.
  await page.request.delete(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Code").fill(await latestCode(page, email));
  await page.getByRole("button", { name: "Sign in" }).click();
  if (opts.country) await page.getByRole("button", { name: opts.country }).click();
  if (opts.storage === "phone") {
    await page.getByRole("button", { name: "This phone only" }).click();
    await page.getByRole("button", { name: "I understand, keep them on this phone" }).click();
  } else if (opts.storage) {
    await page.getByRole("button", { name: opts.storage, exact: true }).click();
  }
  await expect(page.getByText("Snap receipt")).toBeVisible();
}

/** Hands a photo to the camera input as the phone does: an in-memory file and a change event. */
async function snap(page: Page) {
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 1200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#3b3b3b";
    ctx.fillRect(0, 0, 900, 1200);
    ctx.fillStyle = "#f5f5f0";
    ctx.beginPath();
    ctx.moveTo(220, 120);
    ctx.lineTo(700, 160);
    ctx.lineTo(660, 1080);
    ctx.lineTo(180, 1040);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.font = "40px sans-serif";
    ctx.fillText("CAFE NERO  $88.00", 260, 400);
    const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
    const input = document.querySelector<HTMLInputElement>('[data-testid="snap"]')!;
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "receipt.jpg", { type: "image/jpeg" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function capture(page: Page, category: string) {
  await snap(page);
  const use = page.getByRole("button", { name: "Use photo" });
  await expect
    .poll(async () => ((await page.locator(".error").count()) ? `${await page.locator(".error").innerText()} [${await page.locator(".error").getAttribute("data-detail")}]` : (await use.isEnabled()) ? "ready" : "loading"))
    .toBe("ready");
  await use.click(); // tap 1
  await page.getByRole("button", { name: category }).click(); // tap 2
  await expect(page.getByRole("status")).toContainText(`Saved to ${category}`);
}

/**
 * Cut the phone off from the servers. Playwright's WebKit offline emulation also blocks reading
 * in-memory files (a real iPhone never does), so on WebKit the servers are blocked instead.
 */
const SERVERS = /^http:\/\/(localhost:8081|127\.0\.0\.1:54321|localhost:54399)\//;
async function cutNetwork(context: BrowserContext, project: string) {
  if (project === "iphone") await context.route(SERVERS, (route) => route.abort());
  else await context.setOffline(true);
}
async function restoreNetwork(context: BrowserContext, project: string) {
  if (project === "iphone") await context.unroute(SERVERS);
  else await context.setOffline(false);
}

async function newPhone(browser: Browser, project: string): Promise<{ context: BrowserContext; page: Page }> {
  // Request routing can miss requests from pages a service worker controls, so the WebKit runs
  // (which cut the network by routing) go without the worker.
  const context = await browser.newContext({ ...test.info().project.use, ...(project === "iphone" && { serviceWorkers: "block" as const }) });
  return { context, page: await context.newPage() };
}

test.beforeEach(async ({ request }) => {
  await request.get(`${FAKE}/__reset`);
});

test("snap, crop, tap a category: kept on the phone and in the user's Google Drive, nothing on our server", async ({ page }, info) => {
  const email = emailFor("snap", info.project.name);
  await signIn(page, email, { country: "Australia", storage: "Google Drive" });
  await capture(page, "Taxi / ground transport");
  await expect(page.getByTestId("sync-status")).toHaveText("Synced to Google Drive");
  await expect(page.locator('[data-testid="entry"]')).toHaveCount(1);

  const files = await cloudFiles(page);
  expect(files.map((f) => f.path.replace(/[0-9a-f-]{36}/, "<id>")).sort()).toEqual([
    "ClaimTidy/Receipts/" + new Date().toISOString().slice(0, 7) + "/<id>.jpg",
    "ClaimTidy/Receipts/" + new Date().toISOString().slice(0, 7) + "/<id>.json",
    "ClaimTidy/settings.json",
  ]);
  const details = files.find((f) => f.path.includes("/Receipts/") && f.path.endsWith(".json"))!;
  expect(JSON.parse(details.text!)).toMatchObject({ categoryId: "taxi-ground-transport", cardType: "personal" });

  // ClaimTidy's database has the account, and no receipt anywhere.
  const tables = await db.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name ~ '(entr|receipt_|claim|statement|categor)' and table_name <> 'receipt_usage'",
  );
  expect(tables.rows).toEqual([]);

  // Undo removes it from the phone and from Drive.
  await capture(page, "Meals");
  await expect.poll(async () => (await cloudPhotos(page)).length).toBe(2);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-testid="entry"]')).toHaveCount(1);
  await expect.poll(async () => (await cloudPhotos(page)).length).toBe(1);
});

test("this phone only: receipts never leave the phone", async ({ page }, info) => {
  await signIn(page, emailFor("device", info.project.name), { country: "United Kingdom", storage: "phone" });
  await capture(page, "Meals");
  await expect(page.getByTestId("sync-status")).toHaveText("Saved on this phone");
  await page.waitForTimeout(1000);
  expect(await cloudFiles(page)).toEqual([]);
});

test("a new phone restores the receipts from the user's OneDrive", async ({ browser }, info) => {
  const email = emailFor("restore", info.project.name);
  const first = await newPhone(browser, info.project.name);
  await signIn(first.page, email, { country: "United States", storage: "OneDrive" });
  await capture(first.page, "Meals");
  await capture(first.page, "Air travel");
  await expect(first.page.getByTestId("sync-status")).toHaveText("Synced to OneDrive");
  await first.context.close();

  const second = await newPhone(browser, info.project.name);
  await signIn(second.page, email, { storage: "OneDrive" });
  await expect(second.page.getByTestId("sync-status")).toHaveText("Synced to OneDrive");
  await expect(second.page.locator('[data-testid="entry"]')).toHaveCount(2);
  await expect(second.page.getByTestId("entries")).toContainText("Air travel");
  await second.context.close();
});

test("offline: 5 captures wait on the phone, then reach Drive once, even across a close mid-sync", async ({ browser }, info) => {
  // Needs real offline emulation (reopening offline). On iPhone this is the real-device check in
  // build plan section 9; WebKit's emulation can't read captured photos while offline.
  test.skip(info.project.name === "iphone", "WebKit offline emulation blocks in-memory file reads");
  const { context, page } = await newPhone(browser, info.project.name);
  await signIn(page, emailFor("offline", info.project.name), { country: "Australia", storage: "Google Drive" });
  await page.reload(); // let the service worker take control so the app opens offline
  await expect(page.getByText("Snap receipt")).toBeVisible();

  await context.setOffline(true);
  for (let i = 0; i < 5; i++) await capture(page, "Meals");
  await expect(page.getByTestId("sync-status")).toHaveText("Offline · 5 to sync");
  expect(await cloudPhotos(page)).toHaveLength(0);

  // Close the app offline and reopen it: the receipts are still there.
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.locator('[data-testid="entry"]')).toHaveCount(5);

  // Back online; close the app as soon as uploading starts, then open it again.
  const firstUpload = reopened.waitForRequest((r) => r.url().includes("/upload/drive/v3/files") && r.method() === "POST");
  await context.setOffline(false);
  await reopened.evaluate(() => window.dispatchEvent(new Event("online")));
  await firstUpload;
  await reopened.close();

  const again = await context.newPage();
  await again.goto("/");
  await expect(again.getByTestId("sync-status")).toHaveText("Synced to Google Drive");
  await expect.poll(async () => (await cloudPhotos(again)).length).toBe(5);
  await expect(again.locator('[data-testid="entry"]')).toHaveCount(5);
  await context.close();
});

test("account switching never shows or uploads one account's receipts for another", async ({ browser }, info) => {
  const a = emailFor("switch-a", info.project.name);
  const b = emailFor("switch-b", info.project.name);
  const { context, page } = await newPhone(browser, info.project.name);

  await signIn(page, a, { country: "Australia", storage: "Google Drive" });
  await cutNetwork(context, info.project.name);
  for (let i = 0; i < 3; i++) await capture(page, "Office supplies");
  await expect(page.locator('[data-testid="entry"][data-pending="true"]')).toHaveCount(3);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("dialog")).toContainText("3 receipts haven't reached Google Drive yet");
  await page.getByRole("button", { name: "Sign out", exact: true }).last().click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await restoreNetwork(context, info.project.name);

  await signIn(page, b, { country: "Australia", storage: "phone" });
  await expect(page.locator('[data-testid="entry"]')).toHaveCount(0);
  await page.waitForTimeout(2000); // give any stray sync a chance to misbehave
  expect(await cloudPhotos(page)).toHaveLength(0);

  // Reload straight after tapping Sign out (as if the app were closed mid sign-out): still signed out.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).last().click();
  await signIn(page, a);
  await expect(page.locator('[data-testid="entry"]')).toHaveCount(3);
  await expect(page.getByTestId("sync-status")).toHaveText("Synced to Google Drive");
  await expect.poll(async () => (await cloudPhotos(page)).length).toBe(3);
  await context.close();
});

test("Android share target: a receipt shared into the app opens for categorising", async ({ page }, info) => {
  test.skip(info.project.name !== "android", "Share targets are Android-only");
  await signIn(page, emailFor("share", info.project.name), { country: "Australia", storage: "phone" });
  await page.reload(); // let the service worker control the page
  await expect(page.getByText("Snap receipt")).toBeVisible();

  // What Android does when the user shares a photo to the installed app: a multipart POST.
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 800;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = "#fff";
    ctx.fillRect(150, 100, 300, 600);
    const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/share-target";
    form.enctype = "multipart/form-data";
    const input = document.createElement("input");
    input.type = "file";
    input.name = "receipt";
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "shared.jpg", { type: "image/jpeg" }));
    input.files = dt.files;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  });

  await page.getByRole("button", { name: "Use photo" }).click();
  await page.getByRole("button", { name: "Air travel" }).click();
  await expect(page.locator('[data-testid="entry"]')).toHaveCount(1);
  expect(new URL(page.url()).search).toBe("");
});
