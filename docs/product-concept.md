# Work Receipts: Product Concept

_Draft v3, 27 Sep 2026. Ideas only; nothing is built yet._

This document records the decisions made after the [market research](market-research.md). Where the two disagree, this document wins. In particular, the research suggested a background screenshot watcher, which we have dropped.

## One-line pitch

Open the app, snap the receipt, tap a category. The receipt lands in your claim sheet, and month-end becomes one button. Everyone in the company uses the same categories and the same claim format.

## Decisions so far

| Topic | Decision |
|---|---|
| Platforms | **iPhone and Android** |
| Capture | **In-app camera** (plus "Pick from Photos"). No background screenshot watching. |
| Claim form | The company form is an **Excel file**. A Google Sheet version is also acceptable. |
| Claim layout | **One row per receipt**, with **totals per category at the bottom** |
| Currency | **Multi-currency**, default **AUD** |
| Connectivity | Works **online and offline**. Offline, receipts are saved now and synced later. |
| Audience | **Company-wide**, about **50–100 employees** |
| Company platform | **Microsoft 365**: Entra ID sign-in, OneDrive/SharePoint, Excel, Outlook |
| Approval | The generated claim is **emailed to finance and the employee's manager** for approval |
| Cards | **Personal cards (reimbursed)** and **company cards (must match the card statement)** |
| Cost centre / project | **Not required.** Optional field, off by default. |
| Retention | Receipts kept **6 months** in the app. The **finance manager sees everyone's claims.** |

## 1. Capture: in-app camera only

- Opening the app goes **straight to the camera**, with no menu in between.
- You snap the receipt. The app detects the edges, crops and straightens it, then **immediately shows your category buttons**.
- While you choose a category, the AI reads the receipt in parallel: date, merchant, ABN, amount, GST and currency.
- You tap a category, the row is saved, and a short confirmation appears with **Undo** and **Edit**.
- **Secondary option, "Pick from Photos":** for receipts you already have as images, such as e-receipt screenshots from Uber or an airline. It leads to the same category screen.

Why this is better:
- No battery drain and no permission to read your whole photo library.
- It works the same way on iPhone and Android.
- It's easier to get through App Store review.

## 2. Company-wide setup (new)

Because the whole company will use the app, there are two roles.

### Admin (for example, finance), set up once for the company
- Creates the **company workspace** and invites staff. Staff sign in with their **Microsoft 365 work account** (single sign-on, so there are no new passwords). Leavers lose access automatically when IT disables their account.
- Uploads the **company claim form** (the Excel file). The app reads it and suggests:
  - the **category list**,
  - the **column mapping** (Date, Supplier, Description, Category, Amount AUD, GST, Original currency, …),
  - the **totals block** at the bottom.
- The admin confirms these once, and every employee gets the same buttons and the same claim format.
- Maintains categories centrally. A change reaches everyone's phone at their next sync.
- Optional: sets **category rules**, such as attendee names for client entertainment or a meal limit per day. A cost centre or project field can be switched on if ever needed, but it is off by default.

### Employee (everyone)
- Signs in and sees the company's categories automatically, with no setup.
- Snaps receipts during the month and taps a category for each one.
- At month-end, taps **Generate claim**. This produces the filled-in company Excel form plus a PDF of the receipts.

### Where categories come from
There are three sources, and they all produce the same thing: **one category list per company, or per team if needed**.

- **A. Sync from an Excel file in SharePoint/OneDrive** (a Google Sheet also works): the admin points the app at a list or header row. The file stays in charge, so edits to it update everyone's buttons. Removed categories are archived, not deleted, so past receipts keep their label.
- **B. Enter categories manually:** add, rename, reorder and archive, with an icon or colour for each.
- **C. Snap the claim form:** the AI reads the categories and the layout from a photo, screenshot or file of the form. It shows a checklist to confirm, and nothing is saved without review.

Only the admin can choose options A–C for the company list. Optionally, an employee can also add **personal categories**, which map back to a company category when a claim is generated.

The AI **highlights the most likely category** (Uber → Taxi) and learns from each person's history with each merchant. The employee's tap is always final.

## 3. The claim sheet

Each employee gets their own claim sheet for each month, laid out like the company form:

