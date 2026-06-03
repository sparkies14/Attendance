# Admin Nocturne Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Nocturne theme (dark cyan / light amber toggle) to the admin side, sharing one theme module with member, with fully themed charts. Pure restyle.

**Architecture:** Promote the theme module + mode hook to `components/` (shared), add 4 admin tokens, add a `ThemeModeContext` (so Recharts can pick concrete colors). Each admin file imports the shared theme and follows the same swap pattern proven on member.

**Tech Stack:** Next.js/React 19, inline styles, Recharts. Gate: `tsc --noEmit` + `next build` + both-mode visual; `jest` guard.

**Spec:** `docs/superpowers/specs/2026-06-03-admin-nocturne-theme-design.md`

---

## Shared rules (every page task)

**A. Import.** Remove the file's local `const C = {…}` block and its `F_SERIF/F_SANS/F_MONO` consts. Add `import { C, F_SERIF, F_SANS, F_MONO, tickTrack } from '../../theme';` (admin pages in `components/admin/pages/`) or `'../theme'` (admin shell + `components/admin/RecentDecisions.tsx`). Omit `tickTrack` if no meter bars.

**B. Literal → token map** (grep the file for these and replace):
| literal | token |
|---|---|
| on-accent/dark-button text `#fafafa`/`#fff` | `C.btnText` (if on a button bg) or `C.onAccent` (on accent bg) |
| dark primary button bg `#0a0a0a`/`#111` | `C.btnBg` |
| white surface `#fff`/`#ffffff` | `C.surface` |
| status `#16a34a`/`#b45309`/`#dc2626`/`#2563eb`/`#7c3aed` | `C.green`/`C.accent`/`C.red`/`C.blue`/`C.purple` |
| amber/orange `#f4b942`/`#f59e0b` | `C.orange` |
| purple borders `rgba(124,58,237,…)` | `C.purpleBorder` |
| brand gradient `linear-gradient(135deg,#f4b942,#b45309)` | `C.brand` |
**Traps:** never put `C.onAccent` on a non-accent background (it's invisible on `C.sidebarBg`/`C.surface` — use `C.text`); `${C.x}NN` hex concat is INVALID now (use the soft token, e.g. `${C.green}44`→`C.greenSoft`); static brand colors (Discord `#5865F2`) keep static white. After mapping, grep must show no `#fff`/`#fafafa`/`#0a0a0a`/status hexes/`${C.[a-z]+}[0-9a-f]{2}` (charts' concrete palette excepted).

**C. Office-bold weight.** `sed -i 's/fontFamily: F_SERIF,/fontFamily: F_SERIF, fontWeight: 600,/g' <file>`, then grep for any `F_SERIF }` (last prop) and add the weight manually. Verify no `fontWeight: 600, fontWeight:` duplicates.

**D. Tick meters.** Spread `...tickTrack` into each fill-bar track; fill child gets `position:'relative', zIndex:1`; any reference marker gets `zIndex:2`.

**E. Gate.** `cd frontend && npx tsc --noEmit` clean, then visual check in BOTH modes.

---

## Task 1: Foundation — relocate shared theme + tokens + hook + context

**Files:** Create `frontend/components/theme.ts`, `frontend/components/useThemeMode.ts`; delete `frontend/components/member/theme.ts`, `frontend/components/member/useMemberMode.ts`; modify `frontend/app/globals.css` + 6 member imports.

