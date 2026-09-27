# Work Receipts: Product Concept

_Draft v1, 27 Sep 2026. Ideas only; nothing is built yet._

This document records the decisions made after the [market research](market-research.md). Where the two disagree, this document wins. In particular, the research suggested a background screenshot watcher, which we have dropped.

## One-line pitch

Open the app, snap the receipt, tap a category. The receipt lands in the right place in your Google Sheet, and month-end becomes one button.

## 1. Capture: in-app camera only

**Decision:** there is no background screenshot watching. The app does nothing until you open it.

- Opening the app goes **straight to the camera**, with no menu in between.
- You snap the receipt. The app detects the edges, crops and straightens it, then **immediately shows your category buttons**.
- While you choose a category, the AI reads the receipt in parallel: date, merchant, amount, currency and tax.
- You tap a category, the row is written, and a short confirmation appears with **Undo** and **Edit**.
- **Secondary option, "Pick from Photos":** for receipts you already have as images, such as e-receipt screenshots from Uber or an airline. It leads to the same category screen.

Why this is better:
- No battery drain and no permission to read your whole photo library.
- It works the same way on iPhone and Android, so the iPhone limits don't matter.
- It's easier to get through App Store review.

## 2. Where the category buttons come from

There are three ways to set up categories, and they all produce the same thing: **one category list**.

### A. Sync from a Google Sheet

- Connect Google and pick a sheet with the Google file picker.
- Choose where the categories live, either:
  - **a list**, such as a `Categories` tab or a column range, or
  - **a header row**, for claim sheets that have one column per category.
- The sheet is the **source of truth**. The app re-syncs each time it opens. If the finance team edits the sheet, your buttons update.
- A category removed from the sheet is **archived**, not deleted, so past receipts keep their label.

### B. Enter categories manually

- You can add, rename, reorder and archive categories.
- You can give each one an icon or colour so the buttons are quick to recognise.
- This works offline with no Google account, which is good for trying the app out.

### C. Snap the company claim form

- Take a photo or screenshot of the claim form, whether paper, PDF or Excel.
- The AI finds the category names (for example "Air travel", "Taxi / ground transport", "Meals", "Client entertainment", "Mileage") and shows them as a **checklist to confirm or edit**. Nothing is saved without your review.
- Bonus: the same pass also records the **form's layout**, meaning its columns, required fields (cost centre, project code, GST column) and whether it wants one row per receipt or totals per category. That layout is used later to fill the form at month-end (see 3a).

### Extras for categories

- **The AI suggests and you confirm:** the most likely button is highlighted (Uber → Taxi), and it learns from your history with each merchant.
- **Optional rules per category:** for example, "Client entertainment" asks who attended, and "Meals" warns above a daily limit.
- **Profiles**, if you ever claim from more than one place (two employers, a side business), each with its own sheet and category list.

## 3. Everything else we're keeping

### a. Write into *your* sheet, in *your* format
- The app reads the header row, suggests a mapping from its fields to your columns, and you confirm it once.
- Supported layouts: one tab per month, one column per category (a pivot-style claim form), or a flat list.
- Each row links to the receipt image, which is saved to your Google Drive.

### b. Month-end in one button
- Totals by category.
- **One PDF of all receipt images, in the same order as the rows,** ready to attach to the claim.
- Warnings before you submit: missing receipts, possible duplicates, anything that looks personal.

### c. Duplicate detection
- Catches the same receipt photographed twice, or an e-receipt that was also photographed. It matches on merchant, amount, date and image similarity.

### d. Currency and tax
- Detects the currency and converts it at the **exchange rate on the transaction date** into your claim currency. Both the original and converted amounts are kept.
- Splits out VAT or GST when your form has a column for it.

### e. E-receipts from Gmail
- Watches a Gmail label or accepts forwarded emails. E-receipts land in an **inbox inside the app** so you can categorise them with one tap. Nothing is written to your sheet without your tap.

### f. Privacy
- Data lives in **your** Google Drive and Sheet. There is no vendor database of your receipts.
- The app only accesses the files you pick. It uses the Google file picker and the narrow `drive.file` permission.

## Screen map

```
Camera ─snap─▶ Category buttons (AI suggestion highlighted, fields filling in)
   │                 │ tap
   │                 ▼
   │           ✓ Saved · Undo · Edit
   └─ Pick from Photos ─┘

Home tabs:  Camera · Inbox (e-receipts, low-confidence reads) · This month · Settings
Settings:   Profiles · Categories (Sheet sync / manual / snap claim form) · Sheet & column mapping · Currency
```

## Open questions

1. iPhone, Android, or both?
2. What format is your company claim form: a Google Sheet, an Excel file, a PDF, or a web portal?
3. Does the claim need **one row per receipt**, **totals per category**, or both?
4. What is your claim currency, and how often are receipts in other currencies?
5. Should capture work **offline**, saving now and syncing later (for flights and basements)?
6. Is this for you only, or eventually for colleagues too? That decides accounts, pricing and how much polish is needed.
