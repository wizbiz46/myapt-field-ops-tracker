# myAPT Field Ops Tracker V1

Static unified app for myAPT partnership outreach + media capture operations.

## Run locally

```bash
cd src
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

Deploy the `src/` folder to Netlify Drop, GitHub Pages, Vercel static hosting, or any static host.

## Architecture

- Static HTML/CSS/JS
- localStorage for working state/offline use
- Seed data embedded from Partner Tracker + Alerts Sheet CSV
- n8n should write a current-snapshot `Daily Capture Opportunities` sheet
- App supports CSV/JSON import/export for handoff/recovery

No backend and no video upload in V1.

## What is included

- Mobile-first static web app in `src/`
- Google Sheets sync Apps Script in `apps-script/Code.gs`
- GitHub Pages-ready static site mirrored into `docs/`
- n8n workflow export in `n8n/`

## Google Sheets sync setup

1. Create/choose the myAPT tracker Google Sheet.
2. Open `apps-script/Code.gs` and replace `PASTE_YOUR_SHEET_ID_HERE` with the Sheet ID.
3. Deploy the Apps Script as a Web App.
4. Paste the Web App URL into the app under Settings → Google Sheets sync.
5. Use Pull from Sheets / Push to Sheets.

Do not store credentials/passwords in this tracker sheet.

## GitHub Pages setup

After pushing to GitHub, enable Pages with source: `Deploy from a branch`, branch `main`, folder `/docs`. The app source remains in `src/`; `docs/` is the GitHub Pages serving copy.
