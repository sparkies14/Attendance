# Sidebar Icons + Collapsible Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace text-glyph nav icons with an Iconsax-style inline SVG set (door for Leave) across member + admin sidebars, rename admin "Payroll" → "Timesheet", and make both sidebars collapse to icons-only with hover-overlay expand and a persisted lock.

**Architecture:** A shared inline icon module (`NavIcons.tsx`, `fill="currentColor"`) and a shared collapse hook (`useSidebarCollapse.ts`). Each dashboard imports both: nav configs reference icon components; the `<aside>` reserves collapsed/locked width while an absolutely-positioned inner panel expands on hover (overlay, no reflow).

**Tech Stack:** Next.js / React 19, inline styles. Frontend has no unit-test runner — gate on `tsc --noEmit` + playwright-cli visual checks.

**Spec:** `docs/superpowers/specs/2026-06-02-sidebar-icons-and-collapse-design.md`

---

## File Structure

- **Create** `frontend/components/icons/NavIcons.tsx` — all nav icon components + `PinIcon`.
- **Create** `frontend/components/hooks/useSidebarCollapse.ts` — collapse state + persistence.
- **Modify** `frontend/components/member/MemberDashboard.tsx` — icons + collapse.
- **Modify** `frontend/components/admin/AdminDashboard.tsx` — icons + collapse + label rename.

---

## Task 1: Icon module `NavIcons.tsx`

**Files:** Create `frontend/components/icons/NavIcons.tsx`

- [ ] **Step 1: Inline the 4 provided Iconsax SVGs.**

Read the 4 files in `/mnt/f/Attendance/Iconsax/` (`Home.svg`, `Calendar.svg`, `TImesheet.svg`, `Setting.svg`). For each, create a component that returns the file's `<svg>` with these transformations: `width`/`height` → `{size}`, root `fill="#fff"` → `fill="currentColor"`, add `aria-hidden`, and rename any `clipPath` `id` (and its `url(#…)` reference) to a unique per-icon id (e.g. `home_clip`, `cal_clip`, `ts_clip`, `set_clip`) to avoid DOM id collisions. `Home.svg` is shown fully as the worked example:

```tsx
export function HomeIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#home_clip)">
        <path d="M12.7 16.8798H13.4C14.55 16.8798 15.49 15.9398 15.49 14.7898V14.0898H12.7V16.8798Z"/>
        <path d="M8.51001 14.7898C8.51001 15.9398 9.45001 16.8798 10.6 16.8798H11.3V14.0898H8.51001V14.7898Z"/>
        <path d="M8.51001 12.0002V12.7002H11.3V9.91016H10.6C9.45001 9.91016 8.51001 10.8502 8.51001 12.0002Z"/>
        <path d="M20.03 6.81969L14.28 2.78969C12.71 1.68969 10.31 1.74969 8.8 2.91969L3.79 6.82969C2.78 7.60969 2 9.20969 2 10.4697V17.3697C2 19.9197 4.07 21.9997 6.61 21.9997H17.38C19.92 21.9997 21.99 19.9297 21.99 17.3797V10.5997C22 9.24969 21.13 7.58969 20.03 6.81969ZM16.88 14.7897C16.88 16.7097 15.31 18.2797 13.39 18.2797H10.6C8.68 18.2797 7.11 16.7197 7.11 14.7897V11.9997C7.11 10.0797 8.68 8.50969 10.6 8.50969H13.39C15.31 8.50969 16.88 10.0697 16.88 11.9997V14.7897Z"/>
        <path d="M13.4 9.91016H12.7V12.7002H15.49V12.0002C15.49 10.8502 14.55 9.91016 13.4 9.91016Z"/>
      </g>
      <defs><clipPath id="home_clip"><rect width="24" height="24" fill="white"/></clipPath></defs>
    </svg>
  );
}
```

Create `CalendarIcon`, `TimesheetIcon` (from `TImesheet.svg`), `SettingIcon` the same way using their files' path data and unique clip ids.

- [ ] **Step 2: Add the door + 9 authored admin icons + pin.**

At the top of the file:
```tsx
import React from 'react';
export interface IconProps { size?: number }
```
Add these components (filled 24×24, `fill="currentColor"`; holes use `fillRule="evenodd"`):

