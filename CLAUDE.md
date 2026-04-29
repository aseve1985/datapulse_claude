# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (tsx runs server.ts + Vite HMR)
npm run build        # Build frontend with Vite (output: dist/)
npm run build:server # Bundle server.ts with esbuild (output: dist/server.mjs)
npm start            # Run compiled server (production)
npm run lint         # TypeScript type check only (no emit)
npm run clean        # Remove dist/
```

No test suite exists in this project.

## Architecture Overview

Single-repo: **Express backend + React/Vite frontend**, served from the same process. In dev, Express uses Vite in middleware mode (`middlewareMode: true`). In production, Express serves the compiled `dist/` folder with SPA fallback.

```
server.ts          Express API + Vite middleware (dev) / static serving (prod)
src/App.tsx        Root component — auth check, view routing, module selection
src/components/    LandingPage, DashboardView, ChatPanel, LoginView
src/services/      gemini.ts (AI + data digest), api.ts (S3 fetch)
src/businessContext.ts  Formatting rules + terminology injected into every AI prompt
tools_libgot/      Standalone HTML tools, served at /tools/:filename
```

## Routing

**Frontend:** No router library. Uses `window.history.pushState()` + `popstate` listener. Only two views: `'landing'` and `'dashboard'`, toggled via `currentView` state in App.tsx.

**Backend route groups:**
- `/api/auth/status` — IAP validation + permissions from Google Sheet
- `/api/sales-s3` — Parquet data from S3 (1-hour in-memory cache)
- `/api/reports` — CRUD for saved reports (persisted in Google Sheet)
- `/api/ai/insights` + `/api/ai/chat` — Gemini endpoints (structured + free-form)
- `/api/exchange-rates` — Cached ARS/COP rates
- `/tools/:filename` — Serves files from `tools_libgot/` (bypasses Vite SPA fallback via explicit `res.sendFile`)

## Authentication

Google Cloud IAP in production. Header `x-goog-authenticated-user-email` carries the identity. Dev fallback chain: `test_email` query param → `DEV_DEFAULT_EMAIL` env var → guest mode.

**Permissions** are read from a Google Sheet (`PERMISSIONS_SPREADSHEET_ID`), cached 5 minutes in memory. "Todas"/"Todos" grants `hasAllAccess`. Module names in the sheet map to IDs: Ventas→sales, Cobranzas→collections, etc.

## Data Flow

1. User selects a module → `App.handleSelectModule()` navigates to dashboard.
2. Dashboard triggers `handleFetchData(dateRange)`:
   - **API modules**: `GET /api/sales-s3` downloads parquet from S3, filters by date, returns JSON.
   - **File uploads**: Parsed client-side (PapaParse for CSV, XLSX for Excel, pdfjs for PDF).
   - **Google Sheets**: `GET /api/sheets/fetch` proxies via service account, returns CSV.
3. Dashboard computes a **data digest** in `src/services/gemini.ts` — column inference (numeric/date/categorical), country-based aggregations, monthly rollups, top-10 segments — and sends it to Gemini instead of raw rows.
4. `POST /api/ai/insights` returns structured JSON (`{ summary, insights, recommendation, calculation_explanation }`) enforced via Gemini's schema.
5. Token usage is logged to a `tokens` tab in the same Google Sheet.

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini AI |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON credentials for Sheets/Drive |
| `PERMISSIONS_SPREADSHEET_ID` | Sheet with users, reports, tokens tabs |
| `BI_API_KEY` | Fallback external BI API |
| `AWS_REGION` | S3 region (default: us-east-1) |
| `DEV_DEFAULT_EMAIL` | Dev identity fallback |
| `DISABLE_HMR` | Set `"true"` to disable Vite WebSocket HMR (useful behind IAP/corp proxies) |

AWS credentials are picked up from the environment automatically (standard SDK chain).

## Non-Obvious Decisions

- **Data digest instead of raw data to Gemini**: `gemini.ts` pre-aggregates data client-side before sending to the AI. This reduces token cost and keeps prompts under the context limit. Modifying AI behavior means editing this digest logic, not just the prompt.
- **Business context module** (`src/businessContext.ts`): Formatting rules (1.000.000 dot-thousands, 15,50% comma-decimals) and business terminology are injected as a template literal into every Gemini prompt. Keep this in sync if business rules change.
- **Never mix ARS + COP totals**: Enforced in both the data digest and the business context prompt. Insights are always per-country.
- **Saved reports store filter state**: The `filtros` JSON field in the reports sheet persists `{ startDate, endDate, filterSlots, cardConfigs, chartConfigs }`. Loading a report restores the full dashboard configuration.
- **S3 parquet key is hardcoded** in server.ts: `platinum_ia/ventas_multipais/ventas_platinum.parquet`. Change here if the data lake path changes.
- **Gemini model**: `gemini-3-flash-preview`. Structured output uses `responseMimeType: "application/json"` with an explicit schema.
