import { RemoteFace } from "@/components/bench/remote-face";
import { DEFAULT_AC, type Skin } from "@/lib/ir/skins";

export function SkinLibrary({
  skins,
  activeId,
  onClose,
  onUse,
  onDuplicate,
  onDelete,
  onDownload,
  onImport,
  onPhoto,
  onBlank,
}: {
  skins: Skin[];
  activeId: string;
  onClose: () => void;
  onUse: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
  onImport: (file: File) => void;
  onPhoto: (file: File) => void;
  onBlank: () => void;
}) {
  return (
    <div className="library" role="dialog" aria-label="Skins">
      <div className="library-card">
        <header>
          <div>
            <strong>Skins</strong>
            <p>Built-in faces, your edits, or a photo with draggable hotspots.</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <div className="library-actions">
          <button type="button" onClick={onBlank}>New blank</button>
          <label className="file">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = "";
              }}
            />
          </label>
          <label className="file">
            Photo skin
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onPhoto(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <ul>
          {skins.map((skin) => (
            <li key={skin.id} className={skin.id === activeId ? "is-on" : ""}>
              <div className="thumb" aria-hidden>
                <div style={{ width: skin.designW, transform: `scale(${Math.min(70 / skin.designW, 124 / skin.designH)})`, transformOrigin: "top left" }}>
                  <RemoteFace
                    skin={skin}
                    ac={DEFAULT_AC}
                    edit={false}
                    selectedId={null}
                    firingId={null}
                    glowId={null}
                    onPressStart={() => undefined}
                    onPressEnd={() => undefined}
                    onMove={() => undefined}
                    onResize={() => undefined}
                  />
                </div>
              </div>
              <div className="meta">
                <strong>{skin.name}</strong>
                <span>{skin.model}{skin.builtin ? " · built in" : ""}</span>
                <div className="row-actions">
                  <button type="button" onClick={() => onUse(skin.id)}>Use</button>
                  <button type="button" onClick={() => onDuplicate(skin.id)}>Duplicate</button>
                  <button type="button" onClick={() => onDownload(skin.id)}>Download</button>
                  {!skin.builtin && (
                    <button type="button" className="danger" onClick={() => onDelete(skin.id)}>Delete</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
