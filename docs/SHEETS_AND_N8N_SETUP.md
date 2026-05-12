# myAPT Sheets + n8n setup

## Google Sheet

Use `myAPT_Field_Ops_Tracker_Sheet_Template.xlsx` to create/seed the tracker sheet.

Tabs:

- `Buildings` — building/media master
- `Partners` — local partner outreach CRM
- `Captures` — unit-level capture log from the app
- `Daily Capture Opportunities` — current snapshot written by n8n

Do not store passwords or API keys in this sheet.

## Apps Script sync endpoint

1. Open the Google Sheet.
2. Extensions → Apps Script.
3. Paste `apps-script/Code.gs` from this repo.
4. Replace `PASTE_YOUR_SHEET_ID_HERE` with the Sheet ID from the Google Sheet URL.
5. Deploy → New deployment → Web app.
6. Execute as: Me.
7. Access: anyone with the link, or restricted to your workspace if supported by your deployment.
8. Copy the Web App URL.
9. In the app, open Settings → Google Sheets sync → paste endpoint → Save endpoint.
10. Use Pull from Sheets / Push to Sheets.

## n8n

Import `n8n/myAPT_Daily_Filming_Alert_FIXED_Daily_Capture_Opportunities.json`.

Expected behavior:

- Reads inventory + building master.
- Scores buildings with enough unfilmed vacant floorplans.
- Sends Telegram summary if configured.
- Clears and rewrites `Daily Capture Opportunities` in the tracker sheet.

After importing, reconnect credentials for:

- Google Sheets
- Telegram, if using the alert message
- Any existing inventory/source sheet nodes from the original workflow

Make sure the Google Sheets nodes point to the same tracker Google Sheet and the tab named `Daily Capture Opportunities`.
