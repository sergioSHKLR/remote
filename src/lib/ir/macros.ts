/** M1–M3 memories: recorded key presses replayed one second apart. Ported from live v35. */
import type { AcState } from "@/lib/ir/protocol";

export type MacroStep = { label: string; pulses: number[]; hz: number; ac: AcState | null };
export type Macro = { steps: MacroStep[]; gapMs: number } | null;

export const MACRO_GAP_MS = 1000;
export const MACRO_MAX_STEPS = 24;
const STORE = "remir.macros.v1";

function isStep(value: unknown): value is MacroStep {
  if (!value || typeof value !== "object") return false;
  const s = value as MacroStep;
  return typeof s.label === "string" && typeof s.hz === "number" && Array.isArray(s.pulses) && s.pulses.every((n) => typeof n === "number");
}

export function loadMacros(): Macro[] {
  const empty: Macro[] = [null, null, null];
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return empty;
    return empty.map((_, i) => {
      const m = parsed[i] as { steps?: unknown; gapMs?: unknown } | null;
      if (!m || typeof m !== "object" || !Array.isArray(m.steps)) return null;
      const steps = m.steps.filter(isStep).slice(0, MACRO_MAX_STEPS);
      if (!steps.length) return null;
      const gap = m.gapMs;
      return { steps, gapMs: typeof gap === "number" && gap >= 0 ? gap : MACRO_GAP_MS };
    });
  } catch {
    return empty;
  }
}

export function saveMacros(macros: Macro[]) {
  localStorage.setItem(STORE, JSON.stringify(macros));
}
