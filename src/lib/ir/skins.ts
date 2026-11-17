import type { AcState } from "@/lib/ir/protocol";
import samsungJson from "@/skins/samsung-bn59-01199f.irskin.json";
import lgJson from "@/skins/lg-tv.irskin.json";
import homecoJson from "@/skins/homeco.irskin.json";

export type Glyph = "power" | "up" | "down" | "left" | "right" | "play" | "pause" | "stop" | "rew" | "ff" | "mute" | "back";

export type Action =
  | { t: "cmd"; cmd: number }
  | { t: "ac"; op: "power" | "mode" | "temp+" | "temp-" | "fan" | "swing" }
  | { t: "raw"; pulses: number[]; hz: number };

export type KeyShape = "round" | "pill" | "circle" | "square";

export type KeyDef = {
  id: string;
  label: string;
  glyph?: Glyph;
  iconOnly?: boolean;
  action: Action;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: KeyShape;
  radius: number;
  bg: string;
  fg: string;
  border: string;
  fontSize: number;
  weight: number;
  opacity: number;
  repeat: boolean;
  tracking: number;
};

export type Decal =
  | { id: string; kind: "text"; x: number; y: number; w: number; h: number; text: string; color: string; size: number; tracking: number; weight: number }
  | { id: string; kind: "well"; x: number; y: number; w: number; h: number; radius: number; bg: string; border: string }
  | { id: string; kind: "ir"; x: number; y: number; w: number; h: number }
  | { id: string; kind: "lcd"; x: number; y: number; w: number; h: number };

export type SkinProtocol =
  | { family: "samsung32"; address: number; hz: number }
  | { family: "nec"; address: number; hz: number }
  | { family: "coolix"; hz: number }
  | { family: "lgac"; variant: "lg" | "lg2"; hz: number }
  | { family: "goodweather"; hz: number };

export type Skin = {
  version: 1;
  id: string;
  name: string;
  short: string;
  model: string;
  builtin: boolean;
  designW: number;
  designH: number;
  photo: string | null;
  showDecals: boolean;
  protocol: SkinProtocol;
  chassis: { bg: string; bg2: string; border: string; radiusTop: number; radiusBot: number };
  decals: Decal[];
  keys: KeyDef[];
};

// Built-in skins exported from the live remir.grok.me v35 on Nov 17, 2026.

export const BUILTINS: Skin[] = [samsungJson, lgJson, homecoJson].map((s) => ({ ...(s as unknown as Skin), builtin: true }));

export const DEFAULT_AC: AcState = {
  power: true,
  mode: "cool",
  temp: 23,
  fan: "auto",
  swing: false,
};

export function cloneSkin(skin: Skin, id = crypto.randomUUID()): Skin {
  const copy = structuredClone(skin);
  copy.id = id;
  copy.builtin = false;
  copy.name = skin.builtin ? `${skin.name} copy` : skin.name;
  return copy;
}

export function blankSkin(): Skin {
  const base = cloneSkin(BUILTINS[0]!);
  base.name = "Blank chassis";
  base.short = "Blank";
  base.model = "Custom";
  base.keys = base.keys.filter((k) => ["power", "vol+", "vol-", "ok", "up", "down", "left", "right"].includes(k.id));
  return base;
}

export function isSkin(value: unknown): value is Skin {
  if (!value || typeof value !== "object") return false;
  const s = value as Skin;
  return s.version === 1 && typeof s.id === "string" && Array.isArray(s.keys) && typeof s.designW === "number" && typeof s.designH === "number" && !!s.protocol && !!s.chassis;
}

const STORE_SKINS = "irbench.skins.v1";
const STORE_ACTIVE = "irbench.active.v2";
const STORE_AC = "irbench.ac.v1";
const STORE_KIND = "irbench.kind.v1";

export function loadCustom(): Skin[] {
  try {
    const raw = localStorage.getItem(STORE_SKINS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSkin).map((s) => ({ ...s, builtin: false }));
  } catch {
    return [];
  }
}

export function saveCustom(skins: Skin[]) {
  localStorage.setItem(STORE_SKINS, JSON.stringify(skins));
}

export function loadActiveId(): string {
  return localStorage.getItem(STORE_ACTIVE) || "lg-tv";
}

export function saveActiveId(id: string) {
  localStorage.setItem(STORE_ACTIVE, id);
}

export function loadAc(): AcState {
  try {
    const raw = localStorage.getItem(STORE_AC);
    if (!raw) return { ...DEFAULT_AC };
    const parsed = JSON.parse(raw) as AcState;
    if (typeof parsed.temp !== "number") return { ...DEFAULT_AC };
    return { ...DEFAULT_AC, ...parsed };
  } catch {
    return { ...DEFAULT_AC };
  }
}

export function saveAc(state: AcState) {
  localStorage.setItem(STORE_AC, JSON.stringify(state));
}

export type ForceKind = "auto" | "d226" | "d552";

export function loadForce(): ForceKind {
  const v = localStorage.getItem(STORE_KIND);
  return v === "d226" || v === "d552" ? v : "auto";
}

export function saveForce(v: ForceKind) {
  localStorage.setItem(STORE_KIND, v);
}

export function findSkin(custom: Skin[], id: string): Skin {
  return custom.find((s) => s.id === id) ?? BUILTINS.find((s) => s.id === id) ?? BUILTINS[0]!;
}

export function actionLabel(action: Action): string {
  if (action.t === "cmd") return `0x${(action.cmd & 0xff).toString(16).toUpperCase().padStart(2, "0")}`;
  if (action.t === "ac") return action.op;
  return `learned ${action.pulses.length} pulses`;
}

/** Value of the AC protocol picker ("homeco" | "coolix" | "lg" | "lg2") to a skin protocol. */
export function acProtocolFor(value: string): SkinProtocol {
  if (value === "coolix") return { family: "coolix", hz: 38000 };
  if (value === "lg" || value === "lg2") return { family: "lgac", variant: value, hz: 38000 };
  return { family: "goodweather", hz: 38000 };
}

export function isAcFamily(family: SkinProtocol["family"]): boolean {
  return family === "coolix" || family === "lgac" || family === "goodweather";
}
