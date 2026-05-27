# Phase 9C — Insights Dashboard

**Date:** 2026-05-28  
**Status:** Approved  
**Depends on:** Phase 9B (Next.js Foundation + Auth Bridge) — complete

---

## Overview

Phase 9C replaces the `/insights` placeholder page with a real dashboard showing tardy, leave, discipline, and attention data — all on one scrollable page. Admins and owners can filter by date range and download exports for each section.

Deliverables:
- Date range picker (defaults to current month, updates URL params)
- Attention widget — cards listing members who need attention this month
- Tardy stacked bar chart — per member, broken into minor/major/awol segments
- Leave utilization grouped bar chart — used vs remaining per member
- Discipline bar chart — active warnings per member
- CSV and PDF export buttons for tardy, leave, and discipline sections
- Express `requireAuth` updated to accept `att_token` cookie as fallback (needed for browser-direct downloads)

---

## Architecture

### Data flow

1. User visits `/insights` → Next.js middleware verifies `att_token` cookie
2. `app/insights/page.tsx` (Server Component) reads `searchParams.from` and `searchParams.to`, defaulting to the current month's first day through today
3. Server component calls all 4 Express report endpoints in parallel via `Promise.all`, forwarding the JWT from the cookie as a `Bearer` token
4. Data is passed as props to Client Components for rendering
5. `DateRangePicker` is a Client Component — on Apply, calls `router.push()` with new URL params, triggering a full server-side re-fetch

### Why Server Component for data fetching

Next.js Server Components can call the Express API directly (server-to-server on the same machine in dev, or Railway-internal in production). No client-side fetch means no loading spinners for initial render and no CORS issues for the data calls. Only chart rendering needs the client.

### requireAuth cookie fallback

Export download links open directly in the browser (`<a href="...">`) — the browser cannot set an `Authorization` header on a direct navigation. Since the `att_token` cookie is `httpOnly`, JavaScript cannot read it either. Solution: update `middleware/requireAuth.js` to check for `att_token` cookie as a fallback when no `Bearer` header is present. The cookie value is a valid JWT and can be verified with `verifyToken` exactly like the header token.

---

## File Map

**Modify — Express:**
- `middleware/requireAuth.js` — accept `att_token` cookie as auth fallback

**Modify — Next.js:**
- `frontend/package.json` — add `recharts` dependency
- `frontend/app/insights/page.tsx` — replace placeholder with full dashboard server component
- `frontend/messages/en.json` — add i18n keys for all new strings
- `frontend/messages/ja.json` — same keys, English values (Phase 9D fills in Japanese)

**Create — Next.js components:**
- `frontend/components/insights/DateRangePicker.tsx` — Client Component; two date inputs + Apply button; validates from ≤ to; updates URL params via `router.push`
- `frontend/components/insights/AttentionWidget.tsx` — Client Component; renders attention cards
- `frontend/components/insights/TardyChart.tsx` — Client Component; Recharts stacked BarChart
- `frontend/components/insights/LeaveChart.tsx` — Client Component; Recharts grouped BarChart
- `frontend/components/insights/DisciplineChart.tsx` — Client Component; Recharts BarChart
- `frontend/components/insights/ExportButtons.tsx` — Client Component; CSV + PDF anchor links with date params

---

## Dashboard Layout

```
Insights

From [2026-05-01]  To [2026-05-28]  [Apply]

── Needs Attention (this month) ──────────────────
[Card: Juan — 2+ tardies this month]  [Card: Maria — Active warning]

── Tardy ─────────────────────────  [↓ CSV] [↓ PDF]
[Stacked bar chart per member]
Legend: ■ Minor  ■ Major  ■ AWOL Half  ■ AWOL Full

── Leave Utilization ─────────────  [↓ CSV] [↓ PDF]
[Grouped bar chart per member]
Legend: ■ Used  ■ Remaining

── Discipline ────────────────────  [↓ CSV] [↓ PDF]
[Bar chart: active warnings per member]
```

---

## Components

### DateRangePicker

- Two `<input type="date">` fields (from, to)
- Defaults: `from` = first day of current month, `to` = today
- Validation: if from > to, show inline error, do not navigate
- On Apply: `router.push('/insights?from=YYYY-MM-DD&to=YYYY-MM-DD')`
- Reads initial values from current URL params

