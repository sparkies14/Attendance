# Admin Panel — 7 Missing Pages Design

**Date:** 2026-05-30  
**Scope:** Build 7 new admin pages that have backend routes but no frontend, and reorganise the sidebar nav.

---

## 1. Sidebar Nav Reorganisation

Replace the current 3-group layout with 4 groups. Only structural change to `AdminDashboard.tsx` — no other files touched by this step.

```
Overview
  • Attendance
  • Reports

Management
  • Approvals
  • Leave Requests
  • Tardy & AWOL      ← new
  • Discipline        ← new
  • Appeals           ← new

Company
  • Calendar
  • Payroll
  • Members
  • Holidays          ← new
  • Leave Balances    ← new

Settings
  • Policy Config     ← new
  • Audit Log         ← new
```

`Page` union type gains 7 new literals. Appeals gets a badge for pending count (same as Approvals).

---

## 2. New Pages

All pages follow the existing pattern: inline styles using the shared `C` / `F_SANS` / `F_MONO` / `F_SERIF` constants, `clientFetch` for API calls, skeleton loading state, silent mock-data fallback in dev.

Props each page receives from `AdminDashboard`:
- `apiUrl: string`
- `adminRole: string` — used to hide owner-only write actions for admins

---

### 2.1 TardyPage (`pages/TardyPage.tsx`)

**Route:** `GET /admin/tardy-report`, `POST /admin/run-awol-check`  
**Props:** `apiUrl`, `adminRole`

**Layout:**
- Header row: "Tardy & AWOL" title + "Run AWOL Check" button (owner + admin)
- Threshold chips: 4 read-only pills showing current thresholds (fetched with the report)
- Table: one row per member
  - Name, Country flag emoji
  - 4 count columns: Minor / Major / AWOL½ / AWOL Full (coloured amber/red when > 0)
  - "Over threshold" badge (red pill) when `exceeded === true`, with reasons as tooltip/expand
- Sort: exceeded members pinned to top (matches backend default), then alpha

**AWOL Check:** button triggers `POST /admin/run-awol-check`, shows a result toast (rows affected).

**Mock fallback (dev):** 3 synthetic member rows.

---

### 2.2 HolidaysPage (`pages/HolidaysPage.tsx`)

**Routes:** `GET /admin/holidays`, `POST /admin/holidays` (owner), `DELETE /admin/holidays/:id` (owner)  
**Props:** `apiUrl`, `adminRole`

**Layout:**
- Country filter tabs: All / PH / JP (or whatever countries are in the data)
- Table: Date | Name | Country | Delete button (owner only)
- Inline add form at bottom (owner only): date input + name text input + country select (PH / JP) + Add button
- Empty state: "No holidays for this country"

**Validation:** date required, name required, country required — all caught client-side before POST.

**Mock fallback (dev):** 3 holidays (1 PH, 2 JP).

---

### 2.3 PolicyPage (`pages/PolicyPage.tsx`)

**Routes:** `GET /admin/policy-config`, `PATCH /admin/policy-config`  
**Props:** `apiUrl`, `adminRole`

**Layout:**
- 4 number inputs, one per threshold key:
  - `threshold_minor_tardy` — "Minor tardy threshold (days)"
  - `threshold_major_tardy` — "Major tardy threshold (days)"
  - `threshold_awol_half` — "AWOL half-day threshold (days)"
  - `threshold_awol_full` — "AWOL full-day threshold (days)"
- "Save" button — owner only (admins see inputs as read-only)
- Save sends PATCH with only changed keys
- Success: inline "Saved" confirmation; error: inline error text

**Mock fallback (dev):** `{ threshold_minor_tardy: 3, threshold_major_tardy: 2, threshold_awol_half: 1, threshold_awol_full: 1 }`

---

### 2.4 DisciplinePage (`pages/DisciplinePage.tsx`)

**Routes:** `GET /discipline/all`, `POST /discipline`, `POST /discipline/:id/void`, `POST /discipline/:id/acknowledge`  
**Props:** `apiUrl`, `adminRole`

