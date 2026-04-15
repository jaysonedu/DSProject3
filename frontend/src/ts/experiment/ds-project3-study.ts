import { applyConfig } from "../config/lifecycle";
import { saveFullConfigToLocalStorage } from "../config/persistence";
import { getInputElement } from "../input/input-element";
import type { CompletedEvent } from "@monkeytype/schemas/results";
import { DS_PROJECT3_STUDY_ENABLED } from "./ds-project3-flags";

export { DS_PROJECT3_STUDY_ENABLED };

const LS_VARIANT = "ds3_ab_autocorrect_variant";
const LS_PARTICIPANT_ID = "ds3_participant_id";
const SS_EXTERNAL_PID = "ds3_external_participant_id";
const SS_SESSION_DONE = "ds3_study_session_completed";
const SS_LAST_RESULT = "ds3_study_last_result";
const LS_RUN_LOG = "ds3_study_run_log";

export type AutocorrectVariant = "autocorrect_on" | "autocorrect_off";

export function isStudyModeActive(): boolean {
  return DS_PROJECT3_STUDY_ENABLED;
}

export function isStudySessionComplete(): boolean {
  return sessionStorage.getItem(SS_SESSION_DONE) === "1";
}

export function getAssignedVariant(): AutocorrectVariant | null {
  const v = localStorage.getItem(LS_VARIANT);
  if (v === "autocorrect_on" || v === "autocorrect_off") return v;
  return null;
}

/** Anonymous id for this browser; included when posting results to your collector. */
export function getStudyParticipantId(): string {
  let id = localStorage.getItem(LS_PARTICIPANT_ID);
  if (id !== null && id.length > 0) {
    return id;
  }
  id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ds3_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  localStorage.setItem(LS_PARTICIPANT_ID, id);
  return id;
}

/** Optional Prolific / class id from `?ds3_pid=` or `?participant=`. */
export function getExternalParticipantId(): string | null {
  return sessionStorage.getItem(SS_EXTERNAL_PID);
}

function captureExternalPidFromUrl(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    const pid = q.get("ds3_pid") ?? q.get("participant");
    if (pid !== null && pid.trim().length > 0) {
      sessionStorage.setItem(SS_EXTERNAL_PID, pid.trim().slice(0, 256));
    }
  } catch {
    /* ignore */
  }
}

function getCollectUrl(): string | null {
  const u: unknown = import.meta.env["VITE_DS3_COLLECT_URL"];
  return typeof u === "string" && u.length > 0 ? u : null;
}

async function postStudyPayload(
  body: Record<string, unknown>,
): Promise<boolean> {
  const url = getCollectUrl();
  if (url === null) {
    if (import.meta.env.DEV) {
      console.warn(
        "[DS Project 3] POST skipped: VITE_DS3_COLLECT_URL is empty",
      );
    }
    return false;
  }
  if (import.meta.env.DEV) {
    const ev = body["event"];
    console.info(
      "[DS Project 3] POST →",
      url,
      typeof ev === "string" ? ev : "",
    );
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      mode: "cors",
    });
    if (!res.ok && import.meta.env.DEV) {
      const text = await res.text().catch(() => "");
      console.warn("[DS Project 3] Collector HTTP", res.status, text);
    }
    return res.ok;
  } catch (e) {
    if (import.meta.env.DEV) {
      const hint =
        typeof url === "string" && url.includes("localhost")
          ? " Try 127.0.0.1 instead of localhost if you are on Windows (IPv6 vs IPv4)."
          : "";
      console.warn(
        "[DS Project 3] Collector fetch failed (is study-server running on :8787?)",
        e,
        hint,
      );
    }
    return false;
  }
}

function registerDs3DevConsoleHelpers(): void {
  if (!import.meta.env.DEV) return;
  console.info(
    "[DS Project 3] Autocorrect A/B variant (stored in localStorage):",
    getAssignedVariant(),
    "participantId:",
    getStudyParticipantId(),
  );
  const w = window as unknown as {
    ds3ExportStudyRunLog: () => void;
    ds3GetStudyVariant: () => AutocorrectVariant | null;
    ds3GetParticipantId: () => string;
    ds3GetCollectUrl: () => string | null;
    ds3PingCollector: () => Promise<boolean>;
  };
  w.ds3ExportStudyRunLog = downloadStudyRunLog;
  w.ds3GetStudyVariant = getAssignedVariant;
  w.ds3GetParticipantId = getStudyParticipantId;
  w.ds3GetCollectUrl = getCollectUrl;
  w.ds3PingCollector = async (): Promise<boolean> =>
    postStudyPayload({
      event: "debug_ping",
      participantId: getStudyParticipantId(),
      ts: new Date().toISOString(),
    });
}

