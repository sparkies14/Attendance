# Sidebar Icons + Collapsible Sidebar — Design

**Date:** 2026-06-02
**Status:** Approved (design), pending spec review

## Problem

Two related sidebar improvements:

1. **Icons.** Both the member and admin sidebars render nav icons as single text glyphs (e.g. `◉ ▦ ⌇ ¥ ○`). The user added an `Iconsax` folder (`F:\Attendance\Iconsax`, i.e. `/mnt/f/Attendance/Iconsax`) with 4 real Iconsax **bold/filled** SVGs — `Home.svg`, `Calendar.svg`, `TImesheet.svg`, `Setting.svg` (24×24, `fill="#fff"`). They want these used across both UIs, a **door** icon for "Leave", and the remaining admin items given matching Iconsax-style icons so the whole set is consistent and monochrome (black/white).

2. **Collapsible sidebar.** Both sidebars should default to **icons-only (collapsed)**; **hovering** the sidebar expands it to show labels as a **floating overlay** (page content does not reflow); a **lock/pin** keeps it expanded permanently, and the lock state **persists** across reloads.

3. **Label.** The admin nav item "Payroll" is renamed to **"Timesheet"** (label only; route/component `TeamPayrollPage` unchanged) to match the member side and the Timesheet icon.

## Current Structure (confirmed)

- Member nav: `NAV` array in `MemberDashboard.tsx` (`{ id, label, icon: string }`), rendered as a button with `<span>{icon}</span><span>{label}</span>`. 5 items: home, calendar, leave, payroll, account.
- Admin nav: `NAV_GROUPS` in `AdminDashboard.tsx` (4 groups, 14 items, `{ id, label, icon: string, badge }`), rendered similarly with an optional badge.
- Both dashboards: flex row `[<aside fixed-width> ][<main flex:1>]`, `height:100vh; overflow:hidden`. Admin aside is `width:232, flexShrink:0`.

## Approach

**Icons — a local inline icon set.** New module `frontend/components/icons/NavIcons.tsx` exports one component per icon (24×24, `fill="currentColor"`, accepting a `size` prop). It contains the 4 provided Iconsax SVGs verbatim (with `fill="#fff"` → `fill="currentColor"`, hardcoded `width/height` → `size` prop, unique clipPath ids) plus a door and the 9 remaining admin icons authored in the Iconsax bold style. `currentColor` makes each icon inherit the nav button's text color, so it is monochrome and follows the existing active (dark) / inactive (grey) states for free. This module is the single swap point: real Iconsax SVGs dropped in later replace the authored ones with a paste.

Rejected: `iconsax-react` (v0.0.8, predates React 19 → install risk, and Iconsax has no door icon anyway); `public/` SVG via CSS mask (only the 4, fragile).

**Collapse — a shared hook.** New `frontend/components/hooks/useSidebarCollapse.ts` encapsulates the collapse state so both dashboards stay DRY: it returns `{ expanded, locked, toggleLock, hoverProps }` and the width constants. State: `locked` (persisted in `localStorage`, key `att_sidebar_locked`, SSR-safe init) and `hovered`; `expanded = locked || hovered`. Each dashboard applies widths/visibility from `expanded`.

## Components & Data Flow

### 1. `frontend/components/icons/NavIcons.tsx` (new)
- Exports: `HomeIcon, CalendarIcon, TimesheetIcon, SettingIcon, DoorIcon, ReportsIcon, ApprovalsIcon, TardyIcon, DisciplineIcon, AppealsIcon, MembersIcon, HolidaysIcon, LeaveBalancesIcon, AuditIcon`.
- Each: `function XIcon({ size = 16 }: { size?: number }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>…</svg>); }`
- Home/Calendar/Timesheet/Setting use the exact path data from the provided files. Door + the 9 admin icons are authored filled 24×24 paths matching the bold style.

### 2. `frontend/components/hooks/useSidebarCollapse.ts` (new)
- `COLLAPSED_W = 64`, `EXPANDED_W` = each dashboard's current full width (member: its current sidebar width; admin: 232).
- `locked` initialized from `localStorage.getItem('att_sidebar_locked') === '1'` guarded by `typeof window !== 'undefined'` (default unlocked/collapsed).
- `toggleLock()` flips `locked` and writes localStorage.
- `hoverProps = { onMouseEnter, onMouseLeave }` set `hovered`.
- Returns `{ expanded, locked, toggleLock, hoverProps, COLLAPSED_W, EXPANDED_W }`.

### 3. Member (`MemberDashboard.tsx`) & Admin (`AdminDashboard.tsx`)
- Change `icon: string` → `icon: React.ComponentType<{ size?: number }>` in the nav config; set each item's icon to the imported component (admin: map all 14; member: all 5). Admin "Payroll" label → "Timesheet".
- Render: replace `<span>{icon}</span>` with `<span style={{…flexShrink:0…}}><Icon size={18} /></span>`, keeping the colored wrapper so `currentColor` themes it. Render the label `<span>` with `opacity: expanded ? 1 : 0; whiteSpace: nowrap` and badges only when `expanded` (badge can show as a dot when collapsed — keep simple: hide numeric badge when collapsed). Group headings (admin) and brand text / footer (clocks, user row) hidden when collapsed.
- Layout: the `<aside>` reserves `locked ? EXPANDED_W : COLLAPSED_W` in the flex row. Its inner panel is `position:absolute; top:0; bottom:0; left:0; width: expanded ? EXPANDED_W : COLLAPSED_W; overflow:hidden; transition: width .18s ease; zIndex:50` so hover expansion **overlays** the main content (no reflow); when locked, reserve and panel widths match (no overlay). Attach `hoverProps` to the aside.
- Lock control: a small pin button in the sidebar (top near brand or bottom), `aria-label="Lock sidebar open" / "Unlock sidebar"`, calls `toggleLock()`; its filled/outline state reflects `locked`. Visible when expanded (and as an icon when collapsed if space allows).

## Error Handling / Edge Cases

- SSR: `localStorage` read guarded by `typeof window` check in the hook's lazy initializer (default `false`).
- Desktop-only app (mobile is a separate roadmap item) — no mobile breakpoint handling here.
- Hover expansion is pointer-only; the lock provides a persistent, click-accessible alternative.

## Testing

- `tsc --noEmit` clean (frontend has no unit-test runner).
- Visual (playwright-cli): both sidebars show icons-only collapsed; hovering expands as an overlay without shifting content; clicking the lock keeps it expanded and persists across reload; the Leave item shows the door icon; admin item reads "Timesheet".

## Verification Before Completion

- `tsc --noEmit` clean.
- Manual: icons render monochrome and follow active/inactive color; collapse/hover/lock work in both UIs; lock survives reload; no content reflow on hover.
- Push to `origin/main` (Vercel + Render auto-deploy).

## Notes / Open Detail

- The door + 9 admin icons are **authored to match** the Iconsax bold style, not guaranteed pixel-identical to official Iconsax vectors (can't be fetched reliably in this environment). Dropping official SVGs into `F:\Attendance\Iconsax` later lets them be swapped into `NavIcons.tsx` trivially.
- Member sidebar's exact current width and footer markup to be read during implementation; `EXPANDED_W` for member = its existing width.