**Layout:**
- Member list: accordion — click a member row to expand their warning records
- Collapsed row: Name | Active warnings count | Total warnings count
- Expanded: table of records
  - Reason | Issued by | Issued at | Status pill (Active / Voided / Acknowledged)
  - Action buttons: "Void" (opens inline reason textarea + confirm) | "Acknowledge" — only on active (non-voided) records
- "Issue Warning" panel at top: email select (from member list) + reason textarea + Issue button

**Void flow:** inline textarea in the row — no modal. Submit void reason → `POST /discipline/:id/void`.

**Mock fallback (dev):** 2 members, 1 with 1 active warning, 1 with 2 (1 voided).

---

### 2.5 AppealsAdminPage (`pages/AppealsAdminPage.tsx`)

**Routes:** `GET /appeals/all`, `POST /appeals/:id/resolve`  
**Props:** `apiUrl`, `adminRole`

**Layout:**
- Filter tabs: Pending | Approved | Rejected
- Table: Member name | Type (discipline / leave / attendance) | Target ID | Reason | Submitted at | Actions
- "Resolve" action (Pending only): inline panel with Approved/Rejected radio + note textarea + Confirm
- Empty state per tab

**Mock fallback (dev):** 2 pending, 1 approved, 1 rejected.

---

### 2.6 AuditLogPage (`pages/AuditLogPage.tsx`)

**Routes:** `GET /audit?page=&actor=&action=&from=&to=`, `DELETE /audit?before=` (owner)  
**Props:** `apiUrl`, `adminRole`

**Layout:**
- Filter bar: actor email input + action text input + from/to date pickers + Apply button
- Paginated table (50 per page): occurred_at | actor_email | action | details (JSON expand)
- Pagination: prev/next buttons + "Page N of M"
- Owner-only "Purge old logs" section at bottom: date input (must be > 24h ago) + Purge button + confirmation prompt

**Mock fallback (dev):** 5 synthetic log rows.

---

### 2.7 LeaveBalancesPage (`pages/LeaveBalancesPage.tsx`)

**Routes:** `GET /leave-balance/all`, `POST /leave-balance/adjust`  
**Props:** `apiUrl`, `adminRole`

**Layout:**
- Table: Name | Hire year | Grants earned | Used | Adjustments | Balance (coloured red if ≤ 0)
- "Adjust" button per row: inline panel with amount (±integer) + note textarea + Submit
- Summary row at bottom: totals

**Mock fallback (dev):** 3 synthetic members.

---

## 3. AdminDashboard Changes

1. Import all 7 new page components
2. Add 7 literals to `Page` type
3. Replace `NAV_GROUPS` with the 4-group structure above
4. Add `appeals` pending badge counter (`dashData?.pendingAppeals` — needs new field on DashboardData, defaulting to 0 if absent)
5. Add 7 render conditions in the page content area
6. Pass `adminRole` down to all new pages (already in scope)

> Note: The Appeals badge requires `GET /appeals/all` count on the dashboard. Since `/webhook/dashboard` doesn't return this today, the badge will show only after the user navigates to the Appeals page (client-side cache). This avoids a backend change for now.

---

## 4. File List

New files (all in `frontend/components/admin/pages/`):
- `TardyPage.tsx`
- `HolidaysPage.tsx`
- `PolicyPage.tsx`
- `DisciplinePage.tsx`
- `AppealsAdminPage.tsx`
- `AuditLogPage.tsx`
- `LeaveBalancesPage.tsx`

Modified files:
- `frontend/components/admin/AdminDashboard.tsx` — nav + routing

---

## 5. Constraints

- No new backend routes — use only what exists
- No Tailwind — inline styles only, using the existing `C` palette
- `clientFetch` for all API calls (handles auth headers)
- TypeScript strict — no `any`
- Each page is self-contained (no shared state between pages)
- Owner-only write actions hidden/disabled for `adminRole === 'admin'`
