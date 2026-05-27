# Phase 4 — Leave Balance & Accrual Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track each employee's running leave balance using live computation — no stored balance, no cron jobs — with admin adjustment capability and balance visibility on both the member and admin UIs.

**Policy rules confirmed with owner:**
- 10 leave days granted per calendar year, all at once (not monthly accrual)
- Unused days carry over to the next year indefinitely
- Leave cannot be converted to cash — carry-over only
- Advance requests = future-dated leave submissions (already supported); emergency advances are owner's discretion, no special system flow needed
- Admin (2 people) can manually adjust any member's balance with a required note

---

## Data Model

### New table: `leave_adjustments`

```sql
create table leave_adjustments (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  amount      integer not null,
  note        text not null,
  created_by  text not null,
  created_at  timestamptz not null default now()
);
```

- `amount` is positive (add days) or negative (deduct days)
- `created_by` stores the admin's email for audit trail
- No other tables are created or modified

### Balance formula (computed live on every request)

```
hire_year     = EXTRACT(YEAR FROM users.created_at)
grants_earned = (current_year - hire_year + 1) × 10
used          = COUNT(*) FROM leave_log WHERE email = ? AND status = 'Approved'
adjustments   = COALESCE(SUM(amount), 0) FROM leave_adjustments WHERE user_id = ?
balance       = grants_earned - used + adjustments
```

- `current_year` is the server's current calendar year (UTC)
- January 1 automatically adds 10 to every balance because `current_year` increments — no cron job needed
- Negative balances are allowed — members can still submit leave with 0 or negative balance (owner approves or rejects at their discretion)
- Admin adjustments correct for wrong hire year (system `created_at` ≠ actual hire date) or any other edge case

---

## API Routes

New file: `routes/leaveBalance.js`

All routes require authentication (`requireAuth`).

### `GET /leave-balance?email=<email>`

Access: member can only query their own email; admin/owner can query any email.

Response:
```json
{
  "email": "ana@company.com",
  "name": "Ana Reyes",
  "hire_year": 2024,
  "grants_earned": 20,
  "used": 4,
  "adjustments": 0,
  "balance": 16
}
```

### `GET /leave-balance/all`

Access: admin/owner only.

Response:
```json
{
  "members": [
    {
      "email": "ana@company.com",
      "name": "Ana Reyes",
      "hire_year": 2024,
      "grants_earned": 20,
      "used": 4,
      "adjustments": 0,
      "balance": 16
    }
  ]
}
```

Sorted by name ascending. Only active members (`status = 'Active'`, `role != 'owner'`).

### `POST /leave-balance/adjust`

Access: admin/owner only.

Request body:
```json
{
  "email": "ana@company.com",
  "amount": -2,
  "note": "Correcting hire year — joined mid-2023 not 2024"
}
```

Validation:
- `email` must resolve to an existing active user
- `amount` must be a non-zero integer
- `note` must be a non-empty string

Response (201):
```json
{
  "adjustment": {
    "id": 1,
    "user_id": "uuid",
    "amount": -2,
    "note": "Correcting hire year — joined mid-2023 not 2024",
    "created_by": "admin@company.com",
    "created_at": "2026-05-27T00:00:00Z"
  }
}
```

### `GET /leave-balance/adjustments?email=<email>`

Access: member can only query their own email; admin/owner can query any.

Response:
```json
{
  "adjustments": [
    {
      "id": 1,
      "amount": -2,
      "note": "Correcting hire year",
      "created_by": "admin@company.com",
      "created_at": "2026-05-27T00:00:00Z"
    }
  ]
}
```

---

## UI Changes

### member.html

Add a **Leave Balance card** at the top of the leave history section. Fetched on page load alongside existing member data.

```
┌──────────────────────────────────┐
│  Leave Balance                   │
│  16 days remaining               │
│  4 used · 20 earned              │
└──────────────────────────────────┘
```

If balance is 0 or negative, show a warning inline on the leave submission form:
> "You have no remaining leave days. Your request will still be sent for approval."

The warning does not block submission.

### admin.html — new "Leave Balances" section in Dashboard tab

Table showing all active members:

```
Name         Balance   Used   Earned   Adjusted
Ana Reyes    16        4      20       0          [Adjust]
Ben Cruz     10        0      10       0          [Adjust]
```

Clicking **[Adjust]** opens a modal with:
- Amount field (integer, can be negative — label: "Days to add (use negative to deduct)")
- Note field (required, plain text)
- Submit button

On success, table refreshes. On error, show inline error in the modal.

---

## What is NOT in scope

- Monthly accrual (not needed — 10 days upfront per year)
- Leave monetization (policy: carry-over only, no cash conversion)
- Special advance request flow (owner decides case by case)
- Leave type breakdown (all 5 types draw from the same pool)
- Leave cancellation UI (leave_log status changes handled by existing approve/reject flow)
