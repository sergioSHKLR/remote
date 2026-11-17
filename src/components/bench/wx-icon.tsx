import type { WxKind } from "@/lib/weather";

/** Weather glyphs, verbatim from live v35. */
export function WxIcon({ kind }: { kind: WxKind }) {
  const sun = (
    <g>
      <circle cx="22" cy="22" r="10" fill="#ffc53d" />
      <g stroke="#ffb020" strokeWidth="3" strokeLinecap="round">
        <path d="M22 4v5M22 35v5M4 22h5M35 22h5M9 9l3.5 3.5M31.5 31.5L35 35M9 35l3.5-3.5M31.5 12.5L35 9" />
      </g>
    </g>
  );
  const cloud = (x: number, y: number, fill: string) => (
    <path fill={fill} transform={`translate(${x} ${y})`} d="M18 28h22a10 10 0 0 0 1.2-19.9 13 13 0 0 0-25-2.2A9 9 0 0 0 18 28z" />
  );
  const drops = (
    <g fill="#4dabf7">
      <path d="M18 40c0 3 2 5 2 5s2-2 2-5-2-6-2-6-2 3-2 6z" />
      <path d="M30 42c0 3 2 5 2 5s2-2 2-5-2-6-2-6-2 3-2 6z" />
      <path d="M42 40c0 3 2 5 2 5s2-2 2-5-2-6-2-6-2 3-2 6z" />
    </g>
  );
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      {kind === "clear" && <g transform="translate(8 8) scale(1.15)">{sun}</g>}
      {kind === "fair" && (
        <>
          <g transform="translate(2 2)">{sun}</g>
          {cloud(16, 22, "#f1f3f5")}
        </>
      )}
      {kind === "partly" && (
        <>
          <g transform="translate(0 0)">{sun}</g>
          {cloud(14, 24, "#e9ecef")}
        </>
      )}
      {kind === "cloudy" && (
        <>
          {cloud(6, 10, "#ced4da")}
          {cloud(14, 22, "#f8f9fa")}
        </>
      )}
      {kind === "fog" && (
        <>
          {cloud(10, 4, "#dee2e6")}
          <g stroke="#adb5bd" strokeWidth="4" strokeLinecap="round">
            <path d="M12 40h40M16 48h32M20 56h24" />
          </g>
        </>
      )}
      {(kind === "rain" || kind === "heavy" || kind === "showers") && (
        <>
          {kind === "showers" && <g transform="translate(2 0) scale(0.72)">{sun}</g>}
          {cloud(kind === "heavy" ? 6 : 8, kind === "showers" ? 12 : 4, kind === "heavy" ? "#495057" : "#dee2e6")}
          {drops}
        </>
      )}
      {kind === "thunder" && (
        <>
          {cloud(8, 2, "#495057")}
          <path fill="#ffd43b" d="M30 28l-8 14h8l-4 14 16-18h-9l7-10z" />
        </>
      )}
      {kind === "snow" && (
        <>
          {cloud(8, 2, "#f1f3f5")}
          <g fill="#a5d8ff">
            <path d="M22 42l2 8 2-8 2 8-2-2 6 2-6 2 2 2-8-2-2 6 2-6-2 6-2-6-8 2 6-2-6-2 8 2-2-8z" />
            <circle cx="40" cy="52" r="3" />
            <circle cx="50" cy="46" r="2.4" />
          </g>
        </>
      )}
      {kind === "sleet" && (
        <>
          {cloud(8, 2, "#dee2e6")}
          <g fill="#74c0fc">
            <circle cx="22" cy="48" r="3" />
            <circle cx="34" cy="54" r="3" />
            <circle cx="46" cy="46" r="3" />
          </g>
        </>
      )}
    </svg>
  );
}
