/**
 * RemIR main screen. Ported from the live remir.grok.me v35 bundle (routes-C1j-SoCt.js, component `an`).
 * Server calls (guide grid, weather) are replaced with direct browser fetches; everything else is local.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Baby,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Heart,
  Laugh,
  Maximize2,
  Mic,
  Minimize2,
  Newspaper,
  Palette,
  RotateCw,
  Sparkles,
  Star,
  Trophy,
  Usb,
} from "lucide-react";
import { EditorSheet } from "@/components/bench/editor-sheet";
import { RemoteFace } from "@/components/bench/remote-face";
import { SkinLibrary } from "@/components/bench/skin-library";
import { WxIcon } from "@/components/bench/wx-icon";
import { DEFAULT_CHANNELS, fetchListings, genreOf, hhmm, loadChannels, saveChannels, slotAt, type Genre, type GuideChannel, type Listing } from "@/lib/guide/guide";
import { connectDongle, reconnectDongle, learnSignal, type ElkLink } from "@/lib/ir/link";
import { loadMacros, saveMacros, MACRO_GAP_MS, MACRO_MAX_STEPS, type Macro } from "@/lib/ir/macros";
import {
  AC_FAN_ORDER,
  AC_MODE_ORDER,
  coolixPulses,
  encodeIr,
  goodweatherPulses,
  hexByte,
  lgAcPulses,
  necPulses,
  samsungPulses,
  toHex,
  type AcState,
  type DongleKind,
} from "@/lib/ir/protocol";
import {
  BUILTINS,
  DEFAULT_AC,
  acProtocolFor,
  actionLabel,
  blankSkin,
  cloneSkin,
  findSkin,
  isAcFamily,
  isSkin,
  loadAc,
  loadActiveId,
  loadCustom,
  loadForce,
  saveAc,
  saveActiveId,
  saveCustom,
  saveForce,
  type ForceKind,
  type KeyDef,
  type Skin,
} from "@/lib/ir/skins";
import { fetchWeather, type Weather } from "@/lib/weather";

const REV = "35";

function pulsesFor(skin: Skin, key: KeyDef, ac: AcState): { pulses: number[]; hz: number } | null {
  const hz = "hz" in skin.protocol ? skin.protocol.hz : 38000;
  if (key.action.t === "raw") return { pulses: key.action.pulses, hz: key.action.hz || hz };
  if (key.action.t === "ac") {
    const swing = key.action.op === "swing";
    if (skin.protocol.family === "lgac") return { pulses: lgAcPulses(ac, skin.protocol.variant, swing), hz };
    if (skin.protocol.family === "goodweather") return { pulses: goodweatherPulses(ac, key.action.op), hz };
    return { pulses: coolixPulses(ac, swing), hz };
  }
  if (skin.protocol.family === "nec") return { pulses: necPulses(skin.protocol.address, key.action.cmd), hz };
  if (skin.protocol.family === "samsung32") return { pulses: samsungPulses(skin.protocol.address, key.action.cmd), hz };
  return null;
}

function stepAc(ac: AcState, key: KeyDef, family: Skin["protocol"]["family"]): AcState {
  if (key.action.t !== "ac") return ac;
  const next = { ...ac };
  const min = family === "coolix" ? 17 : 16;
  if (key.action.op === "power") next.power = !next.power;
  if (key.action.op === "temp+") next.temp = Math.min(30, next.temp + 1);
  if (key.action.op === "temp-") next.temp = Math.max(min, next.temp - 1);
  if (key.action.op === "mode") next.mode = AC_MODE_ORDER[(AC_MODE_ORDER.indexOf(next.mode) + 1) % AC_MODE_ORDER.length] ?? "cool";
  if (key.action.op === "fan") next.fan = AC_FAN_ORDER[(AC_FAN_ORDER.indexOf(next.fan) + 1) % AC_FAN_ORDER.length] ?? "auto";
  if (key.action.op === "swing") next.swing = !next.swing;
  return next;
}

async function fileToPhoto(file: File): Promise<{ url: string; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 640 / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return { url: canvas.toDataURL("image/jpeg", 0.82), w, h };
}

/** Waits `ms`, but returns early when playback `token` is superseded. */
function waitGap(ms: number, ref: { current: number }, token: number) {
  return new Promise<void>((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (ref.current !== token || Date.now() - started >= ms) resolve();
      else window.setTimeout(tick, 40);
    };
    window.setTimeout(tick, 40);
  });
}

