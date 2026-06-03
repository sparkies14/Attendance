# Member "Nocturne" Theme — Design

**Date:** 2026-06-03
**Status:** Approved (design), pending spec review

## Goal

Re-skin the entire **member** side of the app to the "Nocturne Refined" look, with a **dark/light toggle**:
- **Dark mode (default):** cyan accent on warm charcoal — refined, technical, AI-company register.
- **Light mode:** burnt-amber accent on warm paper.
- Plus the gauge **tick pattern** on every fill-meter, Fraunces serif for display type, and the existing hover-collapse sidebar.

Pure restyle: every member action (clock in/out, break/lunch, emergency, leave request, appeals, re-clock-in, calendar, timesheet, account) keeps its exact current behavior. Validated by the standalone demos in `demos/` (nocturne-refined-modes.html is the reference).

Scope = member only (shell + 5 tabs). Admin is a later, separate effort.

## Approach

Tokens become **CSS custom properties** flipped by a `data-mode` attribute, so a single toggle recolors everything without rewriting inline styles. One shared theme module is the source of truth.

Rejected: per-file static token swap (can't support a runtime toggle); a CSS-in-JS library (unnecessary dependency).

## Architecture

**1. Fonts — `app/layout.tsx`**
Add Fraunces via `next/font/google` (`variable: '--font-fraunces'`), add its `.variable` to the `<body>` className. Geist / Geist Mono / Instrument Serif stay (admin still uses Instrument Serif).

**2. Token CSS variables — `app/globals.css`**
Define all `--c-*` tokens for both modes. Default (`:root`) mirrors dark so SSR renders correctly before hydration.
```css
:root, [data-mode="dark"] { /* dark values below */ }
[data-mode="light"] { /* light values below */ }
```

**3. Theme module — `components/member/theme.ts`** (new, single source of truth)
- `export const C` — every existing key mapped to a CSS var, e.g. `bg: 'var(--c-bg)'`, `surface: 'var(--c-surface)'`, … plus new `onAccent: 'var(--c-on-accent)'`, `brand: 'var(--c-brand)'`, `tick: 'var(--c-tick)'`.
- `export const F_SERIF = "'Fraunces', var(--font-fraunces), serif"`, `F_SANS` (Geist, unchanged), `F_MONO` (Geist Mono, unchanged).
- `export const tickTrack` — meter-track style helper:
  `{ backgroundColor: 'var(--c-surface2)', backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 8px, var(--c-tick) 8px 9px)' }`

**4. Mode state — `components/member/MemberDashboard.tsx`**
- `useMemberMode()` hook: `useState<'dark'|'light'>` initialized from `localStorage['att_member_mode']` (SSR-safe `typeof window` guard, default `'dark'`); effect persists on change.
- Apply `data-mode={mode}` to the shell's outermost div (all member UI — including the emergency modal rendered within HomePage — inherits the vars).
- A **Dark/Light toggle pill** in the sidebar footer (near the user row), reusing the demo styling.

**5. Refactor the 6 files** — remove each local `const C = {…}` and the local font consts; replace with `import { C, F_SERIF, F_SANS, F_MONO } from '../theme'` (correct relative path per file). Since tokens are now CSS vars, all existing `C.x` usages keep working and respond to mode.

**6. Fix hardcoded literals** — per file, replace literal colors with tokens:
- on-accent text `#fafafa` / `#0a0b0d` → `C.onAccent`
- the amber brand gradient `linear-gradient(135deg,#f4b942,#b45309)` → `C.brand`
- any literal `#fff` / white surfaces → `C.surface` / appropriate token

**7. Tick meters** — spread `tickTrack` into the track element of every fill-bar (HomePage: hero progress, weekly daily-hours bars, leave balance; PayrollPage: hours/period bars; plus break/lunch budget bars). Ensure the fill child sits above the ticks (`position: relative; zIndex: 1`).

## Token Values

| key | Dark (cyan) | Light (amber) |
|---|---|---|
| bg | `#0c0d10` | `#f7f1e4` |
| surface | `#131418` | `#fffdf7` |
| surface2 | `#1a1c21` | `#f1e9d7` |
| text | `#edecf0` | `#211a12` |
| text2 | `#9b9ba3` | `#5f574a` |
| text3 | `#62636b` | `#9d9582` |
| border | `rgba(255,255,255,.075)` | `rgba(40,28,8,.10)` |
| borderStrong | `rgba(255,255,255,.14)` | `rgba(40,28,8,.16)` |
| accent | `#54e6ff` | `#c2410c` |
| accentSoft | `rgba(84,230,255,.12)` | `rgba(194,65,12,.12)` |
| accentBorder | `rgba(84,230,255,.32)` | `rgba(194,65,12,.40)` |
| green | `#5fd98a` | `#157f3b` |
| greenSoft | `rgba(95,217,138,.12)` | `rgba(21,127,59,.12)` |
| greenBorder | `rgba(95,217,138,.30)` | `rgba(21,127,59,.30)` |
| red | `#ff6b6b` | `#c63d1f` |
| redSoft | `rgba(255,107,107,.12)` | `rgba(198,61,31,.10)` |
| redBorder | `rgba(255,107,107,.30)` | `rgba(198,61,31,.30)` |
| blue | `#6cb8ff` | `#1f6feb` |
| blueSoft | `rgba(108,184,255,.12)` | `rgba(31,111,235,.10)` |
| blueBorder | `rgba(108,184,255,.30)` | `rgba(31,111,235,.30)` |
| purple | `#a99bff` | `#6d4bd6` |
| purpleSoft | `rgba(169,155,255,.12)` | `rgba(109,75,214,.10)` |
| sidebarBg | `#090a0c` | `#efe6d4` |
| sidebarBorder | `rgba(255,255,255,.07)` | `rgba(40,28,8,.10)` |
| sidebarText | `#8a8a92` | `#6b6355` |
| sidebarActive | `rgba(84,230,255,.12)` | `rgba(194,65,12,.12)` |
| sidebarActiveText | `#54e6ff` | `#c2410c` |
| onAccent (new) | `#0c0d10` | `#fffdf7` |
| brand (new) | `#54e6ff` | `#c2410c` |
| tick (new) | `rgba(255,255,255,.07)` | `rgba(40,28,8,.11)` |

## Error Handling / Edge Cases

- SSR: `localStorage` read guarded; default dark. `:root` carries dark vars so the first paint is correct before hydration.
- The emergency modal (`position:fixed` inside HomePage) is within the `data-mode` subtree → inherits tokens. (If any member-side portal escaped the subtree, set `data-mode` on `document.documentElement` instead — not needed for the current tree.)
- Contrast: light-mode semantic colors are darkened (per table) so status text stays legible on paper.

## Testing

Frontend has no unit-test runner → gate on:
- `tsc --noEmit` clean after every task.
- **Visual check of each page in BOTH modes** via the running app / playwright-cli: shell, Home (all states: working, not-clocked-in, pending, rejected, done, weekend), Calendar, Leave, Timesheet, Account. Confirm: legible contrast, accent applied, tick pattern on meters, toggle persists across reload, no element stuck on a hardcoded light color.
- Backend `npx jest` stays green (no backend change expected; run once as a guard).

## Verification Before Completion

- `tsc --noEmit` clean; backend suite green.
- Toggle flips all member tabs between cyan-dark and amber-light; preference survives reload.
- No leftover hardcoded light colors (grep each file for `#fff`, `#fafafa`, `#0a0b0d`, the amber gradient).
- Push to `origin/main` (Vercel auto-deploy).

## Task Decomposition (for the plan)

1. Foundation: Fraunces font + `globals.css` tokens (both modes) + `theme.ts` module + mode hook/toggle in shell.
2. `MemberDashboard.tsx` shell refactor (import theme, data-mode, toggle, sidebar themed).
3. `HomePage.tsx` (largest — all states + tick meters).
4. `CalendarPage.tsx`.
5. `LeavePage.tsx`.
6. `PayrollPage.tsx` (+ tick meters).
7. `AccountPage.tsx`.
8. Tick-meter sweep + final both-mode visual verification.

Each page task: remove local C/fonts → import theme → fix hardcoded literals → apply tickTrack to meters → `tsc` clean → visual check in both modes.

## Notes

- Admin keeps its current look + Instrument Serif (separate future effort).
- The hover-collapse sidebar already exists; this only re-skins it via tokens.
- Reference implementation: `demos/nocturne-refined-modes.html`.
