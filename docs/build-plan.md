# ClaimTidy: Build Plan

_Draft v11, 27 Sep 2026. The product is named **ClaimTidy** (claimtidy.com). v2 to v4, v6 and v7 apply the Codex review; v8 removes Sign in with Apple from R1 and adds Stripe's fees; v9 adds the name and the paid-countries rule; v10 and v11 apply Codex rounds 5 and 6 on billing safety; and v5 applies the product owner's changes: an installable web app instead of app-store apps, receipt-based pricing tiers, and no mileage in Release 1. See the change log at the end. Builds [product-concept.md](product-concept.md) v12. Where the two disagree on *what* the product does, the concept wins; this plan decides *how* and *in what order*._

> **Review status (27 Sep 2026):**
> - **Approved by Codex:** everything except billing (the v8 approval). The later edits (the name, and the paid-countries rule for choosing where to sell) were reviewed in cycle 2.
> - **Billing (sections 6.10–6.13) is not yet independently approved.** The product owner decided to **validate it through testing**: before M8 starts, the Stripe mechanics are proven in Stripe test mode, and a focused Codex review of the billing section is run.
>   - This covers first-payment confirmation, retries, one subscription per account, Radar country rules, and the once-only outcome per Checkout session.
>   - M0–M7 don't depend on billing.
> - **Building started on 6 Oct 2026** with the owner's go-ahead. Progress is tracked in section 13.

## 1. Goal

Ship **Release 1 (R1): individual mode, end to end**, as an **installable web app** for iPhone (Safari) and Android (Chrome) in Australia, the United States and the United Kingdom. There's no App Store or Google Play in R1. R1 must be good enough that one person can:

- capture a month of work receipts,
- reconcile a company-card statement,
- send a finished claim pack to their manager,
- get it approved,
- and, after a 3-month free trial, pay **$5 AUD a month (Basic, up to 35 receipts) or $10 (Premium, 36 to 200)** by card.

**Release 2 (R2)** adds company workspaces. **A later release** adds native store apps and mileage (section 10). R1 must lay the data model and security foundations so that later releases add features rather than rewriting them.

## 2. Decisions already made

| Topic | Decision | Source |
|---|---|---|
| First release | Individuals first. Companies in R2 | Product owner, 27 Sep 2026 |
| Platform | An installable web app, with no app stores in R1. Native apps later | Product owner, 27 Sep 2026 |
| Mileage | Not in R1 | Product owner, 27 Sep 2026 |
| Price | 3 months free, then **Basic $5 AUD** (up to 35 receipts a month) or **Premium $10 AUD** (36 to 200). The tier is **automatic** each month. Above 200, AI reading pauses. Companies pay per employee who claimed, with the same tiers per employee | Product owner; concept section 17 |
| Payment | Card through Stripe. The app is **open worldwide**, but **paid plans are sold only in "paid countries"**: Australia and the US at launch. Others are added by the owner once the accountant confirms. Countries whose tax must be collected from the first sale (UK, EU, South Korea, Mexico and others) get the free trial only, until the business registers there | Product owner, 27 Sep 2026 |
| Name | **ClaimTidy**, at **claimtidy.com** | Product owner, 27 Sep 2026 |
| Trial | No card to start. Read-only after the trial until the user subscribes | Product owner |
| Claim email | Sent by the app with Reply-To set to the user, with attachments. Approval needs designated-approver verification | Concept sections 7 and 15 (Codex-reviewed) |
| Everything else | As in the concept (v9 was approved by the Codex review; v10 and v11 change pricing, platform and mileage timing only) | `docs/product-concept.md` |

## 3. Release 1 scope

### In R1

| Area | What's included | Concept section |
|---|---|---|
| Sign-up | Google, Microsoft (personal and work accounts, as plain sign-in) and email with verification. **No Sign in with Apple in R1** (it comes with the native apps). Country question (AU, US, UK or generic). **Individual profile only** | 0, 15 |
| Capture | The snap button opens the phone's camera. Best-effort automatic edge detection with draggable corners. Pick from Photos/Files, including PDF e-receipts. Share into the app on Android (the installed app registers as a share target). Personal/Company card switch. Category buttons with the AI suggestion highlighted. Undo/Edit | 1 |
| AI read | Date, merchant, amount, currency, tax, supplier tax number and a category suggestion. Monthly receipt counting for the tiers and caps | 1, 17 |
| Categories | Manual (add, rename, reorder, archive) and "snap the claim form" (AI reads categories from a photo or file) | 3 (B, C), 15 |
| Claim forms | Upload the employer's Excel form (AI proposes the column mapping and totals block; the user confirms), or use the built-in default form. Rows are inserted above the totals, and totals are live formulas | 4, 15 |
| Personal claim | One per calendar month. Receipts, receipt-free notes and pending explanations all qualify | 4 |
| Company card | CSV upload, bank-profile learning, statement period, line classification, matching, explanations, and a per-statement reconciliation form with the tie-out | 6 |
| Currency and tax | Multi-currency with the rate on the transaction date. AU, US and UK tax packs plus generic mode | 5 |
| Submit and approve | Pre-submit check, `.xlsx` and PDF claim pack, app-sent email, approver page with a one-time code, reject per form or per explanation, versions, "Mark paid" by the user | 7 |
| Reminders | 3rd business day (email always; web push when the app is installed and allowed), trial-ending and tier notices | 8, 17 |
| Offline | Capture queue on the phone (service worker plus IndexedDB); sync when back online | 9 |
| Duplicates | Same receipt twice, or an e-receipt plus a photo | 12 |
| Storage | **App cloud only**, hosted in the user's region | 14 |
| Retention | 6-month default, owner-controlled | 11 |
| Billing | 3-month trial with no card. Stripe card subscription at Basic $5, with an automatic Premium top-up of $5 in months with 36 to 200 receipts. AI reading pauses above 200. Read-only after the trial, or after 7 days of unpaid billing. **Subscribing is only possible from a paid country** (section 6.13) | 17 |
| Account | Account deletion and full data export in settings (GDPR; also required by the stores for the later native apps) | new |
| App-owner console | Users, subscriptions, trials and monthly receipt counts, per-account limit overrides, tax-pack parameters, FX overrides, retention default, delete any record, suspend an account, audit trail | 2, 11 |

### Deferred to R2 (not in R1)

- Company workspaces, invites, verified domains, roles (company admin, finance, manager, employee) and the finance web portal.
- Company billing: $5 or $10 per employee who claimed that month, by the tier rule.
- Microsoft 365 / Google Drive storage, Microsoft 365 single sign-on, Outlook sending and manager lookup.
- Category sync from a SharePoint or Google Sheet.
- Phone-only storage mode.
- The e-receipt forwarding address and Outlook folder watching.
- Multiple profiles per person, and joining a company while keeping history.
- Manager nudges, and finance's outstanding list.

### Later release (after R2 or alongside it)

- **Native iPhone and Android apps** in the App Store and Google Play, sharing `packages/core`.
- **Mileage** (concept section 16), including the tax-year ledger designed in the concept.

### Never (per the concept)

GPS trip tracking, paying expenses inside the app, languages other than English, and a background screenshot watcher.

## 4. Architecture

```
 Installable web app (PWA): Next.js + TypeScript, served from one global origin (app shell only, no personal data)
   │  service worker (offline shell) · IndexedDB queue (images + metadata) for offline capture
   │  after sign-in, it talks only to the user's regional API
   ▼
 Regional stack  ×3  (AU: Sydney · US: N. Virginia · UK: London)
   ├─ Supabase project: Postgres (row-level security), Auth, Storage (receipt images, claim packs), pg_cron
   ├─ API + worker (Node 22, Fastify, TypeScript) on Google Cloud Run, same region
   │    ├─ AI read (Claude API), document generation (xlsx + PDF), CSV import, matching, receipt counting
   │    ├─ email (Postmark) and web push (VAPID)
   │    └─ job queue (Supabase Queues / pgmq), scheduled jobs (pg_cron → API)
   └─ Regional web routes: approver page, export download, app-owner console (same Next.js app, calling the regional API)
 Global: account directory (provider identity / email alias, keyed hashes → hosting region) · Stripe (billing) · FX rates source
```

