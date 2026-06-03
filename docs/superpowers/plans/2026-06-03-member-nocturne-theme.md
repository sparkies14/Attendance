# Member Nocturne Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the entire member side to "Nocturne" with a dark(cyan)/light(amber) toggle, via centralized CSS-variable tokens. Pure restyle — no behavior changes.

**Architecture:** Tokens become CSS custom properties flipped by a `data-mode` attribute. One shared `components/member/theme.ts` maps `C.*` → `var(--c-*)`; all 6 member files import it. A `useMemberMode` hook persists the choice and the shell sets `data-mode`.

**Tech Stack:** Next.js / React 19, `next/font`, inline styles. No frontend unit tests → gate on `tsc --noEmit` + visual checks in BOTH modes.

**Spec:** `docs/superpowers/specs/2026-06-03-member-nocturne-theme-design.md`

---

## Shared rules (apply in every page task)

**A. Remove + import.** In each member file, delete the local `const C = { … };` block and the three `const F_SERIF/F_SANS/F_MONO = …` lines. Add at the top (after `'use client';` and existing imports):
- pages in `components/member/pages/`: `import { C, F_SERIF, F_SANS, F_MONO, tickTrack } from '../theme';`
- `components/member/MemberDashboard.tsx`: `import { C, F_SERIF, F_SANS, F_MONO, tickTrack } from './theme';`
(Omit `tickTrack` from the import if the file has no meter bars.)

**B. Hardcoded-literal mapping.** After importing, grep the file for literal colors and replace per this table:
| literal | replace with |
|---|---|
| `'#fafafa'` / `'#fff'` / `'#ffffff'` used as **text/icon color on an accent or dark button** | `C.onAccent` |
| `'#fff'` / `'#ffffff'` used as a **surface/background** | `C.surface` |
| `'#0a0a0a'` / `'#0a0b0d'` used as **text on a light/accent button** | `C.onAccent` |
| the brand gradient `linear-gradient(135deg, #f4b942, #b45309)` | `C.brand` |
| hardcoded status hexes in a `STATUS_COLOR`/type map (`#16a34a`,`#b45309`,`#dc2626`,`#2563eb`,`#7c3aed`) | `C.green`,`C.accent`,`C.red`,`C.blue`,`C.purple` respectively |
Leave genuinely decorative one-off colors only if they read fine in both modes; otherwise map to the nearest token. After mapping, the file must contain no `#fff`, `#fafafa`, `#0a0a0a`, `#0a0b0d`, or the amber gradient (grep to confirm).

**C. Tick meters.** For every fill-bar (a track element holding a `% width` fill child), spread `tickTrack` into the track's `style` (it sets `backgroundColor` + tick `backgroundImage`), and give the fill child `position:'relative', zIndex:1` so it sits above the ticks. Tracks are the elements currently styled with `background: C.surface2` or `background: C.border` + `overflow:hidden` that contain a `width:'X%'` bar.

**D. Gate.** End each task with `cd frontend && npx tsc --noEmit` clean, then a visual check in BOTH modes.

---

## Task 1: Foundation — font, tokens, theme module, mode hook

**Files:** Modify `app/layout.tsx`, `app/globals.css`; Create `components/member/theme.ts`, `components/member/useMemberMode.ts`.

- [ ] **Step 1: Add Fraunces font.** In `app/layout.tsx`, change the font import line to include `Fraunces`:
```tsx
import { Geist, Geist_Mono, Instrument_Serif, Fraunces } from 'next/font/google';
```
After the `instrumentSerif` definition add:
```tsx
const fraunces = Fraunces({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-fraunces', display: 'swap' });
```
Add `${fraunces.variable}` to the `<html>` className:
```tsx
    <html lang={locale} className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} ${fraunces.variable}`}>
