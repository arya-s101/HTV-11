// Pixel-art icons from pixelarticons (MIT, https://github.com/halfmage/pixelarticons), copied from @iconify-json/pixelarticons.
// Only the icons the game uses are inlined, so nothing loads at runtime. They replace every emoji in the UI.
const ICONS = {
  "chevron-right": "<path fill=\"currentColor\" d=\"M16 13v-2h-2v2zm-2-2V9h-2v2zm0 4v-2h-2v2zm-2-6V7h-2v2zm0 8v-2h-2v2zM10 7V5H8v2zm0 12v-2H8v2z\"/>",
  "chevron-down": "<path fill=\"currentColor\" d=\"M13 16h-2v-2h2zm-2-2H9v-2h2zm4 0h-2v-2h2zm-6-2H7v-2h2zm8 0h-2v-2h2zM7 10H5V8h2zm12 0h-2V8h2z\"/>",
  "play": "<path fill=\"currentColor\" d=\"M15 11h-2V9h2zm0 4h-2v-2h2zm-2 2h-2v-2h2zm0-8h-2V7h2zm-2-2H9V5h2zM9 21H7V3h2zm6-8h2v-2h-2zm-6 4h2v2H9z\"/>",
  "check": "<path fill=\"currentColor\" d=\"M10 18H8v-2h2zm-2-2H6v-2h2zm4-2v2h-2v-2zm-6 0H4v-2h2zm8 0h-2v-2h2zm2-2h-2v-2h2zm2-2h-2V8h2zm2-2h-2V6h2z\"/>",
  "close": "<path fill=\"currentColor\" d=\"M7 19H5v-2h2zm12 0h-2v-2h2zM9 15v2H7v-2zm8 2h-2v-2h2zm-6-2H9v-2h2zm4 0h-2v-2h2zm-2-2h-2v-2h2zm-2-2H9V9h2zm4 0h-2V9h2zM9 9H7V7h2zm8 0h-2V7h2zM7 7H5V5h2zm12 0h-2V5h2z\"/>",
  "next": "<path fill=\"currentColor\" d=\"M6 4h2v2h2v2h2v2h2v4h-2v2h-2v2H8v2H6zm12 0h-2v16h2z\"/>",
  "clipboard": "<path fill=\"currentColor\" d=\"M4 6h2v14H4zm2 14h12v2H6zM18 6h2v14h-2zM6 4h2v2H6zm10 0h2v2h-2zm-6-2h4v2h-4zm0 4h4v2h-4zM8 2h2v6H8zm6 0h2v6h-2z\"/>",
  "camera": "<path fill=\"currentColor\" d=\"M4 5h4v2H4zm4-2h8v2H8zm8 2h4v2h-4zM2 7h2v12H2zm2 12h16v2H4zM20 7h2v12h-2zM10 8h4v2h-4zm0 6h4v2h-4zm-2-4h2v4H8zm6 0h2v4h-2z\"/>",
  "dice": "<path fill=\"currentColor\" d=\"M5 3H3v18h18V3zm14 2v14H5V5zM9 7H7v2h2zm6 0h2v2h-2zm-6 8H7v2h2zm6 0h2v2h-2zm-2-4h-2v2h2z\"/>",
  "shield": "<path fill=\"currentColor\" d=\"M4 2h16v2H4zM2 4h2v10H2zm18 0h2v10h-2zM4 14h2v2H4zm2 2h2v2H6zm4 4h4v2h-4zm10-6h-2v2h2zm-2 2h-2v2h2zm-2 2h-2v2h2zm-6 0H8v2h2z\"/>",
  "pause": "<path fill=\"currentColor\" d=\"M10 20H4V4h6zm8-16v16h-6V4zm-4 2v12h2V6zM6 18h2V6H6z\"/>",
  "users": "<path fill=\"currentColor\" d=\"M5 2h6v2H5zm10 0h4v2h-4zM5 10h6v2H5zm10 0h4v2h-4zm4-6h2v6h-2zm-8 0h2v6h-2zM3 4h2v6H3zM0 18h2v4H0zm14 0h2v4h-2zm8 0h2v4h-2zM4 14h8v2H4zm12 0h4v2h-4zM2 16h2v2H2zm10 0h2v2h-2zm8 0h2v2h-2z\"/>",
  "volume-x": "<path fill=\"currentColor\" d=\"M13 22h-2v-2H9v-2h2V6H9V4h2V2h2zm-4-4H7v-2h2zm-2-8H5v4h2v2H3V8h4zm10.001 5.224h-2v-2H17v-2h-1.999v-2h2v2H19v2h-1.999zm3.999 0h-2v-2h2zm0-4h-2v-2h2zM9 8H7V6h2z\"/>",
  "volume-3": "<path fill=\"currentColor\" d=\"M11 22H9v-2H7v-2h2V6H7V4h2V2h2zm8 0h-6v-2h6zm2-2h-2v-2h2zM7 18H5v-2h2zm10 0h-4v-2h4zm6 0h-2V6h2zM5 10H3v4h2v2H1V8h4zm14 6h-2V8h2zm-4-2h-2v-4h2zM7 8H5V6h2zm10 0h-4V6h4zm4-2h-2V4h2zm-2-2h-6V2h6z\"/>",
  "trash": "<path fill=\"currentColor\" d=\"M18 22H6v-2h12zM9 6h6V4h2v2h5v2h-2v12h-2V8H6v12H4V8H2V6h5V4h2zm6-2H9V2h6z\"/>",
  "map-pin": "<path fill=\"currentColor\" d=\"M7 2h10v2H7zM5 4h2v2H5zm14 0h-2v2h2zM7 17h2v2H7zm2 2h2v2H9zm6-2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-6-7h2v3H5zm12 0h2v3h-2zM3 6h2v8H3zm18 0h-2v8h2zM10 6h4v2h-4zM8 8h2v4H8zm2 4h4v2h-4zm4-4h2v4h-2z\"/>",
  "trophy": "<path fill=\"currentColor\" d=\"M16 17h-3v2h2v2H9v-2h2v-2H8v-2h8zm2-12h4v6h-2V7h-2v4h2v2h-2v2h-2V5H8v10H6v-2H4v-2h2V7H4v4H2V5h4V3h12z\"/>",
  "mail": "<path fill=\"currentColor\" d=\"M6 8h2v2H6zm2 2h2v2H8zm10-2h-2v2h2zm-2 2h-2v2h2zm-6 2h4v2h-4zM2 6h2v12H2zm18 0h2v12h-2zM4 4h16v2H4zm0 14h16v2H4z\"/>",
  "note": "<path fill=\"currentColor\" d=\"M2 4h2v16H2zm18 0h2v12h-2zM4 2h16v2H4zm14 14h2v2h-2zm-2 2h2v2h-2zM4 20h12v2H4zm10-8h6v2h-6zm-2 2h2v6h-2z\"/>",
  "receipt": "<path fill=\"currentColor\" d=\"M3 2h2v18H3zm16 0h2v18h-2zM5 4h2v2H5zm4 0h2v2H9zM5 20h14v2H5zm8-16h2v2h-2zM7 2h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm2 2h2v2h-2zM7 8h10v2H7zm0 4h10v2H7zm0 4h4v2H7z\"/>",
  "gear": "<path fill=\"currentColor\" d=\"M18 22h-5v2h-2v-2H6v-2h12zM4 22H2v-2h2zm18 0h-2v-2h2zM6 20H4v-2h2zm14 0h-2v-2h2zM4 18H2v-5H0v-2h2V6h2zm4 0H6v-2h2zm14-7h2v2h-2v5h-2v-5h-4v3H8V8h8v3h4V6h2zm-12-1v4h4v-4zM8 8H6V6h2zM6 6H4V4h2zm14 0h-2V4h2zM4 4H2V2h2zm9-2h5v2H6V2h5V0h2zm9 2h-2V2h2z\"/>",
  "user": "<path fill=\"currentColor\" d=\"M9 2h6v2H9zm0 8h6v2H9zm6-6h2v6h-2zM7 4h2v6H7zM4 18h2v4H4zm14 0h2v4h-2zM8 14h8v2H8zm-2 2h2v2H6zm10 0h2v2h-2z\"/>",
  "star": "<path fill=\"currentColor\" d=\"M5 20h3v2H3v-6h2zm16 2h-5v-2h3v-4h2zm-11-2H8v-2h2zm6 0h-2v-2h2zm-2-2h-4v-2h4zm-7-2H5v-3h2zm12 0h-2v-3h2zM5 13H3v-2h2zm16 0h-2v-2h2zM9 9H3v2H1V7h8zm14 2h-2V9h-6V7h8zM11 7H9V3h2zm4 0h-2V3h2zm-2-4h-2V1h2z\"/>",
  "checkbox-on": "<path fill=\"currentColor\" d=\"M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zM7 12h2v2H7zm2 2h2v2H9zm2-2h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2z\"/>",
  "checkbox": "<path fill=\"currentColor\" d=\"M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2z\"/>",
  "folder": "<path fill=\"currentColor\" d=\"M4 4h6v2H4zm0 14h16v2H4zM20 8h2v10h-2zM2 6h2v12H2zm8 0h10v2H10z\"/>",
  "cancel": "<path fill=\"currentColor\" d=\"M6 2h12v2H6zm0 18h12v2H6zM2 6h2v12H2zm18 0h2v12h-2zm-2-2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2H8zm-2 2h2v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4z\"/>",
  "message": "<path fill=\"currentColor\" d=\"M20 2H4v2h16zm0 14H6v2h14zm2-12h-2v12h2zM4 4H2v18h2zm2 14H4v2h2z\"/>",
  "thumbs-up": "<path fill=\"currentColor\" d=\"M2 12h2v8H2zm2 8h14v2H4zm14-4h2v4h-2zm2-4h2v4h-2zm-6-2h6v2h-6zm0-2h2v2h-2zm2-4h2v4h-2zm-2-2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zM8 8h2v2H8zm-4 2h4v2H4zm2 2h2v8H6z\"/>",
  "flag": "<g fill=\"currentColor\"><path d=\"M4 2h2v20H4z\"/><path d=\"M4 4h16v2H4zm12 2h2v2h-2zm-2 2h2v2h-2zm2 2h2v2h-2zM4 12h16v2H4z\"/></g>",
  "music": "<path fill=\"currentColor\" d=\"M4 12h4v2H4zm-2 2h2v4H2zm2 4h4v2H4zM8 6h2v12H8zm10 0h2v12h-2zm-6 8h2v4h-2zm2-2h4v2h-4zm0 6h4v2h-4zM10 4h8v2h-8z\"/>",
  "lightbulb": "<path fill=\"currentColor\" d=\"M9 4h6v2H9zM7 6h2v2H7zm8 0h2v2h-2zm4-2h2v2h-2zm2-2h2v2h-2zM0 10h3v2H0zm21 0h3v2h-3zM3 4h2v2H3zM1 2h2v2H1zm6 12h2v2H7zm8 0h2v2h-2zM5 8h2v6H5zm12 0h2v6h-2zm-8 8h6v2H9zm0 4h6v2H9zm0-2h2v2H9zm4 0h2v2h-2zM11 0h2v3h-2z\"/>",
  "zoom-in": "<path fill=\"currentColor\" d=\"M22 22h-2v-2h2zm-2-2h-2v-2h2zm-6-2H6v-2h8zm4 0h-2v-2h2zM6 16H4v-2h2zm10 0h-2v-2h2zM4 14H2V6h2zm7-5h3v2h-3v3H9v-3H6V9h3V6h2zm7 5h-2V6h2zM6 6H4V4h2zm10 0h-2V4h2zm-2-2H6V2h8z\"/>",
  "external-link": "<g fill=\"currentColor\"><path d=\"M11 5H5v2h6zM5 7H3v12h2zm12 12H5v2h12zm2-6h-2v6h2zm-8 0H9v2h2zm2-2h-2v2h2zm2-2h-2v2h2zm2-2h-2v2h2zm2-2h-2v2h2zm2-2h-2v8h2z\"/><path d=\"M21 3h-8v2h8z\"/></g>",
  "alert": "<path fill=\"currentColor\" d=\"M13 1h-2v2H9v2H7v2H5v2H3v2H1v2h2v2h2v2h2v2h2v2h2v2h2v-2h2v-2h2v-2h2v-2h2v-2h2v-2h-2V9h-2V7h-2V5h-2V3h-2zm0 2v2h2v2h2v2h2v2h2v2h-2v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-2H3v-2h2V9h2V7h2V5h2V3zm0 4h-2v6h2zm0 8h-2v2h2z\"/>",
} as const;
export type IconName = keyof typeof ICONS;

/** A 1em pixel icon in the current text colour. Decorative unless `label` is given. */
export function Icon({ name, label, className }: { name: IconName; label?: string; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ""}`}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