```
Row | Date     | Supplier     | ABN          | Description      | Category        | Orig. amt | Cur | Rate   | Amount AUD | GST   | Receipt
----+----------+--------------+--------------+------------------+-----------------+-----------+-----+--------+------------+-------+--------
 1  | 03/09/26 | Uber         | —            | Airport → office | Taxi            |     64.20 | AUD | 1.0000 |      64.20 |  5.84 | link
 2  | 05/09/26 | Hilton SG    | —            | 1 night          | Accommodation   |    310.00 | SGD | 1.1523 |     357.21 |  0.00 | link
 3  | 09/09/26 | Cafe Nero    | 12 345 678 901| Client lunch    | Client entert.  |     88.00 | AUD | 1.0000 |      88.00 |  8.00 | link
... (new rows are inserted above the totals)
====+======================================================================================+============+=======+
    | TOTALS BY CATEGORY                                                                  |            |       |
    | Taxi                                                                                |     =SUMIF |  …    |
    | Accommodation                                                                       |     =SUMIF |  …    |
    | Client entertainment                                                                |     =SUMIF |  …    |
    | GRAND TOTAL                                                                         |      =SUM  |  …    |
```

- **Totals are live formulas** (`SUMIF` by category), not typed-in numbers, so editing a row updates the totals.
- New receipts are **inserted above the totals block**, so it always stays at the bottom.
- The **Receipt** column links to the image saved in SharePoint.
- **Output:** during the month, the sheet lives as an Excel file in SharePoint. **Generate claim** exports a clean `.xlsx` in the exact company format, plus the receipts PDF.

## 4. Currency and GST (Australia)

- **Default AUD.** Foreign receipts keep the original amount and currency, then convert to AUD at the **exchange rate on the transaction date**, for example the RBA daily rate. The rate used is shown in the row.
- If the card statement shows a different actual amount charged, the employee can **override it with the real AUD amount**.
- **GST** is extracted separately. Foreign purchases default to no GST.
- **Tax-invoice check:** for purchases **over $82.50 including GST**, a valid tax invoice normally needs the supplier's **ABN**. The app warns if it couldn't find one, so finance isn't chasing it later.
- A **possible FBT flag** is set for entertainment categories, so finance can review them.

## 5. Offline first

- Everything you need to capture a receipt works offline:
  - the camera,
  - cropping,
  - the category buttons (cached from the last sync),
  - saving the receipt to the phone.
- Receipts get a **"Pending sync"** badge. When a connection is back, the app:
  1. runs the AI read (or a basic on-device text read as a fallback),
  2. uploads the image,
  3. writes the row,
  4. sends a notification such as "3 receipts synced, 1 needs a check".
- Nothing is lost if the app is closed, because the queue is stored on the phone.
- If the company changes the categories while you're offline, your receipt keeps the category you tapped. Archived categories are flagged for you to re-pick.

## 6. Other features we're keeping

- **Month-end in one button:** category totals, **one PDF of all receipt images in row order**, and warnings before you submit (missing receipts, possible duplicates, a missing ABN, anything that looks personal).
- **Duplicate detection:** catches the same receipt photographed twice, or an e-receipt that was also photographed. It matches on merchant, amount, date and image similarity.
- **E-receipts from email:** watches an Outlook folder, or accepts forwarded emails. E-receipts land in an **inbox inside the app** for a one-tap category. Nothing is written without the employee's tap.
- **Privacy:** receipt images and claim sheets live in **the company's own Microsoft 365** (SharePoint). The app's own server stores only the company setup (categories, form mapping, users), not receipts. It only accesses the files it creates or the ones you pick.

## 7. Microsoft 365 setup (new)

- **Sign-in:** Microsoft Entra ID single sign-on. IT approves the app once for the whole company.
- **Storage:** a **SharePoint "Expense Claims" library** with one folder per employee and one sub-folder per month. It holds the receipt images, the live claim sheet and the generated claim pack.
  - Employees can see only their own folder.
  - The **finance manager** can see every folder.
  - The data stays inside the company's Microsoft 365, under IT's existing security and backup.
- **Excel:** the app fills the company's Excel template through Microsoft Graph, so formulas and formatting are kept.
- **Email:** claims are sent **from the employee's own Outlook** mailbox, so replies and approvals are ordinary email threads.
- **Manager lookup:** each employee's manager is read from their Microsoft 365 profile, so nobody has to pick an approver.
- **Distribution:** the app can be installed privately through **Intune / company app store**, with no public App Store listing needed. It is also possible to list it publicly later.

## 8. Submitting a claim and getting it approved (new)

```
Employee taps "Generate claim"
   ▼
Pre-submit check: missing receipts · duplicates · missing ABN · unmatched company-card lines
   ▼
Claim pack created: company .xlsx + receipts PDF (saved to SharePoint)
   ▼
Email sent from employee's Outlook ─▶ To: manager · Cc: finance
   Subject: "Expense claim – Jane Smith – Sep 2026 – $1,284.55"
   Body: summary by category + [Approve] [Reject with comment] buttons
   ▼
Manager approves ─▶ finance approves ─▶ status "Approved" ─▶ finance marks "Paid"
        │ reject
        ▼
Employee gets a notification with the comment ─▶ fixes rows ─▶ resubmits (version 2)
```

