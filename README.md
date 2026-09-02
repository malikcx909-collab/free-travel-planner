# Wanderlist — Free Travel Planner

Wanderlist is a zero-cost static travel planner built with plain HTML, CSS, and JavaScript. It requires no account, backend, package installation, API key, or paid service.

## Features

The app searches 249 countries, shows flags, region, currency, dial code, example cities, and city coverage, and lets users save favorite destinations. It also includes a public-holiday lookup where the selected country is covered by the OpenHolidays API. Favorites, checklist tasks, and notes persist in the browser with `localStorage`.

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static server. If Python is installed, run:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Accessible page structure and UI templates |
| `styles.css` | Responsive visual design |
| `script.js` | API calls, search, favorites, checklist, and notes logic |

## Public data sources

The app uses First.org for country names and regions, CountriesNow for flags, currencies, dial codes, and city lists, and OpenHolidays API for public holidays. OpenHolidays currently covers a subset of countries, so the UI shows a friendly fallback message for destinations without holiday coverage.

## Free hosting

Because this is a static site, it can be hosted on GitHub Pages or another static hosting provider without a backend. Check each API provider's current acceptable-use terms before deploying a high-traffic version.