### AttentionWidget

- Receives `members: Array<{ name: string, email: string, reasons: string[] }>` as props (shape returned directly by `GET /reports/attention`)
- Renders one card per member who needs attention
- Shows name + reasons (e.g. "2+ tardies this month", "Active warning") — reasons come pre-formatted from the API
- If no one needs attention: renders "No members need attention this month."
- Always reflects current month regardless of date range picker (API limitation)

### TardyChart

- Props: `members: Array<{ name, minor, major, awolHalf, awolFull }>`
- Recharts `BarChart` with `stackId="tardy"` on all 4 bars
- Colors: Minor = `#facc15` (yellow), Major = `#f97316` (orange), AWOL Half = `#ef4444` (red), AWOL Full = `#991b1b` (dark red)
- Wrapped in `ResponsiveContainer` (width 100%, height 300)
- `XAxis` shows member names, `YAxis` shows count, `Tooltip` and `Legend` included
- If all members have zero: renders "No tardy records in this date range."

### LeaveChart

- Props: `members: Array<{ name, used, remaining }>`
- Recharts `BarChart` with two `Bar` elements (not stacked — grouped side by side)
- Colors: Used = `#3b82f6` (blue), Remaining = `#22c55e` (green)
- Same ResponsiveContainer, Tooltip, Legend

### DisciplineChart

- Props: `members: Array<{ name, active }>`
- Single `Bar` showing `active` warnings per member
- Color: `#8b5cf6` (purple)
- If all zero: renders "No active warnings in this date range."

### ExportButtons

- Props: `section: 'tardy' | 'leave' | 'discipline'`, `from: string`, `to: string`
- Renders two `<a>` tags:
  - CSV: `href="${NEXT_PUBLIC_API_URL}/reports/export/${section}.csv?from=${from}&to=${to}"`
  - PDF: `href="${NEXT_PUBLIC_API_URL}/reports/export/${section}.pdf?from=${from}&to=${to}"`
- Both have `target="_blank"` and `rel="noopener noreferrer"`
- Styled as small buttons (inline style, no Tailwind yet)

---

## Error Handling

- Each data fetch is wrapped in a try/catch inside the server component
- If a fetch fails, that section receives `null` data and renders an inline error: "Failed to load [section] data — try refreshing."
- Other sections are unaffected (parallel fetches — one failure doesn't block others)
- Invalid date params (non-date strings in URL) fall back to current month defaults
- Date picker shows "End date must be after start date" if from > to, prevents navigation

---

## Styling

Plain inline styles — no Tailwind (HTML rework phase handles styling). Consistent with the existing placeholder page. Charts use Recharts default font. Section headers use `<h2>`. Export buttons are small grey anchors styled as buttons.

---

## i18n Keys Added

```json
{
  "InsightsPage": {
    "title": "Insights",
    "welcome": "Welcome, {name}",
    "role": "Role: {role}",
    "comingSoon": "Dashboard coming soon.",
    "dateFrom": "From",
    "dateTo": "To",
    "apply": "Apply",
    "dateError": "End date must be after start date.",
    "attentionTitle": "Needs Attention (this month)",
    "noAttention": "No members need attention this month.",
    "tardyTitle": "Tardy",
    "leaveTitle": "Leave Utilization",
    "disciplineTitle": "Discipline",
    "noTardy": "No tardy records in this date range.",
    "noWarnings": "No active warnings in this date range.",
    "downloadCsv": "↓ CSV",
    "downloadPdf": "↓ PDF",
    "errorLoad": "Failed to load {section} data — try refreshing.",
    "legendMinor": "Minor",
    "legendMajor": "Major",
    "legendAwolHalf": "AWOL Half Day",
    "legendAwolFull": "AWOL Full Day",
    "legendUsed": "Used",
    "legendRemaining": "Remaining",
    "legendActive": "Active Warnings"
  }
}
```

---

## Testing

- Express: add test for `requireAuth` cookie fallback — request with `att_token` cookie and no Bearer header should be authenticated
- Next.js: manual end-to-end (run both servers, visit `/insights`, verify charts render, change date range, verify data changes, click export)
- Edge cases to verify manually: empty date range (no data), all-zero charts show empty state message, invalid date params in URL fall back to current month
