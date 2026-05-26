# Milestone A — Auth Overhaul + Owner/Admin/Member Hierarchy

**Date:** 2026-05-26
**Status:** Approved
**Scope:** Replace Google-only login with email+password as primary; Google as backup. Unify `managers` and `members` into one `users` table with a three-tier role hierarchy (owner / admin / member) and an owner-controlled promotion flow.

---

## 1. Overview

Today the system authenticates exclusively through Google Identity Services, and authorization is split across two tables (`managers`, `members`). This works for a closed team but blocks every other planned feature: per-user audit logging, password resets, signed sessions, role-gated APIs, owner-granted admin access.

Milestone A introduces:

1. A single `users` table containing every person in the system, with `role ∈ {owner, admin, member}` and `status ∈ {Active, Inactive, Pending}`.
2. Email + password (bcrypt) as the **primary** authentication path.
3. Google OAuth kept as a **secondary** path that links to the same account.
4. JWT-based sessions issued by our own server (we stop trusting Google's JWT for authorization).
5. An owner-controlled promotion/invite flow: owner is the only role that can promote a member to admin or demote an admin back to member. Admins manage members (activate/deactivate/invite) but cannot create or modify other admins.
6. A one-time CLI bootstrap that creates the single `owner` row. All other accounts are created through the UI.

The existing `attendance`, `leave_log`, `lunch_log`, `break_log` tables are **not** modified in this milestone — they continue to key off `email`. Linking those to `users.id` is deferred to a later milestone where it pays off (audit log, deductions, etc.).

---

## 2. Data Model

### 2.1 New table — `users`

```sql
create table users (
  id              uuid primary key default gen_random_uuid(),
  email           text unique not null,
  name            text not null,
  password_hash   text,                -- null if account is Google-only (no password set)
  google_sub      text unique,         -- Google's stable subject id, null until Google is linked
  role            text not null check (role in ('owner', 'admin', 'member')),
  job_role        text,                -- legacy from members.role (department/title); informational only
  status          text not null check (status in ('Active', 'Inactive', 'Pending')) default 'Pending',
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

-- At most one owner can exist
create unique index users_one_owner on users (role) where role = 'owner';

-- Every active account must have at least one credential
alter table users add constraint users_has_credential
  check (status <> 'Active' or password_hash is not null or google_sub is not null);
```

**Why `role` and `job_role` are separate:** the existing `members.role` column holds department/title info (preserved as `job_role`). The new `role` column is for authorization (`owner`/`admin`/`member`). Conflating the two would break the existing `attendance.role` reporting column.

### 2.2 Migration of existing data

Performed by `scripts/migrate-users-data.js` (idempotent):

| Old row | Becomes |
|---|---|
| `managers(id, email, name)` | `users(email, name, role='admin', status='Active', job_role=null)` |
| `members(id, email, name, role, status)` | `users(email, name, role='member', status=members.status, job_role=members.role)` |

Both old tables remain in place through the end of Milestone A. They are dropped only after the new flow is verified end-to-end in Milestone B.

### 2.3 The single `owner`

Created by `scripts/create-owner.js` exactly once. The unique partial index `users_one_owner` enforces that a second owner row cannot be inserted.

---

## 3. Authentication

### 3.1 JWT

Every authenticated route requires a JWT in `Authorization: Bearer <token>`.

```
payload: { user_id, email, role, iat, exp }
algorithm: HS256
secret: process.env.JWT_SECRET (required, fail-fast at startup if missing)
expiry: 24h
```

Tokens are stored in `sessionStorage` under key `anosupo_jwt` (matches the current pattern; no cookie work needed in this milestone).

### 3.2 Password hashing

`bcryptjs` (pure JS, no compile step) with **cost factor 12**. Verified at login with `bcrypt.compare`.

Minimum policy in Milestone A: ≥ 8 characters, ≤ 128 characters. No complexity rules (deferred).

### 3.3 Google linking

The Google OAuth flow continues to use Google Identity Services in the browser (no change to the front-end Google SDK). The server stops using the Google JWT for authorization — instead, it accepts the Google JWT only at `POST /auth/google`, verifies it against Google's tokeninfo endpoint, and then issues **our** JWT.

When a user logs in with Google for the first time:
- If a `users` row with that `email` exists, set its `google_sub` and issue our JWT.
- If no row exists, the response is `{ error: 'No account found. Please register first.' }` (HTTP 403). We do not auto-create accounts from Google logins — keeps the owner/admin in control.

---

## 4. New Routes

All routes are mounted under `/auth/*` and `/users/*`. They live alongside the existing `/webhook/*` routes.

### 4.1 Public auth routes

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{email, name, password}` | `{success: true, message: 'Account created. Waiting for admin approval.'}` |
| POST | `/auth/login` | `{email, password}` | `{token, user: {id, email, name, role}}` |
| POST | `/auth/google` | `{credential}` (Google JWT) | `{token, user}` or `403` if no matching account |

**Register flow:**
1. Validate body (email format, password length 8–128, name 1–80).
2. Look up existing `users` row by email. Three cases:
   - **No row** → fresh signup. Insert with `role='member', status='Pending'`, hashed password, the provided name. Send Discord notification to `#approvals`: "🆕 New signup: name (email). Approve in admin panel."
   - **Row exists, `password_hash is null`** (invite-claim case from §4.3) → update the row in place: set `password_hash`, preserve the invited `role` and `name`, leave `status='Pending'` if currently Pending (admin will activate). Respond success with message "Account ready. Waiting for admin approval." No new Discord notification (the invite already notified).
   - **Row exists, `password_hash is not null`** → `409 Conflict, an account with this email already exists.`
3. Respond success.

**Login flow:**
1. Find user by email.
2. If not found → `401 Invalid credentials` (same error as wrong-password, to avoid email enumeration).
3. If `status === 'Pending'` → `403 Your account is awaiting approval.`
4. If `status === 'Inactive'` → `403 Your account has been deactivated.`
5. If `password_hash` is null → `401 Invalid credentials` (account is Google-only).
6. `bcrypt.compare(password, hash)` — if false → `401`.
7. Update `last_login_at`.
8. Sign and return JWT + user info.

**Google flow:** as described in §3.3.

### 4.2 Authenticated auth routes

| Method | Path | Body | Auth |
|---|---|---|---|
| POST | `/auth/link-google` | `{credential}` | any logged-in user |
| POST | `/auth/change-password` | `{current_password?, new_password}` | any logged-in user |
| GET  | `/auth/me` | — | any logged-in user |

**Change-password flow:**
1. If the current user has `password_hash !== null`, `current_password` is required and must verify. (Standard password rotation.)
2. If the current user has `password_hash === null` (Google-only or migrated account), `current_password` is ignored. The user is already proven by the JWT, so this acts as "set initial password." After this, the row has a `password_hash` and subsequent changes go through path 1.
3. Validate new password length (8–128), hash with cost 12, update.

### 4.3 User management routes (`/users/*`)

All require `Authorization: Bearer <jwt>`. Role checks performed by middleware.

| Method | Path | Body | Required role |
|---|---|---|---|
| GET  | `/users` | — | admin or owner |
| POST | `/users/invite` | `{email, name, role}` | owner (any role) / admin (member only) |
| POST | `/users/:id/promote` | — | owner only — member → admin |
| POST | `/users/:id/demote` | — | owner only — admin → member |
| POST | `/users/:id/activate` | — | owner / admin — Pending or Inactive → Active |
| POST | `/users/:id/deactivate` | — | owner / admin — Active → Inactive |

**Invite flow:** creates a `Pending` row with no credentials. The invitee sets a password by going through `/auth/register` with the same email — register detects the existing Pending row and updates it (instead of erroring on duplicate email) provided no password is already set.

**Self-protection:** no user can deactivate, demote, or change the role of themselves. The owner cannot demote themselves (no second owner exists to take over).

---

## 5. Middleware

### 5.1 `requireAuth(req, res, next)`

1. Read `Authorization` header. If missing or not `Bearer <token>` → `401 Authentication required.`
2. `jwt.verify(token, JWT_SECRET)` — on failure (expired, malformed, bad signature) → `401`.
3. Attach `req.user = { user_id, email, role }`.
4. Call `next()`.

### 5.2 `requireRole(...allowedRoles)`

Run after `requireAuth`. If `req.user.role` not in allowed list → `403 Forbidden.`

### 5.3 `requireSelfOrRole(emailParam, ...allowedRoles)`

For routes that accept an email/user-id parameter. Pass-through if the requester is acting on their own record OR has one of the allowed roles. Used to lock down `/webhook/member-data` so members can read their own data and admins/owners can read anyone's.

---

## 6. Existing Route Changes

### 6.1 `/webhook/check-role` — DEPRECATED but preserved

For backward compatibility through Milestone A, this route still returns `{role: 'goldlist'|'whitelist'|'denied'}` based on a lookup in `users` (mapping `owner`/`admin` → `goldlist`, `member` → `whitelist`, missing → `denied`). It is removed in Milestone B.

### 6.2 `/webhook/attendance` — now requires auth

- Add `requireAuth` middleware.
- The route uses `req.user.email` instead of trusting `req.body.email`. Body email is ignored.
- The `name` and `job_role` are fetched from `users` table (not the old `members` table).
- No other logic changes.

### 6.3 `/webhook/member-data` — now requires auth + self-or-admin

- Add `requireAuth` + `requireSelfOrRole('email', 'owner', 'admin')`.
- The query param `email` must match `req.user.email` unless the caller is admin/owner.
- Member lookup hits `users` instead of `members`.

### 6.4 `/webhook/dashboard` — now requires admin/owner

- Add `requireAuth` + `requireRole('owner', 'admin')`.
- Members table lookup → `users` table where `role='member' AND status='Active'`.
- Otherwise unchanged.

### 6.5 `/webhook/approve` — now requires admin/owner

- Add `requireAuth` + `requireRole('owner', 'admin')`.
- Logic unchanged.

---

## 7. Front-End Changes

### 7.1 `index.html` — full rewrite of the login card

The right-panel content becomes:

```
[ Sign In ]  [ Create Account ]    ← tab strip

Sign In tab:
  Email     [______________]
  Password  [______________]
  [   Sign In   ]
  ── or ──
  [ G  Continue with Google ]
  Forgot your password? Contact your admin.

Create Account tab:
  Name      [______________]
  Email     [______________]
  Password  [______________]
  Confirm   [______________]
  [   Create Account   ]
  ── or ──
  [ G  Continue with Google ]    ← still says "no account → please register"
```

After successful login (any path):
- `sessionStorage.setItem('anosupo_jwt', token)`
- `sessionStorage.setItem('anosupo_user', JSON.stringify(user))`
- Redirect by role: `owner`/`admin` → `dashboard.html`, `member` → `member.html`.

The old `anosupo_credential` and `anosupo_role` keys are removed. A one-time migration on page load clears them if present.

### 7.2 `member.html` and `dashboard.html` — auth wiring

- On page load, read `anosupo_jwt` from sessionStorage. If absent, redirect to `index.html`.
- Decode JWT (no signature check — server is the only authority) to get `email`, `role`, `name` for display.
- All `fetch(...)` calls add `Authorization: Bearer <jwt>` header.
- On any `401` response, clear sessionStorage and redirect to `index.html`.
- `dashboard.html` adds a section that links to the new "User Management" UI.

### 7.3 New page — `admin.html` (User Management)

Reachable from `dashboard.html`. Shows a single table of all users:

| Name | Email | Role | Status | Last login | Actions |
|---|---|---|---|---|---|
| ... | ... | member | Pending | — | Activate · Invite resend · *(promote: owner only)* |

Action buttons are rendered based on the current user's role and the target row's role/status. The same role rules as §4.3 apply.

A "Invite User" button opens a modal: name, email, role (`admin` option is hidden for admins — only owner sees it).

---

## 8. Bootstrap and Migration Scripts

### 8.1 `scripts/create-owner.js`

```
Usage: node scripts/create-owner.js <email> <name> <password>
```

- Refuses to run if any `users` row with `role='owner'` already exists.
- Validates password length.
- Inserts the owner with `status='Active'`.
- Prints `Owner created: <email> (id=<uuid>)`.

### 8.2 `scripts/migrate-users-data.js`

Idempotent — re-running is safe.

```
Usage: node scripts/migrate-users-data.js [--dry-run]
```

- For each row in `managers`: if no `users` row with that email, insert `role='admin', status='Active'`.
- For each row in `members`: if no `users` row with that email, insert `role='member', status=members.status, job_role=members.role`.
- Prints a summary: `M managers migrated, N members migrated, K skipped (already in users)`.
- Does **not** delete from the old tables.

### 8.3 `migrations/001_create_users.sql`

The DDL from §2.1. The user runs this once in the Supabase SQL editor before running the JS scripts.

---

## 9. Environment Variables

Add to `.env` and `.env.example`:

```
JWT_SECRET=<long random string — use `openssl rand -hex 32`>
```

`server.js` aborts at startup if `JWT_SECRET` is undefined.

---

## 10. Dependencies

Added to `package.json`:

```json
"bcryptjs": "^2.4.3",
"jsonwebtoken": "^9.0.2"
```

No new dev dependencies — Jest already in place.

---

## 11. Testing Strategy

All new pure-logic helpers live in `lib/auth.js` (password hashing wrapper, JWT sign/verify wrappers, role-allowed predicate).

`tests/auth.test.js` covers:

- `hashPassword` produces a verifiable hash.
- `verifyPassword` returns true for correct, false for wrong.
- `signToken` / `verifyToken` round-trip preserves payload.
- `verifyToken` rejects expired tokens (manually craft one with `exp` in the past).
- `verifyToken` rejects tampered signatures.
- `canPerformRoleAction(actorRole, targetRole, action)` — covers the matrix:
  - owner can promote member→admin
  - owner can demote admin→member
  - admin cannot promote anyone
  - admin can activate/deactivate member but not admin
  - no one can demote themselves

Route-level integration tests are out of scope for Milestone A (deferred to a later infrastructure milestone where we set up a Supabase test instance).

---

## 12. File Layout After Milestone A

```
Attendance/
├── server.js                       ← + JWT_SECRET check, mounts auth and users routers
├── lib/
│   ├── auth.js                     ← NEW: password + JWT + role predicates
│   ├── supabase.js
│   ├── discord.js
│   └── rules.js
├── middleware/                     ← NEW
│   ├── requireAuth.js
│   ├── requireRole.js
│   └── requireSelfOrRole.js
├── routes/
│   ├── auth.js                     ← NEW: register / login / google / link-google / change-password / me
│   ├── users.js                    ← NEW: list / invite / promote / demote / activate / deactivate
│   ├── checkRole.js                ← unchanged behaviour, now reads `users` table
│   ├── attendance.js               ← + requireAuth, trust req.user.email
│   ├── memberData.js               ← + requireAuth + requireSelfOrRole
│   ├── dashboard.js                ← + requireAuth + requireRole('owner','admin')
│   └── approve.js                  ← + requireAuth + requireRole('owner','admin')
├── scripts/                        ← NEW
│   ├── create-owner.js
│   └── migrate-users-data.js
├── migrations/                     ← NEW
│   └── 001_create_users.sql
├── tests/
│   ├── rules.test.js
│   └── auth.test.js                ← NEW
├── index.html                      ← rewritten login card (tabs + Google secondary)
├── member.html                     ← + JWT header on fetches, 401 redirect
├── dashboard.html                  ← + JWT header, link to admin.html
├── admin.html                      ← NEW: user management table
├── package.json                    ← + bcryptjs, jsonwebtoken
├── .env                            ← + JWT_SECRET
└── .env.example                    ← + JWT_SECRET=
```

---

## 13. Cutover Procedure

In order, after all code is merged:

1. Run `migrations/001_create_users.sql` in the Supabase SQL editor.
2. Run `node scripts/migrate-users-data.js --dry-run`; review the report.
3. Run `node scripts/migrate-users-data.js` for real.
4. Run `node scripts/create-owner.js you@email.com "Your Name" <strong-password>`.
5. Restart the server (it now requires `JWT_SECRET`).
6. Open `index.html`. Sign in with the owner credentials. Verify the admin page loads.
7. Existing Google-using members can log in by clicking "Continue with Google" — their existing email matches a row in `users`, and `google_sub` is set on first use.

The old `managers`/`members` tables and the `/webhook/check-role` route remain in place; they are dropped at the start of Milestone B.

---

## 14. Out of Scope (Deferred)

- Email-based password reset (requires SMTP and reset-token table — schedule for Milestone B or a dedicated infra milestone)
- Password complexity rules beyond length (deferred to a security-hardening pass)
- Rate limiting on `/auth/login` (deferred to security pass)
- Two-factor authentication
- Account lockout after failed attempts
- Session revocation list (rely on 24h JWT expiry for now)
- Linking `attendance`/`leave_log`/etc. to `users.id` via foreign keys (deferred; later milestone)
- Audit log of role changes and logins (it's its own milestone — Milestone B)
- Email-based invites (Milestone A uses Discord notifications only)
