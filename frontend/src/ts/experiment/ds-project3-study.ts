import { applyConfig } from "../config/lifecycle";
import { saveFullConfigToLocalStorage } from "../config/persistence";
import { getInputElement } from "../input/input-element";
import type { CompletedEvent } from "@monkeytype/schemas/results";

/** Set to false to restore the stock Monkeytype experience. */
export const DS_PROJECT3_STUDY_ENABLED = true;

const LS_VARIANT = "ds3_ab_autocorrect_variant";
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

function assignVariant(): AutocorrectVariant {
  const existing = getAssignedVariant();
  if (existing !== null) return existing;
  const v: AutocorrectVariant =
    Math.random() < 0.5 ? "autocorrect_on" : "autocorrect_off";
  localStorage.setItem(LS_VARIANT, v);
  return v;
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
    time: 60,
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
    const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
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
    if (raw) return JSON.parse(raw) as { wpm?: number; acc?: number; variant?: string };
  } catch {
    /* ignore */
  }
  return {};
}

function renderCompletedPanel(
  summary?: { wpm?: number; acc?: number; variant?: string },
): void {
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
      <p class="ds3-study-complete-text">You have finished this session. Please close the tab or report your result as instructed.</p>
      ${
        merged.wpm !== undefined
          ? `<p class="ds3-study-complete-stats">WPM: <strong>${merged.wpm}</strong> · Accuracy: <strong>${merged.acc ?? "—"}%</strong></p>`
          : ""
      }
      ${
        merged.variant
          ? `<p class="ds3-study-complete-stats ds3-study-variant-line">Assigned condition: <strong>${merged.variant === "autocorrect_on" ? "Autocorrect on" : "Autocorrect off"}</strong></p>`
          : ""
      }
      <p class="ds3-study-complete-hint">To run the study flow again (e.g. for testing), clear site data for this origin or use a private window.</p>
    </div>
  `;
}

function renderConditionBanner(variant: AutocorrectVariant): void {
  document.getElementById("ds3-study-condition")?.remove();
  const el = document.createElement("div");
  el.id = "ds3-study-condition";
  el.setAttribute("role", "status");
  el.textContent =
    variant === "autocorrect_on"
      ? "Study mode: one 60s test · Autocorrect ON (where supported by your device)"
      : "Study mode: one 60s test · Autocorrect OFF";
  document.body.append(el);
}

/**
 * Full-screen “session complete” UI (same as after refresh). Call when a valid study run finishes.
 */
export function showStudySessionCompleteUI(summary: {
  wpm: number;
  acc: number;
  variant: AutocorrectVariant;
}): void {
  document.getElementById("ds3-study-condition")?.remove();
  document.body.classList.add("ds-project3-study-session-done");
  renderCompletedPanel(summary);
}

export function getStudyRunLog(): unknown[] {
  try {
    const raw = localStorage.getItem(LS_RUN_LOG);
    return raw ? (JSON.parse(raw) as unknown[]) : [];
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

  document.body.classList.add("ds-project3-study");

  if (isStudySessionComplete()) {
    document.body.classList.add("ds-project3-study-session-done");
    await applyStudyTypingConfig();
    renderCompletedPanel();
    return;
  }

  await applyStudyTypingConfig();
  const variant = assignVariant();
  applyAutocorrectToInput(variant);
  renderConditionBanner(variant);

  if (import.meta.env.DEV) {
    console.info(
      "[DS Project 3] Autocorrect A/B variant (stored in localStorage):",
      variant,
    );
    const w = window as unknown as {
      ds3ExportStudyRunLog: () => void;
      ds3GetStudyVariant: () => AutocorrectVariant | null;
    };
    w.ds3ExportStudyRunLog = downloadStudyRunLog;
    w.ds3GetStudyVariant = getAssignedVariant;
  }
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
  if (dontSave) return;

  const variant = getAssignedVariant();
  if (variant === null) return;

  sessionStorage.setItem(SS_SESSION_DONE, "1");
  sessionStorage.setItem(
    SS_LAST_RESULT,
    JSON.stringify({
      wpm: completed.wpm,
      acc: completed.acc,
      rawWpm: completed.rawWpm,
      testDuration: completed.testDuration,
      variant,
      ts: new Date().toISOString(),
    }),
  );

  appendRunLog({
    variant,
    wpm: completed.wpm,
    acc: completed.acc,
    rawWpm: completed.rawWpm,
    testDuration: completed.testDuration,
    mode: completed.mode,
    mode2: completed.mode2,
    ts: new Date().toISOString(),
    userAgent: navigator.userAgent,
  });

  showStudySessionCompleteUI({
    wpm: completed.wpm,
    acc: completed.acc,
    variant,
  });
}
