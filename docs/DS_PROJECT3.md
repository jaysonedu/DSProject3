# DS Project 3 — Typing study (Monkeytype fork)

This document describes **Columbia DS Project 3** changes on top of Monkeytype: a minimal **A/B study** (autocorrect on vs off), **~30s English** time mode, optional **server-side logging** of submissions, and local run instructions for the team.

---

## What was added

| Area | Purpose |
|------|---------|
| **Study UI** | Single session: one 30s test, thank-you screen, optional POST to your collector |
| **A/B assignment** | `autocorrect_on` vs `autocorrect_off` stored in `localStorage` (`ds3_ab_autocorrect_variant`) |
| **Autocorrect — mobile** | `textarea` gets `autocorrect` / `spellcheck` attributes (OS-dependent; strongest on mobile Safari) |
| **Autocorrect — desktop** | On **Space**, if the typed word is within a small **Levenshtein** distance of the target, it is replaced; accuracy penalties for that word are **forgiven**; word list UI is refreshed so letters show **correct** before advancing |
| **Data collection** | Browser `POST`s JSON to `VITE_DS3_COLLECT_URL`; small **study-server** appends **NDJSON** |
| **Participant id** | Anonymous browser id + optional `?ds3_pid=` / `?participant=` query params |

---

## Repository layout (study-related)

```
monkeytype/
├── docs/
│   └── DS_PROJECT3.md          ← this file
├── frontend/
│   ├── .env.local              ← you create (gitignored); see example.env.study
│   ├── example.env.study       ← template for VITE_DS3_COLLECT_URL
│   └── src/ts/experiment/
│       ├── ds-project3-study.ts ← study bootstrap, POST, thank-you UI, desktop autocorrect helper
│       └── ds-project3-flags.ts    ← DS_PROJECT3_STUDY_ENABLED (toggle whole study)
├── study-server/
│   ├── server.js               ← Express: POST /submit, GET /export.csv, GET /health
│   ├── data/submissions.ndjson ← created at runtime (gitignored)
│   └── how-to-run.txt          ← shorter ops notes
└── study-collector/            ← optional R Plumber + Shiny (see folder)
```

**Important implementation files**

- `frontend/vite.config.ts` — `envDir` points at `frontend/` so `frontend/.env.local` is loaded for `import.meta.env` (project `root` is `src/`, which broke env loading before this fix).
- `frontend/src/ts/input/handlers/insert-text.ts` — desktop autocorrect + forgiveness + `updateWordLetters` refresh.
- `frontend/src/ts/test/test-input.ts` — `forgiveCurrentWordKeyErrorsForStudyAutocorrect` (does **not** rely on `currentErrorHistory`; timer resets it every second).
- `frontend/src/ts/test/test-logic.ts` — study hook suppression so accuracy-only MT invalidity still POSTs (research).
- `turbo.json` — `VITE_DS3_COLLECT_URL` listed for `@monkeytype/frontend#dev` and `#build`.

---

## Prerequisites

- **Node.js** ≥ 20 (study-server); Monkeytype repo expects **pnpm** (`corepack enable` / `npm i -g pnpm`).
- From repo root **`monkeytype/`**, dependencies are installed with **`pnpm install`** (see upstream docs).

---

## How to run locally (end-to-end)

### 1. Study API (collector)

```bash
cd study-server
npm install
npm start
```

- Listens on **`http://0.0.0.0:8787`** by default.
- Check **`http://127.0.0.1:8787/health`** → JSON `{"ok":true}`.
- Submissions append to **`study-server/data/submissions.ndjson`**.
- CSV: **`http://127.0.0.1:8787/export.csv`**

Override port: `set PORT=9999` (Windows) / `PORT=9999 npm start` (Unix).

### 2. Frontend env

```bash
cd frontend
copy example.env.study .env.local   # Windows; use cp on macOS/Linux
```

Edit **`frontend/.env.local`**:

- Use **`http://127.0.0.1:8787/submit`** on Windows if `localhost` fails (IPv6 vs IPv4).
- For phones on your LAN, use your PC’s **LAN IP** instead of `127.0.0.1`.

### 3. Start the typing app (must be Vite **dev**, not preview)

From **`monkeytype/`** repo root:

```bash
pnpm dev-fe
```

Or:

```bash
cd frontend
pnpm dev
```

Open **`http://localhost:3000`** (or the URL Vite prints).

