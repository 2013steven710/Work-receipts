# Work Receipts: Product Concept

_Draft v2, 27 Sep 2026. Ideas only; nothing is built yet._

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
| Audience | **Company-wide**: you and your colleagues |

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
- Creates the **company workspace** and invites staff. Staff sign in with their work account (Microsoft or Google).
- Uploads the **company claim form** (the Excel file). The app reads it and suggests:
  - the **category list**,
  - the **column mapping** (Date, Supplier, Description, Category, Amount AUD, GST, Original currency, …),
  - the **totals block** at the bottom.
- The admin confirms these once, and every employee gets the same buttons and the same claim format.
- Maintains categories centrally. A change reaches everyone's phone at their next sync.
- Optional: sets **cost centres or project codes** and **category rules**, such as attendee names for client entertainment or a meal limit per day.

### Employee (everyone)
- Signs in and sees the company's categories automatically, with no setup.
- Snaps receipts during the month and taps a category for each one.
- At month-end, taps **Generate claim**. This produces the filled-in company Excel form plus a PDF of the receipts.

### Where categories come from
There are three sources, and they all produce the same thing: **one category list per company, or per team if needed**.

- **A. Sync from a Google Sheet or Excel file:** the admin points the app at a list or header row. The file stays in charge, so edits to it update everyone's buttons. Removed categories are archived, not deleted, so past receipts keep their label.
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
- The **Receipt** column links to the image saved in the employee's Drive or OneDrive folder.
- **Output:** during the month, the sheet lives as a Google Sheet or Excel Online file. **Generate claim** exports a clean `.xlsx` in the exact company format, plus the receipts PDF.

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
- **E-receipts from email:** watches an Outlook or Gmail folder, or accepts forwarded emails. E-receipts land in an **inbox inside the app** for a one-tap category. Nothing is written without the employee's tap.
- **Privacy:** receipt images and claim sheets live in **the company's own Google Drive or Microsoft 365**. The app's own server stores only the company setup (categories, form mapping, users), not receipts. It only accesses the files it creates or the ones you pick.

## Screen map

```
Employee
  Camera ─snap─▶ Category buttons (AI suggestion highlighted, fields filling in)
     │                 │ tap
     │                 ▼
     │           ✓ Saved (or ⏳ Pending sync) · Undo · Edit
     └─ Pick from Photos ─┘

  Tabs:  Camera · Inbox (e-receipts, items needing a check) · This month (rows + totals) · Settings
  This month ─▶ Generate claim ─▶ company .xlsx + receipts PDF ─▶ share / email to finance

Admin (finance)
  Company setup:  Upload claim form ─▶ confirm categories ─▶ confirm column mapping & totals block
  People:         invite staff · teams · cost centres / projects
  Rules:          per-category rules · meal limits · attendee requirement
```

## Open questions

1. Does the company run on **Microsoft 365** (Outlook, OneDrive, Excel) or **Google Workspace**? Since the claim form is Excel, Microsoft 365 is likely. That decides where sheets and receipt images are stored, and which sign-in to use.
2. What happens to a claim after it's generated? Is it **emailed to finance**, **approved by a manager in the app**, or entered into an accounting or payroll system (Xero, MYOB, …)?
3. Are purchases on **personal cards (reimbursement)**, **company cards**, or both? If there are company cards, should we match receipts to the card statement?
4. Does every receipt need a **cost centre or project code**, or only some?
5. Roughly **how many employees**? This affects pricing, admin features and support.
6. How long must receipts be **kept**, and who in finance needs access to all employees' claims?