function assignVariant(): {
  variant: AutocorrectVariant;
  firstAssign: boolean;
} {
  const existing = getAssignedVariant();
  if (existing !== null) return { variant: existing, firstAssign: false };
  const v: AutocorrectVariant =
    Math.random() < 0.5 ? "autocorrect_on" : "autocorrect_off";
  localStorage.setItem(LS_VARIANT, v);
  return { variant: v, firstAssign: true };
}

function applyAutocorrectToInput(variant: AutocorrectVariant): void {
  const ta = getInputElement();
  if (variant === "autocorrect_on") {
    ta.setAttribute("autocorrect", "on");
    ta.setAttribute("spellcheck", "true");
  } else {
    ta.setAttribute("autocorrect", "off");
    ta.setAttribute("spellcheck", "false");
  }
}

async function applyStudyTypingConfig(): Promise<void> {
  await applyConfig({
    mode: "time",
    time: 30,
    language: "english",
    punctuation: false,
    numbers: false,
    funbox: [],
    quickRestart: "off",
    keymapMode: "off",
    paceCaret: "off",
    confidenceMode: "off",
    indicateTypos: "off",
    blindMode: false,
    stopOnError: "off",
    liveSpeedStyle: "mini",
    liveAccStyle: "mini",
    timerStyle: "mini",
  });
  saveFullConfigToLocalStorage(true);
}

function appendRunLog(entry: Record<string, unknown>): void {
  try {
    const raw = localStorage.getItem(LS_RUN_LOG);
    const arr = raw !== null ? (JSON.parse(raw) as unknown[]) : [];
    arr.push(entry);
    localStorage.setItem(LS_RUN_LOG, JSON.stringify(arr));
  } catch {
    /* ignore quota / parse issues */
  }
}

function readLastResultSummary(): {
  wpm?: number;
  acc?: number;
  variant?: string;
} {
  try {
    const raw = sessionStorage.getItem(SS_LAST_RESULT);
    if (raw !== null) {
      return JSON.parse(raw) as {
        wpm?: number;
        acc?: number;
        variant?: string;
      };
    }
  } catch {
    /* ignore */
  }
  return {};
}

function renderCompletedPanel(summary?: {
  wpm?: number;
  acc?: number;
  variant?: string;
}): void {
  const merged = { ...readLastResultSummary(), ...summary };
  const app = document.getElementById("app");
  if (!app) return;

  let panel = document.getElementById("ds3-study-complete-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "ds3-study-complete-panel";
    panel.setAttribute("role", "status");
    app.prepend(panel);
  }

  panel.innerHTML = `
    <div class="ds3-study-complete-inner">
      <h1 class="ds3-study-complete-title">Thank you</h1>
      <p class="ds3-study-complete-text">You have finished this session. Your final typing statistics are shown below.</p>
      ${
        merged.wpm !== undefined
          ? `<p class="ds3-study-complete-stats">WPM: <strong>${merged.wpm}</strong> · Accuracy: <strong>${merged.acc ?? "—"}%</strong></p>`
          : ""
      }
      ${
        merged.variant !== undefined && merged.variant !== ""
          ? `<p class="ds3-study-complete-stats ds3-study-variant-line">Assigned condition: <strong>${merged.variant === "autocorrect_on" ? "Autocorrect on" : "Autocorrect off"}</strong></p>`
          : ""
      }
      <p id="ds3-collection-status" class="ds3-study-collection-status" role="status" aria-live="polite"></p>
      <p class="ds3-study-complete-hint">To run the study flow again (for testing), clear site data for this origin or use a private window.</p>
    </div>
  `;
}

function setCollectionStatusMessage(message: string): void {
  const el = document.getElementById("ds3-collection-status");
  if (el) el.textContent = message;
}

function renderConditionBanner(variant: AutocorrectVariant): void {
  document.getElementById("ds3-study-condition")?.remove();
  const el = document.createElement("div");
  el.id = "ds3-study-condition";
  el.setAttribute("role", "status");
  el.textContent =
    variant === "autocorrect_on"
      ? "Study mode: one 30s test · Autocorrect ON (where supported by your device)"
      : "Study mode: one 30s test · Autocorrect OFF";
  document.body.append(el);
}

/**
 * Full-screen “session complete” UI (same as after refresh). Call when a valid study run finishes.
 */
