# Work Receipts: Market Research

_Researched 27 Sep 2026_

## The idea

You take a screenshot of a receipt. The app asks "Which category?" and you tap a button. AI reads the receipt and adds a row to your Google Sheet, so there's nothing left to do at month-end.

## Short answer

**The basic pipeline (photo → AI extraction → Google Sheets row) already exists and is a commodity.** At least half a dozen small apps do it. **None of them is built around the three things in your idea:**

1. **Screenshot-first capture.** Every competitor starts with the camera.
2. **You pick the category with one tap, from your own list.** Competitors let the AI guess, then make you fix it.
3. **Writing into *your* existing sheet or claim template.** Competitors write their own fixed layout (Date, Merchant, Amount, Category, …).

Those three points, plus month-end claim output, are where there's room to do better.

## Who is already doing it

### Sheets-native indie apps (closest competitors)

| App | Price | Capture | Categorisation | Sheets sync | Notes |
|---|---|---|---|---|---|
| [ReceiptSync](https://receiptsync.net/) | $9.99/mo or $39.99/yr (early deal) | Camera, auto-crop | AI suggests the category | Connect Google and pick a spreadsheet; creates fixed columns (Date, Merchant, Amount, Tax, Category, Notes) | iOS + Android. Budgets and insights are Pro features. |
| [Sheetify](https://sheetify.io/) | Free to start | Camera | Custom labels; organise by month, category or project | Uploads to a sheet in your Drive | [Play Store](https://play.google.com/store/apps/details?id=com.dynamiqdata.r2s&hl=en_US): **1K+ downloads, 4.3★ from 41 reviews**. One review mentions a freeze bug and no reply from support. |
| [ReceiptToSheet](https://receipttosheet.com/) | Free: 20 scans/mo · Pro: $12/mo (annual) | Camera or camera roll (web app, no install) | AI picks it and you can edit it; **custom categories marked "Soon"** | Paste any Sheet URL you can edit | Review-before-save step. Email forwarding and batch import also marked "Soon". |
| [Receipt Reader AI](https://receiptreader.ai/receipt-scanner-to-google-sheets) | n/a | Upload | By project or client | Auto-export | |
| [Splitreceipts](https://splitreceipts.com/) | n/a | Photos, digital receipts, **screenshots** | Automatic, per line item | Real-time sync | Domain didn't resolve during research, so it may be defunct. |
| [ExpenseBot](https://www.expensebot.ai/google-sheets-expense-tracker) | n/a | **Scans Gmail receipts automatically** | GL coding / chart of accounts | Data stays in your own Drive | Aimed at Google Workspace businesses. |

### Established expense platforms

- **Expensify**: SmartScan is accurate, and the free plan includes 25 scans/mo with CSV export. There's no native Google Sheets sync on the free plan, and the product is built for team reimbursement workflows. ([source](https://www.saaspricepulse.com/tools/expensify))
- **Zoho Expense**: $3–5/user/mo. Free for up to 3 users with 20 scans/mo. ([source](https://ramp.com/blog/expensify-vs-zoho-expense))
- **Ramp / Brex / Navan**: match receipts to company-card transactions automatically. They're only an option if your employer already uses them. ([source](https://ramp.com/blog/best-receipt-scanning-apps))
- **Dext, Shoeboxed ($18–54/mo), Neat (~$200/yr), QuickBooks**: bookkeeping-grade tools, more than one employee needs. ([source](https://www.simular.ai/alternatives/receipt-scanner-and-organizer))
- **Smart Receipts** (free / $4.99), **Wave** (free, no OCR): cheap options that export CSV, not a live Sheet.

### Takeaways

- Nobody is doing this at scale. The Sheets-native apps are small: Sheetify has about 1K Android installs, and ReceiptSync is still offering an early-access deal for its first 100 users.
- **Category is always something the AI guesses.** No product treats one tap on your own category as the main interaction.
- **Custom categories and custom columns are missing or marked "coming soon"** in the closest competitors.
- **Screenshots are treated as just another image to upload.** None of these apps notices that you've taken one.

## Where we can do better

### 1. React to the screenshot automatically (biggest gap)

Platform limits decide how this can work:

- **Android: fully possible.** A background service can watch MediaStore for new images in the Screenshots folder. This needs the `READ_MEDIA_IMAGES` permission. Android 14's official `ScreenCaptureCallback` only fires while *your own* activity is on screen, so it isn't enough for this. ([Android docs](https://developer.android.com/about/versions/14/features/screenshot-detection), [write-up](https://dev.to/edwardharks/how-screenshot-detection-works-on-android-2a0m)) The flow would be: screenshot → a notification appears with category buttons → one tap → done, without opening the app.
- **iOS: not possible to fully automate.** iOS 26 Shortcuts has **no "screenshot taken" trigger**, and apps can't watch the photo library in the background. ([analysis](https://leelinkoff.com/docs-professional-essays/ios-26-shortcuts-screenshot-automation-limitations.html), [iOS 26 automations](https://automatemylife.blog/ios-26-shortcuts-new-automations/)) The best iOS flows are:
  - **A Share Sheet extension**: take a screenshot → tap the thumbnail → Share → "Work Receipts" → category buttons appear in the share sheet.
  - **A "Log last screenshot" Shortcut** bound to Back Tap or the Action button.
  - **A catch-up inbox**: when you open the app, it finds recent screenshots that look like receipts and queues them for one-tap categorising.

### 2. Categories are your buttons, and the AI only suggests

- You define the category list once, for example your company's expense codes (Meals, Taxi, Travel, Client entertainment, …).
- The AI highlights the most likely button (Uber → Taxi), but you tap to confirm. That's one tap, and you're always the one who decides.
- It learns from your history for each merchant, so the suggestion is right almost every time.

### 3. Write into *your* sheet, in *your* format

- Point the app at your existing sheet or company claim template. The AI reads the header row and proposes a column mapping, which you confirm once.
- It supports common layouts: one tab per month, one column per category (a pivot-style claim form), or a flat list.
- Each row links to the receipt image saved in your Drive.

### 4. Make month-end a single button

- It builds the claim: a totals-by-category summary plus **one PDF of all receipt images in row order**, ready to submit.
- It warns about missing receipts, duplicates (the same receipt screenshotted twice, or an emailed receipt plus a screenshot) and anything that looks personal.
- It handles multi-currency with the exchange rate on the transaction date, and splits out VAT/GST.

### 5. Also catch e-receipts

A lot of work receipts arrive by email (Uber, airlines, hotels, SaaS). A Gmail label watcher or a forwarding address would close the gap. ExpenseBot does this for businesses. ReceiptToSheet lists it as "Soon".

### 6. Privacy

Data stays in your own Google Drive and Sheet, with no vendor database. Request the narrow `drive.file` OAuth scope and use the Google Picker, so the app only touches the sheet you choose. This also makes Google's OAuth verification easier.

## Risks

- **A crowded, low-price market.** Competitors charge $0–12/mo. If this becomes a product, the edge has to be the screenshot flow and the custom-template flow, not the AI extraction.
- **iOS will always feel less magical than Android** because of the platform limits above.
- **Getting users is hard.** The existing indie apps have little traction, so this probably makes more sense as a personal tool first and a product second.

## Suggested path

1. **Personal MVP, about one day.** Build a share-sheet shortcut (iOS) or share target (Android) that sends the image to a small backend. The backend sends it to a vision model, which extracts date, merchant, amount, currency and tax. It then shows your category buttons and appends a row via the Sheets API. Use it for a month.
2. **App v1.** Android screenshot watcher with notification buttons, iOS share extension, category editor, column mapping for your template, and receipt images saved to Drive.
3. **v2.** Month-end claim PDF, duplicate detection, FX, and Gmail e-receipts.
