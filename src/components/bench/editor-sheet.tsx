import type { ForceKind, KeyDef, KeyShape, Skin } from "@/lib/ir/skins";
import { acProtocolFor, actionLabel } from "@/lib/ir/skins";
import { hexByte } from "@/lib/ir/protocol";

export function EditorSheet({
  skin,
  selected,
  force,
  learning,
  onForce,
  onSkin,
  onKey,
  onAdd,
  onDuplicate,
  onDelete,
  onTest,
  onLearn,
  onSolid,
  onHotspots,
  onClearPhoto,
}: {
  skin: Skin;
  selected: KeyDef | null;
  force: ForceKind;
  learning: boolean;
  onForce: (v: ForceKind) => void;
  onSkin: (recipe: (skin: Skin) => void) => void;
  onKey: (id: string, recipe: (key: KeyDef) => void) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTest: () => void;
  onLearn: () => void;
  onSolid: () => void;
  onHotspots: () => void;
  onClearPhoto: () => void;
}) {
  return (
    <aside className="sheet">
      <div className="sheet-head">
        <strong>{selected ? selected.label || selected.id : "Chassis"}</strong>
        <span>{selected ? actionLabel(selected.action) : skin.model}</span>
      </div>

      {selected ? (
        <div className="fields">
          <label>
            Label
            <input
              value={selected.label}
              onChange={(e) => onKey(selected.id, (k) => (k.label = e.target.value))}
            />
          </label>
          {selected.action.t === "cmd" && (
            <label>
              Command
              <input
                value={hexByte(selected.action.cmd)}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value.replace(/^0x/i, ""), 16);
                  if (Number.isNaN(n)) return;
                  onKey(selected.id, (k) => {
                    k.action = { t: "cmd", cmd: n & 0xff };
                  });
                }}
                inputMode="text"
                spellCheck={false}
              />
            </label>
          )}
          <label>
            Shape
            <select
              value={selected.shape}
              onChange={(e) => onKey(selected.id, (k) => (k.shape = e.target.value as KeyShape))}
            >
              <option value="round">Rounded</option>
              <option value="pill">Pill</option>
              <option value="circle">Circle</option>
              <option value="square">Square</option>
            </select>
          </label>
          <div className="swatches">
            <label>
              Fill
              <input type="color" value={toColor(selected.bg)} onChange={(e) => onKey(selected.id, (k) => (k.bg = e.target.value))} />
            </label>
            <label>
              Text
              <input type="color" value={toColor(selected.fg)} onChange={(e) => onKey(selected.id, (k) => (k.fg = e.target.value))} />
            </label>
            <label>
              Edge
              <input type="color" value={toColor(selected.border)} onChange={(e) => onKey(selected.id, (k) => (k.border = e.target.value))} />
            </label>
          </div>
          <Slider label="X" min={0} max={skin.designW - 8} value={selected.x} onChange={(n) => onKey(selected.id, (k) => (k.x = n))} />
          <Slider label="Y" min={0} max={skin.designH - 8} value={selected.y} onChange={(n) => onKey(selected.id, (k) => (k.y = n))} />
          <Slider label="Width" min={18} max={240} value={selected.w} onChange={(n) => onKey(selected.id, (k) => (k.w = n))} />
          <Slider label="Height" min={16} max={160} value={selected.h} onChange={(n) => onKey(selected.id, (k) => (k.h = n))} />
          <Slider label="Corner" min={0} max={40} value={selected.radius} onChange={(n) => onKey(selected.id, (k) => (k.radius = n))} />
          <Slider label="Type" min={8} max={28} value={selected.fontSize} onChange={(n) => onKey(selected.id, (k) => (k.fontSize = n))} />
          <Slider label="Opacity" min={0} max={100} value={Math.round(selected.opacity * 100)} onChange={(n) => onKey(selected.id, (k) => (k.opacity = n / 100))} />
          <label className="check">
            <input
              type="checkbox"
              checked={selected.repeat}
              onChange={(e) => onKey(selected.id, (k) => (k.repeat = e.target.checked))}
            />
            Repeat while held
          </label>
          <div className="row-actions">
            <button type="button" onClick={onTest}>Test key</button>
            <button type="button" onClick={onLearn} disabled={learning}>
              {learning ? "Listening…" : "Learn"}
            </button>
            <button type="button" onClick={onDuplicate}>Copy</button>
            <button type="button" className="danger" onClick={onDelete}>Delete</button>
          </div>
        </div>
      ) : (
        <p className="hint">Tap a key to change its shape, size, color, and code. Drag it. The corner handle resizes it.</p>
      )}

      <div className="fields chassis-fields">
        <label>
          Name
          <input value={skin.name} onChange={(e) => onSkin((s) => (s.name = e.target.value))} />
        </label>
        <div className="swatches">
          <label>
            Body
            <input type="color" value={toColor(skin.chassis.bg)} onChange={(e) => onSkin((s) => (s.chassis.bg = e.target.value))} />
          </label>
          <label>
            Shade
            <input type="color" value={toColor(skin.chassis.bg2)} onChange={(e) => onSkin((s) => (s.chassis.bg2 = e.target.value))} />
          </label>
          <label>
            Rim
            <input type="color" value={toColor(skin.chassis.border)} onChange={(e) => onSkin((s) => (s.chassis.border = e.target.value))} />
          </label>
        </div>
        {(skin.protocol.family === "samsung32" || skin.protocol.family === "nec") && (
          <label>
            Address
            <input
              value={hexByte(skin.protocol.address)}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value.replace(/^0x/i, ""), 16);
                if (Number.isNaN(n)) return;
                onSkin((s) => {
                  if (s.protocol.family === "samsung32" || s.protocol.family === "nec") s.protocol.address = n & 0xff;
                });
              }}
            />
          </label>
        )}
        {(skin.protocol.family === "coolix" || skin.protocol.family === "lgac" || skin.protocol.family === "goodweather") && (
          <label>
            AC protocol
            <select
              value={skin.protocol.family === "lgac" ? skin.protocol.variant : skin.protocol.family === "coolix" ? "coolix" : "homeco"}
              onChange={(e) => {
                const v = e.target.value;
                onSkin((s) => {
                  s.protocol = acProtocolFor(v);
                });
              }}
            >
              <option value="homeco">Homeco</option>
              <option value="coolix">Midea / Coolix</option>
              <option value="lg">LG</option>
              <option value="lg2">LG alternate</option>
            </select>
          </label>
        )}
        <label>
          Dongle encoding
          <select value={force} onChange={(e) => onForce(e.target.value as ForceKind)}>
            <option value="auto">Auto from handshake</option>
            <option value="d226">D226 Huffman</option>
            <option value="d552">D552 pulses only</option>
          </select>
        </label>
        <div className="row-actions">
          <button type="button" onClick={onAdd}>Add key</button>
          <button type="button" onClick={onSolid}>Solid keys</button>
          <button type="button" onClick={onHotspots}>Hotspots</button>
          {skin.photo && (
            <button type="button" onClick={onClearPhoto}>
              Remove photo
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (n: number) => void }) {
  return (
    <label className="slider">
      <span>
        {label}
        <em>{Math.round(value)}</em>
      </span>
      <input type="range" min={min} max={max} value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function toColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
}
