# Phase 8 — Appeals Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow members to submit appeals against discipline records, rejected leave requests, and tardy/AWOL attendance designations. Admins review and resolve each appeal with an Approved or Rejected outcome. Backend only — no HTML changes.

**Policy rules confirmed with owner:**
- Members can appeal three types of records: discipline warnings, leave decisions, and attendance (tardy/AWOL) marks
- Original record is unchanged while appeal is pending — admin corrects it manually if appeal is approved
- Admin resolves with Approved or Rejected plus a required explanation note
- One appeal per record — duplicate appeals are blocked (409)
- No re-appeal after resolution — final decision stands

---

## Data Model

### New table: `appeals`

```sql
create table appeals (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references users(id) on delete cascade,
  target_type     text not null,
  target_id       text not null,
  reason          text not null,
  status          text not null default 'Pending',
  resolution_note text,
  resolved_by     text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
```

- `target_type` — one of `'discipline'`, `'leave'`, `'attendance'`
- `target_id` — stringified record ID for discipline/leave, or `'YYYY-MM-DD'` date string for attendance
- `status` — one of `'Pending'`, `'Approved'`, `'Rejected'`
- `resolution_note` — required when resolving; stores admin's explanation
- `resolved_by` — admin's email, set at resolution
- `resolved_at` — server-side timestamp set at resolution
- `UNIQUE (user_id, target_type, target_id)` — one appeal per member per record

---

## API Routes

New file: `routes/appeals.js`, mounted at `/appeals` in `server.js`.

All routes require authentication (`requireAuth`).

### `POST /appeals`

Access: any authenticated user (member, admin, owner).

Submit a new appeal.

Request body:
```json
{
  "target_type": "discipline",
  "target_id": "1",
  "reason": "I was not given a verbal warning before this written warning was issued."
}
```

Validation (in order):
1. `target_type` must be one of `'discipline'`, `'leave'`, `'attendance'` — 400 if not
2. `target_id` must be a non-empty string — 400 if missing/empty
3. For `target_type = 'attendance'`: `target_id` must match `YYYY-MM-DD` format — 400 if not
4. `reason` must be a non-empty string — 400 if missing/empty
5. For `target_type = 'discipline'`: verify `discipline_records` row exists with the given id and `user_id = req.user.user_id` — 404 if not found
6. For `target_type = 'leave'`: verify `leave_log` row exists with the given id and the member's email — 404 if not found
7. Check for duplicate: if a row already exists with `(user_id, target_type, target_id)` — 409 with message "Appeal already exists for this record."

Response (201):
```json
{
  "appeal": {
    "id": 1,
    "user_id": "uuid",
    "target_type": "discipline",
    "target_id": "1",
    "reason": "I was not given a verbal warning before this written warning was issued.",
    "status": "Pending",
    "resolution_note": null,
    "resolved_by": null,
    "resolved_at": null,
    "created_at": "2026-05-27T00:00:00Z"
  }
}
```

### `GET /appeals`

Access: any authenticated user. Always returns the requesting user's own appeals.

Returns all appeals for the requesting member, sorted newest first.

Response (200):
```json
{
  "appeals": [
    {
      "id": 1,
      "target_type": "discipline",
      "target_id": "1",
      "reason": "I was not given a verbal warning.",
      "status": "Pending",
      "resolution_note": null,
      "resolved_by": null,
      "resolved_at": null,
      "created_at": "2026-05-27T00:00:00Z"
    }
  ]
}
```

### `GET /appeals/all`

Access: admin/owner only.

Returns all appeals across all members, sorted: Pending first (by created_at descending), then resolved (by resolved_at descending).

Response (200):
```json
{
  "appeals": [
    {
      "id": 1,
      "user_id": "uuid",
      "email": "ana@company.com",
      "name": "Ana Reyes",
      "target_type": "discipline",
      "target_id": "1",
      "reason": "I was not given a verbal warning.",
      "status": "Pending",
      "resolution_note": null,
      "resolved_by": null,
      "resolved_at": null,
      "created_at": "2026-05-27T00:00:00Z"
    }
  ]
}
```

Member `email` and `name` are joined from the `users` table.

### `POST /appeals/:id/resolve`

Access: admin/owner only.

Resolve a pending appeal.

Request body:
```json
{
  "outcome": "Approved",
  "note": "Reviewed attendance log — member was present. Tardy mark was a system error."
}
```

Validation:
1. `outcome` must be `'Approved'` or `'Rejected'` — 400 if not
2. `note` must be a non-empty string — 400 if missing/empty
3. Appeal with given `id` must exist — 404 if not
4. Appeal must have `status = 'Pending'` — 409 if already resolved

Response (200):
```json
{
  "appeal": {
    "id": 1,
    "status": "Approved",
    "resolution_note": "Reviewed attendance log — member was present. Tardy mark was a system error.",
    "resolved_by": "admin@company.com",
    "resolved_at": "2026-05-27T01:00:00Z",
    ...
  }
}
```

---

## What is NOT in scope

- Automatic correction of the original record when appeal is approved — admin handles manually
- Re-appeal after resolution — one final decision per record
- Escalation to owner — two-level review is out of scope
- Frontend changes (HTML) — backend only; UI pass comes later via Claude Design
- Email/notification when appeal is resolved — not in scope