```

- [ ] **Step 2: Define token CSS variables.** Append to `app/globals.css`:
```css
/* ── Member theme tokens (Nocturne) ── */
:root, [data-mode="dark"] {
  --c-bg:#0c0d10; --c-surface:#131418; --c-surface2:#1a1c21;
  --c-text:#edecf0; --c-text2:#9b9ba3; --c-text3:#62636b;
  --c-border:rgba(255,255,255,.075); --c-border-strong:rgba(255,255,255,.14);
  --c-accent:#54e6ff; --c-accent-soft:rgba(84,230,255,.12); --c-accent-border:rgba(84,230,255,.32);
  --c-green:#5fd98a; --c-green-soft:rgba(95,217,138,.12); --c-green-border:rgba(95,217,138,.30);
  --c-red:#ff6b6b; --c-red-soft:rgba(255,107,107,.12); --c-red-border:rgba(255,107,107,.30);
  --c-blue:#6cb8ff; --c-blue-soft:rgba(108,184,255,.12); --c-blue-border:rgba(108,184,255,.30);
  --c-purple:#a99bff; --c-purple-soft:rgba(169,155,255,.12);
  --c-sidebar-bg:#090a0c; --c-sidebar-border:rgba(255,255,255,.07); --c-sidebar-text:#8a8a92; --c-sidebar-active:rgba(84,230,255,.12); --c-sidebar-active-text:#54e6ff;
  --c-on-accent:#0c0d10; --c-brand:#54e6ff; --c-tick:rgba(255,255,255,.07);
}
[data-mode="light"] {
  --c-bg:#f7f1e4; --c-surface:#fffdf7; --c-surface2:#f1e9d7;
  --c-text:#211a12; --c-text2:#5f574a; --c-text3:#9d9582;
  --c-border:rgba(40,28,8,.10); --c-border-strong:rgba(40,28,8,.16);
  --c-accent:#c2410c; --c-accent-soft:rgba(194,65,12,.12); --c-accent-border:rgba(194,65,12,.40);
  --c-green:#157f3b; --c-green-soft:rgba(21,127,59,.12); --c-green-border:rgba(21,127,59,.30);
  --c-red:#c63d1f; --c-red-soft:rgba(198,61,31,.10); --c-red-border:rgba(198,61,31,.30);
  --c-blue:#1f6feb; --c-blue-soft:rgba(31,111,235,.10); --c-blue-border:rgba(31,111,235,.30);
  --c-purple:#6d4bd6; --c-purple-soft:rgba(109,75,214,.10);
  --c-sidebar-bg:#efe6d4; --c-sidebar-border:rgba(40,28,8,.10); --c-sidebar-text:#6b6355; --c-sidebar-active:rgba(194,65,12,.12); --c-sidebar-active-text:#c2410c;
  --c-on-accent:#fffdf7; --c-brand:#c2410c; --c-tick:rgba(40,28,8,.11);
}
```

- [ ] **Step 3: Create the theme module** `components/member/theme.ts`:
```ts
import type { CSSProperties } from 'react';

export const C = {
  bg:'var(--c-bg)', surface:'var(--c-surface)', surface2:'var(--c-surface2)',
  border:'var(--c-border)', borderStrong:'var(--c-border-strong)',
  text:'var(--c-text)', text2:'var(--c-text2)', text3:'var(--c-text3)',
  accent:'var(--c-accent)', accentSoft:'var(--c-accent-soft)', accentBorder:'var(--c-accent-border)',
  green:'var(--c-green)', greenSoft:'var(--c-green-soft)', greenBorder:'var(--c-green-border)',
  red:'var(--c-red)', redSoft:'var(--c-red-soft)', redBorder:'var(--c-red-border)',
  blue:'var(--c-blue)', blueSoft:'var(--c-blue-soft)', blueBorder:'var(--c-blue-border)',
  purple:'var(--c-purple)', purpleSoft:'var(--c-purple-soft)',
  sidebarBg:'var(--c-sidebar-bg)', sidebarBorder:'var(--c-sidebar-border)', sidebarText:'var(--c-sidebar-text)',
  sidebarActive:'var(--c-sidebar-active)', sidebarActiveText:'var(--c-sidebar-active-text)',
  onAccent:'var(--c-on-accent)', brand:'var(--c-brand)', tick:'var(--c-tick)',
} as const;

