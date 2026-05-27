# Phase 3 — Excused Outages & Evidence Upload

**Date:** 2026-05-27
**Status:** Approved
**Scope:** Allow members and admins to attach file evidence (images, PDFs) or external links to any leave request, viewable by the uploader and admin/owner only.

---

## 1. Overview

Leave requests already exist (`leave_log` table, submission + approval flow). Phase 3 adds an evidence layer: any leave request can have zero or more attachments. Evidence is optional — no mandatory policy — admin decides per case whether evidence is required. Members can attach at submission or after. Admins can attach to any leave record.

Files are stored in a private Supabase Storage bucket. External links (Google Drive, Dropbox) are also supported. Signed URLs (1-hour expiry) are generated on demand — no public file access.

---

## 2. Data Model

### New table — `leave_evidence`

```sql
create table leave_evidence (
  id           uuid primary key default gen_random_uuid(),
  leave_id     uuid not null references leave_log(id) on delete cascade,
  uploaded_by  text not null,
  file_path    text,
  file_name    text,
  external_url text,
  note         text,
  created_at   timestamptz not null default now()
);
```

- At least one of `file_path` or `external_url` must be non-null (enforced in route layer).
- `file_path` is the Supabase Storage object path: `{leave_id}/{timestamp}-{sanitized_filename}`
- `file_name` stores the original filename for display purposes.
- `uploaded_by` is the email of the user who attached the evidence.

### Supabase Storage

- Bucket: `leave-evidence` (private, no public access)
- Path format: `{leave_id}/{unix_timestamp}-{filename}`
- Max file size: 5 MB per file
- Allowed MIME types: `image/jpeg`, `image/png`, `application/pdf`

---

## 3. API Routes

New file: `routes/leaveEvidence.js`, mounted at `/leave` in `server.js`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/leave/:id/evidence` | member (own) + admin/owner | List all evidence for a leave request |
| `POST` | `/leave/:id/evidence` | member (own) + admin/owner | Attach a file or external URL |
| `DELETE` | `/leave/:id/evidence/:eid` | uploader or admin/owner | Remove one evidence item |
| `GET` | `/leave/:id/evidence/:eid/url` | member (own) + admin/owner | Get a signed download URL (1-hour expiry) |

### POST `/leave/:id/evidence`

Accepts `multipart/form-data`:
- `file` (optional) — binary file upload, max 5 MB, MIME: jpeg/png/pdf
- `external_url` (optional) — text URL
- `note` (optional) — short label e.g. "Day 1 certificate"

At least one of `file` or `external_url` must be provided.

File upload flow:
1. Validate MIME type and size via `multer` (memory storage, 5 MB limit)
2. Upload buffer to Supabase Storage at `{leave_id}/{timestamp}-{filename}`
3. Insert row into `leave_evidence` with `file_path` and `file_name`

URL-only flow:
1. Validate `external_url` is a non-empty string
2. Insert row into `leave_evidence` with `external_url` only

Response: `{ evidence: { id, leave_id, uploaded_by, file_name, external_url, note, created_at } }`

### GET `/leave/:id/evidence/:eid/url`

1. Fetch the `leave_evidence` row
2. Call `supabase.storage.from('leave-evidence').createSignedUrl(file_path, 3600)`
3. Return `{ url: signedUrl }`

Returns 400 if the evidence item is a URL-only entry (no `file_path`).

### Auth enforcement

- Member: verify `leave_log.email === req.user.email` before any operation
- Admin/owner: bypass the email check, can access any leave record
- Delete: uploader (`uploaded_by === req.user.email`) or admin/owner

---

## 4. Permissions Summary

| Action | Owner | Admin | Member |
|---|---|---|---|
| List evidence (own leave) | ✅ | ✅ | ✅ |
| List evidence (any leave) | ✅ | ✅ | ❌ 403 |
| Upload evidence (own leave) | ✅ | ✅ | ✅ |
| Upload evidence (any leave) | ✅ | ✅ | ❌ 403 |
| Delete own evidence | ✅ | ✅ | ✅ |
| Delete others' evidence | ✅ | ✅ | ❌ 403 |
| Get signed URL (own leave) | ✅ | ✅ | ✅ |
| Get signed URL (any leave) | ✅ | ✅ | ❌ 403 |

---

## 5. UI Changes

### `member.html` — Leave History page

Each leave item in the history list gets a collapsible evidence panel:

```
┌─────────────────────────────────────────────┐
│ 🏖️ Sick Leave — May 26          ⏳ Pending  │
│ "Fever, will submit cert"        📎 1 file  │
│ ▼ Evidence                                  │
│   • medical-cert.pdf  [View] [Delete]       │
│   + Add file   + Add link                   │
└─────────────────────────────────────────────┘
```

- Paperclip icon with count appears on any leave item that has evidence
- Clicking expands the evidence panel (toggle)
- "Add file" opens a file picker (jpeg/png/pdf, max 5 MB)
- "Add link" shows an inline input for an external URL + optional note
- "View" fetches the signed URL and opens in a new tab
- "Delete" removes the evidence item after confirmation

### `admin.html` — Dashboard pending leave cards

Pending leave approval cards show evidence inline:

```
┌──────────────────────────────────────────────────────┐
│ Ana Reyes — Sick Leave — May 26     📎 2 files        │
│ "Doctor visit"                                        │
│ ▼ Evidence                                            │
│   • medical-cert.pdf        [View]                    │
│   • https://drive.google.com/...   [Open] [Delete]   │
│   + Add file   + Add link                             │
│                              [Approve] [Reject]       │
└──────────────────────────────────────────────────────┘
```

- Admin can view all evidence on any leave
- Admin can add or delete evidence on any leave
- Evidence panel loads lazily when expanded (not on page load)

---

## 6. Dependencies

- `multer` — multipart file parsing, memory storage (buffer passed directly to Supabase Storage)

```json
"multer": "^1.4.5-lts.1"
```

No other new dependencies. Supabase Storage JS client is already available via `lib/supabase.js`.

---

## 7. Migration

```sql
-- 009_create_leave_evidence.sql
create table leave_evidence (
  id           uuid primary key default gen_random_uuid(),
  leave_id     uuid not null references leave_log(id) on delete cascade,
  uploaded_by  text not null,
  file_path    text,
  file_name    text,
  external_url text,
  note         text,
  created_at   timestamptz not null default now()
);
```

Run in Supabase SQL Editor. Create the `leave-evidence` storage bucket manually in the Supabase dashboard (set to private).

---

## 8. Out of Scope (deferred)

- Evidence on attendance records (not leave) — deferred to Phase 8 appeals
- Admin-forced evidence requirement per leave type — deferred
- Evidence expiry / auto-deletion — deferred
- Virus scanning on uploads — deferred
