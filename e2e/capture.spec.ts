import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import pg from "pg";

// M1 acceptance (build plan section 7): capture in at most 2 taps after the photo, offline queue
// with no duplicates across a close and reopen, and account switching that never leaks items.

const db = new pg.Pool({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
test.afterAll(async () => db.end());

const run = Date.now().toString(36);
const emailFor = (who: string, project: string) =>
  `${who}-${project}-${run}-${test.info().repeatEachIndex}-${test.info().retry}@e2e.claimtidy.test`;

async function entryCount(email: string): Promise<number> {
  const { rows } = await db.query(
    "select count(*)::int as n from entries e join auth.users u on u.id = e.owner_id where u.email = $1",
    [email],
  );
  return rows[0].n as number;
}

async function latestCode(page: Page, email: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(async () => {
      const res = await page.request.get(`http://127.0.0.1:54390/dev/outbox?to=${encodeURIComponent(email)}`);
      const mails = (await res.json()) as { subject: string }[];
      code = mails.at(-1)?.subject.match(/(\d{6})$/)?.[1];
      return code;
    })
    .toBeTruthy();
  return code!;
}

async function signIn(page: Page, email: string, country?: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Code").fill(await latestCode(page, email));
  await page.getByRole("button", { name: "Sign in" }).click();
  if (country) await page.getByRole("button", { name: country }).click();
  await expect(page.getByText("Snap receipt")).toBeVisible();
}

/** A photo of a white receipt on a dark table, made in the page. */
async function receiptPhoto(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const dataUrl = await page.evaluate(() => {
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
    return c.toDataURL("image/jpeg", 0.9);
  });
  return { name: "receipt.jpg", mimeType: "image/jpeg", buffer: Buffer.from(dataUrl.split(",")[1]!, "base64") };
}

async function capture(page: Page, category: string) {
  await page.getByTestId("snap").setInputFiles(await receiptPhoto(page));
  // The crop screen is ready (or shows why not).
  const use = page.getByRole("button", { name: "Use photo" });
  await expect
    .poll(async () => ((await page.locator(".error").count()) ? `${await page.locator(".error").innerText()} [${await page.locator(".error").getAttribute("data-detail")}]` : (await use.isEnabled()) ? "ready" : "loading"))
    .toBe("ready");
  // Tap 1: accept the automatic corners.
  await use.click();
  // Tap 2: the category saves it.
  await page.getByRole("button", { name: category }).click();
  await expect(page.getByRole("status")).toContainText(`Saved to ${category}`);
}

async function newPhone(browser: Browser, project: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(test.info().project.use);
  void project;
  return { context, page: await context.newPage() };
}

test("snap, crop, tap a category: saved and synced", async ({ page }, info) => {
  const email = emailFor("snap", info.project.name);
  await signIn(page, email, "Australia");
  await capture(page, "Taxi / ground transport");
  await expect(page.getByTestId("sync-status")).toHaveText("All synced");
  await expect(page.locator('[data-testid="entry"][data-pending="false"]')).toHaveCount(1);
  expect(await entryCount(email)).toBe(1);

  // Undo removes it again.
  await capture(page, "Meals");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-testid="entry"]')).toHaveCount(1);
  await expect.poll(() => entryCount(email)).toBe(1);
});

test("offline: 5 captures queue, then sync once with no duplicates, even across a close mid-sync", async ({ browser }, info) => {
  const email = emailFor("offline", info.project.name);
  const { context, page } = await newPhone(browser, info.project.name);
  await signIn(page, email, "Australia");
  // Let the service worker take control so the app opens offline.
  await page.reload();
  await expect(page.getByText("Snap receipt")).toBeVisible();

  await context.setOffline(true);
  for (let i = 0; i < 5; i++) await capture(page, "Meals");
  await expect(page.getByTestId("sync-status")).toHaveText("Offline · 5 waiting");
  await expect(page.locator('[data-testid="entry"][data-pending="true"]')).toHaveCount(5);
  expect(await entryCount(email)).toBe(0);

  // Close the app offline and reopen it: the queue survives.
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.locator('[data-testid="entry"][data-pending="true"]')).toHaveCount(5);

  // Back online; close the app as soon as uploading starts, then open it again.
  const firstEntry = reopened.waitForRequest((r) => r.url().endsWith("/v1/entries") && r.method() === "POST");
  await context.setOffline(false);
  await reopened.evaluate(() => window.dispatchEvent(new Event("online")));
  await firstEntry;
  await reopened.close();

  const again = await context.newPage();
  await again.goto("/");
  await expect(again.getByTestId("sync-status")).toHaveText("All synced");
  await expect.poll(() => entryCount(email)).toBe(5);
  await expect(again.locator('[data-testid="entry"][data-pending="false"]')).toHaveCount(5);
  await context.close();
});

test("account switching never moves one account's queued receipts to another", async ({ browser }, info) => {
  const a = emailFor("switch-a", info.project.name);
  const b = emailFor("switch-b", info.project.name);
  const { context, page } = await newPhone(browser, info.project.name);

  await signIn(page, a, "Australia");
  await context.setOffline(true);
  for (let i = 0; i < 3; i++) await capture(page, "Office supplies");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("dialog")).toContainText("3 receipts haven't uploaded yet");
  await page.getByRole("button", { name: "Keep them and sign out" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await context.setOffline(false);

  await signIn(page, b, "Australia");
  await expect(page.getByTestId("sync-status")).toHaveText("All synced");
  await expect(page.locator('[data-testid="entry"]')).toHaveCount(0);
  await page.waitForTimeout(2000); // give any stray sync (page or worker) a chance to misbehave
  expect(await entryCount(b)).toBe(0);
  expect(await entryCount(a)).toBe(0);

  // A's cached data left the device with A.
  const cached = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("claimtidy.me.")));
  expect(cached).toHaveLength(1);

  // Reload straight after tapping Sign out (as if the app were closed mid sign-out): still signed out.
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, a);
  await expect.poll(() => entryCount(a)).toBe(3);
  await expect(page.getByTestId("sync-status")).toHaveText("All synced");
  expect(await entryCount(b)).toBe(0);
  await context.close();
});

test("Android share target: a receipt shared into the app opens for categorising", async ({ page }, info) => {
  test.skip(info.project.name !== "android", "Share targets are Android-only");
  const email = emailFor("share", info.project.name);
  await signIn(page, email, "Australia");
  await page.reload(); // let the service worker control the page
  await expect(page.getByText("Snap receipt")).toBeVisible();
  const photo = await receiptPhoto(page);

  // What Android does when the user shares a photo to the installed app: a multipart POST.
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/share-target";
    form.enctype = "multipart/form-data";
    const input = document.createElement("input");
    input.type = "file";
    input.name = "receipt";
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "shared.jpg", { type: "image/jpeg" }));
    input.files = dt.files;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }, photo.buffer.toString("base64"));

  await page.getByRole("button", { name: "Use photo" }).click();
  await page.getByRole("button", { name: "Air travel" }).click();
  await expect(page.getByTestId("sync-status")).toHaveText("All synced");
  await expect.poll(() => entryCount(email)).toBe(1);
  expect(new URL(page.url()).search).toBe("");
});
