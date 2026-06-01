# Manual Clock-In Approval Gate

**Date:** 2026-06-01  
**Status:** Approved

## Problem

When a member submits a manual clock-in, the timer starts immediately even though the record is `status: 'Pending'` awaiting admin approval. The member has no visible indication that they're waiting, and the admin hasn't yet reviewed the entry.

## Goal

- Timer must not start until admin approves the manual clock-in
- Member sees a clear "awaiting approval" state
- Rejected clock-ins show a red state with an inline appeal form
- Approved clock-ins use the original submitted time as the start of the timer

## Approach

Expose `entryType` and `dateISO` per calendar day from the backend, then gate the frontend timer and UI on those fields plus the existing `status` field.

---

## Backend Changes

### `lib/rules.js` — `calendarDayStatus`

Add `'Rejected'` case before the late/present fallthrough:

```js
if (record.status === 'Rejected') return 'rejected';
```

Without this, a rejected manual entry falls through to the present/late check and shows incorrectly as present.

### `routes/memberData.js` — calendar day object

Add two fields to each entry pushed into `calendar[]`:

```js
entryType: record?.entry_type || 'auto',
dateISO: `${yearNum}-${String(monthNum).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
```

- `entryType` distinguishes manual from auto so the pending condition is explicit
- `dateISO` is required by `appeals.js` which validates `target_id` as `YYYY-MM-DD` for attendance appeals

No changes to `routes/approve.js` or `routes/attendance.js`.

---

## Frontend Changes

### `frontend/components/member/MemberDashboard.tsx` — `CalendarDay` interface

```ts
entryType?: string;   // 'manual' | 'auto'
dateISO?: string;     // YYYY-MM-DD, for appeal submission
```

### `frontend/components/member/pages/HomePage.tsx`

#### 1. State derivation

```ts
const pendingApproval = !!today && today.status === 'pending' && today.entryType === 'manual';
const rejected        = !!today && today.status === 'rejected';
// Narrow working to exclude pending manual entries
const working = !!today && today.clockIn !== '-' && today.clockOut === '-' && !pendingApproval;
```

`notIn` and `done` are unchanged.

#### 2. Pending approval UI (shown when `pendingApproval`)

- Amber status badge: "Awaiting approval" with pulsing dot
- Serif headline: "Clock-in pending approval."
- Mono subtext: "Submitted at {today.clockIn} — waiting for admin review"
- No timer, no action buttons

#### 3. Rejected UI (shown when `rejected`)

- Red status badge: "Rejected"
- Serif headline: "Manual clock-in was rejected."
- Mono subtext: "Submitted at {today.clockIn}"
- Inline appeal form:
  - Reason textarea (required)
  - "Submit appeal" button
  - On submit: `POST /webhook/appeals` with `{ target_type: 'attendance', target_id: today.dateISO, reason }`
  - After submit: show "Appeal submitted — admin will review." and disable button
  - If appeal already exists (409 from server): show "Appeal already submitted."

#### 4. Weekly strip color

Add `pending` and `rejected` to `STATUS_COLOR`:

```ts
pending:  '#b45309',  // amber — same as accent
rejected: '#dc2626',  // red
```

---

## Admin Side

No changes. `ApprovalsPage` already:
- Shows pending manual clock-ins in the queue
- Has Approve / Reject buttons that call `GET /webhook/approve?action=...&row=<id>&type=attendance`
- `approve.js` sets `status: 'Approved'` or `'Rejected'` correctly

When approved, the member's `memberData` refresh will show `status: 'present'`/`'late'` (not pending), so `working` becomes true and the timer starts from the original `clock_in` time.

---

## Data Flow

```
Member clicks "Clock in" (manual)
  → POST /webhook/attendance { entry_type: 'manual', action: 'clock-in' }
  → attendance row inserted: status='Pending', clock_in=<submitted time>
  → Discord notification to approvals channel

Member's HomePage polls memberData
  → today.status === 'pending', today.entryType === 'manual'
  → pendingApproval = true → show amber "Awaiting approval" UI, no timer

Admin approves in ApprovalsPage
  → GET /webhook/approve?action=approve&row=<id>&type=attendance
  → attendance.status → 'Approved'

Member's next memberData fetch
  → today.status === 'present'/'late', working = true
  → Timer starts from today.clockIn (original submitted time) ✓

Admin rejects
  → attendance.status → 'Rejected'

Member's next memberData fetch
  → today.status === 'rejected'
  → Show red "Rejected" UI with inline appeal form

Member submits appeal
  → POST /webhook/appeals { target_type: 'attendance', target_id: dateISO, reason }
  → Appeal record created, admin reviews via existing appeals flow
```

---

## Files Changed

| File | Change |
|------|--------|
| `lib/rules.js` | Add `'Rejected'` case to `calendarDayStatus` |
| `routes/memberData.js` | Add `entryType` + `dateISO` to each calendar day |
| `frontend/components/member/MemberDashboard.tsx` | Add `entryType?` + `dateISO?` to `CalendarDay` |
| `frontend/components/member/pages/HomePage.tsx` | New pending/rejected states + UI + appeal form |