```tsx
export function DoorIcon({ size = 18 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path fillRule="evenodd" clipRule="evenodd" d="M5 3.5C5 2.67 5.67 2 6.5 2H15.5C16.33 2 17 2.67 17 3.5V20.5C17 21.33 16.33 22 15.5 22H6.5C5.67 22 5 21.33 5 20.5V3.5ZM13.5 12C14.05 12 14.5 11.55 14.5 11C14.5 10.45 14.05 10 13.5 10C12.95 10 12.5 10.45 12.5 11C12.5 11.55 12.95 12 13.5 12Z"/></svg>);
}
export function ReportsIcon({ size = 18 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3 19.25h18a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1 0-1.5Z"/><rect x="4.5" y="10" width="3.2" height="7" rx="1"/><rect x="10.4" y="5.5" width="3.2" height="11.5" rx="1"/><rect x="16.3" y="13" width="3.2" height="4" rx="1"/></svg>);
}
export function ApprovalsIcon({ size = 18 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M9.55 17.2 4.4 12.05l1.8-1.8 3.35 3.35L17.8 5.35l1.8 1.8-9.85 10.05Z"/></svg>);
}
export function TardyIcon({ size = 18 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path fillRule="evenodd" clipRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 4.75a1 1 0 1 0-2 0V12c0 .27.11.52.3.71l3 3 1.4-1.42L13 11.59V6.75Z"/></svg>);
}
export function DisciplineIcon({ size = 18 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M5 2a1 1 0 0 1 1 1v18a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Z"/><path d="M7 3.5h10.6c.83 0 1.25.97.69 1.58L16 8l2.29 2.92c.56.61.14 1.58-.69 1.58H7v-9Z"/></svg>);
}
export function AppealsIcon({ size = 18 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 4.5V1.5L7.5 6 12 10.5V7a5 5 0 1 1-5 5H4.5a7.5 7.5 0 1 0 7.5-7.5Z"/></svg>);
}
export function MembersIcon({ size = 18 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M9 11.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Zm0 1.4c-3.1 0-6 1.55-6 4.3V19.5h12v-2.6c0-2.75-2.9-4.3-6-4.3Z"/><path d="M16.7 11a3 3 0 1 0-1.9-5.32 4.6 4.6 0 0 1 0 5.04c.55.18 1.18.28 1.9.28Z"/><path d="M17.2 12.5c1.95.25 3.8 1.4 3.8 3.5V18.5h-2.5v-1.6c0-1.7-.55-3.05-1.45-4.1.05-.1.1-.2.15-.3Z"/></svg>);
}
export function HolidaysIcon({ size = 18 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2.5l2.7 5.47 6.05.88-4.38 4.27 1.03 6.02L12 16.78l-5.4 2.84 1.03-6.02L3.25 8.85l6.05-.88L12 2.5Z"/></svg>);
}
export function LeaveBalancesIcon({ size = 18 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4 8a3 3 0 0 1 3-3h10.5a1.5 1.5 0 0 1 0 3H7a1 1 0 1 0 0 2h11a2 2 0 0 1 2 2v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8Z"/></svg>);
}
export function AuditIcon({ size = 18 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path fillRule="evenodd" clipRule="evenodd" d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm2.5 9a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7Zm0 3.5a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7Z"/></svg>);
}
export function PinIcon({ size = 16 }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M9 2h6a1 1 0 0 1 .78 1.63L14.5 5.25V10l2.6 2.6A1 1 0 0 1 16.4 14.3H13v6a1 1 0 1 1-2 0v-6H7.6a1 1 0 0 1-.7-1.7L9.5 10V5.25L8.22 3.63A1 1 0 0 1 9 2Z"/></svg>);
}
```

- [ ] **Step 3: Type-check.** Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20` → clean.

- [ ] **Step 4: Commit.**
```bash
git add frontend/components/icons/NavIcons.tsx
git commit -m "feat: inline Iconsax-style nav icon set (NavIcons)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Collapse hook `useSidebarCollapse.ts`

**Files:** Create `frontend/components/hooks/useSidebarCollapse.ts`

- [ ] **Step 1: Write the hook.**
```ts
'use client';
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'att_sidebar_locked';
export const COLLAPSED_W = 64;

export function useSidebarCollapse(expandedW: number) {
  const [locked, setLocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });
  const [hovered, setHovered] = useState(false);

  const toggleLock = useCallback(() => {
    setLocked(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const hoverProps = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };

  return { expanded: locked || hovered, locked, toggleLock, hoverProps, COLLAPSED_W, EXPANDED_W: expandedW };
}
```

