# Work Receipts: Product Concept

_Draft v6, 27 Sep 2026. Ideas only; nothing is built yet._

This document records the decisions made after the [market research](market-research.md). Where the two disagree, this document wins. In particular, the research suggested a background screenshot watcher, which we have dropped.

## One-line pitch

Open the app, snap the receipt, tap a category. The receipt lands in your claim form, and month-end is one button that emails a finished claim to your manager and finance. It's built for companies and individuals anywhere in the world, with their own forms, currencies, tax rules, banks and choice of where receipts are stored.

## Decisions so far

| Topic | Decision |
|---|---|
| Market | **Global product** for **companies and individuals.** Anyone can sign up, with no approval step. |
| Country | **Sign-up asks "Which country does this profile/company belong to?"** The answer sets the tax rules, home currency, date format, holidays, mileage rates and retention reminder. |
| Launch countries | **Australia, United States, United Kingdom** |
| Language | **English only** for v1. Dates, numbers and currency follow each company's country. |
| Billing | **Not part of the app** for v1. There is no subscription or payment handling inside the app. |
| Platforms | **iPhone and Android** apps for employees, plus a **web portal** for finance and admins. |
| Capture | **In-app camera**, plus "Pick from Photos". No background screenshot watching. |
| Claim forms | The company's own **Excel** forms, filled in by the app, as **two separate forms**: *Personal card (reimbursement)* and *Company card (reconciliation)*. A Google Sheet is also acceptable. |
| Claim layout | **One row per receipt**, with **totals per category at the bottom** |
| Currency | **Multi-currency.** The home currency is set per company (AUD for the first company). |
| Connectivity | Works **online and offline**. Offline, receipts are saved now and synced later. |
| Who uses it | **Individuals** (one person claiming from their employer) and **companies** (sized for about **50–100 employees**) |
| Sign-in | **Microsoft, Google, Apple or email.** |
| Image storage | **Optional; the user chooses:** app cloud (default), Microsoft 365 (OneDrive/SharePoint), Google Drive, or phone only. |
| Mileage | **Included in v1**, in a simple form: trip entry and route distance. **No live GPS tracking.** |
| Approval | One email, **To: manager, Cc: finance.** The **manager approves both forms** (personal and company card), then **finance pays by bank transfer outside the app**. |
| Cards | **Personal cards (reimbursed)** and **company cards (every statement line must match a receipt)** |
| Card statements | **CSV download from any bank.** The format differs by bank, so the app learns each bank's layout. |
| Cost centre / project | **Not required.** Optional field, off by default. |
| Retention | **6 months** by default. **The app owner (you, the platform owner) can change this and can delete any receipt at any time**, in app cloud storage directly and in customer storage where permission was given. The finance manager sees everyone's claims. |
| Reminder | Sent on the **3rd business day of the new month** if last month's claim hasn't been submitted. |

## 0. Sign-up and first questions

Anyone can download the app and sign up, with no approval step. Sign-in is with **Microsoft, Google, Apple or email**. Apple requires "Sign in with Apple" to be offered whenever other social sign-ins are. The email address is verified.

The first screens ask three questions, one per screen, with big buttons:

1. **"Is this for a company or for yourself?"**
   - *Company:* creates a company workspace, and you become its company admin.
   - *Myself:* creates a personal profile, with no admin screens.
   - *Joining my company:* if your email domain (for example `@acme.com`) matches an existing company, or you have an invite, you join that company.
2. **"Which country does this profile/company belong to?"** This answer is required. It sets:
   - the **tax pack**: AU, US or UK rules. Any other country gets a **generic mode** that records tax amounts without country rules,
   - the **home currency** (AUD, USD, GBP, …),
   - the **date and number format** (27/09/2026 or 09/27/2026),
   - the **public-holiday calendar**, used for the 3rd-business-day reminder,
   - the **mileage rates**,
   - the **record-keeping reminder** (5 / 3 / 6 years).

   The country can be changed later in settings, with a warning because it affects tax rules. Claims already submitted keep the rules they were made with.
