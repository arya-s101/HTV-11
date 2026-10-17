# BUGS.md: layout and behaviour audit (PRD v3, Change 3)

How the audit was run on 2026-10-17: an automated headless-Chrome audit (`scratchpad/smoke/audit.mjs`, not committed) played the
game-show demo preset at 375×667, 768×1024, 1280×800 and 1920×1080, at 200% zoom (640×400 CSS px at 2× DPR), with
`prefers-reduced-motion: reduce`, and at text speed "instant". It checked horizontal overflow, podium/stage overlap, tap targets under 44px,
unequal answer-button widths, text-box height shift while lines type, counter width jitter during count-up, "Why?" drawer layout shift,
and console errors and warnings. A code review against the behaviour checklist covered the rest.

## Known bugs (team)

| # | Screen / round | What's wrong | Steps to reproduce | Screenshot |
|---|---|---|---|---|
| 1 | | *(team to add anything seen on their machines)* | | |

## Audit findings

| ID | Screen | Viewport(s) | Expected | Actual | Status |
|---|---|---|---|---|---|
| A1 | Any line-by-line text (host bubble, listing text) | all | Text box reserves its final height | Answer buttons moved down 76–84px as lines typed in | Fixed: all lines render up front, untyped text is invisible, so the box keeps its final size |
| A2 | Counters (rent, area average…) | all except reduced motion | Fixed width during count-up | Width changed (e.g. 222→195px) as digits counted | Fixed: an invisible copy of the final value reserves the width; tabular figures |
| A3 | Podium bar | 375×667 | No horizontal page scroll | Podium bar 450px wide; page scrolled sideways | Fixed: podium wraps on phones; lifelines become icon buttons |
| A4 | Provenance chip | 375×667 | Short chip | "MEASURED · OCTOBER 2025 RENTAL MARKET SURVEY" forced width | Fixed: short labels such as "CMHC · Oct 2025"; full detail stays in the tooltip and source |
| A5 | Lifelines, Settings, Quit | all | Tap targets ≥ 44×44px | 32–40px tall | Fixed: minimum 44px |
| A6 | "Why? · Source" drawer | all | Opens without shifting the layout | Drawer expanded inline under the buttons (pushes content below) | Fixed: opens as an overlay dialog |
| A7 | Answer buttons | all | A second tap can't score twice | A fast double click could call `onPick` twice before re-render | Fixed: buttons lock on first pick |
| A8 | Timed rounds | all | Timer pauses when the tab is hidden | Countdown kept running in a background tab | Fixed: pauses on `visibilitychange` |
| A9 | Fonts | all | Fonts load before text appears | `next/font` default `display: swap` could flash fallback type mid-animation | Fixed: `display: block` for both fonts |
| A10 | Reveal "Next" | all | Double-tap never skips a question | "Next" appears focused; a quick double Enter could advance twice | Fixed: action buttons arm after a short delay |
| A11 | Audit tooling | n/a | n/a | "Clipped content" hits were screen-reader-only text (intentionally 1px) | Not a bug: excluded from the check |
| A12 | Console | all | No errors or warnings | None during the audited run | Pass |

A1–A10 are fixed in code (typecheck, lint and the 75 tests pass). They have not been re-audited in the browser yet.

## Re-audit after fixes

Pending: re-run the audit at all viewports after Changes 1, 2 and 4.