- [ ] **Step 1: Create `frontend/components/theme.ts`** (moved from member, + 4 admin tokens):
```ts
import type { CSSProperties } from 'react';
import { createElement, Fragment, type ReactNode } from 'react';

export const C = {
  bg:'var(--c-bg)', surface:'var(--c-surface)', surface2:'var(--c-surface2)',
  border:'var(--c-border)', borderStrong:'var(--c-border-strong)',
  text:'var(--c-text)', text2:'var(--c-text2)', text3:'var(--c-text3)',
  accent:'var(--c-accent)', accentSoft:'var(--c-accent-soft)', accentBorder:'var(--c-accent-border)',
  green:'var(--c-green)', greenSoft:'var(--c-green-soft)', greenBorder:'var(--c-green-border)',
  red:'var(--c-red)', redSoft:'var(--c-red-soft)', redBorder:'var(--c-red-border)',
  blue:'var(--c-blue)', blueSoft:'var(--c-blue-soft)', blueBorder:'var(--c-blue-border)',
  purple:'var(--c-purple)', purpleSoft:'var(--c-purple-soft)', purpleBorder:'var(--c-purple-border)',
  orange:'var(--c-orange)',
  btnBg:'var(--c-btn-bg)', btnText:'var(--c-btn-text)',
  sidebarBg:'var(--c-sidebar-bg)', sidebarBorder:'var(--c-sidebar-border)', sidebarText:'var(--c-sidebar-text)',
  sidebarActive:'var(--c-sidebar-active)', sidebarActiveText:'var(--c-sidebar-active-text)',
  onAccent:'var(--c-on-accent)', brand:'var(--c-brand)', tick:'var(--c-tick)',
} as const;

export const F_SERIF = "'Geist', var(--font-geist, -apple-system), system-ui, sans-serif";
export const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
export const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

export const tickTrack: CSSProperties = {
  backgroundColor: 'var(--c-surface2)',
  backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 8px, var(--c-tick) 8px 9px)',
};

export function accentSecs(time: string): ReactNode {
  const i = time.lastIndexOf(':');
  if (i < 0) return time;
  return createElement(Fragment, null, time.slice(0, i), createElement('span', { style: { color: 'var(--c-accent)' } }, time.slice(i)));
}
```

- [ ] **Step 2: Create `frontend/components/useThemeMode.ts`** (generalized + context + shared key):
```ts
'use client';
import { useState, useEffect, useCallback, createContext } from 'react';

const KEY = 'att_theme_mode';
export type Mode = 'dark' | 'light';
export const ThemeModeContext = createContext<Mode>('dark');

export function useThemeMode() {
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (window.localStorage.getItem(KEY) as Mode) === 'light' ? 'light' : 'dark';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, mode);
  }, [mode]);
  const toggle = useCallback(() => setMode(m => (m === 'dark' ? 'light' : 'dark')), []);
  return { mode, toggle };
}
```

- [ ] **Step 3: Add the 4 tokens to `frontend/app/globals.css`.** In the `:root, [data-mode="dark"]` block add:
```css
  --c-btn-bg:#edecf0; --c-btn-text:#0c0d10; --c-orange:#f2b85c; --c-purple-border:rgba(169,155,255,.30);
```
In the `[data-mode="light"]` block add:
```css
  --c-btn-bg:#211a12; --c-btn-text:#fffdf7; --c-orange:#b8791a; --c-purple-border:rgba(109,75,214,.30);
```

- [ ] **Step 4: Delete the old member modules + update member imports.**
```bash
git rm frontend/components/member/theme.ts frontend/components/member/useMemberMode.ts
```
Update these member imports:
- `components/member/MemberDashboard.tsx`: `from './theme'` → `from '../theme'`; replace `import { useMemberMode } from './useMemberMode';` → `import { useThemeMode } from '../useThemeMode';` and the call `useMemberMode()` → `useThemeMode()`.
- `components/member/pages/HomePage.tsx`, `LeavePage.tsx`, `AccountPage.tsx`, `CalendarPage.tsx`, `PayrollPage.tsx`: `from '../theme'` → `from '../../theme'`.

- [ ] **Step 5: Type-check (member must stay clean).** `cd frontend && npx tsc --noEmit 2>&1 | tail -20` → clean.