const GENRE_ICON: Record<Genre, typeof Newspaper> = {
  news: Newspaper,
  sport: Trophy,
  br: Heart,
  tr: Heart,
  dub: Heart,
  comedy: Laugh,
  kids: Baby,
  faith: Sparkles,
  talk: Mic,
  doc: BookOpen,
  drama: Clapperboard,
  reality: Star,
};

function GenreChip({ title, cat, feed }: { title: string; cat?: string; feed?: string }) {
  const g = genreOf(title, cat, feed);
  const Icon = GENRE_ICON[g.id];
  return (
    <span className={`genre genre-${g.id}`}>
      <Icon aria-hidden />
      {g.label}
    </span>
  );
}

export function BenchApp() {
  const [custom, setCustom] = useState<Skin[]>([]);
  const [activeId, setActiveId] = useState("lg-tv");
  const [edit, setEdit] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  const [ac, setAc] = useState<AcState>(DEFAULT_AC);
  const [force, setForce] = useState<ForceKind>("auto");
  const [link, setLink] = useState<ElkLink | null>(null);
  const [log, setLog] = useState("Plug in the Hrebos dongle, then connect.");
  const [packets, setPackets] = useState<string[]>([]);
  const [packetsOpen, setPacketsOpen] = useState(false);
  const [firingId, setFiringId] = useState<string | null>(null);
  const [glowId, setGlowId] = useState<string | null>(null);
  const [learning, setLearning] = useState(false);
  const [fitWidth, setFitWidth] = useState(260);
  const [flipped, setFlipped] = useState(false);
  const [macros, setMacros] = useState<Macro[]>(() => [null, null, null]);
  const [recording, setRecording] = useState<number | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideEdit, setGuideEdit] = useState(false);
  const [channels, setChannels] = useState<GuideChannel[]>(DEFAULT_CHANNELS);
  const [listings, setListings] = useState<Record<string, Listing[]>>({});
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [guideNote, setGuideNote] = useState("");
  const [guideStep, setGuideStep] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [weather, setWeather] = useState<Weather | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<ElkLink | null>(null);
  const repeatRef = useRef<number | null>(null);
  const ledOff = useRef(0);
  const glowOff = useRef(0);
  const held = useRef(false);
  const busy = useRef(false);
  const saveTimer = useRef(0);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const skinRef = useRef<Skin>(BUILTINS[0]!);
  const acRef = useRef(ac);
  const forceRef = useRef(force);
  const macrosRef = useRef<Macro[]>(macros);
  const recRef = useRef<number | null>(null);
  const playRef = useRef<number | null>(null);
  const playToken = useRef(0);
  const holdTimer = useRef(0);

  const skin = useMemo(() => findSkin(custom, activeId), [custom, activeId]);
  const selected = skin.keys.find((k) => k.id === selectedId) ?? null;
  skinRef.current = skin;
  acRef.current = ac;
  forceRef.current = force;
  linkRef.current = link;

  useEffect(() => {
    const loaded = loadCustom();
    const id = loadActiveId();
    setCustom(loaded);
    setActiveId(findSkin(loaded, id).id);
    setAc(loadAc());
    setForce(loadForce());
    const m = loadMacros();
    macrosRef.current = m;
    setMacros(m);
    setChannels(loadChannels());
    setFlipped(localStorage.getItem("remir.flip") === "1");
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const feedKey = channels.map((c) => c.feed ?? "").join("|");
  useEffect(() => {
    if (!guideOpen) return;
    let dead = false;
    const slugs = [...new Set(channels.map((c) => c.feed).filter((f): f is string => !!f))];
    const pull = async () => {
      try {
        const result = await fetchListings(slugs);
        if (dead) return;
        setListings(result.listings);
        setLogos(result.logos);
        setGuideNote("");
        setNow(Date.now());
      } catch {
        if (!dead) setGuideNote("Live grid unavailable.");
      }
    };
    void pull();
    const refresh = window.setInterval(() => void pull(), 300000);
    const tick = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      dead = true;
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [guideOpen, feedKey]);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      try {
        const w = await fetchWeather();
        if (!dead) setWeather(w);
      } catch {
        if (!dead) setWeather(null);
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 900000);
    return () => {
      dead = true;
      window.clearInterval(timer);
    };
  }, []);

  const toggleFullscreen = async () => {
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (root.requestFullscreen) await root.requestFullscreen();
      else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
      else setLog("Fullscreen is not available in this browser.");
    } catch (error) {
      setLog(error instanceof Error ? error.message : "Fullscreen was blocked.");
    }
  };

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const availW = Math.max(140, el.clientWidth - padX);
      const current = skinRef.current;
      const reserve = isAcFamily(current.protocol.family) && !edit ? 118 : 0; // room for the weather card
      const byHeight = (Math.max(140, el.clientHeight - padY - reserve) * current.designW) / current.designH;
      setFitWidth(Math.max(120, Math.min(availW, byHeight)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [edit, skin.designW, skin.designH, skin.protocol.family, library]);

  const persistCustom = (next: Skin[]) => {
    setCustom(next);
    saveCustom(next);
  };

  const mutate = useCallback((recipe: (skin: Skin) => void) => {
    setCustom((prev) => {
      const id = activeRef.current;
      const current = findSkin(prev, id);
      const copy = current.builtin ? cloneSkin(current) : structuredClone(current);
      recipe(copy);
      const next = current.builtin ? [...prev, copy] : prev.map((s) => (s.id === copy.id ? copy : s));
      if (current.builtin) {
        activeRef.current = copy.id;
        queueMicrotask(() => {
          setActiveId(copy.id);
          saveActiveId(copy.id);
        });
      }
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => saveCustom(next), 180);
      return next;
    });
  }, []);

  const choose = (id: string) => {
    setGuideOpen(false);
    setActiveId(id);
    saveActiveId(id);
    setSelectedId(null);
    setLibrary(false);
  };

  const persistChannels = (next: GuideChannel[]) => {
    setChannels(next);
    saveChannels(next);
  };

  const resolvedKind = (reportKind: ElkLink["report"]["kind"] | null): DongleKind => {
    if (forceRef.current !== "auto") return forceRef.current;
    return reportKind === "d552" ? "d552" : "d226";
  };

  const persistMacros = (next: Macro[]) => {
    macrosRef.current = next;
    setMacros(next);
    saveMacros(next);
  };

  /** Encodes and sends one waveform, then checks the dongle's FF FF FF FF "LED" acknowledgement. */
  const sendPulses = useCallback(async (label: string, pulses: number[], hz: number, code?: string) => {
    const usb = linkRef.current;
    const kind = resolvedKind(usb?.report.kind ?? null);
    const say = (text: string) => {
      const rec = recRef.current;
      if (rec == null) {
        setLog(text);
        return;
      }
      const n = macrosRef.current[rec]?.steps.length ?? 0;
      setLog(`M${rec + 1} rec${n >= MACRO_MAX_STEPS ? " full" : ""} · ${n} · ${text}`);
    };
    if (!usb) {
      const frames = encodeIr(hz, pulses, kind);
      setPackets(frames.map((frame, i) => `#${i + 1}  ${toHex(frame)}`));
      const count = `${frames.length} frame${frames.length === 1 ? "" : "s"}`;
      say(code ? `${label} · ${code} · ${count} · not connected` : `${label} · ${count} · not connected`);
      return;
    }
    if (busy.current) return;
    busy.current = true;
    const preview = (reply: Uint8Array | null) =>
      !reply || !reply.length ? "silent" : `${toHex(reply.subarray(0, 8))}${reply.length > 8 ? "…" : ""}`;
    const acked = (reply: Uint8Array | null) => {
      if (!reply) return false;
      for (let i = 0; i + 4 <= reply.length; i++) {
        if (reply[i] === 0xff && reply[i + 1] === 0xff && reply[i + 2] === 0xff && reply[i + 3] === 0xff) return true;
      }
      return false;
    };
    try {
      const frames = encodeIr(hz, pulses, kind);
      setPackets(frames.map((frame, i) => `#${i + 1}  ${toHex(frame)}`));
      for (const frame of frames) {
        await usb.write(frame);
        await new Promise((r) => window.setTimeout(r, 2));
      }
      await new Promise((r) => window.setTimeout(r, 50));
      const reply = await usb.read(300);
      say(acked(reply) ? `LED · ${kind.toUpperCase()} · ${label}` : `No LED · ${kind.toUpperCase()} · ${label} · ${preview(reply)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      say(message);
      if (/did not answer|Lost the dongle|Dongle is closed|USB write failed/i.test(message)) {
        try {
          await usb.close();
        } catch {
          /* gone */
        }
        if (linkRef.current === usb) {
          linkRef.current = null;
          setLink(null);
        }
      }
    } finally {
      busy.current = false;
    }
  }, []);

  const transmit = useCallback(
    async (key: KeyDef, liveAc: AcState) => {
      const built = pulsesFor(skinRef.current, key, liveAc);
      if (!built) return;
      const code = key.action.t === "cmd" ? `0x${hexByte(key.action.cmd)}` : actionLabel(key.action);
      await sendPulses(key.label || key.id, built.pulses, built.hz, code);
    },
    [sendPulses],
  );

  /** Guide row tap: types the channel number on the active TV remote (LG if an AC is showing). */
  const tune = async (channel: GuideChannel) => {
    const current = skinRef.current;
    const tv = current.protocol.family === "samsung32" || current.protocol.family === "nec" ? current : findSkin([], "lg-tv");
    const chars = [...channel.number.matchAll(/\d|[.-]/g)].map((m) => m[0]);
    if (!chars.some((c) => /\d/.test(c))) {
      setLog("That channel has no number.");
      return;
    }
    const dash = tv.keys.find((k) => k.id === "dash");
    setLog(`Tuning ${channel.name} · ${channel.number}`);
    const pause = () => new Promise((r) => window.setTimeout(r, 650));
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i]!;
      const key = /\d/.test(c) ? tv.keys.find((k) => k.label === c) : dash;
      if (!key) {
        setLog(`${tv.short || tv.name} has no ${/\d/.test(c) ? c : "dash"} key.`);
        return;
      }
      const built = pulsesFor(tv, key, acRef.current);
      if (!built) return;
      await sendPulses(/\d/.test(c) ? c : "—", built.pulses, built.hz);
      if (i < chars.length - 1) await pause();
    }
    const ok = tv.keys.find((k) => k.id === "ok");
    if (ok && chars.some((c) => !/\d/.test(c))) {
      await pause();
      const built = pulsesFor(tv, ok, acRef.current);
      if (built) await sendPulses("OK", built.pulses, built.hz);
    }
  };

  const stopRepeat = () => {
    held.current = false;
    if (repeatRef.current != null) {
      window.clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
    window.clearTimeout(ledOff.current);
    ledOff.current = window.setTimeout(() => {
      if (!held.current) setFiringId(null);
    }, 240);
    window.clearTimeout(glowOff.current);
    glowOff.current = window.setTimeout(() => {
      if (!held.current) setGlowId(null);
    }, 500);
  };

  // ---- M1–M3 memories ----
  const stopPlayback = () => {
    playToken.current += 1;
    playRef.current = null;
    setPlaying(null);
  };

  const playMacro = async (slot: number) => {
    const macro = macrosRef.current[slot];
    if (!macro?.steps.length) return;
    stopRepeat();
    const token = ++playToken.current;
    playRef.current = slot;
    setPlaying(slot);
    for (let i = 0; i < macro.steps.length; i++) {
      if (playToken.current !== token) return;
      const step = macro.steps[i]!;
      if (step.ac && typeof step.ac.temp === "number") {
        const next = { ...DEFAULT_AC, ...step.ac, swing: !!step.ac.swing };
        acRef.current = next;
        setAc(next);
        saveAc(next);
      }
      await sendPulses(step.label, step.pulses, step.hz);
      if (playToken.current !== token) return;
      if (i < macro.steps.length - 1) await waitGap(macro.gapMs || MACRO_GAP_MS, playToken, token);
    }
    if (playToken.current === token) {
      playRef.current = null;
      setPlaying(null);
      setLog(`M${slot + 1} done · ${macro.steps.length} keys`);
    }
  };

  const startRecording = (slot: number) => {
    recRef.current = slot;
    setRecording(slot);
    persistMacros(macrosRef.current.map((m, i) => (i === slot ? null : m)));
    setLog(`Recording M${slot + 1}. Press keys, then tap M${slot + 1}.`);
  };

  const finishRecording = (slot: number) => {
    const macro = macrosRef.current[slot];
    recRef.current = null;
    setRecording(null);
    setLog(macro?.steps.length ? `M${slot + 1} saved · ${macro.steps.length} keys · 1s apart` : `M${slot + 1} empty.`);
  };

  const tapMacro = (slot: number) => {
    if (playRef.current != null) {
      const was = playRef.current;
      stopPlayback();
      if (was === slot) {
        setLog("Playback stopped.");
        return;
      }
    }
    if (recRef.current === slot) finishRecording(slot);
    else if (recRef.current == null) {
      if (macrosRef.current[slot]?.steps.length) void playMacro(slot);
      else startRecording(slot);
    }
  };

  const holdMacro = (slot: number) => {
    if (navigator.vibrate) navigator.vibrate(16);
    if (playRef.current != null) stopPlayback();
    if (recRef.current === slot) {
      recRef.current = null;
      setRecording(null);
      persistMacros(macrosRef.current.map((m, i) => (i === slot ? null : m)));
      setLog(`M${slot + 1} cancelled.`);
    } else if (recRef.current == null) {
      if (macrosRef.current[slot]) {
        persistMacros(macrosRef.current.map((m, i) => (i === slot ? null : m)));
        setLog(`M${slot + 1} cleared.`);
      } else startRecording(slot);
    }
  };

  const pressStart = (key: KeyDef, repeat = key.repeat) => {
    if (playRef.current != null) stopPlayback();
    if (repeatRef.current != null) {
      window.clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
    window.clearTimeout(ledOff.current);
    window.clearTimeout(glowOff.current);
    held.current = true;
    if (navigator.vibrate) navigator.vibrate(12);
    let live = acRef.current;
    if (key.action.t === "ac") {
      live = stepAc(live, key, skinRef.current.protocol.family);
      acRef.current = live;
      setAc(live);
      saveAc(live);
    }
    const rec = recRef.current;
    if (rec != null) {
      const built = pulsesFor(skinRef.current, key, live);
      if (built && (macrosRef.current[rec]?.steps.length ?? 0) < MACRO_MAX_STEPS) {
        const steps = [
          ...(macrosRef.current[rec]?.steps ?? []),
          { label: key.label || key.id, pulses: built.pulses, hz: built.hz, ac: key.action.t === "ac" ? { ...live } : null },
        ];
        persistMacros(macrosRef.current.map((m, i) => (i === rec ? { steps, gapMs: MACRO_GAP_MS } : m)));
      }
    }
    setFiringId(key.id);
    setGlowId(key.id);
    void transmit(key, live);
    if (repeat) {
      repeatRef.current = window.setInterval(() => {
        const again = key.action.t === "ac" ? stepAc(acRef.current, key, skinRef.current.protocol.family) : acRef.current;
        if (key.action.t === "ac" && (key.action.op === "temp+" || key.action.op === "temp-")) {
          acRef.current = again;
          setAc(again);
          saveAc(again);
        }
        void transmit(key, key.action.t === "ac" ? again : acRef.current);
      }, 120);
    }
  };

  const adopt = (next: ElkLink) => {
    linkRef.current = next;
    setLink(next);
    const pid = next.report.pid.toString(16).padStart(4, "0").toUpperCase();
    const kind = next.report.kind === "unknown" ? "unknown type, using D226" : next.report.kind.toUpperCase();
    setLog(`Connected 045C:${pid} · ${kind} · ${next.report.mark}`);
    const onGone = (event: USBConnectionEvent) => {
      if (event.device.productId !== next.report.pid) return;
      setLink(null);
      linkRef.current = null;
      setLog("Dongle unplugged.");
      navigator.usb.removeEventListener("disconnect", onGone);
    };
    navigator.usb.addEventListener("disconnect", onGone);
  };

  const connect = async () => {
    try {
      adopt(await connectDongle());
    } catch (error) {
      const message = error instanceof Error ? error.message : "USB connection failed";
      if (message.includes("No device selected") || message.includes("cancelled")) {
        setLog("Connect cancelled.");
        return;
      }
      setLog(message);
    }
  };

  useEffect(() => {
    let dead = false;
    void reconnectDongle()
      .then((next) => {
        if (dead) {
          void next?.close();
          return;
        }
        if (next) adopt(next);
      })
      .catch(() => {
        if (!dead) setLog("Tap Connect.");
      });
    return () => {
      dead = true;
    };
  }, []);

  const disconnect = async () => {
    stopRepeat();
    await link?.close();
    linkRef.current = null;
    setLink(null);
    setLog("Disconnected.");
  };

  const learn = async () => {
    if (!selected) return;
    if (!linkRef.current) {
      setLog("Connect the dongle before learning a key.");
      return;
    }
    setLearning(true);
    setLog("Learning… press one button on the original remote.");
    try {
      const pulses = await learnSignal(linkRef.current);
      const hz = "hz" in skin.protocol ? skin.protocol.hz : 38000;
      mutate((draft) => {
        const key = draft.keys.find((k) => k.id === selected.id);
        if (key) key.action = { t: "raw", pulses, hz };
      });
      setLog(`Learned ${pulses.length} timings onto ${selected.label || selected.id}.`);
    } catch (error) {
      setLog(error instanceof Error ? error.message : "Learn failed");
    } finally {
      setLearning(false);
    }
  };

  const allSkins = [...BUILTINS, ...custom];
  const acFamily = isAcFamily(skin.protocol.family);
  const hasLater = channels.some((c) => slotAt(c.feed ? listings[c.feed] : undefined, now, guideStep + 1).shown);
  const viewStart = channels.reduce<number | null>((min, c) => {
    const shown = slotAt(c.feed ? listings[c.feed] : undefined, now, guideStep).shown;
    return shown && (min == null || shown.start < min) ? shown.start : min;
  }, null);

  return (
    <div className={flipped ? "app is-flipped" : "app"}>
      {acFamily && !edit && !guideOpen && (
        <div className="ac-line">
          <span>{ac.power ? `${ac.temp}° ${ac.mode}` : "AC off"}</span>
          <select
            aria-label="AC protocol"
            value={skin.protocol.family === "lgac" ? skin.protocol.variant : skin.protocol.family === "coolix" ? "coolix" : "homeco"}
            onChange={(e) => {
              const v = e.target.value;
              mutate((draft) => {
                draft.protocol = acProtocolFor(v);
              });
            }}
          >
            <option value="homeco">Homeco</option>
            <option value="coolix">Midea</option>
            <option value="lg">LG</option>
            <option value="lg2">LG alt</option>
          </select>
        </div>
      )}

      <div className="stage" ref={stageRef}>
        <div className="device-stack">
          <div className="macro-stack" role="group" aria-label="Macros">
            {macros.map((macro, slot) => {
              const rec = recording === slot;
              const play = playing === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  className={rec ? "is-rec" : play ? "is-play" : macro ? "is-set" : ""}
                  aria-pressed={rec || play}
                  aria-label={
                    rec
                      ? `Stop recording memory ${slot + 1}`
                      : macro
                        ? `Play memory ${slot + 1}, ${macro.steps.length} keys, 1 second apart. Hold to clear.`
                        : `Record memory ${slot + 1}`
                  }
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    window.clearTimeout(holdTimer.current);
                    holdTimer.current = window.setTimeout(() => {
                      holdTimer.current = 0;
                      holdMacro(slot);
                    }, 520);
                  }}
                  onPointerUp={() => {
                    if (holdTimer.current) {
                      window.clearTimeout(holdTimer.current);
                      holdTimer.current = 0;
                      tapMacro(slot);
                    }
                  }}
                  onPointerCancel={() => {
                    window.clearTimeout(holdTimer.current);
                    holdTimer.current = 0;
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {rec ? "REC" : macro ? `M${slot + 1}·${macro.steps.length}` : `M${slot + 1}`}
                </button>
              );
            })}
          </div>
          <div className="device-tabs" role="tablist" aria-label="Device">
            {(
              [
                ["bn59", "Samsung"],
                ["split-ac", "AC"],
                ["lg-tv", "LG"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={!guideOpen && skin.id === id}
                className={!guideOpen && skin.id === id ? "is-on" : ""}
                onClick={() => choose(id)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={guideOpen}
              className={guideOpen ? "edge-guide is-on" : "edge-guide"}
              onClick={() => {
                setGuideOpen(true);
                setEdit(false);
              }}
            >
              Guide
            </button>
            {!skin.builtin && (
              <button type="button" className={guideOpen ? "" : "is-on"} role="tab" aria-selected={!guideOpen}>
                {skin.short || "Custom"}
              </button>
            )}
          </div>
          <button
            type="button"
            className={flipped ? "edge-turn is-on" : "edge-turn"}
            aria-pressed={flipped}
            aria-label={flipped ? "Turn the remote upright" : "Turn the remote 180 degrees"}
            onClick={() =>
              setFlipped((value) => {
                const next = !value;
                localStorage.setItem("remir.flip", next ? "1" : "0");
                return next;
              })
            }
          >
            <RotateCw aria-hidden />
          </button>
          <button
            type="button"
            className={fullscreen ? "edge-full is-on" : "edge-full"}
            aria-pressed={fullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            Full
          </button>
        </div>

        {guideOpen ? (
          <div className="guide">
            <div className="guide-head">
              <strong>Itajaí · {hhmm(guideStep === 0 ? now : viewStart || now)}</strong>
              <button
                type="button"
                className="guide-step"
                aria-label="Earlier on every channel"
                disabled={guideStep === 0}
                onClick={() => setGuideStep((s) => Math.max(0, s - 1))}
              >
                <ChevronLeft aria-hidden />
              </button>
              <button type="button" className="guide-step" aria-label="Later on every channel" disabled={!hasLater} onClick={() => setGuideStep((s) => s + 1)}>
                <ChevronRight aria-hidden />
              </button>
              <button type="button" onClick={() => setGuideEdit((v) => !v)}>
                {guideEdit ? "Done" : "Edit"}
              </button>
            </div>
            {guideNote ? <p className="guide-note">{guideNote}</p> : null}
            <ul className="guide-list">
              {channels.map((channel) => {
                const slot = slotAt(channel.feed ? listings[channel.feed] : undefined, now, guideStep);
                const genre = slot.shown ? genreOf(slot.shown.title, slot.shown.cat, channel.feed).id : undefined;
                if (guideEdit) {
                  return (
                    <li key={channel.id} className="guide-row">
                      <input
                        className="num"
                        aria-label={`${channel.name} number`}
                        value={channel.number}
                        onChange={(e) => persistChannels(channels.map((c) => (c.id === channel.id ? { ...c, number: e.target.value } : c)))}
                      />
                      <input
                        className="name"
                        aria-label={`${channel.number} name`}
                        value={channel.name}
                        onChange={(e) => persistChannels(channels.map((c) => (c.id === channel.id ? { ...c, name: e.target.value } : c)))}
                      />
                      <button type="button" aria-label={`Remove ${channel.name}`} onClick={() => persistChannels(channels.filter((c) => c.id !== channel.id))}>
                        ×
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={channel.id}>
                    <button type="button" data-genre={genre} onClick={() => void tune(channel)}>
                      <span className="guide-main">
                        {channel.feed && logos[channel.feed] ? <img className="guide-logo" src={logos[channel.feed]} alt="" /> : null}
                        <b>{channel.number}</b>
                        <span>{channel.name}</span>
                        {channel.rf ? <i className="guide-rf">{channel.rf}</i> : null}
                      </span>
                      {slot.shown ? (
                        <span className="guide-now">
                          <GenreChip title={slot.shown.title} cat={slot.shown.cat} feed={channel.feed} />
                          <em>{guideStep === 0 ? "Agora" : hhmm(slot.shown.start)}</em>
                          <span className="guide-title">{slot.shown.title}</span>
                          <i>
                            {hhmm(slot.shown.start)}–{hhmm(slot.shown.end)}
                          </i>
                        </span>
                      ) : (
                        <span className="guide-next">{channel.feed ? "Fim da grade" : "Sem grade ao vivo"}</span>
                      )}
                      {slot.after ? (
                        <span className="guide-next">
                          <GenreChip title={slot.after.title} cat={slot.after.cat} feed={channel.feed} />
                          {hhmm(slot.after.start)} {slot.after.title}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            {guideEdit && (
              <div className="guide-tools">
                <button
                  type="button"
                  onClick={() => persistChannels([...channels, { id: crypto.randomUUID().slice(0, 8), name: "New channel", number: "1" }])}
                >
                  Add
                </button>
                <button type="button" onClick={() => persistChannels(DEFAULT_CHANNELS.map((c) => ({ ...c })))}>
                  Reset
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="remote-wrap" style={{ width: fitWidth }}>
            <RemoteFace
              skin={skin}
              ac={ac}
              edit={edit}
              selectedId={edit ? selectedId : null}
              firingId={firingId}
              glowId={glowId}
              onPressStart={(key) => {
                if (edit) setSelectedId(key.id);
                else pressStart(key);
              }}
              onPressEnd={stopRepeat}
              onMove={(id, x, y) => {
                setSelectedId(id);
                mutate((draft) => {
                  const key = draft.keys.find((k) => k.id === id);
                  if (!key) return;
                  key.x = x;
                  key.y = y;
                });
              }}
              onResize={(id, w, h) => {
                mutate((draft) => {
                  const key = draft.keys.find((k) => k.id === id);
                  if (!key) return;
                  key.w = w;
                  key.h = h;
                });
              }}
            />
            {acFamily && !edit && weather && (
              <div className="wx-card">
                <WxIcon kind={weather.kind} />
                <div>
                  <strong>{weather.temp}°</strong>
                  <span>{weather.label}</span>
                  <em>Itajaí Express</em>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {edit && (
        <EditorSheet
          skin={skin}
          selected={selected}
          force={force}
          learning={learning}
          onForce={(v) => {
            setForce(v);
            saveForce(v);
          }}
          onSkin={(recipe) => mutate(recipe)}
          onKey={(id, recipe) =>
            mutate((draft) => {
              const key = draft.keys.find((k) => k.id === id);
              if (key) recipe(key);
            })
          }
          onAdd={() => {
            const id = `key-${crypto.randomUUID().slice(0, 4)}`;
            mutate((draft) => {
              draft.keys.push({
                id,
                label: "NEW",
                action: { t: "cmd", cmd: 0x02 },
                x: 24,
                y: 24,
                w: 72,
                h: 40,
                shape: "round",
                radius: 10,
                bg: "#2a2e34",
                fg: "#f4f6f8",
                border: "#4a5058",
                fontSize: 13,
                weight: 650,
                opacity: 1,
                repeat: false,
                tracking: 0.3,
              });
            });
            setSelectedId(id);
          }}
          onDuplicate={() => {
            if (!selected) return;
            const id = `${selected.id}-copy`;
            mutate((draft) => {
              const key = draft.keys.find((k) => k.id === selected.id);
              if (!key) return;
              draft.keys.push({ ...structuredClone(key), id, x: key.x + 8, y: key.y + 8 });
            });
            setSelectedId(id);
          }}
          onDelete={() => {
            if (!selected) return;
            mutate((draft) => {
              draft.keys = draft.keys.filter((k) => k.id !== selected.id);
            });
            setSelectedId(null);
          }}
          onTest={() => {
            if (!selected) return;
            pressStart(selected, false);
            window.setTimeout(stopRepeat, 90);
          }}
          onLearn={() => void learn()}
          onSolid={() => mutate((draft) => draft.keys.forEach((k) => (k.opacity = 1)))}
          onHotspots={() => mutate((draft) => draft.keys.forEach((k) => (k.opacity = 0)))}
          onClearPhoto={() =>
            mutate((draft) => {
              draft.photo = null;
              draft.showDecals = true;
            })
          }
        />
      )}

      <footer className="dock">
        <button type="button" onClick={() => setLibrary(true)}>
          Skins
        </button>
        <button type="button" className={edit ? "is-on" : ""} aria-pressed={edit} onClick={() => setEdit((v) => !v)}>
          <Palette aria-hidden />
          Design
        </button>
        <button type="button" className={link ? "connect is-on" : "connect"} onClick={() => (link ? void disconnect() : void connect())}>
          <Usb aria-hidden />
          {link ? "Connected" : "Connect"}
        </button>
      </footer>

      <footer className="log">
        <button type="button" onClick={() => setPacketsOpen((v) => !v)}>
          {packetsOpen ? "Hide packets" : "Packets"}
        </button>
        <p>{log}</p>
        <span className="rev">v{REV}</span>
      </footer>
      {packetsOpen && <pre className="packets">{packets.length ? packets.join("\n") : "Press a key to build a packet, connected or not."}</pre>}

      {library && (
        <SkinLibrary
          skins={allSkins}
          activeId={skin.id}
          onClose={() => setLibrary(false)}
          onUse={choose}
          onDuplicate={(id) => {
            const source = findSkin(custom, id);
            const copy = cloneSkin(source);
            copy.name = `${source.name} copy`;
            persistCustom([...custom, copy]);
            choose(copy.id);
          }}
          onDelete={(id) => {
            persistCustom(custom.filter((s) => s.id !== id));
            if (activeId === id) choose("lg-tv");
          }}
          onDownload={(id) => {
            const source = findSkin(custom, id);
            const blob = new Blob([JSON.stringify(source, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${source.name.replace(/\s+/g, "-").toLowerCase()}.irskin.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          onImport={async (file) => {
            try {
              const parsed = JSON.parse(await file.text()) as unknown;
              if (!isSkin(parsed)) throw new Error("That file is not a skin.");
              const copy = cloneSkin(parsed);
              copy.name = parsed.name || "Imported";
              persistCustom([...custom, copy]);
              choose(copy.id);
              setLog(`Imported ${copy.name}.`);
            } catch (error) {
              setLog(error instanceof Error ? error.message : "Import failed");
            }
          }}
          onPhoto={async (file) => {
            try {
              const photo = await fileToPhoto(file);
              const copy = cloneSkin(skin);
              const sx = 320 / copy.designW;
              const nextH = Math.round(320 * (photo.h / photo.w));
              const sy = nextH / copy.designH;
              copy.designW = 320;
              copy.designH = nextH;
              copy.photo = photo.url;
              copy.showDecals = false;
              copy.name = `${skin.short} photo`;
              copy.short = "Photo";
              for (const key of copy.keys) {
                key.x = Math.round(key.x * sx);
                key.y = Math.round(key.y * sy);
                key.w = Math.round(key.w * sx);
                key.h = Math.round(key.h * sy);
                key.opacity = 0;
              }
              for (const decal of copy.decals) {
                decal.x = Math.round(decal.x * sx);
                decal.y = Math.round(decal.y * sy);
                decal.w = Math.round(decal.w * sx);
                decal.h = Math.round(decal.h * sy);
              }
              persistCustom([...custom, copy]);
              choose(copy.id);
              setEdit(true);
              setLog("Photo loaded. Drag each outline onto its button, then leave Design.");
            } catch (error) {
              setLog(error instanceof Error ? error.message : "Could not read that image.");
            }
          }}
          onBlank={() => {
            const copy = blankSkin();
            persistCustom([...custom, copy]);
            choose(copy.id);
            setEdit(true);
          }}
        />
      )}
    </div>
  );
}