**Do not** use `npm start` inside `frontend/` for local collection: that runs **`vite preview`**, which serves a **pre-built** bundle. `VITE_DS3_COLLECT_URL` is baked in at **`pnpm build-fe`** time; without a rebuild, `import.meta.env.VITE_DS3_COLLECT_URL` is empty and **nothing is POSTed**.

### 4. Optional: full Monkeytype backend

`pnpm dev-fe` alone will show **connection refused** to `:5005` and **Firebase** may warn (empty keys in this fork). That is **expected** for anonymous typing + study flow. To silence errors, run **`pnpm dev-be`** (or full **`pnpm dev`**) per upstream docs (MongoDB, Redis, etc.).

---

## Verifying data collection

1. With **`pnpm dev-fe`** running, open DevTools → Console.
2. **`ds3GetCollectUrl()`** should return your submit URL (dev-only helpers).
3. **`await ds3PingCollector()`** should be **`true`** and **`study-server/data/submissions.ndjson`** should gain a `debug_ping` line.
4. **Network** tab: filter **`submit`**; complete a test → **POST** should return **200**.

If the thank-you screen says the session is done and you cannot type again, **clear site data** or use a **new incognito** window (session flag in `sessionStorage`).

---

## Study behavior (participant-facing)

- **One** 30s English time test per “session” (then thank-you).
- **Variant** is chosen once and reused on refresh until `localStorage` is cleared.
- **Submitted events** (when URL is set): `assigned` (first visit) and `completed` (after a valid-enough run; see `test-logic` / study hook).
- **Query params**: `?ds3_pid=...` or `?participant=...` for an external id (Prolific, class roster id), stored in `sessionStorage`.

---

## Disabling or shipping without the study

- Set **`DS_PROJECT3_STUDY_ENABLED`** to **`false`** in `frontend/src/ts/experiment/ds-project3-flags.ts` to turn off all study UI and POSTs without removing files.

---

## Deployment (production)

1. **Host `study-server`** (Render, Railway, Fly.io, VPS, etc.). Persist **`data/`** (volume or disk).
2. Set **`VITE_DS3_COLLECT_URL=https://YOUR-API-HOST/submit`** in the environment used for **`pnpm build-fe`** (or your CI), then deploy the **static** frontend.
3. Participant link example: `https://YOUR-SITE/?ds3_pid=OPTIONAL_ID`

**Security:** `/submit` is open by default (typical for class studies). Restrict **`/export.csv`** (firewall or auth) on public hosts.

---

## Optional: R / Shiny

See **`study-collector/`** (`plumber.R`, `dashboard/app.R`) for optional ingestion/dashboard experiments. Not required for `study-server`.

---

## What to do next (handoff checklist)

Use this list so teammates can continue without reverse-engineering the fork.

1. **IRB / consent** — Align copy on the thank-you screen and data fields with approved protocol; document retention and deletion for `submissions.ndjson`.
2. **Production URLs** — Deploy `study-server` + frontend; set `VITE_DS3_COLLECT_URL` on **build**; smoke-test `health`, `submit`, and `export.csv`.
3. **Randomization balance** — Confirm sample size per `variant` in NDJSON or CSV; add monitoring if needed.
4. **Methods text** — Describe: (a) mobile vs desktop autocorrect mechanisms, (b) Levenshtein threshold and forgiveness for desktop, (c) Monkeytype accuracy/WPM still reflect keypresses unless forgiven by autocorrect path.
5. **Toggle for upstream** — If merging back to vanilla Monkeytype, set `DS_PROJECT3_STUDY_ENABLED` to `false` or gate behind env.
6. **Tests** — Add automated tests for `tryDs3StudyDesktopAutocorrect` and forgiveness if the course requires regression safety.
7. **Backup** — Schedule backups of `data/` on the host running `study-server`.
8. **Secrets** — Never commit `frontend/.env.local`; use CI secrets for `VITE_DS3_COLLECT_URL`.

---

## Troubleshooting (short)

| Symptom | Likely cause |
|---------|----------------|
| No `submissions.ndjson` | `vite preview` / wrong start command; missing `.env.local`; Turbo/env not passed — use **`pnpm dev-fe`** and restart after env changes |
| `ds3GetCollectUrl()` null | `envDir` / `.env.local` path — should be fixed in `vite.config.ts`; confirm file is **`frontend/.env.local`** |
| Ping `false` on Windows | Use **`127.0.0.1`** not `localhost`; ensure study-server is running |
| Console `:5005` / Firebase errors | Normal for frontend-only dev; run backend or ignore for study |

For more detail, see **`study-server/how-to-run.txt`** and **`frontend/example.env.study`**.