export function showStudySessionCompleteUI(
  summary: {
    wpm: number;
    acc: number;
    variant: AutocorrectVariant;
  },
  completedPayload: CompletedEvent,
): void {
  document.getElementById("ds3-study-condition")?.remove();
  document.body.classList.add("ds-project3-study-session-done");
  renderCompletedPanel(summary);

  const url = getCollectUrl();
  if (url === null) {
    setCollectionStatusMessage(
      "Results are saved only on this device. If your instructor gave you a study link with a data server, they will provide the correct URL.",
    );
    return;
  }

  setCollectionStatusMessage("Submitting your results to the research server…");

  const body = {
    event: "completed" as const,
    variant: summary.variant,
    participantId: getStudyParticipantId(),
    externalId: getExternalParticipantId(),
    wpm: completedPayload.wpm,
    acc: completedPayload.acc,
    rawWpm: completedPayload.rawWpm,
    testDuration: completedPayload.testDuration,
    mode: completedPayload.mode,
    mode2: completedPayload.mode2,
    ts: new Date().toISOString(),
    userAgent: navigator.userAgent,
  };

  void postStudyPayload(body).then((ok) => {
    setCollectionStatusMessage(
      ok
        ? "Your results were received. You may close this window."
        : "We could not reach the research server. Your results are still saved in this browser; contact your instructor if this persists.",
    );
  });
}

export function getStudyRunLog(): unknown[] {
  try {
    const raw = localStorage.getItem(LS_RUN_LOG);
    return raw !== null ? (JSON.parse(raw) as unknown[]) : [];
  } catch {
    return [];
  }
}

/** Download JSON lines of all runs stored in this browser (for piloting / manual data collection). */
export function downloadStudyRunLog(): void {
  const data = getStudyRunLog();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ds3-study-runs-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Call after DOM is ready and config has been loaded from storage.
 */
export async function initDsProject3Study(): Promise<void> {
  if (!DS_PROJECT3_STUDY_ENABLED) return;

  captureExternalPidFromUrl();
  document.body.classList.add("ds-project3-study");

  if (isStudySessionComplete()) {
    document.body.classList.add("ds-project3-study-session-done");
    await applyStudyTypingConfig();
    renderCompletedPanel();
    registerDs3DevConsoleHelpers();
    return;
  }

  await applyStudyTypingConfig();
  getStudyParticipantId();
  const { variant, firstAssign } = assignVariant();
  const collectUrl = getCollectUrl();
  if (collectUrl === null) {
    console.warn(
      "[DS Project 3] VITE_DS3_COLLECT_URL is missing in this bundle. For local runs use `pnpm dev-fe` with frontend/.env.local (see example.env.study). `npm start` / vite preview in frontend/ does not load .env.local unless you rebuild.",
    );
  }
  if (firstAssign && collectUrl !== null) {
    void postStudyPayload({
      event: "assigned",
      variant,
      participantId: getStudyParticipantId(),
      externalId: getExternalParticipantId(),
      ts: new Date().toISOString(),
    });
  }
  applyAutocorrectToInput(variant);
  renderConditionBanner(variant);
  registerDs3DevConsoleHelpers();
}

export function isStudyModeLockedToTest(): boolean {
  return DS_PROJECT3_STUDY_ENABLED;
}

/**
 * After a test finishes and the result screen is ready.
 */
export function onStudyTestFinished(
  completed: CompletedEvent,
  dontSave: boolean,
): void {
  if (!DS_PROJECT3_STUDY_ENABLED) return;
  if (dontSave) {
    if (import.meta.env.DEV) {
      console.warn(
        "[DS Project 3] No POST after test: run was rejected (AFK, too short, repeated, impossible WPM, etc.). Check for a “Test invalid” toast.",
      );
    }
    return;
  }

  const variant = getAssignedVariant();
  if (variant === null) {
    if (import.meta.env.DEV) {
      console.warn(
        "[DS Project 3] No POST: missing A/B variant (localStorage). Clear site data and reload once.",
      );
    }
    return;
  }

  sessionStorage.setItem(SS_SESSION_DONE, "1");
  const participantId = getStudyParticipantId();
  const externalId = getExternalParticipantId();
  const finishedAt = new Date().toISOString();

  sessionStorage.setItem(
    SS_LAST_RESULT,
    JSON.stringify({
      wpm: completed.wpm,
      acc: completed.acc,
      rawWpm: completed.rawWpm,
      testDuration: completed.testDuration,
      variant,
      participantId,
      externalId,
      ts: finishedAt,
    }),
  );

  appendRunLog({
    event: "completed",
    variant,
    participantId,
    externalId,
    wpm: completed.wpm,
    acc: completed.acc,
    rawWpm: completed.rawWpm,
    testDuration: completed.testDuration,
    mode: completed.mode,
    mode2: completed.mode2,
    ts: finishedAt,
    userAgent: navigator.userAgent,
  });

  showStudySessionCompleteUI(
    {
      wpm: completed.wpm,
      acc: completed.acc,
      variant,
    },
    completed,
  );
}
