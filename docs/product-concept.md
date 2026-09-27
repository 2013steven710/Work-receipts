# Work Receipts: Product Concept

_Draft v4, 27 Sep 2026. Ideas only; nothing is built yet._

This document records the decisions made after the [market research](market-research.md). Where the two disagree, this document wins. In particular, the research suggested a background screenshot watcher, which we have dropped.

## One-line pitch

Open the app, snap the receipt, tap a category. The receipt lands in your claim form, and month-end is one button that emails a finished claim to your manager and finance. It's built for companies anywhere in the world, with their own forms, currencies, tax rules and banks.

## Decisions so far

| Topic | Decision |
|---|---|
| Market | **Global product.** Each company gets its own workspace with its own country, home currency, tax rules and holiday calendar. |
| Platforms | **iPhone and Android** apps for employees, plus a **web portal** for finance and admins. |
| Capture | **In-app camera**, plus "Pick from Photos". No background screenshot watching. |
| Claim forms | The company's own **Excel** forms, filled in by the app, as **two separate forms**: *Personal card (reimbursement)* and *Company card (reconciliation)*. A Google Sheet is also acceptable. |
| Claim layout | **One row per receipt**, with **totals per category at the bottom** |
| Currency | **Multi-currency.** The home currency is set per company (AUD for the first company). |
| Connectivity | Works **online and offline**. Offline, receipts are saved now and synced later. |
| Company size | Aimed at companies of about **50–100 employees** |
| Company platform | **Microsoft 365** first (sign-in, SharePoint, Excel, Outlook). Google Workspace later. |
| Approval | One email, **To: manager, Cc: finance.** The **manager approves**, then **finance pays by bank transfer outside the app**. |
| Cards | **Personal cards (reimbursed)** and **company cards (every statement line must match a receipt)** |
| Card statements | **CSV download from any bank.** The format differs by bank, so the app learns each bank's layout. |
| Cost centre / project | **Not required.** Optional field, off by default. |
| Retention | **6 months** by default. **The app owner can change this and can delete any receipt at any time.** The finance manager sees everyone's claims. |
| Reminder | Sent on the **3rd business day of the new month** if last month's claim hasn't been submitted. |

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
| **App owner** (the company's workspace owner) | Signs the company up and controls billing, security and **retention**. **Can delete any receipt or claim at any time.** Appoints finance admins. |
| **Finance** (finance manager / admin) | Sets up the claim forms, categories and rules. Uploads card statements. **Sees every employee's claims.** Marks claims as paid. |
| **Manager** | Receives their team's claims by email and approves or rejects them. |
| **Employee** | Snaps receipts, taps categories and submits claims at month-end. |

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
  - **Later packs:** NZ (GST), UK and EU (VAT number and VAT amount), Singapore (GST), US (sales tax, usually not reclaimable), and others.
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
   Body: totals by category for each form + [Approve] [Reject with comment]
   ▼
Manager approves ─▶ status "Approved" ─▶ finance pays by bank transfer (outside the app)
        │ reject                              ─▶ finance clicks "Mark paid" (optional, so the employee can see it)
        ▼
Employee gets the comment ─▶ fixes rows ─▶ resubmits (version 2, same email thread)
```

- **Statuses:** Draft → Submitted → Approved → Paid, or Rejected.
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
- **The app owner decides:**
  - They can change the retention period for the company, shorter or longer.
  - They can **delete any receipt or claim at any time.**
  - Every deletion is recorded in the audit trail (what was deleted, when and by whom), but the image itself is gone.
- **Employees** can delete their own receipts while they're still in a draft claim. After a claim is submitted, only the app owner can delete it.
- **A local-law reminder is shown when changing retention:** many countries require businesses to keep expense records much longer. For example, Australia's ATO generally requires 5 years. The app shows this warning, but **the owner makes the call**.
  - Recommended: keep approved claim packs in the company's SharePoint archive under its normal Microsoft 365 retention policy.

## 12. Other features we're keeping

- **Duplicate detection:** catches the same receipt photographed twice, or an e-receipt that was also photographed. It matches on merchant, amount, date and image similarity.
- **E-receipts from email:** watches an Outlook folder, or accepts forwarded emails. E-receipts land in the **inbox inside the app** for a one-tap category.
- **Privacy:** receipt images and claim forms live in **the company's own Microsoft 365** (SharePoint). The app's server stores only company setup, bank profiles, claim statuses and the audit trail, not receipt images. Employees see only their own folder.

## 13. Scale and running cost (rough)

- A 50–100 employee company at about 10–30 receipts per person works out to roughly **1,000–3,000 receipts a month**.
- The AI read costs cents or less per receipt, and hosting is small.
- The main work is the Microsoft 365 integration, the approval emails, the bank CSV learning and the per-country tax packs.
- **Distribution:** as a global product, the app will be listed publicly on the **App Store and Google Play**. Companies can also push it to staff phones through **Intune**.

## Screen map

```
Employee (phone app)
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

App owner (web portal)
  Everything finance has + billing · retention period · delete any receipt/claim · roles
```

## Open questions

1. **App owner:** is this the company that subscribes (its workspace owner, as assumed above), or you, as the owner of the whole product? If it's you, do you also need a **super-admin console** across all companies?
2. **Company-card approval:** should the manager approve the *company card* form too, or only the personal claim?
3. **Business model:** will companies pay per employee per month, a flat fee per company, or will it be free for the first company?
4. **Next country after Australia:** which tax pack should come second?
5. **Languages:** is English-only fine for v1?