- [ ] **Step 2: Type-check.** Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20` → clean.

- [ ] **Step 3: Commit.**
```bash
git add frontend/components/hooks/useSidebarCollapse.ts
git commit -m "feat: useSidebarCollapse hook (hover-expand + persisted lock)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Member sidebar — icons + collapse

**Files:** Modify `frontend/components/member/MemberDashboard.tsx`

- [ ] **Step 1: Imports.** Add near the other imports (top of file):
```tsx
import { useSidebarCollapse, COLLAPSED_W } from '../hooks/useSidebarCollapse';
import { HomeIcon, CalendarIcon, DoorIcon, TimesheetIcon, SettingIcon, PinIcon } from '../icons/NavIcons';
import type { ComponentType } from 'react';
```

- [ ] **Step 2: Nav config → icon components.** Replace the `NAV` definition (currently lines 114-119):
```tsx
const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'home',     label: 'Home',         icon: '◉' },
  { id: 'calendar', label: 'Calendar · plan', icon: '▦' },
  { id: 'leave',    label: 'Leave history', icon: '⌇' },
  { id: 'payroll',  label: 'Timesheet',    icon: '¥' },
  { id: 'account',  label: 'Account',      icon: '○' },
];
```
with:
```tsx
const NAV: { id: Page; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'home',     label: 'Home',            icon: HomeIcon },
  { id: 'calendar', label: 'Calendar · plan', icon: CalendarIcon },
  { id: 'leave',    label: 'Leave history',   icon: DoorIcon },
  { id: 'payroll',  label: 'Timesheet',       icon: TimesheetIcon },
  { id: 'account',  label: 'Account',         icon: SettingIcon },
];
```

- [ ] **Step 3: Call the hook.** Inside the component, near the top (after the existing hooks/derived values, before the `return`), add:
```tsx
  const { expanded, locked, toggleLock, hoverProps, EXPANDED_W } = useSidebarCollapse(220);
```

- [ ] **Step 4: Make the aside a reservation box + overlay panel.** Replace the `<aside ...>` opening tag (currently line 175):
```tsx
      <aside style={{ width: 220, flexShrink: 0, background: C.sidebarBg, borderRight: `1px solid ${C.sidebarBorder}`, display: 'flex', flexDirection: 'column', height: '100vh' }}>
```
with a reservation box wrapping an absolutely-positioned panel:
```tsx
      <aside {...hoverProps} style={{ width: locked ? EXPANDED_W : COLLAPSED_W, flexShrink: 0, height: '100vh', position: 'relative', transition: 'width .18s ease' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: expanded ? EXPANDED_W : COLLAPSED_W, background: C.sidebarBg, borderRight: `1px solid ${C.sidebarBorder}`, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', transition: 'width .18s ease', zIndex: 50 }}>
```
Then find the matching closing `</aside>` for this element and insert one extra `</div>` immediately before it (to close the new panel div). Confirm the JSX still balances after this change.

- [ ] **Step 5: Render icon component + collapse labels + lock button.**
In the brand row, wrap the text block (the `<div>` containing "Anosupo AI" / "Attendance") so it only shows when expanded, and add the lock button. Change the brand text block to:
```tsx
          {expanded && (<div>
            <div style={{ fontFamily: F_SANS, fontSize: 13.5, fontWeight: 500, color: '#fafafa', letterSpacing: '-0.01em', lineHeight: 1.1 }}>Anosupo AI</div>
            <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.sidebarText, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>Attendance</div>
          </div>)}
          {expanded && (
            <button onClick={toggleLock} aria-label={locked ? 'Unlock sidebar' : 'Lock sidebar open'} title={locked ? 'Unlock sidebar' : 'Lock sidebar open'}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: locked ? '#f4b942' : C.sidebarText, display: 'flex', alignItems: 'center', padding: 4 }}>
              <PinIcon size={15} />
            </button>
          )}
```
In the nav button map, replace the icon span + label span (currently lines 206-207):
```tsx
                <span style={{ width: 16, textAlign: 'center', fontFamily: F_MONO, fontSize: 13, flexShrink: 0 }}>{icon}</span>
                <span>{label}</span>
```
with (note: destructure `icon` as `Icon` — capitalize so JSX treats it as a component; rename in the map callback `{ id, label, icon: Icon }`):
```tsx
                <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={18} /></span>
                <span style={{ opacity: expanded ? 1 : 0, whiteSpace: 'nowrap', transition: 'opacity .12s' }}>{label}</span>
```
And update the map header from `{NAV.map(({ id, label, icon }) => {` to `{NAV.map(({ id, label, icon: Icon }) => {`. Also change the "Menu" heading and the entire user-row footer block to render only `{expanded && (…)}` so they disappear when collapsed (wrap each in `{expanded && (` … `)}`).

