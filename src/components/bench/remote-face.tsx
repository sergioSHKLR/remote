import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FastForward,
  Pause,
  Play,
  Power,
  Rewind,
  Square,
  Undo2,
  Snowflake,
  Droplets,
  Fan,
  Sun,
  UnfoldVertical,
} from "lucide-react";
import { AC_MODE_ORDER, type AcState } from "@/lib/ir/protocol";
import type { Decal, Glyph, KeyDef, Skin } from "@/lib/ir/skins";

const ICONS: Record<Glyph, typeof Power> = {
  power: Power,
  up: ChevronUp,
  down: ChevronDown,
  left: ChevronLeft,
  right: ChevronRight,
  play: Play,
  pause: Pause,
  stop: Square,
  rew: Rewind,
  ff: FastForward,
  mute: Square,
  back: Undo2,
};

const LCD_MODES: Record<AcState["mode"], { label: string; Icon: typeof Power }> = {
  cool: { label: "Cool", Icon: Snowflake },
  dry: { label: "Dry", Icon: Droplets },
  fan: { label: "Fan", Icon: Fan },
  heat: { label: "Heat", Icon: Sun },
  auto: { label: "Auto", Icon: Fan },
};

function FanBars({ fan }: { fan: AcState["fan"] }) {
  const level = fan === "low" ? 1 : fan === "med" ? 2 : fan === "high" ? 3 : 0;
  return (
    <span className={fan === "auto" ? "lcd-fan is-auto" : "lcd-fan"} aria-label={`Fan ${fan}`}>
      {[1, 2, 3].map((n) => (
        <i key={n} className={fan === "auto" || n <= level ? "is-on" : ""} />
      ))}
      {fan === "auto" && <em>A</em>}
    </span>
  );
}

function box(el: { x: number; y: number; w: number; h: number }, skin: Skin) {
  return {
    left: `${(el.x / skin.designW) * 100}%`,
    top: `${(el.y / skin.designH) * 100}%`,
    width: `${(el.w / skin.designW) * 100}%`,
    height: `${(el.h / skin.designH) * 100}%`,
  };
}

function radiusOf(key: KeyDef, skin: Skin): string {
  if (key.shape === "circle") return "50%";
  if (key.shape === "pill") return "999px";
  if (key.shape === "square") return "2px";
  return `${(key.radius / skin.designW) * 100}cqw`;
}