export const F_SERIF = "'Fraunces', var(--font-fraunces, 'Times New Roman'), serif";
export const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
export const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

export const tickTrack: CSSProperties = {
  backgroundColor: 'var(--c-surface2)',
  backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 8px, var(--c-tick) 8px 9px)',
};
```

- [ ] **Step 4: Create the mode hook** `components/member/useMemberMode.ts`:
```ts
'use client';
import { useState, useEffect, useCallback } from 'react';

const KEY = 'att_member_mode';
export type Mode = 'dark' | 'light';

export function useMemberMode() {
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

- [ ] **Step 5: Type-check.** `cd frontend && npx tsc --noEmit 2>&1 | tail -20` → clean.

- [ ] **Step 6: Commit.**
```bash
git add app/layout.tsx app/globals.css frontend/components/member/theme.ts frontend/components/member/useMemberMode.ts
git commit -m "feat(member): Nocturne theme foundation — Fraunces, CSS-var tokens, theme module, mode hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(Adjust paths: layout/globals are under `frontend/app/`. Stage the four files with their real paths.)

---

## Task 2: MemberDashboard shell

**Files:** Modify `frontend/components/member/MemberDashboard.tsx`

- [ ] **Step 1:** Apply shared rule **A** (remove local `C` + fonts; `import { C, F_SERIF, F_SANS, F_MONO } from './theme';`). Also `import { useMemberMode } from './useMemberMode';`.
- [ ] **Step 2:** Inside the component, add `const { mode, toggle } = useMemberMode();`. On the outermost wrapper `<div style={{ display:'flex', height:'100vh', … }}>`, add `data-mode={mode}`.
- [ ] **Step 3:** Add a Dark/Light toggle in the sidebar footer (near the user row). Use the brand square `background: C.brand` (was the amber gradient) with `color: C.onAccent`. Toggle markup:
```tsx
<button onClick={toggle} aria-label="Toggle dark / light"
  style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 10px', marginTop:8, background:C.sidebarActive, color:C.sidebarActiveText, border:`1px solid ${C.sidebarBorder}`, borderRadius:8, fontFamily:F_MONO, fontSize:10.5, letterSpacing:'0.06em', textTransform:'uppercase', cursor:'pointer' }}>
  {mode === 'dark' ? '◐ Light mode' : '◑ Dark mode'}
</button>
```
- [ ] **Step 4:** Apply shared rule **B** (fix any hardcoded literals — notably the brand gradient → `C.brand`, `#fafafa`/`#0a0a0a` → `C.onAccent`).
- [ ] **Step 5:** `cd frontend && npx tsc --noEmit` clean. Visual: shell renders dark by default; toggle flips to light; sidebar hover-expand still works in both.
- [ ] **Step 6:** Commit: `git add frontend/components/member/MemberDashboard.tsx && git commit -m "feat(member): shell uses Nocturne theme + dark/light toggle"` (with co-author trailer).

---

## Task 3: HomePage (largest)

**Files:** Modify `frontend/components/member/pages/HomePage.tsx`

- [ ] **Step 1:** Shared rule **A** (`import … from '../theme'`, include `tickTrack`).
- [ ] **Step 2:** Shared rule **B**. Specifically map the `STATUS_COLOR` object hexes: `present:C.green, late:C.accent, absent:C.red, leave:C.purple, rejected:C.red, pending:C.accent` (match existing keys; use the table). Map any `#fafafa`/`#0a0a0a` button text → `C.onAccent`. The progress-bar fill gradient `linear-gradient(90deg, ${C.accent}, ${C.green})` may stay (token-based) or simplify to `C.accent`.
- [ ] **Step 3:** Shared rule **C** — apply `tickTrack` to: the hero **progress bar** track, each **weekly daily-hours** bar track, and the **leave balance** bar track. Give each fill child `position:'relative', zIndex:1`.
- [ ] **Step 4:** `tsc` clean. Visual in BOTH modes across states: working (timer, clock-out/emergency/lunch/break buttons, progress + ticks), not-clocked-in (Clock in + auto/manual toggle), pending approval, rejected (appeal form), done (resume), weekend. Confirm the emergency modal is themed.
- [ ] **Step 5:** Commit (`feat(member): HomePage Nocturne theme + tick meters`).

---

## Task 4: CalendarPage

**Files:** Modify `frontend/components/member/pages/CalendarPage.tsx`
- [ ] Shared rule **A**, then **B** (map any hardcoded day/status/legend hexes to tokens; calendar cell state colors → green/accent/red/purple tokens). No meter bars expected (skip **C** unless a progress bar exists).
- [ ] `tsc` clean; visual in BOTH modes (recap/plan toggle, day states, plan events legible).
- [ ] Commit (`feat(member): CalendarPage Nocturne theme`).

---

## Task 5: LeavePage

**Files:** Modify `frontend/components/member/pages/LeavePage.tsx`
- [ ] Shared rule **A**, then **B** — note the leave-type color map (e.g. `sick:'#dc2626'`, etc.): map to tokens (`sick:C.red, vacation:C.blue, personal:C.purple, emergency:C.accent, other:C.text3` — match existing keys). Fix the `+ Request leave` button text-on-accent → `C.onAccent`.
- [ ] Shared rule **C** if a leave-balance meter exists here (apply `tickTrack`).
- [ ] `tsc` clean; visual in BOTH modes (list, cancel pending, appeal rejected, new request form).
- [ ] Commit (`feat(member): LeavePage Nocturne theme`).

---

## Task 6: PayrollPage (Timesheet)

**Files:** Modify `frontend/components/member/pages/PayrollPage.tsx`
- [ ] Shared rule **A**, then **B**.
- [ ] Shared rule **C** — apply `tickTrack` to the hours/period bars and any progress meters.
- [ ] `tsc` clean; visual in BOTH modes (timesheet, "show all" ledger toggle, the `days left` chip, period bars + ticks).
- [ ] Commit (`feat(member): PayrollPage Nocturne theme + tick meters`).

---

## Task 7: AccountPage

**Files:** Modify `frontend/components/member/pages/AccountPage.tsx`
- [ ] Shared rule **A**, then **B** (security/link buttons text-on-accent → `C.onAccent`; brand/avatar bits → tokens).
- [ ] `tsc` clean; visual in BOTH modes (profile, password change, link Google/Discord, country).
- [ ] Commit (`feat(member): AccountPage Nocturne theme`).

---

## Task 8: Verification sweep + ship

- [ ] **Step 1: Leftover-literal grep.** From `frontend/`:
```bash
grep -rnE "#fff(f|fff)?\b|#fafafa|#0a0a0a|#0a0b0d|135deg, ?#f4b942" components/member/ || echo "CLEAN"
```
Expected: `CLEAN` (any remaining hit must be justified — e.g. inside an SVG that should stay fixed — otherwise map it to a token).
- [ ] **Step 2: Type-check.** `cd frontend && npx tsc --noEmit` → clean.
- [ ] **Step 3: Backend guard.** From repo root: `npx jest 2>&1 | tail -5` → all pass (no backend change expected).
- [ ] **Step 4: Full visual pass.** Run the app (or playwright-cli) and walk every member tab in BOTH modes; confirm: legible contrast everywhere, accent + tick meters correct, toggle persists across reload, hover sidebar works, nothing stuck light.
- [ ] **Step 5: Merge + push** to `origin/main` (Vercel auto-deploys).

---

## Verification Before Completion
- `tsc --noEmit` clean; `npx jest` green; leftover-literal grep CLEAN.
- Member tabs flip cyan-dark ↔ amber-light via the toggle; preference survives reload; all member actions behave exactly as before.

## Notes
- Admin is untouched (keeps Instrument Serif + current look).
- Reference: `demos/nocturne-refined-modes.html`.
- The hover-collapse sidebar already exists; it only gets re-skinned via tokens.
