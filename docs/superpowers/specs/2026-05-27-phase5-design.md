# Phase 5 — Progressive Discipline Engine Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Record formal written warnings issued to employees when they exceed tardy thresholds. Admin manually issues warnings after reviewing the tardy report. Backend only — no HTML changes.

**Policy rules confirmed with owner:**
- One warning type: Written Warning (no progression levels — severity is admin's judgment)
- Admin manually creates each warning after reviewing the tardy report (system never auto-creates)
- Warnings are permanent by default but can be voided (not deleted) by admin with a required reason
- Acknowledgment tracked in system — admin marks it after member signs the physical copy
- Members can view their own warning history via API

---

## Data Model

### New table: `discipline_records`

```sql
create table discipline_records (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references users(id) on delete cascade,
  reason          text not null,
  issued_by       text not null,
  issued_at       timestamptz not null default now(),
  voided          boolean not null default false,
  void_reason     text,
  voided_by       text,
  voided_at       timestamptz,
  acknowledged    boolean not null default false,
  acknowledged_at timestamptz
);
```

- `reason` — free-text description of the violation (e.g., "5 minor tardies in 30 days")
- `issued_by` — email of the admin who issued the warning (audit trail)
- `voided` — soft-delete: warning remains visible in history but flagged as inactive
- `void_reason` — required when voiding; set along with `voided_by` and `voided_at`
- `acknowledged` — true once admin marks it after member physically signs
- `acknowledged_at` — timestamp of acknowledgment

---

## API Routes

New file: `routes/discipline.js`, mounted at `/discipline` in `server.js`.

All routes require authentication (`requireAuth`).

### `POST /discipline`

Access: admin/owner only.

Issues a written warning for a member.

Request body:
```json
{ "email": "ana@company.com", "reason": "5 minor tardies in the last 30 days" }
```

Validation:
- `email` must resolve to an existing active user with `role != 'owner'`
- `reason` must be a non-empty string

Response (201):
```json
{
  "record": {
    "id": 1,
    "user_id": "uuid",
    "reason": "5 minor tardies in the last 30 days",
    "issued_by": "admin@company.com",
    "issued_at": "2026-05-27T00:00:00Z",
    "voided": false,
    "void_reason": null,
    "voided_by": null,
    "voided_at": null,
    "acknowledged": false,
    "acknowledged_at": null
  }
}
```

### `GET /discipline?email=<email>`

Access: member can only query their own email; admin/owner can query any.

Returns all warning records for the specified member, newest first.

Response (200):
```json
{
  "records": [
    {
      "id": 1,
      "reason": "5 minor tardies in the last 30 days",
      "issued_by": "admin@company.com",
      "issued_at": "2026-05-27T00:00:00Z",
      "voided": false,
      "void_reason": null,
      "voided_by": null,
      "voided_at": null,
      "acknowledged": false,
      "acknowledged_at": null
    }
  ]
}
```

### `GET /discipline/all`

Access: admin/owner only.

Returns all active members with their warning summary and full record list. Sorted by name ascending.

Response (200):
```json
{
  "members": [
    {
      "email": "ana@company.com",
      "name": "Ana Reyes",
      "totalWarnings": 2,
      "activeWarnings": 1,
      "records": [...]
    }
  ]
}
```

- `totalWarnings` — count of all records (including voided)
- `activeWarnings` — count of records where `voided = false`
- Only active members (`status = 'Active'`, `role != 'owner'`)

### `POST /discipline/:id/void`

Access: admin/owner only.

Voids a warning. Cannot void an already-voided warning.

Request body:
```json
{ "reason": "Issued in error — wrong employee" }
```

Validation:
- `reason` must be a non-empty string
- Record with the given `id` must exist
- Record must not already be voided

Response (200):
```json
{
  "record": {
    "id": 1,
    "voided": true,
    "void_reason": "Issued in error — wrong employee",
    "voided_by": "admin@company.com",
    "voided_at": "2026-05-27T01:00:00Z",
    ...
  }
}
```

### `POST /discipline/:id/acknowledge`

Access: admin/owner only.

Marks a warning as acknowledged by the member (after physical signature). Cannot acknowledge a voided warning.

No request body required.

Response (200):
```json
{
  "record": {
    "id": 1,
    "acknowledged": true,
    "acknowledged_at": "2026-05-27T02:00:00Z",
    ...
  }
}
```

---

## What is NOT in scope

- Multiple discipline levels (verbal warning, suspension, termination) — Written Warning only
- Auto-creation of records when threshold is exceeded — admin always decides
- Member self-acknowledgment via API — admin marks it after physical sign
- Hard deletion of records — void only
- Frontend changes (HTML) — backend only; UI pass comes later via Claude Design
