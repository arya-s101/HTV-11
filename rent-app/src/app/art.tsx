// Inline SVG icons and generated building illustrations (no image assets needed).

type IconName = "home" | "wallet" | "train" | "bed" | "briefcase" | "pin" | "flame" | "check" | "x" | "star" | "clock" | "trophy";

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h13v4" />
      <path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Z" />
      <circle cx="16" cy="14.5" r="1.2" fill="currentColor" />
    </>
  ),
  train: (
    <>
      <rect x="5" y="3" width="14" height="14" rx="3" />
      <path d="M5 11h14M9 21l-2-4M15 21l2-4" />
      <circle cx="9" cy="14" r="0.9" fill="currentColor" />
      <circle cx="15" cy="14" r="0.9" fill="currentColor" />
    </>
  ),
  bed: <path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3M7 11.5a1.5 1.5 0 1 0 0-.01" />,
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  flame: <path d="M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2.4 1.2-4 2.5-5 0 2 1 3 2 3 0-3-1-5.5.5-8Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6" />,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A small generated street scene; same seed always draws the same picture. */
export function BuildingArt({ seed, hue }: { seed: string; hue: number }) {
  let h = hash(seed);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return (h >>> 0) / 4294967296;
  };
  const buildings: { x: number; w: number; top: number; tone: number }[] = [];
  let x = -10;
  while (x < 320) {
    const w = 42 + Math.floor(next() * 50);
    buildings.push({ x, w, top: 22 + Math.floor(next() * 60), tone: next() });
    x += w + 4;
  }
  const hero = buildings[Math.floor(buildings.length / 2)];
  const skyId = `sky-${hash(seed).toString(36)}`;
  return (
    <svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 70% 78%)`} />
          <stop offset="1" stopColor={`hsl(${(hue + 30) % 360} 75% 88%)`} />
        </linearGradient>
      </defs>
      <rect width="300" height="120" fill={`url(#${skyId})`} />
      <circle cx={150 + next() * 120} cy={30} r={13} fill={`hsl(${(hue + 50) % 360} 90% 92%)`} opacity="0.9" />
      {buildings.map((b, i) => {
        const isHero = b === hero;
        const light = isHero ? 34 : 46 + b.tone * 14;
        const fill = `hsl(${hue} ${isHero ? 45 : 25}% ${light}%)`;
        const cols = Math.max(2, Math.floor((b.w - 10) / 12));
        const rows = Math.floor((120 - b.top - 10) / 14);
        return (
          <g key={i}>
            <rect x={b.x} y={isHero ? b.top - 8 : b.top} width={b.w} height={130} fill={fill} rx="2" />
            {Array.from({ length: rows }).map((_, r) =>
              Array.from({ length: cols }).map((_, c) => (
                <rect
                  key={`${r}-${c}`}
                  x={b.x + 6 + c * 12}
                  y={(isHero ? b.top - 8 : b.top) + 8 + r * 14}
                  width="6"
                  height="8"
                  rx="1"
                  fill={next() > 0.55 ? "hsl(45 95% 80%)" : `hsl(${hue} 30% ${light + 14}%)`}
                  opacity={isHero ? 1 : 0.8}
                />
              )),
            )}
          </g>
        );
      })}
      <rect y="112" width="300" height="8" fill={`hsl(${hue} 15% 30%)`} />
    </svg>
  );
}

export function HeroArt() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a7a" />
          <stop offset="0.6" stopColor="#ffc8a2" />
          <stop offset="1" stopColor="#ffe6c7" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#hero-sky)" />
      <circle cx="300" cy="90" r="38" fill="#fff3d6" />
      {/* tower with pod and spire */}
      <rect x="196" y="40" width="8" height="200" fill="#5b3a46" />
      <ellipse cx="200" cy="120" rx="20" ry="9" fill="#5b3a46" />
      <rect x="198.5" y="10" width="3" height="32" fill="#5b3a46" />
      {[
        [10, 170, 50], [64, 150, 40], [108, 185, 46], [158, 160, 34], [214, 175, 44], [262, 140, 48], [314, 168, 38], [356, 190, 50],
      ].map(([x, y, w], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={300 - y} fill={i % 2 ? "#7a4a57" : "#8d5866"} />
          {Array.from({ length: Math.floor((300 - y - 20) / 18) }).map((_, r) =>
            Array.from({ length: Math.floor((w - 8) / 12) }).map((_, c) => (
              <rect key={`${r}-${c}`} x={x + 6 + c * 12} y={y + 10 + r * 18} width="6" height="9" rx="1" fill={(r * 3 + c * 7 + i) % 4 === 0 ? "#ffe08a" : "#a4707e"} />
            )),
          )}
        </g>
      ))}
      {/* streetcar */}
      <rect x="40" y="262" width="150" height="30" rx="8" fill="#e5484d" />
      {[52, 78, 104, 130, 156].map((x) => (
        <rect key={x} x={x} y="268" width="18" height="11" rx="2" fill="#fff3ec" />
      ))}
      <rect x="0" y="292" width="400" height="8" fill="#3d2730" />
    </svg>
  );
}
