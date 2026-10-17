// Small presentational pieces: the character sprite, number-with-status badges, and the title scene.
import { money } from "@/game/outcome";
import { composeSprite, H, W, type Appearance } from "@/game/sprite";
import type { Field, Status } from "@/game/types";

export function Sprite({ appearance, scale = 8, label }: { appearance: Appearance; scale?: number; label?: string }) {
  const grid = composeSprite(appearance);
  return (
    <svg className="sprite" width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? "Your character"}>
      {grid.flatMap((row, y) => row.map((c, x) => (c ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} /> : null)))}
    </svg>
  );
}

const STATUS_TEXT: Record<Status, string> = { measured: "measured", derived: "derived", illustrative: "illustrative", unknown: "unknown" };

export function Badge({ f }: { f: Pick<Field<unknown>, "status" | "geography" | "reference_period" | "source_url" | "source_ref"> }) {
  const title = [STATUS_TEXT[f.status], f.geography, f.reference_period, f.source_ref].filter(Boolean).join(" · ");
  return f.source_url ? (
    <a className={`badge ${f.status}`} href={f.source_url} target="_blank" rel="noreferrer" title={`${title} (open source)`}>
      {STATUS_TEXT[f.status]} ↗
    </a>
  ) : (
    <span className={`badge ${f.status}`} title={title}>
      {STATUS_TEXT[f.status]}
    </span>
  );
}

export function formatValue(f: Pick<Field<number>, "value" | "unit">): string {
  if (f.value === null) return "Unknown";
  switch (f.unit) {
    case "CAD cents/month":
      return `${money(f.value)}/mo`;
    case "%":
      return `${f.value}%`;
    case "minutes":
      return `${f.value} min`;
    case "hours/month":
      return `${f.value} h/mo`;
    default:
      return `${f.value} ${f.unit}`;
  }
}

export function Num({ f }: { f: Field<number> }) {
  return (
    <>
      {formatValue(f)}
      <Badge f={f} />
    </>
  );
}

export function Legend() {
  return (
    <div className="legend on-dark">
      <span>Every number is labelled:</span>
      <span className="badge measured">measured</span> real Toronto data
      <span className="badge derived">derived</span> computed in code
      <span className="badge illustrative">illustrative</span> made-up scenario
      <span className="badge unknown">unknown</span> nobody told you
    </div>
  );
}

/** Original pixel skyline (no recognizable brand or game styles). */
export function TitleScene() {
  const buildings = [
    [0, 52, 14], [15, 40, 12], [28, 58, 16], [45, 34, 10], [56, 46, 14], [71, 30, 12], [84, 50, 16], [101, 38, 12], [114, 54, 14], [129, 42, 12], [142, 56, 18],
  ];
  return (
    <svg className="title-scene" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges" aria-hidden="true">
      <rect width="160" height="90" fill="#2b2650" />
      <rect y="40" width="160" height="50" fill="#3a2f63" />
      <rect y="55" width="160" height="35" fill="#4f3a6e" />
      {[[12, 8], [40, 14], [70, 6], [96, 12], [130, 9], [150, 18], [24, 22]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1" height="1" fill="#f6eed9" />
      ))}
      <rect x="120" y="10" width="10" height="10" fill="#f2b136" />
      <rect x="122" y="8" width="6" height="14" fill="#f2b136" />
      <rect x="78" y="6" width="2" height="60" fill="#1d1a2f" />
      <rect x="75" y="24" width="8" height="4" fill="#1d1a2f" />
      <rect x="78.5" y="0" width="1" height="7" fill="#1d1a2f" />
      {buildings.map(([x, top, w], i) => (
        <g key={i}>
          <rect x={x} y={top} width={w} height={90 - top} fill={i % 2 ? "#221d38" : "#2a2442"} />
          {Array.from({ length: Math.floor((70 - top) / 5) }).map((_, r) =>
            Array.from({ length: Math.floor((w - 2) / 4) }).map((_, c) => (
              <rect key={`${r}-${c}`} x={x + 2 + c * 4} y={top + 3 + r * 5} width="2" height="2" fill={(r * 7 + c * 3 + i) % 5 === 0 ? "#f2b136" : "#3a3358"} />
            )),
          )}
        </g>
      ))}
      <rect y="78" width="160" height="12" fill="#1d1a2f" />
      <rect x="20" y="70" width="40" height="8" fill="#e0505e" />
      {[23, 31, 39, 47].map((x) => (
        <rect key={x} x={x} y="72" width="5" height="3" fill="#f6eed9" />
      ))}
      <rect x="0" y="78" width="160" height="1" fill="#8a8399" />
    </svg>
  );
}
