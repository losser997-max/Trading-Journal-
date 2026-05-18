# Swing Trading Journal with Yahoo Finance LTP

A deployable React + Vite swing trading journal.

## Features
- Professional trading journal dashboard
- Trade log with filters
- Live LTP monitor for open trades using Yahoo Finance chart endpoint
- Live open P&L calculation
- Analytics charts
- Risk manager
- LocalStorage persistence

## Stock Symbol Format
- NSE India: `RELIANCE.NS`, `TCS.NS`, `SBIN.NS`
- If you enter `RELIANCE`, the app automatically converts it to `RELIANCE.NS`
- BSE India: use `.BO`, example `RELIANCE.BO`
- US stocks: use ticker directly, example `AAPL`

## Run Locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Deploy to GitHub Pages
1. Create a GitHub repository.
2. Upload/push these files.
3. In `package.json`, optionally add:
```json
"homepage": "https://YOUR_USERNAME.github.io/YOUR_REPO_NAME"
```
4. Run:
```bash
npm install
npm run build
npm run deploy
```

## Important Note on Yahoo Finance
Yahoo Finance does not provide an official free public browser API. This app first tries Yahoo's chart endpoint directly, then falls back to a public CORS proxy. For a production app, use your own backend/serverless proxy or a paid market-data API.