3. **"Where should we keep your receipt images?"** See section 14. The default is the app's cloud, so you can **skip this and start snapping immediately**.

**Profiles:** one person can have more than one profile. For example, a personal profile in Australia plus membership of a UK company. Each profile has its own country, categories and forms. Switching between them is one tap at the top of the camera screen.

## 1. Capture: in-app camera only

- Opening the app goes **straight to the camera**, with no menu in between.
- You snap the receipt. The app detects the edges, crops and straightens it, then **immediately shows your category buttons**.
- A **Personal / Company card** switch sits above the buttons.
  - It remembers your last choice.
  - It auto-switches if the card digits printed on the receipt match your company card.
- While you choose a category, the AI reads the receipt in parallel:
  - date, merchant, amount and currency,
  - tax amount (GST, VAT, …),
  - the supplier's tax number (ABN, VAT number, …).
- You tap a category, the receipt is saved, and a short confirmation appears with **Undo** and **Edit**.
- **"Pick from Photos"** handles receipts you already have as images, such as e-receipt screenshots. It leads to the same category screen.

Why this is better:
- No battery drain and no permission to read your whole photo library.
- It works the same on iPhone and Android.
- It's easier to get through App Store review.

## 2. Roles

| Role | What they do |
|---|---|
| **App owner** (you: the platform owner, across *all* companies) | Uses a **super-admin console** to see every company workspace. Sets the **default retention**. **Can delete any receipt or claim in any company at any time.** Can suspend a workspace and manage the tax packs and app-wide settings. |
| **Company admin** (each company's workspace owner) | Signs the company up, chooses where its receipt images are stored and connects Microsoft 365 or Google if needed. Appoints finance users. Can set a company retention period within the limits the app owner allows. |
| **Finance** (finance manager / admin) | Sets up the claim forms, categories and rules. Uploads card statements. **Sees every employee's claims.** Marks claims as paid. |
| **Manager** | Receives their team's claims by email and approves or rejects them. |
| **Employee** | Snaps receipts, taps categories and submits claims at month-end. |
| **Individual** | Plays every role for themselves: sets up their own form and categories, and emails claims to whoever approves them (see section 15). |

## 3. Company setup (finance, done once)

- **Company settings:**
  - country, which picks the tax rules and public-holiday calendar,
  - home currency,
  - date format,
  - claim cycle (monthly).
- **Sign-in:** staff use their **Microsoft 365 work account** through single sign-on. IT approves the app once for the whole company, and leavers lose access automatically.
- **Claim forms:** finance uploads **two Excel forms**, *Personal card claim* and *Company card reconciliation*. For each one, the app reads the form and suggests:
  - the **category list**,
  - the **column mapping** (Date, Supplier, Tax number, Description, Category, Original amount, Currency, Rate, Home-currency amount, Tax, Receipt link),
  - the **totals block** at the bottom.

  Finance confirms these once, and every employee gets the same buttons and the same forms.
- **Categories** can come from three places, and all of them produce one company list:
  - **A. Sync from an Excel file in SharePoint** (or a Google Sheet). The file stays in charge. Removed categories are archived, not deleted.
  - **B. Enter them manually:** add, rename, reorder and archive, each with an icon or colour.
  - **C. Snap the claim form:** the AI reads the categories and the layout from a photo or file. Finance reviews a checklist, and nothing is saved without confirmation.
- **Optional rules:** attendee names for entertainment, a meal limit per day, or a cost centre or project field (off by default).
- The AI **highlights the most likely category** (Uber → Taxi) and learns each person's usual merchants. The employee's tap is always final.

## 4. The two claim forms

Each employee gets **two forms per month**, laid out exactly like the company templates. A form is only produced if it has at least one receipt.

```
PERSONAL CARD CLAIM (to reimburse) – Jane Smith – Sep 2026
Row | Date     | Supplier   | Tax no.        | Description      | Category        | Orig. amt | Cur | Rate   | Amount AUD | Tax   | Receipt
 1  | 03/09/26 | Uber       | —              | Airport → office | Taxi            |     64.20 | AUD | 1.0000 |      64.20 |  5.84 | link
 2  | 05/09/26 | Hilton SG  | —              | 1 night          | Accommodation   |    310.00 | SGD | 1.1523 |     357.21 |  0.00 | link
... (new rows are inserted above the totals)
    | TOTALS BY CATEGORY:  Taxi =SUMIF …  Accommodation =SUMIF …           TOTAL TO REIMBURSE =SUM …

COMPANY CARD RECONCILIATION – Jane Smith – card •••• 4821 – Sep 2026
Row | Date     | Supplier   | … | Category   | Statement amt AUD | Matched statement line | Receipt
 1  | 14/09/26 | Qantas     | … | Air travel |            412.30 | ✓ line 17              | link
    | TOTALS BY CATEGORY … GRAND TOTAL (must equal statement total for this card)
```

- **Totals are live formulas**, so editing a row updates the totals.
- New rows are always **inserted above the totals block**.
- The **Receipt** column links to the image in SharePoint.
- During the month the forms live as Excel files in SharePoint. **Generate claim** produces clean `.xlsx` copies, plus **one PDF of the receipt images in row order** for each form.

## 5. Currency and tax (per country)

- Each company has a **home currency**, which is AUD for the first company.
- Foreign receipts keep the original amount and currency, and are converted at the **exchange rate on the transaction date**. The rate used is shown in the row.
- For company-card purchases, the **statement's home-currency amount** is used as the real cost.
- For personal cards, the employee can override the converted amount with the amount their bank actually charged.
- **Tax rules come from the company's country**, one rule pack per country, starting with Australia:
  - **Australia:** GST extracted separately. Purchases over $82.50 including GST need the supplier's **ABN** on the invoice, and the app warns if one is missing. Entertainment categories are flagged for **FBT** review.
  - **United States:**
    - Currency USD, dates MM/DD/YYYY.
    - **Sales tax** is recorded but usually not reclaimable, so there's no tax-number check.
    - **IRS receipt rule:** a receipt is needed for **lodging of any amount** and for **other expenses of $75 or more**. Below $75, the employee can enter a short note instead. The app warns when a receipt is required.
    - **Business meals:** the app asks for the **business purpose and attendees**, which the IRS expects as substantiation.
    - **Accountable plan timing:** claims are expected within about **60 days** of the expense. The app flags receipts older than 60 days.
  - **United Kingdom:**
    - Currency GBP, dates DD/MM/YYYY.
    - **VAT** is extracted separately, along with the supplier's **VAT registration number** (GB + 9 digits).
    - **VAT invoice check:** up to **£250** a simplified VAT receipt is fine. Above £250 a **full VAT invoice** is needed to reclaim VAT, and the app warns if the receipt looks like a simplified one.
    - **Client entertainment:** VAT is generally **not reclaimable**, so the app sets the reclaimable VAT to zero for that category. Staff entertainment is handled differently.
  - **Later packs:** NZ, EU countries, Singapore, and others.
  - ⚠️ Every tax pack must be **reviewed by a local accountant before launch**. These rules are a design starting point, not tax advice.
- Foreign purchases default to no local tax.

## 6. Company card statements (any bank, CSV)

- Finance uploads the monthly **CSV** from whichever bank issues the cards.
- **The app learns each bank's layout:**
  1. On the first upload from a bank, the AI works out the columns: date, description, amount, debit/credit, currency, card number or cardholder.
  2. It shows a preview for finance to confirm, handling cases such as:
     - dates that could be read either way (03/04: is that 3 April or 4 March?),
     - negative amounts vs separate debit and credit columns,
     - refunds.
  3. The layout is **saved as a bank profile**. Next month the same bank's CSV imports with **no questions asked**.
- One CSV can hold several cardholders. Lines are split by card number or cardholder name and assigned to employees.
- **Automatic matching** to receipts uses amount, date (± 3 days) and merchant name. The results are:
  - ✅ **Matched:** statement line and receipt are linked.
  - ⚠️ **Statement line with no receipt:** becomes a to-do in the employee's app inbox, for example "Qantas $412.30 on 14 Sep – snap the receipt or explain".
  - ⚠️ **Receipt with no statement line:** flagged. It's probably a personal-card purchase, so the app suggests moving it.

## 7. Submitting and approving

```
3rd business day of new month: reminder to anyone who hasn't submitted
   ▼
Employee taps "Generate claim"
   ▼
Pre-submit check: missing receipts · duplicates · missing tax number · company-card lines without a receipt
   ▼
Claim pack: Personal claim .xlsx + PDF  and/or  Company card reconciliation .xlsx + PDF (saved to SharePoint)
   ▼
ONE email from the employee's Outlook ─▶ To: manager · Cc: finance
   Subject: "Expense claim – Jane Smith – Sep 2026 – $421.41 to reimburse"
   Body: totals by category for each form + [Approve all] [Reject with comment]
   (the manager approves the personal claim AND the company card reconciliation)
   ▼
Manager approves ─▶ status "Approved" ─▶ finance pays by bank transfer (outside the app)
        │ reject                              ─▶ finance clicks "Mark paid" (optional, so the employee can see it)
        ▼
Employee gets the comment ─▶ fixes rows ─▶ resubmits (version 2, same email thread)
```

- **Statuses:** Draft → Submitted → Approved → Paid, or Rejected. **Both forms need the manager's approval.**
  - A rejection can name one form (for example "company card row 4 has no receipt"). Only that form goes back to the employee, and the other stays approved.
  - A company-card form has nothing to reimburse, so its final status is "Approved" rather than "Paid".
- After submitting, the claim is **locked**. Any change creates a new version.
- Each employee's manager is read from their **Microsoft 365 profile**, so nobody has to pick an approver.
- If the email buttons are blocked by the company's email security, the manager can approve in the app instead.
- **Payment is not the app's job.** Finance pays by bank transfer as usual. "Mark paid" is just a status update for the employee.

## 8. Reminders

- **The 3rd business day of the new month:** if an employee has receipts for last month but hasn't submitted, they get a push notification and an email.
  - "Business day" skips weekends and the **public holidays of the company's country**.
- **In the same reminder:** any company-card statement lines still missing a receipt.
- **Finance** gets a short list that day of who hasn't submitted yet.
- **Managers** get a nudge if a claim has waited for approval for more than a few days (the number of days is set by the company).

## 9. Offline first

- Capture works offline: the camera, cropping, the Personal/Company switch, the category buttons (cached from the last sync) and saving to the phone.
- Receipts get a **"Pending sync"** badge. Once back online, the app:
  1. runs the AI read (or a basic on-device text read as a fallback),
  2. uploads the image,
  3. adds the row,
  4. sends a notification such as "3 receipts synced, 1 needs a check".
- The queue is stored on the phone, so nothing is lost if the app is closed.
- If categories change while you're offline, your tap is kept, and archived categories are flagged for you to re-pick.

## 10. Finance web portal

- **All claims:** filter by employee, month, status and category.
- **Card statements:** upload CSVs, manage bank profiles, and see a matched/unmatched board for each cardholder.
- **Reports:** spend by category, team and month, with an Excel export.
- **Company setup:** forms, categories, rules, cardholders and managers.
- **Audit trail:** who submitted, approved, rejected, edited or **deleted** what, and when.

## 11. Retention and deletion

- **Default:** receipts and claims stay in the app for **6 months**, and then they're removed.
- **The app owner (you) decides:**
  - You set the **default retention** for every company, and the range a company admin may choose within.
  - You can **delete any receipt or claim in any company at any time**, from the super-admin console.
  - Every deletion is recorded in the audit trail (what was deleted, when and by whom), but the image itself is gone.
- **Employees** can delete their own receipts while they're still in a draft claim. After a claim is submitted, only the app owner can delete it.
- **How deletion works depends on where the images are stored** (section 14):
  - **App cloud:** you can delete directly.
  - **Microsoft 365 / Google Drive:** the app deletes using the permission the customer granted.
  - **Phone only:** the image is deleted on the phone at its next sync.
- ⚠️ **Trust and legal point.** A vendor deleting a customer's records is sensitive. This matters especially under **UK GDPR** and US customer contracts. Recommendations:
  - State this deletion right clearly in the **terms of service** each company accepts at sign-up.
  - **Notify the company admin** whenever you delete something.
  - For Microsoft 365 storage, the approval must include **delete permission on the Expense Claims library**. The narrow `Sites.Selected` permission is enough. For Google Drive, the narrow `drive.file` permission covers files the app created.
  - For images in the **app cloud**, the app is holding customer data itself. It needs a **privacy policy**, encryption, **regional hosting** (AU / US / UK-EU) and a data-deletion-on-request process, as UK GDPR requires.
- **A local-law reminder is shown when changing retention:** many countries require businesses to keep expense records much longer. For example: **Australia** (ATO) generally 5 years, **UK** (HMRC, companies) 6 years, **US** (IRS) generally 3 years and sometimes longer. The app shows this warning, but **the owner makes the call**.
  - Recommended: keep approved claim packs in the company's SharePoint archive under its normal Microsoft 365 retention policy.

## 12. Other features we're keeping

- **Duplicate detection:** catches the same receipt photographed twice, or an e-receipt that was also photographed. It matches on merchant, amount, date and image similarity.
- **E-receipts from email:** watches an Outlook folder, or accepts forwarded emails. E-receipts land in the **inbox inside the app** for a one-tap category.
- **Privacy:** receipt images and claim forms live **wherever the user or company chose** (section 14). Employees see only their own receipts.

## 13. Scale and running cost (rough)

- A 50–100 employee company at about 10–30 receipts per person works out to roughly **1,000–3,000 receipts a month**.
- The AI read costs cents or less per receipt, and hosting is small.
- The main work is the Microsoft 365 integration, the approval emails, the bank CSV learning and the per-country tax packs.
- **Data location:** hosted per region (AU, US, UK/EU). This matters most for users who keep images in the app cloud.
- **Open sign-up and AI cost:** because anyone can sign up, each account gets a **fair-use limit** on AI receipt reads, for example a monthly cap with a friendly message. That protects the running cost while billing is out of scope.
- **Distribution:** as a global product, the app will be listed publicly on the **App Store and Google Play**. Companies can also push it to staff phones through **Intune**.

## 14. Where receipt images are stored (optional, user's choice)

Chosen at sign-up, or skipped to use the default. It can be changed later in settings.

| Option | Good for | Notes |
|---|---|---|
| **App cloud** (default) | Individuals and anyone who wants zero setup | Works immediately. Encrypted and hosted in the user's region. The app holds the data, so the privacy policy applies. |
| **Microsoft 365** (OneDrive / SharePoint) | Companies on Microsoft 365 | Images and Excel forms live in the customer's own tenant. IT approves the app once. |
| **Google Drive** | Companies on Google Workspace, and individuals with Gmail | Uses the Google file picker and the narrow `drive.file` permission. |
| **Phone only** | Privacy-minded individuals | Nothing leaves the phone except the claim email itself. ⚠️ If the phone is lost, the receipts are lost too. The app says so clearly. |

- For a company, the **company admin chooses once** and everyone follows it. Individuals choose for themselves.
- **Switching later:** the app moves existing images to the new place in the background.
- Whatever is chosen, **claim forms and PDFs are generated the same way**. Only the storage location differs.
- **Offline capture works with every option**, because images are queued on the phone first.

## 15. Individual mode

For someone using the app for themselves, for example because their employer doesn't use it:

- **Setup, about 2 minutes:**
  1. Country (required).
  2. Categories: typed in, synced from a sheet, or read from a photo of the employer's claim form.
  3. Optional: upload the employer's Excel claim form, so claims come out in exactly that format.
- **Approvers are typed-in email addresses:** "Send claims to" the manager, "Cc" finance. Approvers **don't need an account**. The email's Approve / Reject buttons open a secure one-time link.
- **Company card:** individuals can upload their own card-statement CSV and get the same matching.
- **The same month-end button, the same 3rd-business-day reminder and the same mileage feature** as company users.
- **Joining a company later:** if the employer starts using the app, the individual can join the company workspace and **bring their history with them**.

## 16. Mileage claims (v1, simple version)

**Complexity: low to medium, as long as there is no live GPS tracking.** Tracking trips in the background with GPS is the hard, battery-hungry part, so it's out of v1, which is consistent with our "no background activity" decision.

**How it works:**
- Tap **"+ Trip"** on the camera screen.
- Enter **From**, **To**, date and purpose.
  - Tick "return trip" to double it.
  - "Add stop" handles multi-stop trips.
  - Frequent places such as Office, Home or Client X can be saved.
- The distance is calculated with a **maps route service**. It can be edited, or entered as odometer start and end readings instead.
- **Amount = distance × the rate for the profile's country**, from a rate table that you, the app owner, update each year:
  - **UK (HMRC):** a per-mile rate for the first 10,000 business miles in the tax year, and a lower rate after that. The app tracks the running total for the tax year, which starts on 6 April, and switches automatically.
  - **US (IRS):** the standard mileage rate for that year.
  - **Australia (ATO):** the cents-per-km rate for that year, with the annual cap on claimable km.
  - A company can override the rate with its own reimbursement rate.
- **The trip becomes a row** in the personal claim form with the category "Mileage". There's no receipt; a **route map image** in the receipts PDF serves as the evidence.
- It's included in the manager's approval like any other row.

**Later:** automatic trip detection with GPS, vehicle types (motorbike, bicycle), and passenger allowances.

## Screen map

```
Sign-up (first run)
  Sign in (Microsoft / Google / Apple / email) ─▶ Company or Myself? ─▶ Which country? ─▶ Where to store images? (skip = app cloud)

Employee / Individual (phone app)
  [Profile switcher]  Camera  · [+ Trip]
  Camera ─snap─▶ [Personal | Company card] + category buttons (AI suggestion highlighted)
     │                 │ tap
     │                 ▼
     │           ✓ Saved (or ⏳ Pending sync) · Undo · Edit
     └─ Pick from Photos ─┘

  Tabs:  Camera · Inbox (e-receipts, card lines missing a receipt, items to check)
         · This month (two forms + totals) · Claims (Submitted / Approved / Paid / Rejected)
  This month ─▶ Generate claim ─▶ check ─▶ one email: To manager, Cc finance

Manager (email, or the phone app)
  Claim email ─▶ Approve / Reject with comment

Finance (web portal)
  All claims · Card statements (CSV upload, bank profiles, matching) · Reports · Company setup · Audit trail

Company admin (web portal)
  Everything finance has + storage choice (app cloud / Microsoft 365 / Google Drive) · roles · company retention (within allowed range)

App owner – you (super-admin console)
  All companies and individuals · mileage rate tables · fair-use limits · default retention · delete any receipt/claim anywhere · suspend workspace · tax packs (AU/US/UK) · audit trail across companies
```

## Open questions

None blocking. The concept is ready to turn into a build plan. Things to settle during build planning:

1. **Name and branding** for the app.
2. **Fair-use limits:** how many AI receipt reads per month per account are free before a message appears.
3. **Which accountant(s)** will review the AU, US and UK tax packs and mileage rates before launch.