- **Status is tracked** for every claim: Draft → Submitted → Manager approved → Finance approved → Paid, or Rejected.
- After submitting, the claim is **locked**, so it can't be quietly changed. Any change creates a new version.
- **Reminders:** the employee is nudged near month-end if they have a draft claim. The approver is nudged if a claim has waited more than N days.
- If email buttons are blocked, the same **Approve / Reject** actions are available in the finance web portal.

## 9. Personal card vs company card (new)

**At capture:** a **Personal / Company card** switch sits above the category buttons.
- It remembers your last choice.
- It auto-switches if the card digits printed on the receipt match your company card.

**Personal card, reimbursement:**
- The receipt goes into the claim as normal.
- The total at the bottom is the **amount to reimburse**.

**Company card, reconciliation:**
- Nothing is reimbursed. Every line on the card statement must have a matching receipt.
- **Statement import:** finance uploads each month's card statement from the bank (CSV, Excel or PDF). A direct bank feed could come later.
- **Automatic matching** uses amount (in AUD, as charged), date (± 3 days) and merchant name.
  - For overseas purchases, the **statement's AUD amount** is used as the real cost.
- **Result for each cardholder:**
  - ✅ **Matched:** statement line and receipt are linked.
  - ⚠️ **Statement line with no receipt:** becomes a to-do in the employee's inbox ("Qantas $412.30 on 14 Sep — snap the receipt or explain").
  - ⚠️ **Receipt with no statement line:** flagged. It's probably a personal-card receipt, so the app suggests moving it.
- The claim form shows **two sections**: *Personal (to reimburse)* and *Company card (reconciliation)*, each with its own category totals. If the company form expects two separate files, the app produces two instead.

## 10. Finance manager view (new)

This is a **web portal** for desktop use. Employees only need the phone app.
- **All claims**, filterable by employee, month, status and category.
- **Company card reconciliation board:** matched and unmatched lines per cardholder, plus a way to upload statements.
- **Totals:** spend by category, by team and by month. The whole month can be exported to Excel in one go.
- **Company setup:** claim form template, categories, rules, cardholders and approvers.
- **Audit trail:** who submitted, approved, rejected or edited what, and when.

## 11. Retention (new)

- Receipts and claims stay available in the app for **6 months**. After that they drop out of the app's lists.
- ⚠️ **Check with finance before we set any auto-delete.** The ATO generally requires business records, including expense and FBT records, to be kept for **5 years**. The suggested design:
  - After 6 months, receipts leave the app.
  - The **approved claim pack** (Excel plus receipts PDF) stays in the SharePoint archive under the company's normal Microsoft 365 retention policy.
  - That way the app stays uncluttered and the company still meets its record-keeping obligations.

## 12. Scale and running cost (rough)

- 50–100 employees at about 10–30 receipts each works out to roughly **1,000–3,000 receipts a month**.
- The AI read costs cents or less per receipt, so AI is a minor cost. Hosting for the small company-setup server is also minor.
- At this size, the main work is the Microsoft 365 integration, the approval flow and statement matching, not the AI.

## Screen map

```
Employee (phone app)
  Camera ─snap─▶ [Personal | Company card] + category buttons (AI suggestion highlighted)
     │                 │ tap
     │                 ▼
     │           ✓ Saved (or ⏳ Pending sync) · Undo · Edit
     └─ Pick from Photos ─┘

  Tabs:  Camera · Inbox (e-receipts, card lines missing a receipt, items needing a check)
         · This month (rows + totals) · Claims (status: submitted / approved / paid)
  This month ─▶ Generate claim ─▶ check ─▶ email manager + finance

Manager (email, or the phone app)
  Claim email ─▶ Approve / Reject with comment

Finance manager (web portal)
  All claims · Card statements & matching · Reports & export · Company setup · Audit trail
```

## Open questions

1. **Approval order:** manager first, then finance (sequential), or both at the same time? Does it need **both** approvals, or is one enough?
2. **Payment:** how are approved reimbursements paid? Through payroll, or through a bank transfer from Xero or MYOB? Should the app export a file for that?
3. **Company card statements:** which bank issues the cards, and what format can finance download (CSV, Excel, PDF)?
4. **Claim form:** does the Excel form already have separate personal and company-card sections, or are they two different forms? Could you share a blank copy?
5. **Retention:** confirm with finance that "6 months" means *in the app* and that approved claim packs are archived for 5 years, not deleted.
6. **Claim cycle:** is it strictly monthly, with a submission deadline (for example the 5th of the next month)? That drives the reminders.
