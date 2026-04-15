/**
 * DS Project 3 — ingest API for typing study results.
 *
 * POST /submit  — JSON body (same shape as the Monkeytype study frontend sends)
 * GET  /export.csv — download all rows as CSV (for Excel / R / grading)
 * GET  /health — ok check
 *
 * Data file: data/submissions.ndjson (one JSON object per line; survives restarts)
 */
import express from "express";
import { appendFile, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const DATA_DIR = process.env.STUDY_DATA_DIR || join(__dirname, "data");
const STORE_PATH = join(DATA_DIR, "submissions.ndjson");

const app = express();
app.use(express.json({ limit: "32kb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/submit", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") {
    res.status(400).json({ ok: false, error: "invalid_json" });
    return;
  }

  const receivedAt = new Date().toISOString();
  const row = {
    server_received_at: receivedAt,
    event: body.event ?? "completed",
    participant_id: body.participantId ?? "",
    external_id: body.externalId ?? "",
    variant: body.variant ?? "",
    wpm: body.wpm ?? "",
    acc: body.acc ?? "",
    raw_wpm: body.rawWpm ?? "",
    test_duration: body.testDuration ?? "",
    mode: body.mode ?? "",
    mode2: body.mode2 ?? "",
    user_agent: body.userAgent ?? "",
    raw: body,
  };

  try {
    await ensureDataDir();
    await appendFile(STORE_PATH, `${JSON.stringify(row)}\n`, "utf8");
    res.json({ ok: true, received: receivedAt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "write_failed" });
  }
});

app.get("/export.csv", async (_req, res) => {
  try {
    const text = await readFile(STORE_PATH, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    const header = [
      "server_received_at",
      "event",
      "participant_id",
      "external_id",
      "variant",
      "wpm",
      "acc",
      "raw_wpm",
      "test_duration",
      "mode",
      "mode2",
      "user_agent",
    ];
    const out = [header.join(",")];
    for (const line of lines) {
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      out.push(header.map((h) => csvEscape(o[h])).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="study-submissions.csv"',
    );
    res.send(out.join("\n"));
  } catch (e) {
    if (e.code === "ENOENT") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(
        "server_received_at,event,participant_id,external_id,variant,wpm,acc,raw_wpm,test_duration,mode,mode2,user_agent\n",
      );
      return;
    }
    console.error(e);
    res.status(500).send("export failed");
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Study API listening on http://0.0.0.0:${PORT}`);
  console.log(`  POST /submit   — ingest`);
  console.log(`  GET  /export.csv — spreadsheet download`);
});