export function RemoteFace({
  skin,
  ac,
  edit,
  selectedId,
  firingId,
  glowId,
  onPressStart,
  onPressEnd,
  onMove,
  onResize,
}: {
  skin: Skin;
  ac: AcState;
  edit: boolean;
  selectedId: string | null;
  firingId: string | null;
  glowId: string | null;
  onPressStart: (key: KeyDef) => void;
  onPressEnd: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
}) {
  const faceRef = useRef<HTMLDivElement>(null);

  const drag = (key: KeyDef, event: ReactPointerEvent, mode: "move" | "resize") => {
    const face = faceRef.current;
    if (!face) return;
    event.stopPropagation();
    event.preventDefault();
    const rect = face.getBoundingClientRect();
    const start = { px: event.clientX, py: event.clientY, x: key.x, y: key.y, w: key.w, h: key.h };
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - start.px) / rect.width) * skin.designW;
      const dy = ((ev.clientY - start.py) / rect.height) * skin.designH;
      if (mode === "move") {
        onMove(
          key.id,
          Math.round(Math.min(skin.designW - key.w, Math.max(0, start.x + dx))),
          Math.round(Math.min(skin.designH - key.h, Math.max(0, start.y + dy))),
        );
      } else {
        onResize(
          key.id,
          Math.round(Math.min(200, Math.max(18, start.w + dx))),
          Math.round(Math.min(160, Math.max(16, start.h + dy))),
        );
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const photo = Boolean(skin.photo);
  const rTop = `${(skin.chassis.radiusTop / skin.designW) * 100}cqw`;
  const rBot = `${(skin.chassis.radiusBot / skin.designW) * 100}cqw`;

  return (
    <div
      ref={faceRef}
      className={`face${edit ? " is-edit" : ""}${photo ? " is-photo" : ""}${firingId ? " is-live" : ""}`}
      style={{
        aspectRatio: `${skin.designW} / ${skin.designH}`,
        backgroundColor: skin.chassis.bg,
        backgroundImage: photo
          ? `url(${skin.photo})`
          : `linear-gradient(180deg, color-mix(in srgb, ${skin.chassis.bg} 78%, white) 0%, ${skin.chassis.bg} 18%, ${skin.chassis.bg2} 100%)`,
        borderColor: skin.chassis.border,
        borderTopLeftRadius: rTop,
        borderTopRightRadius: rTop,
        borderBottomLeftRadius: rBot,
        borderBottomRightRadius: rBot,
      }}
    >
      {skin.showDecals && !photo && skin.decals.map((d) => <DecalView key={d.id} decal={d} skin={skin} ac={ac} />)}
      {skin.keys.map((key) => {
        const Icon = key.glyph ? ICONS[key.glyph] : null;
        const ghost = key.bg === "transparent";
        const showIcon = Boolean(Icon && (key.iconOnly || !key.label));
        return (
          <button
            key={key.id}
            type="button"
            className={`key${ghost ? " is-ghost" : ""}${selectedId === key.id ? " is-selected" : ""}${firingId === key.id ? " is-down" : ""}${glowId === key.id ? " is-glow" : ""}`}
            aria-label={key.label || key.id}
            aria-pressed={firingId === key.id}
            style={{
              ...box(key, skin),
              ["--bg" as string]: key.bg,
              ["--fg" as string]: key.fg,
              ["--bd" as string]: key.border,
              color: key.fg,
              borderColor: ghost ? "transparent" : key.border,
              borderRadius: radiusOf(key, skin),
              fontSize: `${(key.fontSize / skin.designW) * 100}cqw`,
              fontWeight: key.weight,
              letterSpacing: `${key.tracking}px`,
              opacity: edit ? Math.max(key.opacity, ghost ? 0.85 : 0.45) : key.opacity,
            }}
            onPointerDown={(event) => {
              if (edit) {
                onPressStart(key);
                drag(key, event, "move");
                return;
              }
              (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
              event.preventDefault();
              onPressStart(key);
            }}
            onPointerUp={() => {
              if (!edit) onPressEnd();
            }}
            onPointerCancel={() => {
              if (!edit) onPressEnd();
            }}
          >
            {showIcon && Icon ? <Icon strokeWidth={2.4} aria-hidden /> : key.label}
            {edit && selectedId === key.id && (
              <span
                className="resize"
                onPointerDown={(event) => drag(key, event, "resize")}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function DecalView({ decal, skin, ac }: { decal: Decal; skin: Skin; ac: AcState }) {
  if (decal.kind === "text") {
    return (
      <div
        className="decal decal-text"
        style={{
          ...box(decal, skin),
          color: decal.color,
          fontSize: `${(decal.size / skin.designW) * 100}cqw`,
          letterSpacing: `${decal.tracking}px`,
          fontWeight: decal.weight,
        }}
      >
        {decal.text}
      </div>
    );
  }
  if (decal.kind === "well") {
    return (
      <div
        className="decal decal-well"
        style={{
          ...box(decal, skin),
          ["--bg" as string]: decal.bg,
          borderColor: decal.border,
          borderRadius: `${(decal.radius / skin.designW) * 100}cqw`,
        }}
      />
    );
  }
  if (decal.kind === "ir") {
    return <div className="decal decal-ir" style={box(decal, skin)} />;
  }
  const mode = LCD_MODES[ac.mode];
  const fan = ac.fan === "med" ? "Med" : ac.fan[0]!.toUpperCase() + ac.fan.slice(1);
  return (
    <div className={ac.power ? "decal lcd" : "decal lcd is-off"} style={box(decal, skin)}>
      <div className="lcd-temp">{ac.power ? `${ac.temp}°` : "OFF"}</div>
      <div className="lcd-row">
        <div className="lcd-modes" aria-hidden>
          {AC_MODE_ORDER.map((m) => {
            const info = LCD_MODES[m];
            return (
              <span key={m} className={m === ac.mode ? "is-on" : ""} title={info.label}>
                {m === "auto" ? <b>A</b> : <info.Icon aria-hidden />}
              </span>
            );
          })}
        </div>
        <FanBars fan={ac.fan} />
        <span className={ac.swing ? "lcd-swing is-on" : "lcd-swing"} title="Swing">
          <UnfoldVertical aria-hidden />
        </span>
      </div>
      <div className="lcd-sub">
        {mode.label} · Fan {fan}
        {ac.swing ? " · Swing" : ""}
      </div>
    </div>
  );
}
