# Admin "Nocturne" Theme — Design

**Date:** 2026-06-03
**Status:** Approved (design), pending spec review

## Goal

Apply the Nocturne theme (dark **cyan** default / light **amber** toggle) to the entire **admin** side, matching the member side, with a **unified app-wide** preference and **fully themed charts**. Pure restyle — admin behavior unchanged.

Builds on the member theme (`docs/superpowers/specs/2026-06-03-member-nocturne-theme-design.md` + the tweaks: Geist-bold display via `F_SERIF`, `accentSecs`, always-visible toggle, `tickTrack`). Reference: `demos/admin-attendance-console.html` is the *Console* demo — NOT the target; the target is the member Nocturne look applied to admin.

Scope = admin shell + ~13 page components (~15 files, ~5,900 lines). The 5 seed accounts and all admin actions stay identical.

## Approach

The `--c-*` CSS-variable tokens are already global. Promote the theme module to a **shared** location so admin and member consume one source, add the few admin-only tokens, generalize the mode hook with a **shared key + a context** (the context is needed so InsightsPage's Recharts can pick concrete colors — CSS vars don't resolve in SVG presentation attributes).

## Foundation (unified)

**1. Relocate the theme module**
- Move `components/member/theme.ts` → **`components/theme.ts`**.
- Move/rename `components/member/useMemberMode.ts` → **`components/useThemeMode.ts`** (export `useThemeMode()` → `{ mode, toggle }`, **shared localStorage key `att_theme_mode`**, default `'dark'`) and add a context:
  ```ts
  export type Mode = 'dark' | 'light';
  export const ThemeModeContext = createContext<Mode>('dark');
  ```
- Update the **member import paths** (mechanical): member shell `./theme`/`./useMemberMode` → `../theme`/`../useThemeMode`; member pages `../theme` → `../../theme`. Member behavior unchanged (default still dark; key migrates `att_member_mode` → `att_theme_mode` — acceptable, preference simply resets once).

**2. Add the 4 admin-only tokens** to `theme.ts` `C` (+ `globals.css` both modes):

| key | var | Dark | Light |
|---|---|---|---|
| btnBg | `--c-btn-bg` | `#edecf0` | `#211a12` |
| btnText | `--c-btn-text` | `#0c0d10` | `#fffdf7` |
| orange | `--c-orange` | `#f2b85c` | `#b8791a` |
| purpleBorder | `--c-purple-border` | `rgba(169,155,255,.30)` | `rgba(109,75,214,.30)` |

(`btnBg`/`btnText` = high-contrast primary button per mode; `orange` = amber semantic; `purpleBorder` mirrors the other `*Border` tokens.) `C` adds: `btnBg:'var(--c-btn-bg)'`, `btnText:'var(--c-btn-text)'`, `orange:'var(--c-orange)'`, `purpleBorder:'var(--c-purple-border)'`.

## Per-page pattern (×13 pages — same shared rules as member)

For each admin page: **(A)** remove local `const C={…}` + font consts → `import { C, F_SERIF, F_SANS, F_MONO, tickTrack } from '../../theme'` (pages) / `'../theme'` (shell, RecentDecisions); **(B)** map hardcoded literals → tokens (incl. `btnBg`/`btnText`/`orange`/`purpleBorder`; the on-accent/sidebar-bg contrast rules from member apply — never put `C.onAccent` on a non-accent background; watch the `${C.x}NN` var+hex concat trap → use soft tokens); **(C)** add `fontWeight:600` to every `fontFamily: F_SERIF` site (Geist office-bold); **(D)** `tickTrack` on fill-bars (TeamPayrollPage hours bars, LeaveBalancesPage balance bars, AttendancePage any meters) with the fill child raised `zIndex:1` and any reference marker `zIndex:2`.

## Admin shell (`AdminDashboard.tsx`)

- Import shared theme + `useThemeMode`. Set `data-mode={mode}` on the outermost wrapper. Wrap children in `<ThemeModeContext.Provider value={mode}>` (so InsightsPage can read it).
- Always-visible dark/light toggle at the sidebar bottom (member pattern: glyph-only collapsed, glyph+label expanded; not gated by `expanded`).
- `accentSecs` on the JST/Local clocks.
- Sidebar brand/name → `C.text` (legible both modes — do NOT use `C.onAccent` on `C.sidebarBg`). Keep the hover-collapse sidebar + Iconsax icons.

