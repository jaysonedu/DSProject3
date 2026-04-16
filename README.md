# Columbia DS Project 3 — Monkeytype study fork

Typing **A/B study** (autocorrect on vs off, ~30s English time mode) on top of [Monkeytype](https://github.com/monkeytypegame/monkeytype). Results can be **POST**ed to a small **Node** app (`study-server`).

**Detailed runbook and checklist:** [docs/DS_PROJECT3.md](./docs/DS_PROJECT3.md)

---

## Prerequisites

- **Node.js** ≥ 20 (`study-server`; repo tooling expects **pnpm** — `corepack enable` / install pnpm)
- From this directory: **`pnpm install`**

---

## Local development (typing + collector)

1. **API:** `cd study-server` → `npm install` → `npm start` → default **http://127.0.0.1:8787** (`/health`, `POST /submit`, `GET /export.csv`).
2. **Frontend env:** copy `frontend/example.env.study` to **`frontend/.env.local`** and set **`VITE_DS3_COLLECT_URL`** (on Windows prefer **`http://127.0.0.1:8787/submit`** if `localhost` fails).
3. **App:** from repo root run **`pnpm dev-fe`** (not `npm start` in `frontend/` — that is preview and won’t pick up `.env.local` the same way).
4. Open **http://localhost:3000**, complete a run; rows append to **`study-server/data/submissions.ndjson`**.

Turn off the study layer: **`DS_PROJECT3_STUDY_ENABLED`** in `frontend/src/ts/experiment/ds-project3-flags.ts` → `false`.

---

## Production build (static site)

Vite bakes **`VITE_*`** and build-time checks into the bundle at compile time.

**`frontend/.env.local`** (or CI env) should include at least:

| Variable | Notes |
|----------|--------|
| **`VITE_DS3_COLLECT_URL`** | Full URL to your live collector, e.g. `https://your-api.onrender.com/submit` |
| **`RECAPTCHA_SITE_KEY`** | Required by `vite.config.ts` for production; may be **empty** (`RECAPTCHA_SITE_KEY=`) for this fork |

**Firebase (production):** Vite aliases **`firebase-config`** → **`firebase-config-live`**. That file is **gitignored**. Before **`pnpm build-fe`**, create **`frontend/src/ts/constants/firebase-config-live.ts`** (copy from **`firebase-config-example.ts`** with empty strings is enough for anonymous study-only deploys).

From repo root:

```bash
pnpm build-fe
```

If Turbo reuses an old cached bundle and **`VITE_DS3_COLLECT_URL`** looks missing in the output, rebuild with the variable set in the shell and cache disabled, e.g.:

```powershell
$env:VITE_DS3_COLLECT_URL = "https://your-api.onrender.com/submit"
$env:RECAPTCHA_SITE_KEY = ""
pnpm build-fe -- --force
```

**Build output directory:** **`frontend/dist/`** (not `dist/` at repo root). Deploy that folder to Netlify, Cloudflare Pages, etc.

Confirm the collector URL is in the bundle (from repo root):

```powershell
Select-String -Path "frontend\dist\js\*.js" -Pattern "your-api.onrender.com" -SimpleMatch
```

---

## Deploying the study

1. **Collector:** host **`study-server`** (e.g. Render). Optional: **`STUDY_DATA_DIR`** if you mount a persistent disk. **`/export.csv`** is public by default — restrict on real deployments if needed.
2. **Frontend:** set **`VITE_DS3_COLLECT_URL`** in the environment used for **`pnpm build-fe`**, build, then deploy **`frontend/dist`**.
3. **Participant links:** `https://your-site/` with optional **`?ds3_pid=`** or **`?participant=`** for an external id.

**Export data:** open **`https://your-api-host/export.csv`** (or use `curl` to save a file).

---

## Optional R collector

**`study-collector/`** (Plumber + optional Shiny) — see that folder; not required for `study-server`.

---

## Upstream

Original app: [monkeytypegame/monkeytype](https://github.com/monkeytypegame/monkeytype). For contributing to vanilla Monkeytype, see their repository and **[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)**.