- [ ] **Step 6: Type-check.** `cd frontend && npx tsc --noEmit 2>&1 | tail -20` → clean (watch for unbalanced JSX / unused `COLLAPSED_W` — it IS used in Step 4).

- [ ] **Step 7: Commit.**
```bash
git add frontend/components/member/MemberDashboard.tsx
git commit -m "feat: member sidebar Iconsax icons + collapse/hover/lock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Admin sidebar — icons + Timesheet label + collapse + final verification

**Files:** Modify `frontend/components/admin/AdminDashboard.tsx`

- [ ] **Step 1: Imports.** Add near the other imports:
```tsx
import { useSidebarCollapse, COLLAPSED_W } from '../hooks/useSidebarCollapse';
import { HomeIcon, ReportsIcon, ApprovalsIcon, DoorIcon, TardyIcon, DisciplineIcon, AppealsIcon, CalendarIcon, TimesheetIcon, MembersIcon, HolidaysIcon, LeaveBalancesIcon, SettingIcon, AuditIcon, PinIcon } from '../icons/NavIcons';
import type { ComponentType } from 'react';
```

- [ ] **Step 2: Nav groups → icon components + rename Payroll.** Replace the `NAV_GROUPS` definition (currently lines 111-133) with the same structure but `icon` set to components and the Payroll label changed to Timesheet:
```tsx
const NAV_GROUPS: { label: string; items: { id: Page; label: string; icon: ComponentType<{ size?: number }>; badge: 'pending' | 'leave' | 'appeals' | null }[] }[] = [
  { label: 'Overview',   items: [
    { id: 'attendance'    as Page, label: 'Attendance',     icon: HomeIcon,        badge: null },
    { id: 'insights'      as Page, label: 'Reports',        icon: ReportsIcon,     badge: null },
  ]},
  { label: 'Management', items: [
    { id: 'approvals'     as Page, label: 'Approvals',      icon: ApprovalsIcon,   badge: 'pending' },
    { id: 'leave'         as Page, label: 'Leave requests', icon: DoorIcon,        badge: 'leave'   },
    { id: 'tardy'         as Page, label: 'Tardy & AWOL',   icon: TardyIcon,       badge: null },
    { id: 'discipline'    as Page, label: 'Discipline',     icon: DisciplineIcon,  badge: null },
    { id: 'appeals-admin' as Page, label: 'Appeals',        icon: AppealsIcon,     badge: 'appeals' },
  ]},
  { label: 'Company',    items: [
    { id: 'calendar'       as Page, label: 'Calendar',       icon: CalendarIcon,      badge: null },
    { id: 'payroll'        as Page, label: 'Timesheet',      icon: TimesheetIcon,     badge: null },
    { id: 'members'        as Page, label: 'Members',        icon: MembersIcon,       badge: null },
    { id: 'holidays'       as Page, label: 'Holidays',       icon: HolidaysIcon,      badge: null },
    { id: 'leave-balances' as Page, label: 'Leave balances', icon: LeaveBalancesIcon, badge: null },
  ]},
  { label: 'Settings',   items: [
    { id: 'policy' as Page, label: 'Policy config', icon: SettingIcon, badge: null },
    { id: 'audit'  as Page, label: 'Audit log',     icon: AuditIcon,   badge: null },
  ]},
];
```
(If the existing `as const` / type annotations differ, preserve whatever makes the `badge` union type-check; the key change is `icon` → component and "Payroll" → "Timesheet".)

- [ ] **Step 3: Call the hook.** Inside the component, before the `return`:
```tsx
  const { expanded, locked, toggleLock, hoverProps, EXPANDED_W } = useSidebarCollapse(232);
