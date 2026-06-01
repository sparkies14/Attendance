# Recent Decisions Panel — Approvals & Leave pages

**Date:** 2026-06-01
**Status:** Approved (design)

## Problem

Admins can only see the history of approve/reject decisions in the Audit Log
page. When working the Approvals or Leave queues, there's no in-context view of
what was recently decided — so admins can't quickly see what teammates already
handled, or confirm their own action landed. We want a compact "Recent
decisions" history embedded directly in the Approvals and Leave pages.

## Scope (confirmed decisions)

- **Per-page type only.** The Approvals page shows recent **clock-in** decisions
  (`attendance_approved` / `attendance_rejected`); the Leave requests page shows
  recent **leave** decisions (`leave_approved` / `leave_rejected`).
- **Team feed.** Show decisions by all admins/owners, not just the current user.
- **Last 8 entries**, with a "View all in audit log →" link for the rest.

### Out of scope (YAGNI)

- No pagination / infinite scroll in the strip (the audit-log link covers depth).
- No undo of a decision.
- No filter controls in the strip.

## UX

**Placement:** a full-width "Recent decisions" panel rendered *below* the
existing master/detail area on each page. Always visible; does not reduce the
space available to the review queue or detail card.

**Row format:**

```
✓  Carol Reyes · Vacation      · by erwin@…  · 2m ago
✕  Bob Cruz · clock-in         · by erwin@…  · 14m ago
✓  Dan Lim · Sick leave        · by admin@…  · 1h ago
```

- Result icon: ✓ approved (green) / ✕ rejected (red).
- Member name + descriptor: leave type (e.g. "Vacation") for leave, or
  "clock-in" for attendance.
- Actor: which admin made the decision (`actor_email`).
- Relative time from `occurred_at` (e.g. "2m ago", "1h ago", "Yesterday").
- Footer link: **"View all in audit log →"** navigating to the Audit Log page.

**Empty state:** "No decisions yet." when the list is empty.

**Error state:** a quiet inline line "Couldn't load recent decisions." The strip
never blocks or crashes the approval queue if the fetch fails.

## Architecture

### Backend — new endpoint

`GET /webhook/recent-decisions?type=leave|attendance&limit=8`

- Auth: `requireAuth` + `requireRole('owner', 'admin')` — same guard as the
  rest of the admin/webhook surface.
- Validation: `type` must be `leave` or `attendance` (default `attendance`);
  `limit` clamped to 1–50 (default 8).
- Query `audit_log` for the two actions matching `type`, ordered by
  `occurred_at` descending, limited.
- **Name enrichment:** collect the returned `target_id`s, batch-fetch member
  names from the corresponding source table (`leave_log` for leave, `attendance`
  for attendance) in a single `.in('id', ids)` query, and map names back onto
  the audit rows by id. If a source row was deleted, fall back to
  `Entry #<id>`.
- Response shape:

```json
{
  "items": [
    {
      "id": "<audit row id>",
      "result": "approved" | "rejected",
      "name": "Carol Reyes",
      "label": "Vacation",            // leave_type, or "clock-in" for attendance
      "actor": "erwin@example.com",
      "occurred_at": "2026-06-01T12:34:56Z"
    }
  ]
}
```

### Frontend — new component

`frontend/components/admin/RecentDecisions.tsx`

- Props: `{ apiUrl: string; type: 'leave' | 'attendance'; refreshKey?: number }`.
- On mount and whenever `refreshKey` changes, fetches
  `GET /webhook/recent-decisions?type=…&limit=8` via the existing
  `clientFetch` helper.
- Renders the strip described above using the existing `C` color / `F_*` font
  constants pattern used across admin pages.
- Self-contained loading / empty / error states.

### Integration into ApprovalsPage

- `ApprovalsPage` renders `<RecentDecisions type={leaveMode ? 'leave' : 'attendance'} … />`
  below the master/detail grid. Because both the Approvals and Leave views use
  `ApprovalsPage`, this single insertion covers both pages with the correct
  type.
- **Refresh on action:** `ApprovalsPage` keeps a `decisionsRefreshKey` counter
  in state, increments it inside the existing `doAction` success path (right
  after `onRefresh?.()`), and passes it as `refreshKey` so a just-made decision
  appears immediately.

## Data flow

1. Admin clicks Approve/Reject → existing `GET /webhook/approve` updates the
   row and writes the audit record (unchanged).
2. `doAction` success → `onRefresh()` (existing) + increment
   `decisionsRefreshKey`.
3. `RecentDecisions` re-fetches `/webhook/recent-decisions` and re-renders the
   strip with the new entry on top.

## Error handling

- Backend: on a Supabase error, return `500 { error }`; the audit query and the
  name-enrichment query each guarded so a name-lookup failure still returns the
  decisions (names degrade to `Entry #<id>`).
- Frontend: fetch failure → inline "Couldn't load recent decisions." Never
  throws into the page.

## Testing

- Backend: unit/integration test for `GET /webhook/recent-decisions` covering
  (a) leave type returns only leave actions, (b) attendance type returns only
  attendance actions, (c) `limit` clamping, (d) name enrichment maps correctly,
  (e) missing source row falls back to `Entry #<id>`, (f) non-admin is rejected.
- Frontend: verify in the running app (harness) that the strip renders rows for
  both modes, shows the empty state with no data, and updates after a decision.