**Key choices and why:**

| Choice | Why | Alternative considered |
|---|---|---|
| **Installable web app (PWA) with Next.js + TypeScript** | One codebase for iPhone and Android, with no store review. Stripe billing makes receipt-based pricing possible. The owner is on Windows, and no Mac is needed. Business logic lives in `packages/core`, so the later native apps (React Native) reuse it | Expo native apps: better camera and background behaviour, but the stores' fixed-price subscriptions can't bill by receipt count, and store review adds launch risk |
| **Camera through the phone's own camera app** (`<input type="file" accept="image/*" capture="environment">`) | Most reliable across iPhone Safari and Android Chrome, and gives full-resolution photos | Live `getUserMedia` viewfinder: nicer, but more fragile across browsers. Could come later |
| **Best-effort edge detection in the browser** (OpenCV.js-based, loaded on demand) with draggable corners | No native document scanner on the web. Manual corners always work | Server-side cropping: slower, and doesn't work offline |
| **Supabase** (Postgres, Auth, Storage) | Google, Azure/Microsoft, Apple and email sign-in built in. Row-level security puts per-user isolation in the database. Available in Sydney, N. Virginia and London | Firebase: its document model suits claim versions and tie-outs less well |
| **Separate Node API + worker on Cloud Run** | Excel/PDF generation and image handling need more CPU and memory than edge functions allow. One testable TypeScript service | Supabase Edge Functions: too tight a CPU limit |
| **Three regional stacks from day one** | The concept promises hosting in the user's region, and UK GDPR restricts transfers. Adding regions later means migrating live data | One AU region: cheaper, but it breaks the promise to UK users |
| **Claude API for the AI read** | Vision, PDF input and structured JSON output in one call. Model `claude-opus-5` with structured outputs (`output_config.format`), adaptive thinking at `low` effort, and server-side refusal fallbacks. Roughly **2–3 US cents per receipt**, so the 35-receipt Basic tier costs about A$1.40 in AI | A cheaper model (Sonnet 5 / Haiku 4.5) only if the extraction eval shows equal accuracy. **That's the product owner's call** |
| **Stripe Billing** (Checkout in setup mode, Customer Portal, webhooks, and Stripe Tax's threshold monitoring) | Card subscriptions, invoice items for the Premium top-up, automatic retries for failed payments, and a hosted page for users to view invoices and cancel | A merchant-of-record service (Paddle): handles every country's tax for 5% + 50c. The owner chose Stripe with paid countries instead (27 Sep 2026) |
| **ExcelJS** for forms, **HyperFormula** to check totals in tests, **pdf-lib + sharp** for PDFs | They preserve the employer's template formatting. The formula contract (section 6.3) governs every rewrite | SheetJS community edition: loses more styling |
| **Postmark** for email | Reliable transactional delivery with attachments, and inbound processing for R2 forwarding | Resend: fine too |

**Region routing.** An account's **hosting region** (AU, US or UK) is separate from its **profile country** (which sets tax rules and can change). The hosting region is fixed when the account is created.

- **A small global account directory** (its own tiny service and database in the AU region) maps identities to a hosting region. Every key is stored as an HMAC with a secret key; no plain email, name or provider ID is stored.
  - **Primary key:** for Google and Microsoft (and Apple when it's added with the native apps), the provider's **stable account ID**. That's the token issuer plus the subject; for Microsoft it's the tenant ID plus the object ID, not the email. Each provider uses one fixed app registration, so the ID never changes.
  - **Email account key:** for email sign-in, the verified email address.
  - **Aliases:** each account also stores its **verified** email addresses as aliases. **Linking policy:** this matches Supabase's own automatic linking, which joins identities that share a verified email.
    - When the directory sees an unregistered provider identity whose verified email matches an existing account's alias, it routes the sign-in to **that account's region**. Supabase there links the new identity to the same user.
    - It's never treated as a new account.
    - Unverified emails are never used for matching.
  - **Email changes and linking:**
    - A provider account whose email changes still matches by its stable ID, and the new email is added as an alias after sign-in.
    - Linking another sign-in method to an existing account needs the user to be signed in to that account. It adds the new identity to the same directory record.
- **Sign-in on any device:**
  1. The user signs in with Google or Microsoft through the provider's **web sign-in library** (Google Identity Services, MSAL.js), each of which returns a signed ID token bound to a nonce. Or they type their email address.
  2. The directory verifies the ID token (signature, issuer, audience, nonce) or the email one-time code, looks up the stable identity, and returns the region.
  3. The app then completes sign-in against that region's Supabase: `signInWithIdToken` for the providers, or a one-time email code for email sign-in.
- **New accounts:** if the directory has no entry, this is a new account. The app then asks "Which country is this profile for?" (the concept's question). The hosting region is the matching one, and generic-mode countries use the nearest of AU, US or UK, which the app says. The directory **reserves** the identity for that region **before** the regional account exists.
- **Enforced in every region, not just in the app (BP-008).** Each regional Supabase Auth runs a **"before user created" hook** that calls the directory. It lets an account be created only when the directory reservation for that identity names **this** region; anything else is refused (fail closed).
  - This means sending a valid provider token straight to another region's sign-in endpoint can't create a second account or a second trial.
  - If regional creation fails after the reservation, the reservation stays pending, and a retry in the same region completes it. Pending reservations expire after 24 hours.
  - **M0 checks** the hook works on each Supabase project. If it's unavailable, the fallback is sign-ups disabled in each region, with accounts created only by the directory service through the Supabase admin API.
- **Every session is checked, including linked identities (BP-010).** The "before user created" hook doesn't run when Supabase links an identity to an existing user, so each region also runs a **custom access token hook**. It runs every time a session token is issued, including a sign-in that just linked a new identity.
  - The hook compares the user's identities with the directory.
  - Any identity not yet registered is **registered to this account and region** in the same step. That covers a same-email identity that Supabase linked automatically.
  - If an identity is already registered to a **different** account or region, no token is issued (fail closed), and the owner console gets a conflict to resolve.
  - This makes the directory and regional Auth agree after every sign-in, whichever path the user took.
- **Changing the profile country** changes tax rules only. Hosting stays where it is.
  - Moving hosting to another region is an explicit, owner-assisted migration, and not in R1.
  - The privacy policy says where data is hosted.
- **Cross-origin rules:** the regional APIs accept requests only from the app's own origin.
- This keeps the concept's order (sign in, then country) for new accounts.

## 5. Data model (R1, shaped for R2)

Every table has an `owner_id` (R1: the user; R2 adds `workspace_id`). Money is stored as integer minor units plus a currency code; FX rates are stored as decimal strings.

**Who can write what.** The web app **never writes to the database or storage directly**.

- **Reads:** signed-in users get read-only row-level security on their own rows (the `authenticated` role has `SELECT` only; `INSERT`, `UPDATE` and `DELETE` are revoked on every table). Storage buckets allow reading your own objects and nothing else.
  - **Secrets are never readable, even by their "owner".** View tokens, one-time code verifiers, attempt counters, Stripe customer and payment identifiers, and directory keys live in a separate `private` schema that isn't exposed to the Data API and has no grants for `authenticated`.
  - Claimants read approval **status** (sent, viewed, approved, rejected, comment) through a view that contains no verification material. API responses never include it either.
- **All changes go through the API**, which enforces the state machine:
  - Drafts can be edited by their owner.
  - Submitted claim versions, their entries and statement lines are frozen.
  - Approval decisions can only be made by a verified approver.
  - Trial dates, **receipt counters and tier and limit overrides**, subscriptions, tax packs, rate tables, FX rates and the audit log are **server-only**. No user can change them through any path, including their own records.
- **Uploads** use short-lived signed upload URLs from the API, for a new random object name only. There is no overwrite or delete; deletions happen through the API.
- **Claim-pack objects** are written once by the worker and can't be deleted except by retention or the owner, through the API with an audit entry.
- The API uses the service role only inside server code. The service-role key never reaches a device.

| Table | Purpose |
|---|---|
| `profiles` | Country, home currency, date format, time zone, holiday region (optional state or territory for AU and US), `trial_started_at` |
| `categories` | Name, icon, colour, sort order, `archived_at` |
| `form_templates` | Kind (`personal` or `company_card`), stored `.xlsx`, confirmed column mapping, totals-block definition |
| `entries` | A receipt or note (trips come in a later release). Card type, category, date, merchant, description, original amount and currency, FX rate, home amount, tax, supplier tax number, image path, raw AI read (JSON), explanation and its status, perceptual hash, `client_uuid` (for idempotent offline sync) |
| `receipt_usage` | One row per counted AI read: account, usage month (in the account's time zone), read time, phase (`trial` or `paid`), entry, counted/uncounted and why (duplicate deleted, undone). Server-only |
| `usage_months` | Per account per month: trial count, paid count, tier (Basic or Premium, from the paid count), caps reached, top-up invoice item ID, closed flag. Server-only |
| `invoices` | Stripe invoice ID, kind (subscription or top-up), amount, status, first payment-failure time. Re-read from Stripe on every webhook. Server-only |
| `cards`, `bank_profiles` | A card's last four digits and label; the saved CSV layout for each bank |
| `statements`, `statement_lines` | Period, opening and closing balances; each line's type, matched entry, explanation and its status |
| `claims`, `claim_versions` | Kind and period. Each version is an immutable snapshot: file paths, SHA-256, totals, rates used, status history |
| `approvers`, `approval_requests` | Approver emails (To and Cc). Each request's decision, comment, timestamps and how the approver was verified. **Tokens, code verifiers, expiry and attempts are in `private.approval_secrets`** (server-only) |
| `subscriptions` | Stripe subscription status, current period, `past_due_since`, updated only by verified Stripe webhooks. Stripe IDs are in `private` |
| `paid_countries`, `billing_provisioning`, `checkout_session_results` | The owner-edited list of countries where subscriptions are sold, with the owner-entered tax threshold and currency for alerts (audited, synced to the Stripe Radar value list); each account's subscription provisioning state (`none`, `provisioning`, `pending_payment`, `subscribed`); and the permanent, once-only outcome of each Checkout session. Server-only |
| `tax_packs`, `fx_rates`, `limits` | Owner-editable parameters: tax thresholds by year, FX overrides, and the tier and cap numbers (35, 200, trial 100) with per-account overrides. The rule logic itself is versioned code |
| `audit_log` | Append-only record of every submission, decision, edit, deletion, limit override and owner action |

Tax-pack **logic** lives in code (`packages/core/tax/{au,us,uk,generic}.ts`); **thresholds** live in the database, so the owner can update them yearly without a release. Each claim version snapshots the pack version and parameters it used.

## 6. How the hard parts work

1. **Offline capture (web).**
   - A service worker caches the app shell. Images and metadata are written to IndexedDB with a `client_uuid`.
   - **Every queued item is bound to its account.** Each account gets its **own IndexedDB database**, named from a hash of the account ID and hosting region. Each item also records the account ID and region it was captured under.
   - **Sync only under the same account.** The sync code (in the page, and the Android Background Sync handler) uploads an item only when the current session's account ID and region match the item's.
     - `POST /entries` also sends the item's account ID, and the API rejects any mismatch with the session.
     - Otherwise the item is skipped and stays queued.
   - **Sign-out or account switch:**
     - In-flight uploads are cancelled.
     - The previous account's cached data (lists, drafts, images already synced) is deleted from the device.
     - **Only unsynced items** stay, in that account's database, never shown to or uploaded by another account. Signing out with unsynced items warns first: "3 receipts haven't uploaded yet. They'll stay on this device and upload next time you sign in, or you can delete them now."
   - When online, the app uploads and calls `POST /entries` (safe to repeat, keyed on `client_uuid`). This happens when the app opens, and on Android through Background Sync. Nothing is removed from the phone until the server confirms.
   - The app requests persistent storage (`navigator.storage.persist()`) and encourages installing to the home screen, because iPhone Safari may clear a website's stored data after a period of non-use.
   - The app shows how many items are waiting and warns if any have waited more than 24 hours.
   - If the account is read-only, sync is refused with a clear message and items stay on the phone.
2. **AI read.**
   - The worker sends the image or the PDF (all pages), the user's category list and their recent merchant→category history to Claude, with a JSON schema. The result is validated. Low-confidence fields are flagged "check this". The raw response is kept.
   - The user's category tap always wins.
   - Failures and refusals fall back to manual entry.
   - **Before each read, the worker checks the monthly limits** (section 6.11). Above the cap, the receipt is saved without an AI read, and the user types the details.
3. **Template mapping.**
   - The uploaded `.xlsx` is turned into a text grid (cell addresses and values).
   - Claude proposes the header row, the column mapping and the totals block. The user confirms on a preview.
   - Supported layout: a flat list of rows with totals below. `.xlsm` files, merged header rows and pivot-style layouts are rejected with a clear message; the built-in form is offered instead.
   - **Formula contract**, checked at upload. The app parses every formula in the sheet and classifies each cell reference:
     - **Detail references:** a range covering the whole detail area of a mapped column (first to last detail row), used in `SUM`, `SUMIF`, `SUMIFS` or `SUBTOTAL` (function 9 or 109). These are **extended** to cover inserted rows.
     - **Totals-block references:** cells inside the totals block (for example a grand total `=SUM(J5:J6)` that adds the category subtotals). The whole totals block moves down by the number of inserted rows. These references are **relocated with an old-to-new address map** (after inserting 2 rows, `J5:J6` becomes `J7:J8`), **not** extended over detail rows.
     - Every other formula on the sheet that points at a moved cell is relocated the same way.
     - **Anything else that touches detail rows** (another function, a partial range, a single detail cell, a reference from another sheet): the template is **rejected** at upload with the cell address and reason, and the built-in form is offered.
   - The same classifier runs again after generation, and generation fails loudly rather than producing a pack with wrong totals.
4. **Claim pack generation.**
   - Rows are inserted above the totals block. Only references identified by the formula contract are rewritten or relocated.
   - The PDF embeds the evidence in row order. Each receipt starts on a new page headed with "Row n".
     - Photos are one page.
     - **A PDF e-receipt keeps every one of its pages, in the original order**, copied as PDF pages (not re-rendered), each headed "Row n, page k of m".
   - Each file's SHA-256 is stored.
   - Submitted versions are never regenerated.
5. **Approval.**
   - The email goes To the approver and Cc to finance.
   - **Attach or link?** The worker builds the complete message (body plus Base64-encoded attachments) and measures its encoded size. If it's **8 MB or less**, the files are attached. That leaves headroom under Postmark's 10 MB limit, which counts the whole encoded message ([Postmark limits](https://postmarkapp.com/support/article/1056-what-are-the-attachment-and-email-size-limits)).
   - Otherwise the email carries **secure download links** for all files, with a summary table in the body.
   - Images are resized and compressed for the PDF (about 1600 px on the long edge, JPEG quality around 80) to keep typical monthly packs attachable. The originals stay in storage.
   - The buttons open the web approver page with a **view-only** token.
   - To decide, the page sends a 6-digit code **only to the designated approver's address**. The code lasts 10 minutes, with 5 attempts. The decision and how the approver was verified are recorded.
   - The server stores only a **verifier**: an HMAC with a server-held secret over the request ID and the code. It's never exposed to any client, so it can't be brute-forced offline.
   - A code is **consumed atomically**: verifying and recording the decision happen in one transaction, and the verifier is deleted.
   - Requesting a new code invalidates the old one.
6. **Company-card import.**
   - The first upload from a bank has Claude propose the column mapping. The user confirms a preview, including ambiguous dates, sign conventions and refunds. The layout is saved as a bank profile.
   - Lines are classified as purchase, refund, fee/interest or payment.
   - Matching uses amount, date (± 3 days) and a fuzzy merchant name.
   - The tie-out is purchases − refunds + fees/interest = closing − opening + payments.
   - CSV mapping calls to the AI don't count as receipts.
7. **Retention.** A daily job per region applies the retention period (6 months by default) to **everything that holds receipt content**:
   - receipts and notes,
   - their original images,
   - claims and **every claim version**, with each version's `.xlsx` and PDF objects,
   - statement files and lines,
   - pending approval and view tokens, which are invalidated.

   **When the clock starts:**
   - For submitted material: the claim's final status (Approved, Paid or Rejected-and-abandoned).
   - For drafts: when the entry was **created or imported** in the app, not the receipt's transaction date. An old receipt imported today gets the full period.
   - Nothing is removed without at least **30 days' warning** in the app and by email. If the retention period is shortened, affected drafts get that 30-day notice before removal.
   - A claim waiting for a decision is never removed.

   **What survives:**
   - The audit log keeps metadata only (what, when, who), never content.
   - `receipt_usage` and `usage_months` keep counts only (no content) for as long as the related invoices are kept for tax records.
8. **Business days.** Holidays come from the `date-holidays` library by country, plus state or territory where set (national holidays otherwise). Reminders run from a daily job in each profile's local time zone. They're sent by email, and also by web push when the app is installed and notifications are allowed (iPhone supports web push only for home-screen apps).
9. **FX.** Daily reference rates are cached in `fx_rates` from the rate source. The user can override the converted amount on a personal card. The owner can add missing currencies manually.
10. **Entitlement.**
    - A user is `active` when both of these hold:
      - they're within 3 months of `trial_started_at`, or have a Stripe subscription with status `trialing`, `active` or **`past_due`**. `past_due` is included so the grace period works; `unpaid`, `canceled` and `incomplete_expired` aren't;
      - they have **no unpaid invoice more than 7 days past its first failed payment**.
    - **Unpaid invoices are tracked one by one (BP-013)** in `invoices`: Stripe invoice ID, amount, kind (subscription or top-up), status, and the time of the first failed payment.
      - Webhook events are treated only as a **signal**. The API re-reads the invoice from the Stripe API before updating, so events arriving out of order can't leave a stale status.
      - Paying a newer invoice doesn't clear an older one. Access returns only when **every** invoice more than 7 days overdue is paid, voided, or written off by the owner (audited).
    - **The 7-day cutoff (BP-016)** is exactly 7 × 24 hours after an invoice's **first** failed payment. That time is recorded once and never changed.
    - **Stripe settings to match:**
      - Smart Retries run for 2 weeks.
      - When all retries fail, the subscription is marked **`unpaid`** (not cancelled). The account stays recoverable, and paying the open invoices restores it.
    - **Reconciliation is serialised per invoice (BP-017).** Every update to an invoice row (from a webhook, the month-close job, deletion, or an owner write-off done through the Stripe API) runs one sequence:
      1. Take a transaction-scoped database lock on that invoice's ID.
      2. Fetch the invoice from Stripe.
      3. Write the result, then release the lock.

      Two handlers for the same invoice can't interleave.
      - **Stale-write guard:** a finished status (`paid`, `void`, `uncollectible`) is never overwritten by `open`.
      - The first-failure time is never cleared or moved.
    - It's checked **on the server** for sync, AI reads and submissions. The app shows the read-only state and the subscribe screen.
    - Because clients can't write to the database (section 5), the check can't be bypassed.
    - Export and viewing are always allowed.
11. **Receipt counting, tiers and caps.**
    - **Counted:** a new entry whose image or PDF gets its first AI read, counted once in the account's time-zone calendar month when the read starts. Each `receipt_usage` row records the read time and its **phase**: `trial` (before the trial end date) or `paid`.
      - One `receipt_usage` row per entry is enforced by a unique constraint, so retries and re-reads never double-count.
      - Counting and the cap check happen in **one transaction with a per-account-month row lock**, so two receipts uploaded at the same moment can't both slip past the cap.
    - **Not counted** (the row is marked uncounted, with the reason, before the month closes):
      - Undo within the capture confirmation.
      - A receipt deleted after the app flagged it as a duplicate.
      - Manual entries with no AI read.
      - CSV and template mapping calls.
    - **Limits** (from the `limits` table, with per-account owner overrides): trial 100 a month; paid 200 a month. Premium applies above 35.
    - **The month the trial ends (BP-012):**
      - **Only `paid` reads decide the tier and the top-up.** Trial reads never push anyone into Premium, and paid reads after the trial ends are billed normally.
      - For example, if the trial ends on 15 September, 90 trial reads plus 36 paid reads gives one top-up, while 90 trial reads plus 35 paid reads gives none.
      - **Caps follow the phase:** trial reads count toward the trial cap (100), and paid reads toward the paid cap (200). Neither counts toward the other.
      - Notices use the paid count once the trial has ended.
    - **Subscribing during the trial** is allowed. The Stripe subscription is created with its trial ending exactly at the account's trial end date, so the first $5 is charged then. The phase switches at that moment, whether or not the user subscribed early.
      - At the limit, new captures are saved **without** an AI read (the user types the details), and the notice explains why.
    - **Billing:**
      - The Stripe subscription is **Basic, $5 a month, billed in advance** on the monthly anniversary of subscribing.
      - When an account's month closes (a job just after local midnight on the 1st), the API finalises `usage_months`. If the **paid-phase** counted total is **36 or more**, it adds a **one-off $5 "Premium top-up" invoice item** (idempotency key: account + month). It's charged on the next invoice.
      - When a subscription is cancelled with an open top-up, the API invoices it straight away.
      - The **trial months never create a top-up.**
    - **Notices** go out at 30, 36 and 180 receipts (in the app, plus email at 36).
12. **Account deletion (BP-014)** is a **retryable job**. Each step records its result, so a failure resumes where it stopped:
    1. **Freeze:** the account can't capture, sync or submit, and pending approval links are invalidated.
       - The API **refuses to create any new Stripe Checkout or Customer Portal session** for the account.
       - A **billing tombstone** is written: the Stripe customer ID plus the deletion state, in `private.billing_tombstones`, kept with the tax records.
    2. **Close the checkout window (BP-018):** list all **open Checkout Sessions** for the customer and **expire** each one through the Stripe API. Checkout sessions are also created with a 30-minute expiry, so the window is always short.
    3. **Stop billing:** cancel the Stripe subscription **immediately** (no renewal), then confirm with Stripe that the customer has no active subscriptions and no upcoming invoice.
       - **Late or racing completions:** any `checkout.session.completed` or `customer.subscription.created` webhook for a tombstoned customer is handled by the tombstone, never by the (deleted) account:
         - the new subscription is cancelled immediately,
         - any payment it took is **refunded in full**,
         - the event is logged for the owner.

         Webhooks for tombstoned customers can never create or restore app records.
       - The final check in step 7 is repeated after any such late event.
    4. **Settle top-ups:**
       - A top-up for an already-closed month is invoiced and charged straight away.
       - The **current, unfinished month is not billed**, and any pending invoice item for it is deleted.
       - If that final charge fails, the invoice stays in Stripe as a record. It's shown to the owner, it's never retried against a new card, and it doesn't block deletion.
    5. **Detach** all saved payment methods.
    6. **Delete app data:** every row and storage object, then the account-directory entry, then the regional Auth user. **Keep only tax records:** the Stripe customer and its invoices (needed for tax), the billing tombstone, and audit-log metadata.
    7. **Verify:** Stripe shows no open Checkout Session, no active subscription and no upcoming invoice for the customer, and the region has no rows for the account.
13. **Paid countries (sales tax).**
    - **The list:** an owner-editable, audited `paid_countries` table. It starts with **AU and US**. Candidates to add once the accountant confirms: New Zealand, Canada, Japan, Singapore, Norway and Switzerland, all of which have registration thresholds.
    - **No-threshold countries stay off the list** until the business registers there: the UK, EU countries, South Korea, Mexico, Chile, Turkey and others.
    - **Evidence of location:** a subscription is allowed only when **both** of these are in the list:
      - the **card's issuing country** (from Stripe),
      - the **billing-address country** (collected by Checkout).

      Any mismatch or missing value means not allowed.
    - **Checking before any charge:**
      1. Checkout runs in **setup mode**, which only saves the card and never charges.
      2. When `checkout.session.completed` arrives, the API reads the saved card's country and the billing address.
      3. The API **creates the subscription itself** only if both pass, and only if the customer isn't tombstoned (section 6.12). If the user subscribes during the trial, the subscription is created with its trial ending at the account's trial end date.
         - **Exactly one subscription per account (BP-019):**
           - Each account has exactly one Stripe customer.
           - A `billing_provisioning` record (server-only) tracks the state: `none`, `provisioning`, `pending_payment`, `subscribed`. It's updated under a **per-account lock**.
           - Each Checkout session is tagged with its purpose (`subscribe` or `replace_card`) and the account ID.
           - The subscription is created with a **Stripe idempotency key derived from the Checkout session ID**, so a redelivered webhook repeats the same request and gets the same subscription back.
           - Before creating, and after any uncertain API result (timeout or crash), the API **lists the customer's subscriptions** that aren't cancelled or `incomplete_expired`, and adopts an existing one tagged with this account instead of creating another.
           - **Each Checkout session is used at most once, permanently.** A server-only `checkout_session_results` table has one row per Checkout session ID (the primary key), holding its **final outcome** (`subscription_created` plus the subscription ID, `card_saved`, `refused` or `tombstoned`). It's written in the same transaction that records the outcome.
             - A replayed or late webhook for a session that already has a row just returns the stored outcome, **even days later** (Stripe keeps idempotency keys only 24 hours but can retry webhooks for 3 days), and even after that subscription was cancelled or expired.
             - **A new subscription always needs a fresh Checkout session.**
             - The subscription is also tagged with its Checkout session ID, so adoption after a crash can match it exactly.
           - A second `subscribe` session completing while a subscription already exists **only saves the card** (after the country check). It never creates a second subscription.
           - A `replace_card` session never creates a subscription; it only sets the default card.
         - **First payment needs confirming (BP-020):**
           - The subscription is created with payment behaviour `default_incomplete`.
           - **The server confirms every first payment itself.** With `default_incomplete`, Stripe doesn't attempt the first invoice until it's confirmed. So straight after creating the subscription, the API **confirms the first invoice's payment server-side**, using the **validated saved card** (the one that passed the country check). It then handles the three outcomes on **that same payment**:
             - **Success:** the invoice is paid and the account unlocks.
             - **Needs authentication** (`requires_action`): see below.
             - **Declined** (`requires_payment_method`): see below.

             A subscription created during the trial has no immediate payment; its first charge happens at the trial end, like a renewal.
           - If the first invoice's payment needs authentication (such as a bank's 3-D Secure check) or is declined, the account moves to `pending_payment`. The app shows "Confirm your payment". The page uses Stripe.js **only to complete the bank's authentication step** for the payment the server already confirmed with the validated card (`handleNextAction`), and never to enter or choose a card. A declined card can be replaced through the checked card flow (see "Payment surfaces" below), and **the server** retries the same invoice with the new validated card. No new subscription is created.
           - The account unlocks only when the first invoice is **paid**, or while the trial is still valid.
           - If Stripe expires an unconfirmed subscription (`incomplete_expired`, after about 23 hours), the state returns to `none`, and the user can start again.
           - Renewals that need authentication (`invoice.payment_action_required`) use the same in-app confirmation.
      4. Otherwise the card is detached, nothing is charged, and the app says: "Paid plans aren't available in your country yet. We'll email you when they are."
    - **Card changes** go through the same setup-mode flow and the same check (a `replace_card` session).
    - **Payment surfaces (BP-021): every way to enter a card goes through the checked flow.**
      - The **Stripe Customer Portal isn't used.** Viewing invoices, downloading paid invoice PDFs and cancelling are all in the app.
      - **Stripe's customer emails that contain payment links are turned off**: failed-payment, action-required and upcoming-renewal emails, and invoice emails with a "Pay online" link. The app sends its own emails, which link to the app's "Fix payment" page.
      - Invoice PDFs are rendered **without a payment link**. Hosted invoice URLs are never shown or sent to users.
      - **"Fix payment" in the app** completes a bank authentication step (Stripe.js `handleNextAction` only), or collects a new card through the checked setup-mode flow. **The server** then pays the open invoice with that validated card through the API.
      - **The real enforcement point is at Stripe, on every charge (BP-021).** The app's checks are the first line, but a user holding a payment's client secret could, in principle, try to confirm it from their own code with a different card. So **Stripe Radar rules block, on every payment from every route** (app, API, hosted page or a client-side confirmation), any charge where:
        - the **card's issuing country** is not in the Radar value list `paid_countries`,
        - **or** the **billing-address country** is not in that list,
        - **or** the billing-address country is **missing**.

        The API keeps the value list in sync with `paid_countries` whenever the owner edits it. The exact Radar rule syntax, and how it treats a missing billing country, are **proven in Stripe test mode at M8** before launch. If a missing value can't be blocked by a rule, card collection requires a billing address, and payments without one are refused by the server before confirmation.
        - This needs Radar for Fraud Teams, which adds a few cents per charge. The exact price is confirmed at M8.
        - If a charge that fails either country check still succeeds, the webhook refunds it in full and flags it to the owner.
    - **Users outside the paid countries** get the full 3-month trial. Afterwards they're read-only like any unsubscribed user (view and export always work), and they're emailed when their country opens.
    - **Tax collection:**
      - **Australia:** no GST is charged until the business registers for GST. Registration is required at A$75,000 GST turnover, per the accountant's advice. From then on, prices stay $5 and $10 GST-inclusive, and Stripe Tax collection is switched on for AU only.
      - **US:** no sales tax until a state's economic-nexus threshold is reached.
      - **Monitoring (BP-022):**
        - **Australia:** Stripe doesn't monitor your home country. The owner console shows **ClaimTidy's AU revenue for the last 12 months and the projection for the next 12**, and alerts at **A$60,000** (80% of the threshold).
          - GST turnover counts **the whole business's income**, not just ClaimTidy. So the **accountant reviews total turnover every quarter** and decides when to register. That's an operational duty, not an app feature.
        - **Other countries:** Stripe Tax's threshold monitoring is on, but it only covers supported locations and can **lag by up to 7 days**. So the owner console also shows each paid country's 12-month revenue against a threshold the owner enters (in `paid_countries`), with alerts at **70%**. The owner reviews it monthly.

## 7. Milestones and acceptance criteria

Each milestone ends with its proof checks green (section 9) and a demo on a real iPhone (Safari, installed to the home screen) and a real Android phone (Chrome, installed).

| # | Milestone | Acceptance criteria (observable) |
|---|---|---|
| M0 | **Foundations** | The monorepo builds. Local Supabase starts.<br><br>Database tests prove, for every table and bucket:<br>(a) user A can't read user B's rows or objects;<br>(b) a signed-in user **can't insert, update or delete any row, including their own**, in particular `trial_started_at`, receipt counters, limit overrides, subscriptions, approval decisions and submitted claim versions;<br>(c) a user can't overwrite or delete any storage object, including their own;<br>(d) a claimant can't read any token, code verifier, attempt counter, Stripe identifier or directory key through the Data API, views or any API response.<br><br>CI runs the proof commands on each push. Three regional stacks plus the account directory are deployable from CI. Both Supabase Auth hooks run on each project, or the fallback is chosen |
| M1 | **Sign-up and capture** | A new account's country sets its hosting region. The sign-in methods in scope work, and email is verified. **A returning user on a new device reaches their original region even after changing their profile country.** Signing up again with the same email (or the same Google/Microsoft/Apple account) is routed to the existing account, never a second one. **A Microsoft account whose email changed upstream still reaches its original account. Sending a valid provider token or email sign-up directly to a second region's sign-in endpoint does not create an account there.**<br><br>**Same-email second provider:** an AU Google user signs in directly to AU Auth with a new Microsoft identity that has the same verified email. Supabase links it, and the token hook registers it in the directory. A later Microsoft sign-in through the directory reaches the same AU account, with one account, one region and one trial. An identity registered elsewhere gets no session. The directory stores no plain email or provider ID.<br><br>**Capture:** snap → crop (auto corners, adjustable) → category tap saves an entry in at most 2 taps after the photo, on iPhone Safari and Android Chrome. Pick from Photos/Files, including a PDF, works on both, and sharing into the app works on Android. **Offline:** with the network off, 5 captures are queued and sync once back online with no duplicates, including when the tab or app is closed mid-sync and reopened.<br><br>**Account switching:** A captures 3 receipts offline and signs out (after the warning). B signs in on the same browser and goes online, and **none of A's items upload to B or appear in B's app**, including when Background Sync fires. A signs back in, and they upload to A. Switching accounts during an upload cancels it, and the item stays with A. A's synced data is removed from the device on sign-out |
| M2 | **AI read, categories and counting** | On the labelled eval set, extraction meets the targets in section 9. The suggestion is highlighted but never auto-applied. "Snap the claim form" produces a category checklist, and nothing is saved until the user confirms.<br><br>**Counting:** a re-read or edit doesn't add to the count. Undo and a deleted flagged duplicate are uncounted. **20 parallel uploads at 199/200 give exactly one AI read**, and the rest are saved without one. The trial limit is 100. Receipts at 23:59 and 00:01 local time on the month boundary land in the right months, for an AU, a UK and a US time zone |
| M3 | **Currency and tax packs** | Unit tests cover every rule in concept section 5: AU ABN over $82.50, FBT flag; US lodging (any amount) and $75 rule, meals purpose, 60-day flag; UK £250 VAT invoice rule, VAT number format, client entertainment VAT set to zero. A foreign receipt gets the transaction-date rate, shown in the row |
| M4 | **Forms and claim pack** | The fixture employer templates and the built-in form produce `.xlsx` files where HyperFormula-computed totals equal the sum of the rows, for 0, 1 and 200 rows. The fixtures include `SUBTOTAL(9,…)`, a grand total that adds subtotals (checked after inserting 1, 2 and 200 rows, and still referencing only the moved subtotal cells), `SUMIFS`, and a totals row directly under the last detail row. Templates with unsupported formulas (a partial range, a single detail cell, a cross-sheet reference, `OFFSET`) are rejected at upload with the cell address. The PDF has **one or more pages per receipt, in row order**. A 3-page PDF hotel invoice fixture, with its total and tax only on page 3, appears as 3 legible pages under its row, in the original order. The pre-submit check lists missing receipts, duplicates, missing tax numbers and open card lines |
| M5 | **Submit and approve** | The email arrives (Mailpit locally, Postmark in staging) with attachments. Encoded-size boundary tests: a pack just under 8 MB is attached, just over switches to links, and multi-form packs are measured together. The Cc'd finance address **can't** approve (tested). The approver approves with the code. Rejecting one form or one explanation returns only that item. A resubmit creates version 2 and leaves version 1 unchanged (same SHA-256) |
| M6 | **Company card** | Fixture CSVs from 3 bank layouts import. The second upload from the same bank asks no questions. Fees and payments need no receipt. The tie-out holds on the fixtures. A reconciliation can't reach Approved while an explanation is pending |
| M7 | **Reminders, retention, duplicates** | The reminder fires on the 3rd business day (holiday-aware fixtures for all three countries, including an AU state holiday) and only when a concept section 8 condition holds. It's sent by email, and by web push where permitted.<br><br>**Retention:** after the period, no row or storage object holding receipt content remains, including every claim version's `.xlsx` and PDF, and old links return "removed". Claims waiting for a decision are untouched. A receipt with a transaction date 8 months ago, imported today, is kept for the full period, and no draft is removed with less than 30 days' warning.<br><br>Duplicate photos of the same receipt are flagged |
| M8 | **Billing and account** (Stripe test mode, simulated clock). **Entry gate:** a focused Codex review of sections 6.10–6.13 and a Stripe test-mode spike proving the Radar rules, `default_incomplete` confirmation and idempotency behaviour | A fresh account is fully usable with no card. At trial expiry, capture, sync, AI reads and submissions are refused **by the server** while viewing and export still work. Subscribing through Stripe Checkout (setup mode) unlocks it within 1 minute of the **first invoice being paid**, or at once while the trial is still valid.<br><br>**Billing outcomes:**<br>• A month with 35 counted receipts gives **no** top-up. A month with 36 gives exactly **one** $5 top-up on the next invoice, even if the month-close job runs twice.<br>• A trial month with 90 receipts gives no charge.<br>• **Mixed month:** with the trial ending on the 15th, 90 trial reads plus 35 paid reads gives no top-up, while 90 plus 36 gives exactly one. After the trial ends, the cap applies to paid reads only (200). Subscribing during the trial charges the first $5 at the trial end date, not before.<br>• **Invoices:** an old invoice unpaid for 8 days keeps the account read-only even after a newer invoice is paid. Access returns only when the old one is paid, voided or written off. Delivering the webhooks out of order gives the same result.<br>• **Grace period:** straight after a renewal fails (the subscription is `past_due`), the account still has access. It still does at 6 days 23 hours, and is read-only at 7 days plus 1 second. When retries run out, the subscription becomes `unpaid` (not cancelled), and paying restores access.<br>• **Overlapping webhooks:** two handlers for the same invoice, the older one holding an `open` snapshot and committing last, still leave the invoice `paid`.<br>• Cancelling with an open top-up invoices it immediately.<br>• A failed payment keeps access for 7 days, then the account is read-only. Paying restores it.<br>• Webhooks with bad signatures are rejected.<br>• **Paid countries:**<br>&nbsp;&nbsp;– An AU card with an AU address, and a US card with a US address, both subscribe.<br>&nbsp;&nbsp;– A UK card, a UK address, or an AU card with a UK address is **refused with no charge ever made**, and the card is detached.<br>&nbsp;&nbsp;– After the owner adds NZ in the console (audited), an NZ card with an NZ address subscribes.<br>&nbsp;&nbsp;– Changing the card to one from a non-paid country is refused, and the old card stays.<br>&nbsp;&nbsp;– At trial end, a UK user becomes read-only, still sees the "not available yet" message, and can export.<br>• **One subscription (BP-019):** the same `checkout.session.completed` delivered twice, two subscribe sessions completed at the same moment, or a crash after Stripe created the subscription but before the app recorded it all give **exactly one** subscription. After the crash, the next run adopts the existing subscription. A `replace_card` session never creates a subscription. **A subscription that's cancelled (or expired), then has its original Checkout completion replayed 48 hours later (after Stripe's idempotency key has expired), creates nothing new.**<br>• **Ordinary card (BP-020):** a normal test card with no authentication, subscribing after the trial, is **charged straight away by the server's confirmation**, and the account unlocks. It never stays `incomplete`.<br>• **Authentication (BP-020):** with Stripe's 3-D Secure test card, the first payment waits in `pending_payment` with the account locked (after the trial). Confirming in the app pays the same invoice and unlocks; no second subscription is created. A declined first payment followed by a valid replacement card pays the same invoice. An unconfirmed subscription expires and can be restarted.<br>• **Payment surfaces (BP-021):** trying to pay an overdue invoice with a UK card through every surface the user can reach (the Fix payment page, and a hosted invoice URL fetched directly in the test) makes **no successful charge**. The Radar rules block it. So does **an AU-issued card with a UK billing address, or with no billing address, confirmed directly from test code with a payment's client secret** (bypassing the app's screens), and the same through a hosted invoice URL. No Stripe email sent to the customer contains a payment link.<br><br>**Account:** deletion cancels the subscription first, then removes all user data, the account-directory entry and the stored payment methods (invoices are kept as tax records). **After deletion, Stripe shows no active subscription and no upcoming invoice. Advancing the test clock 2 months creates no new invoice.** A closed month's top-up is charged at deletion, and the current month isn't billed. A deletion interrupted at any step resumes and completes.<br><br>**Checkout race:** a Checkout opened before deletion can't be completed afterwards (it's expired). If it completes in the race window anyway, the resulting subscription is cancelled, the payment is refunded, no account is restored, and verification passes again. Full export produces a zip of images, forms and CSV |
| M9 | **Owner console and launch** | The owner console needs sign-in with a second factor. Every owner action, including limit overrides, is audited.<br><br>**Gates:**<br>• A local accountant has signed off the AU, US and UK tax packs.<br>• The accountant has confirmed the paid-countries list, the GST registration timing and the threshold monitoring (section 6.13).<br>• The AU revenue alert at A$60k and the per-country 70% alerts work in the owner console, and the owner's monthly and the accountant's quarterly turnover reviews are scheduled.<br>• The Radar rule and value list are live and in sync with `paid_countries`.<br>• The privacy policy and terms are published.<br>• The production domain has email authentication (SPF, DKIM, DMARC) for Postmark.<br>• The install-to-home-screen guide is tested on current iPhone Safari and Android Chrome |

## 8. Assumptions and risks

**Assumptions** (confirm or correct):

1. With no app stores, there's no Apple or Google payment rule and no store review in R1. When native apps come later, individual subscriptions bought inside those apps will fall under the store rules again (to be planned then).
2. Installed web apps on iPhone (iOS 16.4+) support web push; Safari tabs don't. Email reminders always go out regardless.
3. Claude API processing happens in the US. That needs disclosure in the privacy policy and a data processing agreement / transfer mechanism for UK and AU users.
4. The product owner has, or will create, the needed accounts (listed in section 11).

**Risks:**

| Risk | Impact | Mitigation |
|---|---|---|
| **You're the seller for sales tax.** No app store or merchant of record collects tax for you. The UK, the EU and several other countries require foreign sellers of digital services to register from the **first** sale | Back-tax and penalties if you sell there unregistered | Paid plans are sold only in paid countries (AU, US, plus threshold countries the accountant approves). No-threshold countries get the trial only. Location is checked on card and billing country before any charge. Stripe Tax monitoring alerts before thresholds. **M9 gate.** To open the UK or EU later: register there, or move billing to a merchant of record |
| **Customers in non-paid countries can't pay after the trial** | Lost UK and EU revenue at first | A "notify me" message. Revisit after launch: UK VAT registration, EU one-stop-shop registration, or a merchant of record |
| **iPhone Safari may clear a website's offline data** after a period of non-use | Unsynced receipts could be lost | Install prompt, persistent-storage request, sync as soon as the app is online, and a warning for items waiting over 24 hours |
| **Web camera and edge detection are weaker than native** | Crooked or blurry receipts | The phone's own camera gives full resolution. Corners can always be adjusted. The AI reads skewed photos well. Native apps follow later |
| **No share-into-app on iPhone** | One extra step for e-receipts | Pick from Files/Photos. Email forwarding comes in R2 |
| **Employer Excel templates vary widely** | Forms come out wrong | The formula contract and the flat-list layout, confirmed on a preview. Unsupported files get the built-in form. Keep a corpus of real templates as fixtures |
| **AI read accuracy on faded or foreign receipts** | User frustration | Flag low confidence. The user can always edit. The extraction eval gates M2 |
| **Heavy users cost more than they pay** | Margin | The 200-receipt cap. AI cost overtakes $10 only at about 250 receipts |
| **Three regions multiply operations** | Cost (about 3 × Supabase Pro plus Cloud Run) and complexity | One codebase. CI deploys all three. Migrations are applied to all regions in the same pipeline run |
| **Tax-rule errors** | Legal and trust problems | The accountant sign-off gate. Rules are parameterised and versioned per claim |
| **Stripe fees on small charges** | For an Australian card, pay-as-you-go: card 1.7% + A$0.30, Billing 0.7%, Stripe Tax 0.5% (only on sales where you're registered to collect tax). That's about **A$0.45 on a $5 charge** and **A$0.59 on $10** with Stripe Tax on (A$0.42 and A$0.54 without it). Overseas cards are 3.5% + A$0.30 ([Stripe AU pricing](https://stripe.com/au/pricing)) | Acceptable at these prices. Review after beta |

## 9. Verification

**Proof commands** (run from the repo root; each must exit with code 0):

```
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck
pnpm test          # Vitest unit tests: tax packs, business days, FX, matching, tie-out, eligibility, reminder conditions, entitlement, receipt counting and month boundaries by time zone, tier and top-up decisions
pnpm test:db       # supabase start + `supabase test db` (pgTAP): read isolation for every table; no client writes to any table, even own rows; storage no-overwrite and no-delete; secrets unreadable
pnpm test:api      # API integration tests against local Supabase, with Claude and Postmark faked and Stripe in test mode with test clocks: counting concurrency, trial/paid mixed month, month close idempotency, top-up, per-invoice overdue, past_due grace boundaries, out-of-order and overlapping webhooks, deletion workflow resumption, checkout-during-deletion race, duplicate or concurrent subscribe provisioning, crash-after-create adoption, 3-D Secure first payment, paid-country enforcement on every payment surface
pnpm test:docs     # golden tests for xlsx/PDF generation: formula-contract fixtures; HyperFormula totals equal row sums; row order; SHA-256 stable; encoded email size boundary
pnpm e2e:web       # Playwright (desktop): approver page (Cc can't decide; code expiry; attempt limit; a new code invalidates the old one; the claimant can't see verifiers), export, owner console, Stripe Checkout (test mode)
pnpm e2e:mobile    # Playwright mobile emulation (WebKit iPhone + Chromium Android): capture from a fixture image → crop → category → offline queue (network off) → close and reopen → sync → generate → email in Mailpit → approve; account switch with queued items
```

**Paid or manual checks (not in CI):**

- `pnpm eval:extract` runs about 60 labelled receipts (AU/US/UK, e-receipts including PDFs, foreign currency, faded) against the real Claude API. **Targets:**
  - date, total and currency exactly right on at least 95%,
  - merchant at least 90%,
  - tax amount at least 90%,
  - no invented supplier tax numbers.

  It costs about US$2 per run.
- **Real devices** (Playwright's emulation isn't a real phone):
  - on a current iPhone (Safari, installed to the home screen) and an Android phone (Chrome, installed): camera capture, crop, offline queue across an app close, sync, web push, and Android share target;
  - on iPhone, a Safari tab (not installed) shows the install prompt and still syncs when online.
- Accountant sign-off on the tax packs and the paid-countries list (the M9 gates).

## 10. Later releases (not planned in detail yet)

- **R2, companies:**
  - Invites, verified domains, roles, the finance web portal, a claims board, reports and the audit view.
  - **Billing:** $5 per employee who claimed that month, or $10 for an employee with more than 35 receipts, on the company's Stripe card, billed monthly in arrears. The trial runs 3 months from workspace creation.
  - Microsoft 365 and Google Drive storage, Microsoft 365 single sign-on, Outlook sending, manager lookup, category sheet sync, phone-only mode and the email forwarding address.
  - Multiple profiles, and joining a company while keeping history (the individual's own Stripe subscription ends automatically).
- **Native apps:** App Store and Google Play apps reusing `packages/core`. Store billing rules will need their own pricing design (stores charge fixed prices, and a receipt-count top-up can't be sold through them in the same way).
- **Mileage:** as designed in concept section 16, including the tax-year ledger (to be added to the retention design when built).

## 11. Toolchain and accounts

- **Developer machine:** Node 22, pnpm 9, Docker Desktop (for local Supabase), Supabase CLI, Stripe CLI (for webhooks locally), and Playwright browsers (Chromium and WebKit). Windows works, and no Mac is needed.
- **Accounts the product owner needs:**
  - Supabase (3 Pro projects), Google Cloud (Cloud Run),
  - Anthropic API, Postmark, **Stripe** (with Stripe Tax),
  - a Google OAuth client and a Microsoft Entra app registration (both free),
  - the domain **claimtidy.com** for the web app and email sending.
  - **Not needed in R1:** Apple Developer (US$99 a year). It's needed later for the native apps and Sign in with Apple.
- **Who builds:** Claude builds by default in this repo. Each milestone's changes are then inspected by Codex in a fresh session, following the review loop already used for the plans.

## 12. Open questions (not blocking M0–M1)

1. ~~App name and domain.~~ **Decided: ClaimTidy, at claimtidy.com.** The owner registers the domain. Run a trade mark check (IP Australia) before investing in branding.
2. **Fair-use and tier numbers:** 35, 200 and a trial limit of 100. These are set; the owner can change them in the console.
3. **Which accountant(s)** will review the tax packs (M9 gate).
4. **AI model cost trade-off.** `claude-opus-5` is the default; a cheaper model only if the M2 eval shows equal accuracy and the owner prefers the saving.
5. ~~Sign in with Apple in R1?~~ **Decided (27 Sep 2026): not in R1.** It comes with the native apps.
6. ~~Sales tax approach.~~ **Decided (27 Sep 2026): Stripe with paid countries** (section 6.13). The accountant confirms the list before launch. Earlier text, kept for reference: Stripe Tax plus your own registrations, as the accountant advises, or a merchant-of-record provider. Until decided, R1 can launch paid plans to **Australia only**, with UK and US users getting the free trial.

## 13. Build progress

| Milestone | Status | Notes |
|---|---|---|
| M0 Foundations | **Done locally; hosted parts wait for accounts** | Monorepo (`packages/core`, `apps/api`, `apps/web`) builds. Local Supabase starts. The R1 schema (all section 5 tables, read-only RLS, `private` schema, four storage buckets) is in `supabase/migrations`. `pnpm test:db` runs 150 pgTAP checks for (a)–(d), derived from the catalog so every future table is covered; each check was mutation-tested (a deliberate leak or write grant makes it fail). CI runs lint, typecheck, unit tests, builds and the pgTAP suite on every push. **Waiting on the owner's accounts** (`docs/deploy.md`): the first three-region deploy, and confirming both Auth hooks run on hosted projects |
| M1 Sign-up and capture | **Done locally, except Google/Microsoft sign-in buttons; hosted parts wait for accounts** | **Directory** (`apps/directory`): email codes, Google/Microsoft ID-token verification, reservations, and both regional Auth hooks, with HMAC keys only. 16 integration tests run against real local Supabase Auth with the hooks enabled: new and returning users, one account per identity, a provider email change, verified-email linking (BP-010), direct sign-up at the wrong region refused (BP-008), and conflicts failing closed. **API**: verified regional sessions, the country question, signed uploads, and idempotent entries with the account check (10 tests). **Web app**: email sign-in, country question, camera or Photos/Files (including PDF), automatic corners with drag-to-adjust and a perspective crop, the category tap (2 taps after the photo), Undo/Edit, a per-account offline queue, Background Sync, the Android share target, and safe sign-out. **E2E** (Playwright, mobile emulation, full local stack): capture, 5 offline captures syncing once across a close mid-sync, account switching (mutation-checked), and share target. Stress-run 24/24. **Not yet:** Google and Microsoft buttons in the app (need the owner's client IDs; the directory side is done and tested with a stand-in key set). Real-device checks (section 9) wait for a hosted deploy |
| M2–M9 | Not started | |

**Implementation notes (deviations from the plan text):**
- pnpm 10 instead of 9, and TypeScript 6.0 (typescript-eslint doesn't support TypeScript 7 yet).
- The approval status view in section 5 isn't needed: `approval_requests` itself holds no verification material (all of it is in `private.approval_secrets`), and a pgTAP check forbids secret-like columns in every user-readable table.
- Server-only tables are unreadable by clients, not just unwritable. The app reads counts, tiers and invoice status through the API.
- Email sign-in uses one code: the directory sends and checks it, then asks the region's admin API for a one-time sign-in token that the app redeems. The user never sees a second code.
- Provider identities are keyed on issuer + subject. For Microsoft, the issuer contains the tenant ID and the subject is stable per app registration, which meets the plan's requirement for a stable, non-email key. Microsoft emails count as verified only with the `xms_edov` claim.
- The custom access token hook also refuses password sessions (R1 has no passwords), and treats a just-redeemed email token as proof of the email, because Supabase issues the first session before it records the confirmation.
- The web app builds with webpack, not Turbopack, so the shared packages' `.js` import suffixes resolve.
- Playwright is pinned to 1.56.1 to match this environment's Chromium. CI installs its own browsers, including WebKit for the iPhone project.

## Change log

| Version | Change |
|---|---|
| v2 | Codex round 1:<br>• **BP-001:** clients can't write; the API owns every change, with no-write tests even on the user's own rows.<br>• **BP-002:** attach or link is decided on the encoded size, at 8 MB or less, under Postmark's 10 MB limit.<br>• **BP-003:** the hosting region is separate from the profile country, with a global hashed-email directory.<br>• **BP-004:** a formula contract, checked at upload, including `SUBTOTAL` and subtotal grand totals.<br>• **BP-005:** retention covers every claim version's files; the mileage ledger has its own current-and-previous-tax-year expiry |
| v3 | Codex round 2:<br>• **BP-004:** totals-block references are relocated with an old-to-new map, not left in place.<br>• **BP-006:** approval secrets live in a server-only `private` schema, with a keyed-HMAC verifier consumed atomically.<br>• **BP-007:** the directory is keyed on stable provider identities, with emails as aliases only.<br>• **BP-008:** each region's "before user created" hook enforces the directory reservation, failing closed.<br>• **BP-009:** the draft retention clock starts at creation or import, with at least 30 days' warning |
| v4 | Codex round 3:<br>• **BP-010:** the directory follows Supabase's verified-email auto-linking (a verified alias routes to the existing account's region).<br>• A custom access token hook reconciles or refuses every session, including linked-identity sign-ins.<br>• M1 covers direct same-email linking followed by a directory sign-in. Approved by Codex in round 4 |
| v5 | Product owner changes (concept v11):<br>• **Platform:** an installable web app (PWA, Next.js) replaces Expo and the store apps. Web capture and offline via a service worker and IndexedDB; web sign-in libraries; web push plus email.<br>• **Billing:** Stripe replaces RevenueCat, with Basic $5 plus an automatic $5 Premium top-up for months with 36 or more receipts. Receipt counting with concurrency-safe caps (200 paid, 100 trial).<br>• **Scope:** mileage removed from R1 (trips, ledger, maps and the old M7). Milestones renumbered M0–M9.<br>• **New:** sales-tax risk and gate; Sign in with Apple optional |
| v6 | Codex cycle 2, round 1:<br>• **BP-011:** offline items are bound to an account and region (a separate IndexedDB per account), sync only under the same account, cached data is cleared on sign-out, and account-switch tests are added.<br>• **BP-012:** reads are marked trial or paid; only paid reads set the tier; caps follow the phase; subscribing early starts billing at the trial end.<br>• **BP-013:** a per-invoice overdue ledger, re-read from Stripe, where paying a newer invoice doesn't clear an older one.<br>• **BP-014:** a retryable deletion workflow that cancels the subscription first and verifies no future invoices.<br>• **BP-015:** multi-page PDF receipts keep every page in order |
| v7 | Codex cycle 2, round 2:<br>• **BP-016:** `past_due` counts as entitled during the 7-day grace; exact cutoff; Stripe marks the subscription `unpaid` after retries.<br>• **BP-017:** per-invoice lock across the Stripe fetch and the write, and finished statuses are never overwritten.<br>• **BP-018:** deletion blocks new billing sessions, expires open Checkout Sessions, and a billing tombstone cancels and refunds any racing subscription |
| v8 | Product owner decision: no Sign in with Apple in R1 (Google, Microsoft and email only; Apple comes with the native apps). Stripe fees stated (card, Billing 0.7%, Tax 0.5%). No other design change |
| v9 | Product owner decisions:<br>• **Name:** ClaimTidy (claimtidy.com).<br>• **Paid countries:** a global launch, but subscriptions only where the card and billing country are both on the owner-edited paid list (AU and US at launch). Checked through setup-mode Checkout before any charge; the API creates subscriptions; card changes go through the same check; no-threshold countries (UK, EU and others) get the trial only.<br>• New acceptance cases and an updated M9 gate |
| v10 | Codex cycle 2, round 5 (the last round; approval pending):<br>• **BP-019:** one subscription per account, with idempotency keys from the Checkout session, a per-account lock, and adoption after uncertain results.<br>• **BP-020:** `default_incomplete`, a pending-payment state, and in-app authentication of the same invoice.<br>• **BP-021:** every card-entry surface is checked; the Portal and Stripe payment-link emails are off; a Radar value-list backstop.<br>• **BP-022:** the owner's own AU turnover monitoring (Stripe excludes the home country), per-country alerts, and quarterly accountant review.<br>• Section 6 items put back in numeric order |
| v11 | Codex round 6 (an extra round the user authorised):<br>• **BP-019:** a permanent once-only outcome per Checkout session (survives cancellation and Stripe's 24-hour idempotency expiry).<br>• **BP-020:** the server confirms every first payment with the validated card; Stripe.js is limited to `handleNextAction`.<br>• **BP-021:** Radar rules on card country **and** billing country (including a missing one) as the enforcement point on every charge, proven in test mode at M8 |