```

- [ ] **Step 4: Aside reservation box + overlay panel.** Replace the `<aside ...>` opening tag (currently line 197):
```tsx
      <aside style={{ width: 232, flexShrink: 0, background: C.sidebarBg, borderRight: `1px solid ${C.sidebarBorder}`, display: 'flex', flexDirection: 'column', height: '100vh' }}>
```
with:
```tsx
      <aside {...hoverProps} style={{ width: locked ? EXPANDED_W : COLLAPSED_W, flexShrink: 0, height: '100vh', position: 'relative', transition: 'width .18s ease' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: expanded ? EXPANDED_W : COLLAPSED_W, background: C.sidebarBg, borderRight: `1px solid ${C.sidebarBorder}`, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', transition: 'width .18s ease', zIndex: 50 }}>
```
Find the matching closing `</aside>` and insert one extra `</div>` immediately before it to close the panel. Verify JSX balances.

- [ ] **Step 5: Render icon component + collapse labels/badges + lock button.**
- Brand row: wrap the text block (`Anosupo AI` / `… · Dashboard`) in `{expanded && (…)}`, and add the lock button (same as member Step 5) after it:
```tsx
          {expanded && (
            <button onClick={toggleLock} aria-label={locked ? 'Unlock sidebar' : 'Lock sidebar open'} title={locked ? 'Unlock sidebar' : 'Lock sidebar open'}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: locked ? '#f4b942' : C.sidebarText, display: 'flex', alignItems: 'center', padding: 4 }}>
              <PinIcon size={15} />
            </button>
          )}
```
- Group heading: render only when expanded — wrap the `<div style={{ fontFamily: F_MONO, fontSize: 9.5, … }}>{g.label}</div>` in `{expanded && (…)}`.
- In the item map, change the callback to destructure the icon as a component and render it. Change `{g.items.map((it) => {` body: rename the icon usage. Replace the icon span + label span + badge (currently lines 223-226):
```tsx
                    <span style={{ width: 16, textAlign: 'center', fontFamily: F_MONO, fontSize: 12.5 }}>{it.icon}</span>
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {badge != null && badge > 0 && (
                      <span style={{ background: C.accent, color: '#0a0a0a', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 999, lineHeight: 1.4 }}>{badge}</span>
                    )}
```
with (introduce `const Icon = it.icon;` at the top of the map callback, before the `return`):
```tsx
                    <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={18} /></span>
                    <span style={{ flex: 1, opacity: expanded ? 1 : 0, whiteSpace: 'nowrap', transition: 'opacity .12s' }}>{it.label}</span>
                    {expanded && badge != null && badge > 0 && (
                      <span style={{ background: C.accent, color: '#0a0a0a', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 999, lineHeight: 1.4 }}>{badge}</span>
                    )}
```
- Footer (the dual-clocks block and the user row below it): wrap each in `{expanded && (…)}` so they hide when collapsed.

- [ ] **Step 6: Type-check.** `cd frontend && npx tsc --noEmit 2>&1 | tail -20` → clean.

- [ ] **Step 7: Full backend suite (regression guard).** From repo root: `npx jest 2>&1 | tail -6` → all pass (frontend change shouldn't affect it; confirms nothing else broke).

- [ ] **Step 8: Commit.**
```bash
git add frontend/components/admin/AdminDashboard.tsx
git commit -m "feat: admin sidebar Iconsax icons, Timesheet label, collapse/hover/lock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 9: Visual verification (playwright-cli).** Log in (owner) and confirm: admin sidebar shows icons only when the cursor is away; hovering expands it as an overlay without shifting the page; the lock pin keeps it expanded and survives reload; Leave shows the door icon; "Timesheet" label present. Repeat for the member dashboard. Screenshot both states. (Defer only if login/data unavailable.)

---

## Verification Before Completion

- `cd frontend && npx tsc --noEmit` clean; `npx jest` (root) still green.
- Both sidebars: icons-only collapsed, hover-overlay expand (no reflow), lock persists across reload.
- Door icon on Leave; admin reads "Timesheet".
- Push to `origin/main` (Vercel + Render auto-deploy).

## Notes

- Door + 9 admin icons are authored to match Iconsax bold style; official SVGs dropped into `F:\Attendance\Iconsax` later can be pasted over the corresponding components in `NavIcons.tsx`.
- Collapsed width 64; member expanded 220, admin expanded 232 (their existing widths). Lock key: `att_sidebar_locked` (shared by both dashboards).
- Desktop-only; no mobile breakpoint handling (separate roadmap item).