- [ ] **Step 6: Commit.**
```bash
git add frontend/components/theme.ts frontend/components/useThemeMode.ts frontend/app/globals.css frontend/components/member/
git commit -m "refactor(theme): relocate to shared components/theme + useThemeMode (unified key), add admin tokens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: AdminDashboard shell

**Files:** Modify `frontend/components/admin/AdminDashboard.tsx`

- [ ] Read the file. Apply shared rule **A** with import `from '../theme'`; also `import { useThemeMode, ThemeModeContext } from '../useThemeMode';`.
- [ ] `const { mode, toggle } = useThemeMode();`; `data-mode={mode}` on the outermost wrapper div; wrap the page-content subtree in `<ThemeModeContext.Provider value={mode}> … </ThemeModeContext.Provider>` (so InsightsPage can read it).
- [ ] Apply shared rule **B** — map literals; brand square gradient → `C.brand` (inner letter → `C.onAccent`); **sidebar brand text + user name → `C.text`** (NOT `C.onAccent`).
- [ ] `accentSecs` on the JST + Local clock displays (wrap their time strings).
- [ ] Add the always-visible dark/light toggle in the sidebar footer (member pattern): not gated by `expanded`; glyph-only collapsed, glyph+label expanded:
```tsx
<button onClick={toggle} aria-label="Toggle dark / light"
  style={{ display:'flex', alignItems:'center', justifyContent: expanded ? 'flex-start' : 'center', gap:8, width:'100%', padding:'8px 10px', background:C.sidebarActive, color:C.sidebarActiveText, border:`1px solid ${C.sidebarBorder}`, borderRadius:8, fontFamily:F_MONO, fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase', cursor:'pointer' }}>
  <span style={{ fontSize:13, lineHeight:1 }}>{mode === 'dark' ? '☀' : '☾'}</span>
  {expanded && <span>{mode === 'dark' ? 'Light' : 'Dark'}</span>}
</button>
```
(Use the admin shell's actual collapse variable name if it differs from `expanded`.)
- [ ] Apply shared rule **C** (Geist-bold weight). Keep the hover-collapse sidebar + Iconsax icons untouched.
- [ ] `tsc` clean; visual both modes (sidebar legible, toggle works collapsed+expanded, clocks' seconds accent). Commit: `style(admin): shell Nocturne theme + toggle + accent clocks`.

---

## Tasks 3–16: Admin pages (one per file)

For EACH file below, apply shared rules **A → B → C → D**, `tsc` clean, visual both modes, then commit `style(admin): <Page> Nocturne theme`. Import path `'../../theme'` (pages) or `'../theme'` (RecentDecisions).

- [ ] **Task 3: `pages/AttendancePage.tsx`** (live-status dashboard; has stat cards, panels, the lunch/break + emergency panels, week table — map all status colors; tick any meter bars).
- [ ] **Task 4: `pages/ApprovalsPage.tsx`** (large; pending lists, approve/reject buttons → `C.btnBg`/`C.btnText`).
- [ ] **Task 5: `pages/InsightsPage.tsx`** (Reports — see Charts sub-steps below).
- [ ] **Task 6: `pages/MembersPage.tsx`** (table, status pills, activate/promote buttons).
- [ ] **Task 7: `pages/CalendarPage.tsx`** (admin calendar; mirror member CalendarPage mapping — watch the today-cell contrast trap: text on `C.text` bg → `C.onAccent`).
- [ ] **Task 8: `pages/TeamPayrollPage.tsx`** (+ tick meters on hours bars).
- [ ] **Task 9: `pages/TardyPage.tsx`**.
- [ ] **Task 10: `pages/DisciplinePage.tsx`**.
- [ ] **Task 11: `pages/AppealsAdminPage.tsx`**.
- [ ] **Task 12: `pages/AuditLogPage.tsx`**.
- [ ] **Task 13: `pages/LeaveBalancesPage.tsx`** (+ tick meters on balance bars).
- [ ] **Task 14: `pages/HolidaysPage.tsx`**.
- [ ] **Task 15: `pages/PolicyPage.tsx`** (the toggle + threshold form; buttons → btn tokens).
- [ ] **Task 16: `RecentDecisions.tsx`** (import `'../theme'`).

### Task 5 — InsightsPage charts (extra sub-steps)

After rules A–C on the page chrome:
- [ ] `import { useContext } from 'react';` + `import { ThemeModeContext } from '../../useThemeMode';`; `const mode = useContext(ThemeModeContext);`
- [ ] Define mode-aware palettes (concrete hex — CSS vars don't resolve in Recharts SVG attrs):
```ts
const CHART = mode === 'dark'
  ? { grid:'rgba(255,255,255,.08)', axis:'#9b9ba3', series:['#54e6ff','#5fd98a','#f2b85c','#a99bff','#ff6b6b'], tipBg:'#131418', tipText:'#edecf0', tipBorder:'rgba(255,255,255,.14)' }
  : { grid:'rgba(40,28,8,.10)',   axis:'#5f574a', series:['#0aa2c0','#157f3b','#b8791a','#6d4bd6','#c63d1f'], tipBg:'#fffdf7', tipText:'#211a12', tipBorder:'rgba(40,28,8,.16)' };
```
- [ ] Replace every Recharts color prop with `CHART.*`: `<CartesianGrid stroke={CHART.grid}/>`, `<XAxis stroke={CHART.axis} tick={{ fill: CHART.axis }}/>` (and YAxis), each `<Line stroke={CHART.series[i]}/>` / `<Bar fill={CHART.series[i]}/>` / `<Area>`/`<Pie>` cells, and `<Tooltip contentStyle={{ background: CHART.tipBg, border:`1px solid ${CHART.tipBorder}`, color: CHART.tipText }} labelStyle={{ color: CHART.tipText }} itemStyle={{ color: CHART.tipText }}/>`. No hardcoded chart hex remains.
- [ ] Visual: charts legible and recolor when toggling dark/light.

---

## Task 17: Verify sweep + ship

- [ ] **Leftover-literal grep** (charts palette excepted) from `frontend/`:
```bash
grep -rnE "#fff(f|fff)?\b|#fafafa|#0a0a0a|#16a34a|#b45309|#dc2626|135deg, ?#f4b942|Instrument Serif|\\\$\{C\.[a-zA-Z0-9]+\}[0-9a-fA-F]{2}" components/admin/ | grep -viE "5865F2|CHART_|series:\[|chart" || echo "CLEAN"
```
- [ ] **F_SERIF weight:** `grep -rn "fontFamily: F_SERIF" components/admin/ | grep -vc "fontWeight: 600"` → 0.
- [ ] **tsc:** `cd frontend && npx tsc --noEmit` → clean.
- [ ] **Build:** `npx next build` → succeeds.
- [ ] **Backend guard:** `npx jest 2>&1 | tail -5` → green.
- [ ] **Member regression:** spot-check a member page still renders (relocation didn't break imports).
- [ ] **Full visual pass:** every admin page in BOTH modes (shell, Attendance, Reports/charts, Approvals, Leave, Tardy, Discipline, Appeals, Calendar, Payroll, Members, Holidays, Leave balances, Policy, Audit) — contrast, accent, ticks, toggle persists, charts recolor.
- [ ] **Merge + push** to `origin/main`.

---

## Verification Before Completion
- tsc clean; `next build` ok; jest green; leftover-literal grep CLEAN; F_SERIF weight 0 missing.
- Admin flips cyan-dark ↔ amber-light; preference shared with member (`att_theme_mode`); charts recolor.
- Member side unaffected.

## Notes
- `F_SERIF` is now Geist (kept name for low churn).
- The member key changes `att_member_mode` → `att_theme_mode`; existing member preference resets once to dark (acceptable).
- Reference look: the deployed member Nocturne pages.