## Charts — InsightsPage (Recharts)

CSS-var tokens do **not** resolve in Recharts SVG attributes (`stroke`/`fill` are presentation attributes). So:
- `const mode = useContext(ThemeModeContext);`
- Define a concrete palette: `const chart = mode === 'dark' ? CHART_DARK : CHART_LIGHT;` where each holds literal hex for: `grid`, `axis`, `tick` (label), `series` array (e.g. cyan/green/amber/purple per the token hexes), and `tooltipBg`/`tooltipText`.
- Pass those literals to `<CartesianGrid stroke=…>`, axes, `<Tooltip>` content/wrapper styles, and each series `stroke`/`fill`. The page *chrome* (cards, headings) uses inline-style `C` tokens as normal.
- Palette hexes mirror the tokens: dark grid `rgba(255,255,255,.08)`, axis/tick `#9b9ba3`, series `[#54e6ff,#5fd98a,#f2b85c,#a99bff,#ff6b6b]`, tooltip bg `#131418`; light grid `rgba(40,28,8,.10)`, axis/tick `#5f574a`, series `[#0aa2c0,#157f3b,#b8791a,#6d4bd6,#c63d1f]`, tooltip bg `#fffdf7`.

## Error Handling / Edge Cases

- SSR: hook default dark; `:root` carries dark vars. Context default `'dark'`.
- Recharts: only the InsightsPage uses charts; the palette is the single place needing concrete colors.
- Contrast traps (from member): sidebar-bg text never on `C.onAccent`; static brand colors (Discord blue, if any) keep static white; `${C.x}NN` concat → soft token.

## Testing

No frontend unit runner → gate on:
- `tsc --noEmit` clean after every task.
- `next build` succeeds at the end.
- Backend `npx jest` green (no backend change; guard).
- **Visual check each admin page in BOTH modes**: shell + Attendance, Reports/Insights (charts legible in both), Approvals, Leave requests, Tardy, Discipline, Appeals, Calendar, Timesheet/Payroll, Members, Holidays, Leave balances, Policy, Audit. Confirm: contrast, accent, ticks, toggle persists, charts recolor with mode.

## Verification Before Completion

- `tsc` clean; `next build` ok; jest green.
- Toggle flips ALL admin pages cyan-dark ↔ amber-light; preference shared with member (`att_theme_mode`).
- Grep admin for leftover `#fff`/`#fafafa`/`#0a0a0a`/old status hexes/`${C.x}hex`/Instrument Serif → none (charts' concrete palette excepted).
- Member still works (import relocation didn't break it; member visual spot-check).
- Push to `origin/main`.

## Task Decomposition (for the plan)

1. Foundation: relocate theme.ts + useThemeMode (shared key + context), add 4 tokens (+ globals.css), update member import paths, member still tsc-clean.
2. `AdminDashboard.tsx` shell (data-mode, provider, toggle, accentSecs, contrast).
3. `AttendancePage.tsx`  4. `ApprovalsPage.tsx`  5. `InsightsPage.tsx` (+ chart palette)  6. `MembersPage.tsx`  7. `CalendarPage.tsx`  8. `TeamPayrollPage.tsx` (+ ticks)  9. `TardyPage.tsx`  10. `DisciplinePage.tsx`  11. `AppealsAdminPage.tsx`  12. `AuditLogPage.tsx`  13. `LeaveBalancesPage.tsx` (+ ticks)  14. `HolidaysPage.tsx`  15. `PolicyPage.tsx`  16. `RecentDecisions.tsx`
17. Verify sweep + ship.

(Pages grouped/parallelizable; InsightsPage is the heaviest.)

## Notes

- Member side already shipped (Nocturne). This unifies the theme module so both share it.
- `F_SERIF` is a misnomer (now Geist) but kept for minimal churn.
- Reference for the look: the member Nocturne pages on the deployed site.
