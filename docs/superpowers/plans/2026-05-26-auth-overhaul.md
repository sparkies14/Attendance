# Milestone A — Auth Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google-only authentication with email+password as primary path (Google as backup), unify `managers`+`members` into a single `users` table with `owner`/`admin`/`member` roles, and add an owner-controlled promotion flow.

**Architecture:** Express server issues its own JWTs after verifying credentials (password via bcryptjs, or Google JWT via Google's tokeninfo). All `/webhook/*` routes get a `requireAuth` middleware; admin routes also get `requireRole`. Front-end stores JWT in `sessionStorage` and includes it as `Authorization: Bearer` on every API call.

**Tech Stack:** Node.js 18+, Express 4, Supabase, bcryptjs 2, jsonwebtoken 9, Jest 29

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `bcryptjs`, `jsonwebtoken` |
| `.env.example` | Modify | Add `JWT_SECRET=` |
| `.env` | Modify (manually) | Add real `JWT_SECRET` |
| `lib/auth.js` | Create | Pure helpers: hashPassword, verifyPassword, signToken, verifyToken, canPerformRoleAction |
| `tests/auth.test.js` | Create | Jest unit tests for lib/auth.js |
| `middleware/requireAuth.js` | Create | Verify JWT, attach `req.user` |
| `middleware/requireRole.js` | Create | Gate by role list |
| `middleware/requireSelfOrRole.js` | Create | Allow if caller is acting on own record OR has elevated role |
| `tests/middleware.test.js` | Create | Jest unit tests for the 3 middlewares with mock req/res |
| `migrations/001_create_users.sql` | Create | DDL for `users` table |
| `scripts/migrate-users-data.js` | Create | Idempotent: copy managers+members into users |
| `scripts/create-owner.js` | Create | One-shot: insert single owner row |
| `routes/auth.js` | Create | `/auth/register`, `/login`, `/google`, `/me`, `/link-google`, `/change-password` |
| `routes/users.js` | Create | `/users`, `/invite`, `/:id/promote`, `/demote`, `/activate`, `/deactivate` |
| `routes/checkRole.js` | Modify | Read from `users` table; map roles to legacy shape |
| `routes/attendance.js` | Modify | Add `requireAuth`; trust `req.user.email` |
| `routes/memberData.js` | Modify | Add `requireAuth` + `requireSelfOrRole` |
| `routes/dashboard.js` | Modify | Add `requireAuth` + `requireRole('owner','admin')` |
| `routes/approve.js` | Modify | Add `requireAuth` + `requireRole('owner','admin')` |
| `server.js` | Modify | Fail-fast on missing `JWT_SECRET`; mount `/auth` and `/users` routers |
| `index.html` | Modify | Rewrite login card: tabs (Sign In / Create Account), email+password forms, Google as secondary |
| `member.html` | Modify | Read JWT from sessionStorage; send as `Authorization: Bearer`; 401 → redirect |
| `dashboard.html` | Modify | Same JWT wiring + link to `admin.html` |
| `admin.html` | Create | User management table (promote/demote/activate/invite) |

---

## Task 1: Add dependencies + env var

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Add new dependencies**

Edit `package.json` so the `dependencies` section becomes:

```json
"dependencies": {
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "@supabase/supabase-js": "^2.39.0",
  "dotenv": "^16.3.1",
  "bcryptjs": "^2.4.3",
  "jsonwebtoken": "^9.0.2"
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: no errors, `bcryptjs` and `jsonwebtoken` appear under `node_modules/`.

- [ ] **Step 3: Add JWT_SECRET to .env.example**

Append to `.env.example`:

```
JWT_SECRET=replace-with-output-of-openssl-rand-hex-32
```

- [ ] **Step 4: Add a real JWT_SECRET to local .env**

Run: `openssl rand -hex 32`
Copy the output, then add a `JWT_SECRET=<that-value>` line to `.env`. (Do NOT commit `.env`.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add bcryptjs + jsonwebtoken deps and JWT_SECRET env var"
```

---

## Task 2: Auth helpers (lib/auth.js) — write tests first

**Files:**
- Create: `tests/auth.test.js`
- Create: `lib/auth.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/auth.test.js`:

```js
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  canPerformRoleAction,
} = require('../lib/auth');

const jwt = require('jsonwebtoken');

describe('hashPassword + verifyPassword', () => {
  test('hash is not the plain password', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).not.toBe('correct horse');
    expect(hash.length).toBeGreaterThan(20);
  });

  test('verify returns true for the right password', async () => {
    const hash = await hashPassword('hunter2');
    expect(await verifyPassword('hunter2', hash)).toBe(true);
  });

  test('verify returns false for the wrong password', async () => {
    const hash = await hashPassword('hunter2');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  test('verify returns false when hash is null', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
  });
});

describe('signToken + verifyToken', () => {
  test('round-trip preserves payload fields', () => {
    const token = signToken({ user_id: 'abc', email: 'a@b.com', role: 'admin' });
    const payload = verifyToken(token);
    expect(payload.user_id).toBe('abc');
    expect(payload.email).toBe('a@b.com');
    expect(payload.role).toBe('admin');
  });

  test('verify returns null on tampered token', () => {
    const token = signToken({ user_id: 'abc', email: 'a@b.com', role: 'member' });
    const tampered = token.slice(0, -4) + 'xxxx';
    expect(verifyToken(tampered)).toBeNull();
  });

  test('verify returns null on expired token', () => {
    const expired = jwt.sign(
      { user_id: 'abc', email: 'a@b.com', role: 'member' },
      process.env.JWT_SECRET,
      { expiresIn: '-1h' }
    );
    expect(verifyToken(expired)).toBeNull();
  });

  test('verify returns null on garbage input', () => {
    expect(verifyToken('not-a-token')).toBeNull();
    expect(verifyToken('')).toBeNull();
    expect(verifyToken(null)).toBeNull();
  });
});

describe('canPerformRoleAction', () => {
  // promote: member → admin (owner only)
  test('owner can promote member', () => {
    expect(canPerformRoleAction('owner', 'member', 'promote')).toBe(true);
  });
  test('admin cannot promote anyone', () => {
    expect(canPerformRoleAction('admin', 'member', 'promote')).toBe(false);
  });
  test('member cannot promote', () => {
    expect(canPerformRoleAction('member', 'member', 'promote')).toBe(false);
  });
  test('promote on a non-member is rejected', () => {
    expect(canPerformRoleAction('owner', 'admin', 'promote')).toBe(false);
  });

  // demote: admin → member (owner only)
  test('owner can demote admin', () => {
    expect(canPerformRoleAction('owner', 'admin', 'demote')).toBe(true);
  });
  test('admin cannot demote admin', () => {
    expect(canPerformRoleAction('admin', 'admin', 'demote')).toBe(false);
  });
  test('demote on a non-admin is rejected', () => {
    expect(canPerformRoleAction('owner', 'member', 'demote')).toBe(false);
  });
  test('owner cannot be demoted', () => {
    expect(canPerformRoleAction('owner', 'owner', 'demote')).toBe(false);
  });

  // activate / deactivate: owner & admin can act on members; only owner on admins
  test('admin can activate member', () => {
    expect(canPerformRoleAction('admin', 'member', 'activate')).toBe(true);
  });
  test('admin cannot activate admin', () => {
    expect(canPerformRoleAction('admin', 'admin', 'activate')).toBe(false);
  });
  test('owner can activate admin', () => {
    expect(canPerformRoleAction('owner', 'admin', 'activate')).toBe(true);
  });
  test('admin cannot deactivate admin', () => {
    expect(canPerformRoleAction('admin', 'admin', 'deactivate')).toBe(false);
  });
  test('admin can deactivate member', () => {
    expect(canPerformRoleAction('admin', 'member', 'deactivate')).toBe(true);
  });
  test('owner cannot deactivate owner', () => {
    expect(canPerformRoleAction('owner', 'owner', 'deactivate')).toBe(false);
  });

  // invite: owner can invite any role; admin can invite only member
  test('owner can invite admin', () => {
    expect(canPerformRoleAction('owner', 'admin', 'invite')).toBe(true);
  });
  test('owner can invite member', () => {
    expect(canPerformRoleAction('owner', 'member', 'invite')).toBe(true);
  });
  test('admin can invite member', () => {
    expect(canPerformRoleAction('admin', 'member', 'invite')).toBe(true);
  });
  test('admin cannot invite admin', () => {
    expect(canPerformRoleAction('admin', 'admin', 'invite')).toBe(false);
  });
  test('no one can invite an owner', () => {
    expect(canPerformRoleAction('owner', 'owner', 'invite')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

Run: `npm test -- tests/auth.test.js`
Expected: `Cannot find module '../lib/auth'`

- [ ] **Step 3: Implement `lib/auth.js`**

Create `lib/auth.js`:

```js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const BCRYPT_COST = 12;
const TOKEN_TTL = '24h';

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Returns true if `actorRole` may perform `action` on a user with `targetRole`.
 * Actions: 'promote', 'demote', 'activate', 'deactivate', 'invite'.
 */
function canPerformRoleAction(actorRole, targetRole, action) {
  // Owner is immutable from these actions
  if (targetRole === 'owner' && action !== 'invite') return false;
  if (targetRole === 'owner' && action === 'invite') return false; // no one invites an owner

  switch (action) {
    case 'promote':
      // member → admin, owner only
      return actorRole === 'owner' && targetRole === 'member';

    case 'demote':
      // admin → member, owner only
      return actorRole === 'owner' && targetRole === 'admin';

    case 'activate':
    case 'deactivate':
      // both owner and admin can manage members; only owner can manage admins
      if (targetRole === 'member') return actorRole === 'owner' || actorRole === 'admin';
      if (targetRole === 'admin')  return actorRole === 'owner';
      return false;

    case 'invite':
      // owner can invite any role; admin can invite member only
      if (actorRole === 'owner') return targetRole === 'admin' || targetRole === 'member';
      if (actorRole === 'admin') return targetRole === 'member';
      return false;

    default:
      return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  canPerformRoleAction,
};
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/auth.test.js`
Expected: all auth tests pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass (auth + existing rules).

- [ ] **Step 6: Commit**

```bash
git add lib/auth.js tests/auth.test.js
git commit -m "feat: add auth helpers (bcrypt, JWT, role action matrix)"
```

---

## Task 3: Auth middleware (3 files)

**Files:**
- Create: `middleware/requireAuth.js`
- Create: `middleware/requireRole.js`
- Create: `middleware/requireSelfOrRole.js`
- Create: `tests/middleware.test.js`

- [ ] **Step 1: Create the middleware directory**

Run: `mkdir -p middleware`

- [ ] **Step 2: Write tests first**

Create `tests/middleware.test.js`:

```js
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { signToken } = require('../lib/auth');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const requireSelfOrRole = require('../middleware/requireSelfOrRole');

function mockReq(headers = {}, query = {}, params = {}) {
  return { headers, query, params, user: undefined };
}
function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('requireAuth', () => {
  test('401 when Authorization header missing', () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 on malformed header (no Bearer prefix)', () => {
    const req = mockReq({ authorization: 'NoBearerHere' });
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 on invalid token', () => {
    const req = mockReq({ authorization: 'Bearer not-a-real-token' });
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('attaches req.user and calls next on valid token', () => {
    const token = signToken({ user_id: 'u1', email: 'a@b.com', role: 'admin' });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.user_id).toBe('u1');
    expect(req.user.email).toBe('a@b.com');
    expect(req.user.role).toBe('admin');
  });
});

describe('requireRole', () => {
  test('403 when role not in allowed list', () => {
    const req = { user: { role: 'member' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('owner', 'admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('passes when role is in allowed list', () => {
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('owner', 'admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passes for owner regardless of order', () => {
    const req = { user: { role: 'owner' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin', 'owner')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('requireSelfOrRole', () => {
  test('passes when caller acts on own email', () => {
    const req = { user: { email: 'me@a.com', role: 'member' }, query: { email: 'me@a.com' } };
    const res = mockRes();
    const next = jest.fn();
    requireSelfOrRole('email', 'owner', 'admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passes when caller has elevated role', () => {
    const req = { user: { email: 'admin@a.com', role: 'admin' }, query: { email: 'someone@b.com' } };
    const res = mockRes();
    const next = jest.fn();
    requireSelfOrRole('email', 'owner', 'admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('403 when neither self nor elevated', () => {
    const req = { user: { email: 'me@a.com', role: 'member' }, query: { email: 'someone@b.com' } };
    const res = mockRes();
    const next = jest.fn();
    requireSelfOrRole('email', 'owner', 'admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 when target email is missing', () => {
    const req = { user: { email: 'me@a.com', role: 'member' }, query: {} };
    const res = mockRes();
    const next = jest.fn();
    requireSelfOrRole('email', 'owner', 'admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL (modules not found)**

Run: `npm test -- tests/middleware.test.js`
Expected: `Cannot find module '../middleware/requireAuth'`

- [ ] **Step 4: Implement `middleware/requireAuth.js`**

Create `middleware/requireAuth.js`:

```js
const { verifyToken } = require('../lib/auth');

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  req.user = { user_id: payload.user_id, email: payload.email, role: payload.role };
  next();
};
```

- [ ] **Step 5: Implement `middleware/requireRole.js`**

Create `middleware/requireRole.js`:

```js
module.exports = function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    next();
  };
};
```

- [ ] **Step 6: Implement `middleware/requireSelfOrRole.js`**

Create `middleware/requireSelfOrRole.js`:

```js
/**
 * Allow if the caller acts on their own record (req.query[emailParam] === req.user.email)
 * OR their role is in the allowed list.
 */
module.exports = function requireSelfOrRole(emailParam, ...allowedRoles) {
  return function (req, res, next) {
    const targetEmail = req.query[emailParam] || req.params[emailParam];
    if (!req.user) return res.status(403).json({ error: 'Forbidden.' });
    if (allowedRoles.includes(req.user.role)) return next();
    if (targetEmail && targetEmail === req.user.email) return next();
    return res.status(403).json({ error: 'Forbidden.' });
  };
};
```

- [ ] **Step 7: Run tests — expect PASS**

Run: `npm test -- tests/middleware.test.js`
Expected: all middleware tests pass.

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add middleware/ tests/middleware.test.js
git commit -m "feat: add requireAuth, requireRole, requireSelfOrRole middlewares"
```

---

## Task 4: SQL migration + data migration + bootstrap scripts

**Files:**
- Create: `migrations/001_create_users.sql`
- Create: `scripts/migrate-users-data.js`
- Create: `scripts/create-owner.js`

- [ ] **Step 1: Create directories**

Run: `mkdir -p migrations scripts`

- [ ] **Step 2: Create `migrations/001_create_users.sql`**

```sql
-- Milestone A: unified users table

create extension if not exists pgcrypto;  -- for gen_random_uuid()

create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           text unique not null,
  name            text not null,
  password_hash   text,
  google_sub      text unique,
  role            text not null check (role in ('owner', 'admin', 'member')),
  job_role        text,
  status          text not null check (status in ('Active', 'Inactive', 'Pending')) default 'Pending',
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

create unique index if not exists users_one_owner
  on users (role) where role = 'owner';

alter table users drop constraint if exists users_has_credential;
alter table users add constraint users_has_credential
  check (status <> 'Active' or password_hash is not null or google_sub is not null);
```

- [ ] **Step 3: Create `scripts/migrate-users-data.js`**

```js
require('dotenv').config();
const supabase = require('../lib/supabase');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`);

  const { data: managers, error: e1 } = await supabase.from('managers').select('email, name');
  if (e1) { console.error('managers fetch failed:', e1); process.exit(1); }

  const { data: members, error: e2 } = await supabase.from('members').select('email, name, role, status');
  if (e2) { console.error('members fetch failed:', e2); process.exit(1); }

  const { data: existing, error: e3 } = await supabase.from('users').select('email');
  if (e3) { console.error('users fetch failed:', e3); process.exit(1); }
  const existingEmails = new Set((existing || []).map(u => u.email));

  let managersAdded = 0;
  let membersAdded = 0;
  let skipped = 0;

  for (const m of (managers || [])) {
    if (existingEmails.has(m.email)) { skipped++; continue; }
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').insert({
        email: m.email, name: m.name, role: 'admin', status: 'Active', job_role: null,
      });
      if (error) { console.error(`Failed to insert manager ${m.email}:`, error.message); continue; }
    }
    managersAdded++;
    existingEmails.add(m.email);
  }

  for (const mb of (members || [])) {
    if (existingEmails.has(mb.email)) { skipped++; continue; }
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').insert({
        email: mb.email,
        name: mb.name,
        role: 'member',
        status: mb.status || 'Active',
        job_role: mb.role || null,
      });
      if (error) { console.error(`Failed to insert member ${mb.email}:`, error.message); continue; }
    }
    membersAdded++;
    existingEmails.add(mb.email);
  }

  console.log(`Managers → users: ${managersAdded}`);
  console.log(`Members  → users: ${membersAdded}`);
  console.log(`Skipped (already in users): ${skipped}`);
  if (DRY_RUN) console.log('(no rows were actually written — re-run without --dry-run to apply.)');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 4: Create `scripts/create-owner.js`**

```js
require('dotenv').config();
const supabase = require('../lib/supabase');
const { hashPassword } = require('../lib/auth');

async function main() {
  const [email, name, password] = process.argv.slice(2);

  if (!email || !name || !password) {
    console.error('Usage: node scripts/create-owner.js <email> <name> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const { data: existing, error: e1 } = await supabase
    .from('users').select('id, email').eq('role', 'owner').maybeSingle();
  if (e1) { console.error('Lookup failed:', e1.message); process.exit(1); }
  if (existing) {
    console.error(`Owner already exists: ${existing.email}. Aborting.`);
    process.exit(1);
  }

  const password_hash = await hashPassword(password);
  const { data, error } = await supabase.from('users').insert({
    email, name, password_hash, role: 'owner', status: 'Active',
  }).select('id, email').single();

  if (error) { console.error('Insert failed:', error.message); process.exit(1); }
  console.log(`Owner created: ${data.email} (id=${data.id})`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 5: Commit (DO NOT run scripts yet — schema isn't applied)**

```bash
git add migrations/ scripts/
git commit -m "feat: add users SQL migration, data migration script, owner bootstrap"
```

- [ ] **Step 6: Run the SQL migration in Supabase**

Open your Supabase project → SQL Editor → paste the entire contents of `migrations/001_create_users.sql` → Run.
Expected: query succeeds, `users` table appears in the Tables view.

- [ ] **Step 7: Dry-run the data migration**

Run: `node scripts/migrate-users-data.js --dry-run`
Expected output (numbers vary):
```
Mode: DRY-RUN
Managers → users: <N>
Members  → users: <M>
Skipped (already in users): 0
(no rows were actually written — re-run without --dry-run to apply.)
```

- [ ] **Step 8: Apply the data migration**

Run: `node scripts/migrate-users-data.js`
Expected: same numbers, no `--dry-run` notice.

Re-run once more — expected: all rows show as Skipped (idempotency check).

- [ ] **Step 9: Bootstrap your owner account**

Run: `node scripts/create-owner.js <your-email> "<Your Name>" <strong-password>`
Expected: `Owner created: <your-email> (id=<uuid>)`

Then try running it again — expected: `Owner already exists … Aborting.`

---

## Task 5: Auth routes

**Files:**
- Create: `routes/auth.js`

This route file uses Google's tokeninfo endpoint to verify Google credentials. Built-in `fetch` (Node 18+) is sufficient.

- [ ] **Step 1: Create `routes/auth.js`**

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');
const { hashPassword, verifyPassword, signToken } = require('../lib/auth');
const requireAuth = require('../middleware/requireAuth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(e) { return typeof e === 'string' && EMAIL_RE.test(e); }
function validatePassword(p) { return typeof p === 'string' && p.length >= 8 && p.length <= 128; }
function validateName(n) { return typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 80; }

async function verifyGoogleCredential(credential) {
  // Use Google's tokeninfo endpoint — it verifies signature, issuer, and expiry server-side.
  const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.sub || !data.email) return null;
  return { sub: data.sub, email: data.email, name: data.name || data.email };
}

function issueLoginResponse(user) {
  const token = signToken({ user_id: user.id, email: user.email, role: user.role });
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

// ── Public ──────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { email, name, password } = req.body || {};
  if (!validateEmail(email))    return res.status(400).json({ error: 'Invalid email.' });
  if (!validateName(name))      return res.status(400).json({ error: 'Name must be 1–80 characters.' });
  if (!validatePassword(password)) return res.status(400).json({ error: 'Password must be 8–128 characters.' });

  const { data: existing, error: e1 } = await supabase
    .from('users').select('id, password_hash, role, status, name').eq('email', email).maybeSingle();
  if (e1) return res.status(500).json({ error: 'Database error.' });

  const password_hash = await hashPassword(password);

  if (!existing) {
    // Fresh signup
    const { error } = await supabase.from('users').insert({
      email, name: name.trim(), password_hash, role: 'member', status: 'Pending',
    });
    if (error) return res.status(500).json({ error: error.message });

    // Non-blocking Discord notification
    try {
      const { sendMessage, CHANNELS } = require('../lib/discord');
      sendMessage(CHANNELS.approvals,
        `🆕 New signup: **${name}** (${email}). Approve in the admin panel.`);
    } catch (e) { /* discord optional */ }

    return res.json({ success: true, message: 'Account created. Waiting for admin approval.' });
  }

  if (existing.password_hash) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  // Invite-claim case: row exists with no password yet — set the password, preserve invited role.
  const { error: e2 } = await supabase.from('users')
    .update({ password_hash })
    .eq('id', existing.id);
  if (e2) return res.status(500).json({ error: e2.message });

  return res.json({ success: true, message: 'Account ready. Waiting for admin approval.' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!validateEmail(email) || typeof password !== 'string') {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const { data: user, error } = await supabase
    .from('users').select('id, email, name, role, status, password_hash').eq('email', email).maybeSingle();
  if (error) return res.status(500).json({ error: 'Database error.' });
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  if (user.status === 'Pending')  return res.status(403).json({ error: 'Your account is awaiting approval.' });
  if (user.status === 'Inactive') return res.status(403).json({ error: 'Your account has been deactivated.' });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

  await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

  return res.json(issueLoginResponse(user));
});

router.post('/google', async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Missing credential.' });

  const profile = await verifyGoogleCredential(credential);
  if (!profile) return res.status(401).json({ error: 'Invalid Google credential.' });

  // Lookup by google_sub first, fallback to email
  let { data: user } = await supabase
    .from('users').select('id, email, name, role, status, google_sub').eq('google_sub', profile.sub).maybeSingle();
  if (!user) {
    const r = await supabase.from('users')
      .select('id, email, name, role, status, google_sub').eq('email', profile.email).maybeSingle();
    user = r.data;
  }

  if (!user) {
    return res.status(403).json({ error: 'No account found. Please register first.' });
  }
  if (user.status === 'Pending')  return res.status(403).json({ error: 'Your account is awaiting approval.' });
  if (user.status === 'Inactive') return res.status(403).json({ error: 'Your account has been deactivated.' });

  // Set google_sub on first Google login
  if (!user.google_sub) {
    await supabase.from('users').update({ google_sub: profile.sub }).eq('id', user.id);
  }
  await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

  return res.json(issueLoginResponse(user));
});

// ── Authenticated ───────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users').select('id, email, name, role, status, google_sub, password_hash').eq('id', req.user.user_id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Database error.' });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({
    id: user.id, email: user.email, name: user.name, role: user.role, status: user.status,
    hasPassword: !!user.password_hash,
    hasGoogle: !!user.google_sub,
  });
});

router.post('/link-google', requireAuth, async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Missing credential.' });

  const profile = await verifyGoogleCredential(credential);
  if (!profile) return res.status(401).json({ error: 'Invalid Google credential.' });

  // The credential's email must match the logged-in user's email
  if (profile.email !== req.user.email) {
    return res.status(400).json({ error: 'Google account email does not match your account.' });
  }

  const { error } = await supabase.from('users')
    .update({ google_sub: profile.sub })
    .eq('id', req.user.user_id);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ success: true, message: 'Google account linked.' });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!validatePassword(new_password)) {
    return res.status(400).json({ error: 'New password must be 8–128 characters.' });
  }

  const { data: user, error } = await supabase
    .from('users').select('password_hash').eq('id', req.user.user_id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Database error.' });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // Only require current_password if one is already set
  if (user.password_hash) {
    const ok = await verifyPassword(current_password || '', user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const new_hash = await hashPassword(new_password);
  const { error: e2 } = await supabase.from('users').update({ password_hash: new_hash }).eq('id', req.user.user_id);
  if (e2) return res.status(500).json({ error: e2.message });

  return res.json({ success: true, message: 'Password updated.' });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add routes/auth.js
git commit -m "feat: add auth routes (register, login, google, me, link-google, change-password)"
```

---

## Task 6: Users routes

**Files:**
- Create: `routes/users.js`

- [ ] **Step 1: Create `routes/users.js`**

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { canPerformRoleAction } = require('../lib/auth');

// All routes below require auth
router.use(requireAuth);

// ── List all users (admin or owner) ─────────────────────────────────

router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, job_role, status, created_at, last_login_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ users: data || [] });
});

// ── Invite a new user ───────────────────────────────────────────────

router.post('/invite', async (req, res) => {
  const { email, name, role } = req.body || {};
  if (!email || !name || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'email, name, and role (admin|member) are required.' });
  }
  if (!canPerformRoleAction(req.user.role, role, 'invite')) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  // Don't invite if already exists
  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (existing) return res.status(409).json({ error: 'A user with this email already exists.' });

  const { data, error } = await supabase.from('users').insert({
    email, name, role, status: 'Pending', created_by: req.user.user_id,
  }).select('id, email, name, role, status').single();
  if (error) return res.status(500).json({ error: error.message });

  try {
    const { sendMessage, CHANNELS } = require('../lib/discord');
    sendMessage(CHANNELS.approvals,
      `📨 Invite sent: **${name}** (${email}) — role: ${role}. They need to register with this email to claim the account.`);
  } catch (e) { /* discord optional */ }

  return res.json({ success: true, user: data });
});

// ── Promote / Demote / Activate / Deactivate ────────────────────────

async function performRoleAction(req, res, action, newFields) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'Invalid user id.' });
  if (id === req.user.user_id) {
    return res.status(400).json({ error: 'You cannot perform this action on yourself.' });
  }

  const { data: target, error: e1 } = await supabase
    .from('users').select('id, role, status').eq('id', id).maybeSingle();
  if (e1) return res.status(500).json({ error: 'Database error.' });
  if (!target) return res.status(404).json({ error: 'User not found.' });

  if (!canPerformRoleAction(req.user.role, target.role, action)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const { data, error } = await supabase.from('users').update(newFields).eq('id', id).select('id, email, name, role, status').single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, user: data });
}

router.post('/:id/promote',    (req, res) => performRoleAction(req, res, 'promote',    { role: 'admin' }));
router.post('/:id/demote',     (req, res) => performRoleAction(req, res, 'demote',     { role: 'member' }));
router.post('/:id/activate',   (req, res) => performRoleAction(req, res, 'activate',   { status: 'Active' }));
router.post('/:id/deactivate', (req, res) => performRoleAction(req, res, 'deactivate', { status: 'Inactive' }));

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add routes/users.js
git commit -m "feat: add users routes (list, invite, promote, demote, activate, deactivate)"
```

---

## Task 7: Update existing routes

**Files:**
- Modify: `routes/checkRole.js`
- Modify: `routes/attendance.js`
- Modify: `routes/memberData.js`
- Modify: `routes/dashboard.js`
- Modify: `routes/approve.js`

- [ ] **Step 1: Update `routes/checkRole.js` — read from `users`, return legacy shape**

Replace the entire content of `routes/checkRole.js` with:

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');

// LEGACY: returns 'goldlist' for owner/admin, 'whitelist' for member, 'denied' otherwise.
// Kept for backward compatibility during Milestone A; removed in Milestone B.
router.post('/', async (req, res) => {
  const { email } = req.body || {};
  const { data: user, error } = await supabase
    .from('users').select('role, status').eq('email', email).maybeSingle();
  if (error) return res.status(500).json({ error: 'Database error.' });
  if (!user || user.status !== 'Active') return res.json({ role: 'denied' });

  if (user.role === 'owner' || user.role === 'admin') return res.json({ role: 'goldlist' });
  if (user.role === 'member') return res.json({ role: 'whitelist' });
  return res.json({ role: 'denied' });
});

module.exports = router;
```

- [ ] **Step 2: Update `routes/attendance.js` — require auth, trust req.user.email**

Replace the entire content of `routes/attendance.js` with:

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');
const { sendMessage, CHANNELS } = require('../lib/discord');
const { classifyLateStatus, timeToMinutes, calcNetHours } = require('../lib/rules');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.post('/', async (req, res) => {
  const email = req.user.email; // trust the JWT, ignore body.email
  const {
    action, entry_type, local_time, date,
    jst_hour, jst_minute, fingerprint, reason, leave_type,
  } = req.body || {};

  // Verify member is still active and pull official name + job_role
  const { data: user } = await supabase
    .from('users').select('name, job_role, status').eq('email', email).maybeSingle();
  if (!user || user.status !== 'Active') {
    return res.status(403).json({ error: 'Your account is not active.' });
  }
  const officialName = user.name;
  const role = user.job_role;

  // Late classification only applies to clock-in
  const late_status = action === 'clock-in'
    ? classifyLateStatus(Number(jst_hour), Number(jst_minute))
    : '';

  // Manual entry — clock-in goes to pending approval
  if (entry_type === 'manual' && action === 'clock-in') {
    const { error } = await supabase.from('attendance').insert({
      email, name: officialName, date,
      clock_in: local_time, clock_out: '', total_hours: 0,
      entry_type, status: 'Pending', late_status, reason, fingerprint, role,
    });
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.approvals,
      `📋 **Manual Entry** — ${officialName}\nDate: ${date} | Time: ${local_time} | Reason: ${reason}`);
    return res.json({ success: true, message: 'Manual entry submitted! Waiting for manager approval.' });
  }

  if (action === 'clock-in') {
    const { data: dup } = await supabase
      .from('attendance').select('id').eq('email', email).eq('date', date).maybeSingle();
    if (dup) return res.status(400).json({ error: 'You already clocked in today. Use Clock Out instead.' });

    const { error } = await supabase.from('attendance').insert({
      email, name: officialName, date,
      clock_in: local_time, clock_out: '', total_hours: 0,
      entry_type, status: 'Approved', late_status, reason: '', fingerprint, role,
    });
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.clockLogs,
      `🟢 **Clock In** — ${officialName} | ${date} ${local_time} | ${late_status}`);
    return res.json({ success: true, message: 'Clock in recorded!' });
  }

  if (action === 'clock-out') {
    const { data: row } = await supabase
      .from('attendance').select('id, clock_in').eq('email', email).eq('date', date).maybeSingle();
    if (!row) return res.status(400).json({ error: 'No clock-in record found for today.' });

    const total_hours = calcNetHours(row.clock_in, local_time);
    const { error } = await supabase.from('attendance')
      .update({ clock_out: local_time, total_hours, status: 'Approved' })
      .eq('id', row.id);
    if (error) return res.status(500).json({ error: error.message });
    await sendMessage(CHANNELS.clockLogs,
      `🔴 **Clock Out** — ${officialName} | ${date} ${local_time} | Net: ${total_hours}h`);
    return res.json({ success: true, message: 'Clock out recorded!' });
  }

  if (action === 'leave') {
    const { error } = await supabase.from('leave_log').insert({
      email, name: officialName, date, leave_type, reason, status: 'Pending',
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: '🏖️ Leave request submitted! Manager will review shortly.' });
  }

  if (action === 'lunch-out') {
    const { error } = await supabase.from('lunch_log').insert({
      name: officialName, date, lunch_out: local_time, lunch_in: '', duration_mins: 0,
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Lunch out recorded!' });
  }

  if (action === 'lunch-in') {
    const { data: lunchRow } = await supabase
      .from('lunch_log').select('id, lunch_out').eq('name', officialName).eq('date', date).maybeSingle();
    if (!lunchRow) return res.status(400).json({ error: 'No lunch-out record found.' });
    const duration_mins = timeToMinutes(local_time) - timeToMinutes(lunchRow.lunch_out);
    const { error } = await supabase.from('lunch_log')
      .update({ lunch_in: local_time, duration_mins }).eq('id', lunchRow.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Lunch in recorded!' });
  }

  if (action === 'break-out') {
    const { error } = await supabase.from('break_log').insert({
      name: officialName, date, break_out: local_time, break_in: '', duration_mins: 0,
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Break out recorded!' });
  }

  if (action === 'break-in') {
    const { data: breakRow } = await supabase
      .from('break_log').select('id, break_out').eq('name', officialName).eq('date', date).maybeSingle();
    if (!breakRow) return res.status(400).json({ error: 'No break-out record found.' });
    const duration_mins = timeToMinutes(local_time) - timeToMinutes(breakRow.break_out);
    const { error } = await supabase.from('break_log')
      .update({ break_in: local_time, duration_mins }).eq('id', breakRow.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Break in recorded!' });
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
});

module.exports = router;
```

- [ ] **Step 3: Update `routes/memberData.js` — auth + self-or-admin + read from users**

Replace the entire content of `routes/memberData.js` with:

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');
const { calendarDayStatus, todayJST } = require('../lib/rules');
const requireAuth = require('../middleware/requireAuth');
const requireSelfOrRole = require('../middleware/requireSelfOrRole');

router.use(requireAuth);
router.use(requireSelfOrRole('email', 'owner', 'admin'));

router.get('/', async (req, res) => {
  const { email, month, year } = req.query;
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);
  const today = todayJST();

  const { data: user } = await supabase
    .from('users').select('name').eq('email', email).maybeSingle();
  if (!user) return res.status(400).json({ error: 'Member not found.' });
  const officialName = user.name;

  const [
    { data: allAttendance },
    { data: allLeave },
    { data: lunchToday },
    { data: breakToday },
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('email', email),
    supabase.from('leave_log').select('*').eq('email', email),
    supabase.from('lunch_log').select('*').eq('name', officialName).eq('date', today).maybeSingle(),
    supabase.from('break_log').select('*').eq('name', officialName).eq('date', today).maybeSingle(),
  ]);

  const monthAtt = (allAttendance || []).filter(a => {
    const d = new Date(a.date);
    return d.getMonth() + 1 === monthNum && d.getFullYear() === yearNum;
  });

  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const calendar = [];
  const summary = { present: 0, late: 0, absent: 0, pending: 0 };

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(yearNum, monthNum - 1, day);
    const dateStr = d.toLocaleDateString('en-US');
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    const record = monthAtt.find(
      a => new Date(a.date).toLocaleDateString('en-US') === dateStr
    ) || null;

    const status = calendarDayStatus(record, isWeekend);

    if (!isWeekend) {
      if (status === 'present') summary.present++;
      else if (status === 'late') summary.late++;
      else if (status === 'absent') summary.absent++;
      else if (status === 'pending') summary.pending++;
    }

    calendar.push({
      day,
      date: dateStr,
      status,
      clockIn: record?.clock_in || '-',
      clockOut: record?.clock_out || '-',
      totalHours: record?.clock_out ? record.total_hours : '-',
      isWeekend,
    });
  }

  const leaveHistory = (allLeave || []).map(l => ({
    date: l.date,
    leaveType: l.leave_type,
    reason: l.reason,
    status: l.status,
  }));

  res.json({
    month: monthNum,
    year: yearNum,
    email,
    calendar,
    summary,
    onLunch: !!(lunchToday && !lunchToday.lunch_in),
    onBreak: !!(breakToday && !breakToday.break_in),
    leaveHistory,
  });
});

module.exports = router;
```

- [ ] **Step 4: Update `routes/dashboard.js` — auth + admin/owner + read from users**

Replace the entire content of `routes/dashboard.js` with:

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');
const { todayJST } = require('../lib/rules');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);
router.use(requireRole('owner', 'admin'));

router.get('/', async (req, res) => {
  const today = todayJST();

  const [
    { data: todayAtt },
    { data: allUsers },
    { data: pendingAtt },
    { data: pendingLeave },
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('date', today),
    supabase.from('users').select('*').eq('role', 'member').eq('status', 'Active'),
    supabase.from('attendance').select('*').eq('status', 'Pending'),
    supabase.from('leave_log').select('*').eq('status', 'Pending'),
  ]);

  const att = todayAtt || [];
  const members = allUsers || [];

  const membersWithStatus = members.map(m => {
    const rec = att.find(a => a.email === m.email);
    let status;
    if (!rec)                                                    status = 'NOT CLOCKED IN';
    else if (rec.status === 'Pending')                           status = 'PENDING APPROVAL';
    else if (rec.clock_out)                                      status = 'CLOCKED OUT';
    else if (rec.late_status && rec.late_status !== 'ON TIME')   status = 'CLOCKED IN (LATE)';
    else                                                         status = 'CLOCKED IN';

    return {
      name: m.name,
      email: m.email,
      role: m.job_role,
      status,
      clockIn: rec?.clock_in || '-',
      clockOut: rec?.clock_out || '-',
      totalHours: rec?.total_hours ?? '-',
      lateStatus: rec?.late_status || '',
    };
  });

  const summary = {
    clockedIn:  membersWithStatus.filter(m => m.status === 'CLOCKED IN' || m.status === 'CLOCKED IN (LATE)').length,
    clockedOut: membersWithStatus.filter(m => m.status === 'CLOCKED OUT').length,
    notIn:      membersWithStatus.filter(m => m.status === 'NOT CLOCKED IN').length,
    pending:    membersWithStatus.filter(m => m.status === 'PENDING APPROVAL').length,
    total:      members.length,
  };

  res.json({
    date: today,
    summary,
    members: membersWithStatus,
    pendingApprovals: pendingAtt || [],
    pendingLeave: pendingLeave || [],
  });
});

module.exports = router;
```

- [ ] **Step 5: Update `routes/approve.js` — auth + admin/owner**

Replace the entire content of `routes/approve.js` with:

```js
const router = require('express').Router();
const supabase = require('../lib/supabase');
const { sendMessage, CHANNELS } = require('../lib/discord');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.use(requireAuth);
router.use(requireRole('owner', 'admin'));

router.get('/', async (req, res) => {
  const { action, row, type } = req.query;
  const id = parseInt(row);

  if (!id || id <= 0) return res.status(400).json({ error: 'Invalid row id.' });
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject".' });
  }

  const new_status = action === 'approve' ? 'Approved' : 'Rejected';
  const table = type === 'leave' ? 'leave_log' : 'attendance';

  const { error } = await supabase.from(table).update({ status: new_status }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });

  await sendMessage(CHANNELS.approvals,
    `${action === 'approve' ? '✅' : '❌'} Entry #${id} (${type}) has been **${new_status}**.`);
  res.json({ success: true, message: 'Status updated successfully!' });
});

module.exports = router;
```

- [ ] **Step 6: Run existing tests — expect PASS (no test files were modified)**

Run: `npm test`
Expected: all tests still pass (routes have no unit tests; we test them via curl in the smoke test).

- [ ] **Step 7: Commit**

```bash
git add routes/checkRole.js routes/attendance.js routes/memberData.js routes/dashboard.js routes/approve.js
git commit -m "feat: gate existing routes with auth/role middleware; read from unified users table"
```

---

## Task 8: Update `server.js`

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Replace the entire content of `server.js`**

```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Fail fast if JWT_SECRET is missing — every auth check depends on it.
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Add it to .env (use `openssl rand -hex 32`).');
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.startsWith('http://localhost') || origin === 'https://sparkies14.github.io') {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
}));

app.use(express.json());

// New auth + user-management routers
app.use('/auth',  require('./routes/auth'));
app.use('/users', require('./routes/users'));

// Existing webhook routes (now auth-gated except check-role)
app.use('/webhook/check-role',  require('./routes/checkRole'));
app.use('/webhook/attendance',  require('./routes/attendance'));
app.use('/webhook/member-data', require('./routes/memberData'));
app.use('/webhook/dashboard',   require('./routes/dashboard'));
app.use('/webhook/approve',     require('./routes/approve'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Attendance server running on http://localhost:${PORT}`));
```

- [ ] **Step 2: Start server and verify**

Run: `node server.js`
Expected: `Attendance server running on http://localhost:3000` (no errors).

Test in another terminal:
```bash
# Login with the owner you created in Task 4
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<your-owner-email>","password":"<your-password>"}' | jq .
```
Expected: `{ "token": "<jwt>", "user": { "id": "<uuid>", "email": "...", "name": "...", "role": "owner" } }`

Save the token to a shell variable:
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<your-owner-email>","password":"<your-password>"}' | jq -r .token)
echo $TOKEN
```

Test an auth-required route:
```bash
curl -s http://localhost:3000/auth/me -H "Authorization: Bearer $TOKEN" | jq .
```
Expected: your user info.

Test rejection without token:
```bash
curl -s http://localhost:3000/auth/me | jq .
```
Expected: `{ "error": "Authentication required." }`

Stop the server (Ctrl+C).

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: fail-fast on missing JWT_SECRET; mount /auth and /users routers"
```

---

## Task 9: Rewrite `index.html` login card

**Files:**
- Modify: `index.html`

The login layout (left panel + brand) stays. Only the login card content and `<script>` change.

- [ ] **Step 1: Read the current index.html to find the existing login card and script**

Use the Read tool on `index.html`. The login card is the `<div class="login-card …">` block starting around line 271 and the `<script>` is below it.

- [ ] **Step 2: Replace the login-card div and the entire script**

In `index.html`, find:
```html
<div class="login-card fade-in-d1">
```
…and replace from that opening tag through the closing `</script>` tag (just before `</body>`) with the following:

```html
<div class="login-card fade-in-d1">
  <div class="login-title">Welcome back 👋</div>
  <div class="login-sub" id="login-sub">Sign in with your email and password.</div>

  <div class="status-msg" id="status-msg">
    <span id="status-icon"></span>
    <span id="status-text"></span>
  </div>

  <!-- Tab strip -->
  <div style="display:flex;gap:6px;margin-bottom:18px;background:#f5f5f3;padding:4px;border-radius:10px;">
    <button type="button" id="tab-signin"   onclick="switchTab('signin')"   style="flex:1;padding:8px 12px;border:none;background:white;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.06);">Sign In</button>
    <button type="button" id="tab-register" onclick="switchTab('register')" style="flex:1;padding:8px 12px;border:none;background:transparent;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);">Create Account</button>
  </div>

  <!-- Sign In form -->
  <form id="form-signin" onsubmit="handleSignIn(event)">
    <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px;">Email</label>
    <input type="email" id="signin-email" required style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:12px;font-family:inherit;">
    <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px;">Password</label>
    <input type="password" id="signin-password" required minlength="8" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:16px;font-family:inherit;">
    <button type="submit" id="signin-submit" style="width:100%;padding:11px;background:var(--accent);color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Sign In</button>
  </form>

  <!-- Register form -->
  <form id="form-register" onsubmit="handleRegister(event)" style="display:none;">
    <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px;">Full name</label>
    <input type="text" id="register-name" required minlength="1" maxlength="80" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:12px;font-family:inherit;">
    <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px;">Email</label>
    <input type="email" id="register-email" required style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:12px;font-family:inherit;">
    <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px;">Password (8+ characters)</label>
    <input type="password" id="register-password" required minlength="8" maxlength="128" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:12px;font-family:inherit;">
    <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px;">Confirm password</label>
    <input type="password" id="register-confirm" required minlength="8" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:16px;font-family:inherit;">
    <button type="submit" id="register-submit" style="width:100%;padding:11px;background:var(--accent);color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Create Account</button>
  </form>

  <div class="divider" style="margin-top:18px;">
    <div class="divider-line"></div>
    <div class="divider-text">or</div>
    <div class="divider-line"></div>
  </div>

  <div class="google-btn-wrap">
    <div id="auth-google-btn"></div>
  </div>

  <div class="login-note" id="forgot-note">
    Forgot your password? Contact your admin.
  </div>
</div>

<div class="right-footer">© 2026 Anosupo · Borderless Japan</div>
</div>
</div>

<script>
  const API_BASE  = 'http://localhost:3000';
  const CLIENT_ID = '235069172609-3fjjse85jeuj815o3rrtrtd8i21s12f3.apps.googleusercontent.com';

  function showStatus(type, msg) {
    const el = document.getElementById('status-msg');
    el.className = `status-msg show ${type}`;
    document.getElementById('status-text').textContent = msg;
    document.getElementById('status-icon').innerHTML =
      type === 'loading' ? '<span class="spin"></span>' : type === 'error' ? '✕' : '✓';
  }

  function hideStatus() {
    document.getElementById('status-msg').className = 'status-msg';
  }

  function switchTab(which) {
    const signinBtn = document.getElementById('tab-signin');
    const registerBtn = document.getElementById('tab-register');
    const signinForm = document.getElementById('form-signin');
    const registerForm = document.getElementById('form-register');
    const sub = document.getElementById('login-sub');
    const forgot = document.getElementById('forgot-note');

    if (which === 'signin') {
      signinBtn.style.background = 'white';
      signinBtn.style.fontWeight = '600';
      signinBtn.style.color = 'var(--text)';
      registerBtn.style.background = 'transparent';
      registerBtn.style.fontWeight = '500';
      registerBtn.style.color = 'var(--text2)';
      signinForm.style.display = 'block';
      registerForm.style.display = 'none';
      sub.textContent = 'Sign in with your email and password.';
      forgot.style.display = 'block';
    } else {
      registerBtn.style.background = 'white';
      registerBtn.style.fontWeight = '600';
      registerBtn.style.color = 'var(--text)';
      signinBtn.style.background = 'transparent';
      signinBtn.style.fontWeight = '500';
      signinBtn.style.color = 'var(--text2)';
      registerForm.style.display = 'block';
      signinForm.style.display = 'none';
      sub.textContent = 'Create a new account. An admin will activate it before you can sign in.';
      forgot.style.display = 'none';
    }
    hideStatus();
  }

  function redirectByRole(role) {
    if (role === 'owner' || role === 'admin') window.location.replace('dashboard.html');
    else if (role === 'member') window.location.replace('member.html');
  }

  function persistSession(token, user) {
    sessionStorage.setItem('anosupo_jwt', token);
    sessionStorage.setItem('anosupo_user', JSON.stringify(user));
    // Clean up legacy keys
    sessionStorage.removeItem('anosupo_credential');
    sessionStorage.removeItem('anosupo_role');
  }

  async function handleSignIn(ev) {
    ev.preventDefault();
    const email    = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;
    showStatus('loading', 'Signing in…');
    try {
      const r = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) { showStatus('error', data.error || 'Sign-in failed.'); return; }
      persistSession(data.token, data.user);
      showStatus('success', `Welcome, ${data.user.name.split(' ')[0]}! Redirecting…`);
      setTimeout(() => redirectByRole(data.user.role), 600);
    } catch (e) {
      showStatus('error', 'Connection failed. Check the server is running.');
    }
  }

  async function handleRegister(ev) {
    ev.preventDefault();
    const name     = document.getElementById('register-name').value.trim();
    const email    = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm  = document.getElementById('register-confirm').value;
    if (password !== confirm) {
      showStatus('error', 'Passwords do not match.');
      return;
    }
    showStatus('loading', 'Creating account…');
    try {
      const r = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await r.json();
      if (!r.ok) { showStatus('error', data.error || 'Registration failed.'); return; }
      showStatus('success', data.message || 'Account created. Waiting for admin approval.');
    } catch (e) {
      showStatus('error', 'Connection failed. Check the server is running.');
    }
  }

  async function handleGoogleAuth(response) {
    showStatus('loading', 'Signing in with Google…');
    try {
      const r = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await r.json();
      if (!r.ok) { showStatus('error', data.error || 'Google sign-in failed.'); return; }
      persistSession(data.token, data.user);
      showStatus('success', `Welcome, ${data.user.name.split(' ')[0]}! Redirecting…`);
      setTimeout(() => redirectByRole(data.user.role), 600);
    } catch (e) {
      showStatus('error', 'Connection failed. Check the server is running.');
    }
  }

  window.onload = function () {
    // Auto-redirect if a valid session already exists
    const jwt = sessionStorage.getItem('anosupo_jwt');
    const userStr = sessionStorage.getItem('anosupo_user');
    if (jwt && userStr) {
      try {
        const user = JSON.parse(userStr);
        redirectByRole(user.role);
        return;
      } catch (e) {
        sessionStorage.clear();
      }
    }

    // Initialize Google Sign-In as a secondary path
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: handleGoogleAuth,
      auto_select: false,
    });
    google.accounts.id.renderButton(
      document.getElementById('auth-google-btn'),
      { theme: 'outline', size: 'large', width: 288, text: 'continue_with' }
    );
  };

  // Lottie animation
  lottie.loadAnimation({
    container: document.getElementById('lottie-wrap'),
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: 'animations/office.json',
  });
</script>
</body>
</html>
```

(Note: this replacement starts with the existing `<div class="login-card fade-in-d1">` and ends with `</html>`. The earlier `</div>` closing tags for `.right-panel` and `.login-layout` are included.)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: rewrite login card with email+password tabs; Google as secondary"
```

---

## Task 10: Update `member.html` to use JWT auth

**Files:**
- Modify: `member.html`

- [ ] **Step 1: Find and update the URL constants and session loading**

`member.html` currently reads `anosupo_credential` and parses Google's JWT. We need it to read `anosupo_jwt` and `anosupo_user` instead, and send `Authorization: Bearer` on every fetch.

Open `member.html` and find the block that reads `sessionStorage.getItem('anosupo_credential')`. Replace the session-loading logic (the lines that parse the Google JWT into `email`, `name`, etc.) with code that reads our stored user info:

Find a block similar to:
```js
const credential = sessionStorage.getItem('anosupo_credential');
if (!credential) { window.location.replace('index.html'); }
const userInfo = JSON.parse(atob(credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
const userEmail = userInfo.email;
const userName  = userInfo.name;
```

Replace with:
```js
const jwt = sessionStorage.getItem('anosupo_jwt');
const userStr = sessionStorage.getItem('anosupo_user');
if (!jwt || !userStr) { window.location.replace('index.html'); }
const userInfo  = JSON.parse(userStr);
const userEmail = userInfo.email;
const userName  = userInfo.name;
```

- [ ] **Step 2: Add a fetch wrapper that includes the JWT and handles 401**

Near the top of the `<script>` section (after the constants), add:

```js
async function apiFetch(url, opts = {}) {
  const jwt = sessionStorage.getItem('anosupo_jwt');
  const headers = { ...(opts.headers || {}), Authorization: `Bearer ${jwt}` };
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.replace('index.html');
    throw new Error('Session expired');
  }
  return res;
}
```

- [ ] **Step 3: Replace every `fetch(` call to the server with `apiFetch(`**

In `member.html`, search for `fetch(` and replace each call that targets `http://localhost:3000/webhook/*` with `apiFetch(`. The new wrapper handles headers automatically — do not pass `Authorization` manually.

For `POST` calls that include a body containing `email`, you can leave the body as-is — the server now reads email from the JWT and ignores the body's email field. (Optional cleanup: remove `email` from the body — not required.)

- [ ] **Step 4: Add a Sign-Out button handler**

Find the existing sign-out button (if present) or any logout link. Make sure the handler is:

```js
function signOut() {
  sessionStorage.clear();
  window.location.replace('index.html');
}
```

- [ ] **Step 5: Smoke test (no server work yet — just visual)**

Open `member.html` in a browser via Live Server. With no session it should redirect to `index.html`. Sign in as a member (you'll need to invite/activate one first — see Task 13 cutover).

- [ ] **Step 6: Commit**

```bash
git add member.html
git commit -m "feat: member.html uses JWT auth; apiFetch wrapper with 401 redirect"
```

---

## Task 11: Update `dashboard.html` to use JWT auth

**Files:**
- Modify: `dashboard.html`

- [ ] **Step 1: Replace session-loading logic**

Same change pattern as Task 10 Step 1 — find the `anosupo_credential` block and replace with the `anosupo_jwt` + `anosupo_user` block.

- [ ] **Step 2: Add the `apiFetch` wrapper**

Same wrapper as Task 10 Step 2 — add it to the dashboard's `<script>` section.

- [ ] **Step 3: Replace `fetch` calls with `apiFetch`**

Replace every `fetch(` call targeting `http://localhost:3000/webhook/*` with `apiFetch(`.

- [ ] **Step 4: Add an "Admin Panel" link**

In the dashboard's top navigation/header area, add a link to the new admin page:

```html
<a href="admin.html" style="text-decoration:none;color:var(--accent);font-weight:600;font-size:13px;padding:8px 14px;border:1px solid var(--accent);border-radius:8px;">⚙️ Admin Panel</a>
```

Place it next to the existing sign-out button or wherever fits the existing layout.

- [ ] **Step 5: Sign-Out handler**

Ensure sign-out clears `anosupo_jwt` and `anosupo_user` (not the old `anosupo_credential`).

- [ ] **Step 6: Commit**

```bash
git add dashboard.html
git commit -m "feat: dashboard.html uses JWT auth; link to admin panel"
```

---

## Task 12: Create `admin.html` (user management UI)

**Files:**
- Create: `admin.html`

This is a standalone HTML file that lists users and exposes role action buttons.

- [ ] **Step 1: Create `admin.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Anosupo · Admin Panel</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f7f6f3; --white: #fff; --border: #e8e6e1; --text: #1a1915;
    --text2: #6b6860; --text3: #a8a59f; --accent: #1a6b3c; --accent-light: #f0f7f3;
    --red: #9b2626; --amber: #b35900;
    --radius: 10px;
  }
  *, *::before, *::after { box-sizing: border-box; margin:0; padding:0; }
  body { background: var(--bg); font-family: 'Instrument Sans', sans-serif; color: var(--text); }
  .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
  header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 28px; }
  header h1 { font-family: 'Instrument Serif', serif; font-size: 30px; font-weight: normal; letter-spacing: -0.5px; }
  .actions { display: flex; gap: 10px; }
  .btn { padding: 9px 14px; border: 1px solid var(--border); background: white; color: var(--text); border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }
  .btn-primary { background: var(--accent); color: white; border-color: var(--accent); font-weight: 600; }
  .btn-danger  { color: var(--red); border-color: var(--red); }
  .btn-amber   { color: var(--amber); border-color: var(--amber); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 0; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 12px 14px; text-align: left; font-size: 13px; border-bottom: 1px solid var(--border); }
  th { background: #fafaf8; color: var(--text2); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 3px 9px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-owner   { background: #fdf3e7; color: var(--amber); }
  .badge-admin   { background: var(--accent-light); color: var(--accent); }
  .badge-member  { background: #f1f1ef; color: var(--text2); }
  .badge-active   { background: var(--accent-light); color: var(--accent); }
  .badge-pending  { background: #fff4e0; color: var(--amber); }
  .badge-inactive { background: #fcecec; color: var(--red); }
  .row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .row-actions .btn { padding: 5px 10px; font-size: 12px; }
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: none; align-items: center; justify-content: center; z-index: 99; }
  .modal-bg.show { display: flex; }
  .modal { background: white; border-radius: 14px; padding: 24px; width: 360px; max-width: 90vw; }
  .modal h2 { font-family: 'Instrument Serif', serif; font-size: 22px; margin-bottom: 14px; }
  .modal label { display: block; font-size: 12px; color: var(--text2); margin-bottom: 6px; margin-top: 10px; }
  .modal input, .modal select { width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-family: inherit; }
  .modal-actions { display: flex; gap: 8px; margin-top: 18px; justify-content: flex-end; }
  .status-bar { display: none; padding: 11px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 18px; }
  .status-bar.show { display: block; }
  .status-bar.error   { background: #fdf0f0; color: var(--red); border: 1px solid #f5d0d0; }
  .status-bar.success { background: var(--accent-light); color: var(--accent); border: 1px solid #d4eadc; }
</style>
</head>
<body>
<div class="container">

  <header>
    <h1>User Management</h1>
    <div class="actions">
      <button class="btn" onclick="window.location.href='dashboard.html'">← Dashboard</button>
      <button class="btn btn-primary" onclick="openInvite()">+ Invite User</button>
      <button class="btn" onclick="signOut()">Sign Out</button>
    </div>
  </header>

  <div id="status-bar" class="status-bar"></div>

  <div class="card">
    <table id="users-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th>Last login</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="users-tbody">
        <tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text2);">Loading…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- Invite modal -->
<div class="modal-bg" id="invite-modal">
  <div class="modal">
    <h2>Invite User</h2>
    <label>Full name</label>
    <input type="text" id="invite-name" maxlength="80">
    <label>Email</label>
    <input type="email" id="invite-email">
    <label>Role</label>
    <select id="invite-role">
      <option value="member">Member</option>
      <option value="admin" id="invite-role-admin">Admin (owner only)</option>
    </select>
    <div class="modal-actions">
      <button class="btn" onclick="closeInvite()">Cancel</button>
      <button class="btn btn-primary" onclick="submitInvite()">Send Invite</button>
    </div>
  </div>
</div>

<script>
const API_BASE = 'http://localhost:3000';

let currentUser = null;

function showStatus(type, msg) {
  const el = document.getElementById('status-bar');
  el.className = `status-bar show ${type}`;
  el.textContent = msg;
  setTimeout(() => el.className = 'status-bar', 4000);
}

async function apiFetch(url, opts = {}) {
  const jwt = sessionStorage.getItem('anosupo_jwt');
  const headers = { ...(opts.headers || {}), Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.replace('index.html');
    throw new Error('Session expired');
  }
  return res;
}

function signOut() {
  sessionStorage.clear();
  window.location.replace('index.html');
}

function loadCurrentUser() {
  const userStr = sessionStorage.getItem('anosupo_user');
  if (!userStr) { window.location.replace('index.html'); return; }
  currentUser = JSON.parse(userStr);
  if (currentUser.role !== 'owner' && currentUser.role !== 'admin') {
    window.location.replace('member.html');
  }
}

function badge(value, type) {
  return `<span class="badge badge-${type}">${value}</span>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

async function loadUsers() {
  try {
    const res = await apiFetch(`${API_BASE}/users`);
    const data = await res.json();
    if (!res.ok) { showStatus('error', data.error || 'Failed to load users.'); return; }
    renderUsers(data.users || []);
  } catch (e) {
    showStatus('error', 'Connection failed.');
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text2);">No users yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => {
    const isMe = u.id === currentUser.id || u.email === currentUser.email;
    const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—';
    return `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td style="color:var(--text2);">${escapeHtml(u.email)}</td>
        <td>${badge(u.role, u.role)}</td>
        <td>${badge(u.status, u.status.toLowerCase())}</td>
        <td style="color:var(--text2);font-size:12px;">${lastLogin}</td>
        <td><div class="row-actions">${actionButtons(u, isMe)}</div></td>
      </tr>`;
  }).join('');
}

function actionButtons(u, isMe) {
  if (isMe) return '<span style="color:var(--text3);font-size:12px;">(you)</span>';
  const buttons = [];
  const myRole = currentUser.role;

  // Activate / Deactivate
  if (u.status !== 'Active' && canAct(u, 'activate'))
    buttons.push(`<button class="btn" onclick="doAction('${u.id}','activate')">Activate</button>`);
  if (u.status === 'Active' && canAct(u, 'deactivate'))
    buttons.push(`<button class="btn btn-amber" onclick="doAction('${u.id}','deactivate')">Deactivate</button>`);

  // Promote / Demote (owner only)
  if (myRole === 'owner' && u.role === 'member')
    buttons.push(`<button class="btn btn-primary" onclick="doAction('${u.id}','promote')">Promote to Admin</button>`);
  if (myRole === 'owner' && u.role === 'admin')
    buttons.push(`<button class="btn btn-danger" onclick="doAction('${u.id}','demote')">Demote to Member</button>`);

  return buttons.join('') || '<span style="color:var(--text3);font-size:12px;">—</span>';
}

function canAct(u, action) {
  const myRole = currentUser.role;
  if (action === 'activate' || action === 'deactivate') {
    if (u.role === 'member') return myRole === 'owner' || myRole === 'admin';
    if (u.role === 'admin')  return myRole === 'owner';
  }
  return false;
}

async function doAction(userId, action) {
  try {
    const res = await apiFetch(`${API_BASE}/users/${userId}/${action}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { showStatus('error', data.error || 'Action failed.'); return; }
    showStatus('success', `Done: ${action}.`);
    loadUsers();
  } catch (e) {
    showStatus('error', 'Connection failed.');
  }
}

function openInvite() {
  document.getElementById('invite-modal').classList.add('show');
  // Hide admin role option for non-owners
  document.getElementById('invite-role-admin').style.display = (currentUser.role === 'owner') ? 'block' : 'none';
}
function closeInvite() {
  document.getElementById('invite-modal').classList.remove('show');
  document.getElementById('invite-name').value = '';
  document.getElementById('invite-email').value = '';
  document.getElementById('invite-role').value = 'member';
}
async function submitInvite() {
  const name  = document.getElementById('invite-name').value.trim();
  const email = document.getElementById('invite-email').value.trim();
  const role  = document.getElementById('invite-role').value;
  if (!name || !email) { showStatus('error', 'Name and email are required.'); return; }
  try {
    const res = await apiFetch(`${API_BASE}/users/invite`, {
      method: 'POST',
      body: JSON.stringify({ name, email, role }),
    });
    const data = await res.json();
    if (!res.ok) { showStatus('error', data.error || 'Invite failed.'); return; }
    showStatus('success', `Invited ${name}.`);
    closeInvite();
    loadUsers();
  } catch (e) {
    showStatus('error', 'Connection failed.');
  }
}

loadCurrentUser();
loadUsers();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add admin.html
git commit -m "feat: add admin.html user management UI (list/invite/promote/demote/activate)"
```

---

## Task 13: End-to-end smoke test + final commit

- [ ] **Step 1: Confirm the cutover order has been done**

If you skipped the earlier in-line cutover steps, do them now:
1. SQL migration applied in Supabase: `migrations/001_create_users.sql`
2. `node scripts/migrate-users-data.js --dry-run` reviewed
3. `node scripts/migrate-users-data.js` (real run)
4. `node scripts/create-owner.js <your-email> "<Your Name>" <password>` for your owner row

- [ ] **Step 2: Start the server**

Run: `node server.js`
Expected: `Attendance server running on http://localhost:3000`

- [ ] **Step 3: Verify all routes — owner happy path**

Open another terminal:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<your-owner-email>","password":"<your-password>"}' | jq -r .token)

# /auth/me
curl -s http://localhost:3000/auth/me -H "Authorization: Bearer $TOKEN" | jq .
# Expected: your user with role:"owner"

# /users
curl -s http://localhost:3000/users -H "Authorization: Bearer $TOKEN" | jq '.users | length'
# Expected: number of migrated users + the owner

# /webhook/dashboard
curl -s http://localhost:3000/webhook/dashboard -H "Authorization: Bearer $TOKEN" | jq '{date,summary}'
# Expected: today's date and a summary object
```

- [ ] **Step 4: Verify rejection paths**

```bash
# No token
curl -s http://localhost:3000/users
# Expected: {"error":"Authentication required."}

# Bad token
curl -s http://localhost:3000/users -H "Authorization: Bearer not-a-real-token"
# Expected: {"error":"Invalid or expired token."}

# Member trying to access /users (need a member account — see Step 5 first if you don't have one)
```

- [ ] **Step 5: Full browser flow**

Open `index.html` via Live Server.

a. **Register a test member:**
   - Click "Create Account" tab.
   - Fill: name=Test User, email=test+1@example.com, password=testpass123, confirm.
   - Submit → expect "Account created. Waiting for admin approval."

b. **Activate as owner:**
   - Switch to "Sign In" tab, log in as owner.
   - Should land on `dashboard.html`. Click "⚙️ Admin Panel".
   - Find test+1@example.com row. Click **Activate**.

c. **Log in as the activated member:**
   - Sign out.
   - Log in with test+1@example.com / testpass123.
   - Should land on `member.html`.
   - Open browser DevTools → Network. Click any clock button. Verify the request includes `Authorization: Bearer …`.

d. **Promote to admin (owner only):**
   - Sign out, log in as owner.
   - In admin panel, click **Promote to Admin** on test+1.
   - Sign out, log in as test+1. Should now land on `dashboard.html`.
   - In admin panel, the **Promote/Demote** buttons should NOT appear on other admins (only owner sees them).

e. **Google backup path (existing migrated members):**
   - Sign out. Click "Continue with Google" with a Google account whose email was in the original `members` table.
   - Should succeed and land on the right page.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit --allow-empty -m "feat: Milestone A complete — auth overhaul + owner/admin/member roles" || echo "Nothing to commit (already clean)"
```

---

## Out of scope (deferred to Milestone B)

- Drop legacy `managers` and `members` tables
- Remove `/webhook/check-role` route
- Audit log of role changes and logins
- Password reset via email
- Linking attendance rows to `users.id` via FK
