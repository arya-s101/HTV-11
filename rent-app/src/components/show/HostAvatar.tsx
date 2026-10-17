// The show's host: an original, generic cartoon presenter in 8-bit pixel art (quiff, big smile, rosy cheeks,
// blue suit, red bow tie, microphone). Deliberately not modelled on any real host.
const PALETTE: Record<string, string> = {
  K: "#1b1530", // outline
  H: "#4a2e1c", // hair
  S: "#eac09a", // skin
  C: "#f0a6a6", // cheeks
  w: "#ffffff", // eye shine, teeth, shirt
  M: "#7a2531", // mouth
  B: "#3f6fd8", // suit
  b: "#2f55b3", // suit shade
  R: "#e0505e", // bow tie
  G: "#b3a9cc", // mic head
  D: "#30343f", // mic handle
};

// 20×22 grid; "." is transparent.
const ROWS = [
  ".....KKKKKKKK.......",
  "....KHHHHHHHHKK.....",
  "...KHHHHHHHHHHHK....",
  "..KHHHHHHHHHHHHHK...",
  "..KHHSKKSHSKKSHHK...",
  "..KSSSSSSSSSSSSSK...",
  ".KSSSSSKSSSKSSSSSK..",
  "KSSSSSSKSSSKSSSSSSK.",
  ".KSCCSSSSSSSSSCCSK..",
  "..KSSKKKKKKKKKSSKGGG",
  "..KSSKwwwwwwwKSSKGGG",
  "..KSSSKMMMMMKSSSKGGG",
  "...KSSSKKKKKSSSK..D.",
  "....KKSSSSSSSKK...D.",
  ".......KSSSK......D.",
  "...KBBRRRKRRRBBK.SSK",
  "..KBBBRRwKwRRBBBKSSK",
  ".KBBBBBbwwwbBBBBBK..",
  ".KBBBBBBbwbBBBBBBK..",
  ".KBBBBBBBbBBBBBBBK..",
  "KBBBBBBBBbBBBBBBBBK.",
  "KBBBBBBBBbBBBBBBBBK.",
];
export const HOST_W = ROWS[0].length;
export const HOST_H = ROWS.length;

/** `scale` is whole screen pixels per art pixel, so the art never blurs. */
export function HostAvatar({ scale = 4, label }: { scale?: number; label?: string }) {
  return (
    <svg
      className="host-avatar"
      width={HOST_W * scale}
      height={HOST_H * scale}
      viewBox={`0 0 ${HOST_W} ${HOST_H}`}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {ROWS.flatMap((row, y) => [...row].map((ch, x) => (ch === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={PALETTE[ch]} />)))}
    </svg>
  );
}
