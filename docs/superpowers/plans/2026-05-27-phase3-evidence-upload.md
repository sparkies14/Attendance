# Phase 3 — Excused Outages & Evidence Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow members and admins to attach file evidence (JPEG/PNG/PDF, max 5 MB) or external links to any leave request, stored in Supabase Storage, viewable only by the uploader and admin/owner.

**Architecture:** New `leave_evidence` table (FK → `leave_log`) stores metadata. Files live in a private Supabase Storage bucket `leave-evidence`. A new Express route file `routes/leaveEvidence.js` (mounted at `/leave`) handles all CRUD. Both `member.html` (leave history) and `dashboard.html` (pending approvals) get collapsible evidence panels. `routes/memberData.js` is patched to expose `id` on each leave history item.

**Tech Stack:** Node.js 18+, Express 4, Supabase JS v2, multer 1.x, Jest 29, supertest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `multer`, add `supertest` to devDeps |
| `migrations/009_create_leave_evidence.sql` | Create | `leave_evidence` table |
| `routes/leaveEvidence.js` | Create | GET/POST/DELETE evidence + signed URL |
| `tests/leaveEvidence.test.js` | Create | Unit tests for the route |
| `routes/memberData.js` | Modify | Expose `id` on each leaveHistory item |
| `server.js` | Modify | Mount `/leave` router |
| `member.html` | Modify | Collapsible evidence panel in leave history |
| `dashboard.html` | Modify | Evidence panel on pending leave approval cards |

---

## Task 1: Install dependencies + create migration

**Files:**
- Modify: `package.json`
- Create: `migrations/009_create_leave_evidence.sql`

- [ ] **Step 1: Install multer and supertest**

```bash
npm install multer@1.4.5-lts.1
npm install --save-dev supertest
```

Expected: `multer` in `dependencies`, `supertest` in `devDependencies` in `package.json`.

- [ ] **Step 2: Create `migrations/009_create_leave_evidence.sql`**

Create the file with this content:

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

- [ ] **Step 3: Run the migration in Supabase SQL Editor**

Copy the SQL from `migrations/009_create_leave_evidence.sql` and run it in the Supabase SQL Editor. Confirm no errors.

- [ ] **Step 4: Create the Supabase Storage bucket (manual)**

In the Supabase dashboard → Storage → New bucket:
- Name: `leave-evidence`
- Public: **OFF** (private)

Confirm the bucket appears in the Storage section.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json migrations/009_create_leave_evidence.sql
git commit -m "feat: add multer/supertest deps and leave_evidence migration"
```

---

## Task 2: Fix `routes/memberData.js` to expose leave `id`

**Files:**
- Modify: `routes/memberData.js`

Currently `leaveHistory` omits `id`, which is needed for the evidence API.

- [ ] **Step 1: Add `id` to the leaveHistory map**

Open `routes/memberData.js`. Find lines 75–80:

```js
  const leaveHistory = (allLeave || []).map(l => ({
    date: l.date,
    leaveType: l.leave_type,
    reason: l.reason,
    status: l.status,
  }));
```

Replace with:

```js
  const leaveHistory = (allLeave || []).map(l => ({
    id: l.id,
    date: l.date,
    leaveType: l.leave_type,
    reason: l.reason,
    status: l.status,
  }));
```

- [ ] **Step 2: Run existing tests to confirm nothing broke**

```bash
npx jest --no-coverage
```

Expected: all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add routes/memberData.js
git commit -m "fix: expose id on leaveHistory items in memberData route"
```

---

## Task 3: Create `routes/leaveEvidence.js` (TDD)

**Files:**
- Create: `tests/leaveEvidence.test.js`
- Create: `routes/leaveEvidence.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/leaveEvidence.test.js`:

```js
const request = require('supertest');
const express = require('express');

jest.mock('../middleware/requireAuth', () => (req, _res, next) => next());

const mockStorageUpload     = jest.fn();
const mockStorageSignedUrl  = jest.fn();
const mockStorageRemove     = jest.fn();

jest.mock('../lib/supabase', () => ({
  from: jest.fn(),
  storage: {
    from: jest.fn(() => ({
      upload:           mockStorageUpload,
      createSignedUrl:  mockStorageSignedUrl,
      remove:           mockStorageRemove,
    })),
  },
}));

const supabase = require('../lib/supabase');
const router   = require('../routes/leaveEvidence');

// Thenable chain — resolves at any terminal call (maybeSingle, single, order)
// and also when awaited directly (delete().eq() pattern).
function c(data, error = null) {
  const result = { data, error };
  const ch = {
    then:       (resolve) => resolve(result),
    catch:      () => Promise.resolve(result),
    select:     jest.fn(() => ch),
    eq:         jest.fn(() => ch),
    order:      jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single:     jest.fn(() => Promise.resolve(result)),
    insert:     jest.fn(() => ch),
    delete:     jest.fn(() => ch),
  };
  return ch;
}

function makeApp(role, email) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { email, role }; next(); });
  app.use('/leave', router);
  return app;
}

const LEAVE_MINE  = { id: 'leave-1', email: 'ana@test.com' };
const LEAVE_OTHER = { id: 'leave-2', email: 'other@test.com' };

const EVIDENCE_LIST = [{
  id: 'ev-1', leave_id: 'leave-1', uploaded_by: 'ana@test.com',
  file_name: 'cert.pdf', external_url: null, note: null, created_at: '2026-05-27T00:00:00Z',
}];
const EVIDENCE_FILE     = { id: 'ev-1', file_path: 'leave-1/123-cert.pdf' };
const EVIDENCE_URL_ONLY = { id: 'ev-2', file_path: null };
const EVIDENCE_BY_OTHER = { id: 'ev-3', uploaded_by: 'other@test.com', file_path: null };
const EVIDENCE_BY_SELF  = { id: 'ev-4', uploaded_by: 'ana@test.com',  file_path: null };
const INSERTED_EVIDENCE = {
  id: 'ev-new', leave_id: 'leave-1', uploaded_by: 'ana@test.com',
  file_name: null, external_url: 'https://drive.google.com/file', note: null, created_at: '2026-05-27T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStorageUpload.mockResolvedValue({ error: null });
  mockStorageSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.url/cert.pdf' }, error: null });
  mockStorageRemove.mockResolvedValue({ error: null });
});

/* ─── GET /leave/:id/evidence ─── */
describe('GET /leave/:id/evidence', () => {
  test('returns 404 when leave not found', async () => {
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com')).get('/leave/leave-1/evidence');
    expect(res.status).toBe(404);
  });

  test('returns 403 when member accesses another member\'s leave', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_OTHER));
    const res = await request(makeApp('member', 'ana@test.com')).get('/leave/leave-2/evidence');
    expect(res.status).toBe(403);
  });

  test('returns evidence list for own leave', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_LIST));
    const res = await request(makeApp('member', 'ana@test.com')).get('/leave/leave-1/evidence');
    expect(res.status).toBe(200);
    expect(res.body.evidence).toHaveLength(1);
    expect(res.body.evidence[0].file_name).toBe('cert.pdf');
  });

  test('admin can access any leave', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_OTHER));
    supabase.from.mockReturnValueOnce(c([]));
    const res = await request(makeApp('admin', 'admin@test.com')).get('/leave/leave-2/evidence');
    expect(res.status).toBe(200);
    expect(res.body.evidence).toHaveLength(0);
  });

  test('owner can access any leave', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_OTHER));
    supabase.from.mockReturnValueOnce(c([]));
    const res = await request(makeApp('owner', 'owner@test.com')).get('/leave/leave-2/evidence');
    expect(res.status).toBe(200);
  });
});

/* ─── POST /leave/:id/evidence ─── */
describe('POST /leave/:id/evidence', () => {
  test('returns 400 when neither file nor external_url provided', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/leave/leave-1/evidence').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file or.*external_url/i);
  });

  test('inserts URL-only evidence and returns 201', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(INSERTED_EVIDENCE));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/leave/leave-1/evidence')
      .send({ external_url: 'https://drive.google.com/file' });
    expect(res.status).toBe(201);
    expect(res.body.evidence.external_url).toBe('https://drive.google.com/file');
  });

  test('returns 403 when member posts to another member\'s leave', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_OTHER));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/leave/leave-2/evidence')
      .send({ external_url: 'https://example.com' });
    expect(res.status).toBe(403);
  });

  test('uploads file to storage and inserts evidence row', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c({ ...INSERTED_EVIDENCE, file_name: 'cert.pdf', external_url: null }));
    const res = await request(makeApp('member', 'ana@test.com'))
      .post('/leave/leave-1/evidence')
      .attach('file', Buffer.from('fake pdf'), { filename: 'cert.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.stringContaining('leave-1/'),
      expect.any(Buffer),
      { contentType: 'application/pdf' },
    );
    expect(res.body.evidence.file_name).toBe('cert.pdf');
  });
});

/* ─── DELETE /leave/:id/evidence/:eid ─── */
describe('DELETE /leave/:id/evidence/:eid', () => {
  test('returns 403 when member deletes another member\'s evidence', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_BY_OTHER));
    const res = await request(makeApp('member', 'ana@test.com'))
      .delete('/leave/leave-1/evidence/ev-3');
    expect(res.status).toBe(403);
  });

  test('uploader can delete their own evidence', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_BY_SELF));
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .delete('/leave/leave-1/evidence/ev-4');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('admin can delete any evidence', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_OTHER));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_BY_OTHER));
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('admin', 'admin@test.com'))
      .delete('/leave/leave-2/evidence/ev-3');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('removes file from storage when evidence has a file_path', async () => {
    const evWithFile = { id: 'ev-5', uploaded_by: 'ana@test.com', file_path: 'leave-1/123-cert.pdf' };
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(evWithFile));
    supabase.from.mockReturnValueOnce(c(null));
    await request(makeApp('member', 'ana@test.com')).delete('/leave/leave-1/evidence/ev-5');
    expect(mockStorageRemove).toHaveBeenCalledWith(['leave-1/123-cert.pdf']);
  });

  test('returns 404 when evidence item not found', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .delete('/leave/leave-1/evidence/nonexistent');
    expect(res.status).toBe(404);
  });
});

/* ─── GET /leave/:id/evidence/:eid/url ─── */
describe('GET /leave/:id/evidence/:eid/url', () => {
  test('returns 400 when evidence has no file_path', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_URL_ONLY));
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/leave/leave-1/evidence/ev-2/url');
    expect(res.status).toBe(400);
  });

  test('returns signed URL for file evidence', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(EVIDENCE_FILE));
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/leave/leave-1/evidence/ev-1/url');
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://signed.url/cert.pdf');
  });

  test('returns 404 when evidence item not found', async () => {
    supabase.from.mockReturnValueOnce(c(LEAVE_MINE));
    supabase.from.mockReturnValueOnce(c(null));
    const res = await request(makeApp('member', 'ana@test.com'))
      .get('/leave/leave-1/evidence/nonexistent/url');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/leaveEvidence.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../routes/leaveEvidence'`

- [ ] **Step 3: Implement `routes/leaveEvidence.js`**

Create `routes/leaveEvidence.js`:

```js
const router      = require('express').Router();
const multer      = require('multer');
const supabase    = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and PDF files are allowed.'));
  },
});

router.use(requireAuth);

async function checkAccess(leaveId, user) {
  const { data: leave } = await supabase
    .from('leave_log').select('id, email').eq('id', leaveId).maybeSingle();
  if (!leave) return { leave: null, allowed: false };
  const elevated = ['owner', 'admin'].includes(user.role);
  return { leave, allowed: elevated || leave.email === user.email };
}

router.get('/:id/evidence', async (req, res) => {
  const { leave, allowed } = await checkAccess(req.params.id, req.user);
  if (!leave)   return res.status(404).json({ error: 'Leave request not found.' });
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });

  const { data, error } = await supabase
    .from('leave_evidence')
    .select('id, leave_id, uploaded_by, file_name, external_url, note, created_at')
    .eq('leave_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ evidence: data || [] });
});

router.post('/:id/evidence', upload.single('file'), async (req, res) => {
  const { leave, allowed } = await checkAccess(req.params.id, req.user);
  if (!leave)   return res.status(404).json({ error: 'Leave request not found.' });
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });

  const { external_url, note } = req.body || {};
  const file = req.file;
  if (!file && !external_url) return res.status(400).json({ error: 'Provide a file or an external_url.' });

  let file_path = null;
  let file_name = null;

  if (file) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    file_path = `${req.params.id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from('leave-evidence')
      .upload(file_path, file.buffer, { contentType: file.mimetype });
    if (upErr) return res.status(500).json({ error: upErr.message });
    file_name = file.originalname;
  }

  const { data, error } = await supabase
    .from('leave_evidence')
    .insert({
      leave_id:     req.params.id,
      uploaded_by:  req.user.email,
      file_path,
      file_name,
      external_url: external_url || null,
      note:         note || null,
    })
    .select('id, leave_id, uploaded_by, file_name, external_url, note, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ evidence: data });
});

router.delete('/:id/evidence/:eid', async (req, res) => {
  const { leave, allowed } = await checkAccess(req.params.id, req.user);
  if (!leave)   return res.status(404).json({ error: 'Leave request not found.' });
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });

  const { data: ev } = await supabase
    .from('leave_evidence')
    .select('id, uploaded_by, file_path')
    .eq('id', req.params.eid)
    .eq('leave_id', req.params.id)
    .maybeSingle();
  if (!ev) return res.status(404).json({ error: 'Evidence not found.' });

  const elevated   = ['owner', 'admin'].includes(req.user.role);
  const isUploader = ev.uploaded_by === req.user.email;
  if (!elevated && !isUploader) return res.status(403).json({ error: 'Forbidden.' });

  if (ev.file_path) {
    await supabase.storage.from('leave-evidence').remove([ev.file_path]);
  }

  const { error } = await supabase.from('leave_evidence').delete().eq('id', ev.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

router.get('/:id/evidence/:eid/url', async (req, res) => {
  const { leave, allowed } = await checkAccess(req.params.id, req.user);
  if (!leave)   return res.status(404).json({ error: 'Leave request not found.' });
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });

  const { data: ev } = await supabase
    .from('leave_evidence')
    .select('id, file_path')
    .eq('id', req.params.eid)
    .eq('leave_id', req.params.id)
    .maybeSingle();
  if (!ev) return res.status(404).json({ error: 'Evidence not found.' });
  if (!ev.file_path) return res.status(400).json({ error: 'This evidence has no file — use the external_url directly.' });

  const { data: signed, error: signErr } = await supabase.storage
    .from('leave-evidence')
    .createSignedUrl(ev.file_path, 3600);
  if (signErr) return res.status(500).json({ error: signErr.message });
  return res.json({ url: signed.signedUrl });
});

module.exports = router;
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/leaveEvidence.test.js --no-coverage
```

Expected: PASS — 14 tests passing.

- [ ] **Step 5: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add routes/leaveEvidence.js tests/leaveEvidence.test.js
git commit -m "feat: add leave evidence routes with file/URL upload (TDD)"
```

---

## Task 4: Mount route in `server.js`

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add the router mount**

Open `server.js`. Find the line:
```js
app.use('/audit', require('./routes/audit'));
```

After it, add:
```js
app.use('/leave', require('./routes/leaveEvidence'));
```

- [ ] **Step 2: Verify the server starts**

```bash
node server.js
```

Expected: server starts without errors. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: mount /leave evidence route in server.js"
```

---

## Task 5: Update `member.html` — evidence panel in leave history

**Files:**
- Modify: `member.html`

- [ ] **Step 1: Add `escapeHtml` helper**

Open `member.html`. Find the `<script>` block. Search for `function defaultAvatar` (around line 942). **Before** that function, add:

```js
  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
```

- [ ] **Step 2: Replace `renderLeaveHistory()`**

Find the existing `renderLeaveHistory` function (around line 1751):

```js
  function renderLeaveHistory() {
    const container = document.getElementById('leave-history-container');
    const history   = memberData?.leaveHistory || [];
    if (history.length === 0) {
      container.innerHTML = `<div class="empty-state">No leave requests yet.</div>`;
      return;
    }
    container.innerHTML = history.map(l => {
      const statusClass = { Approved:'ls-approved', Pending:'ls-pending', Rejected:'ls-rejected' }[l.status] || 'ls-pending';
      return `<div class="leave-item">
        <div class="leave-item-left">
          <div class="leave-item-date">${l.date || '—'}</div>
          <div class="leave-item-type">${l.leaveType || '—'}</div>
          ${l.reason ? `<div class="leave-item-reason">"${l.reason}"</div>` : ''}
        </div>
        <span class="leave-status-badge ${statusClass}">${l.status}</span>
      </div>`;
    }).join('');
  }
```

Replace entirely with:

```js
  function renderLeaveHistory() {
    const container = document.getElementById('leave-history-container');
    const history   = memberData?.leaveHistory || [];
    if (history.length === 0) {
      container.innerHTML = `<div class="empty-state">No leave requests yet.</div>`;
      return;
    }
    container.innerHTML = history.map(l => {
      const statusClass = { Approved:'ls-approved', Pending:'ls-pending', Rejected:'ls-rejected' }[l.status] || 'ls-pending';
      return `<div style="margin-bottom:8px;">
        <div class="leave-item">
          <div class="leave-item-left">
            <div class="leave-item-date">${escapeHtml(l.date || '—')}</div>
            <div class="leave-item-type">${escapeHtml(l.leaveType || '—')}</div>
            ${l.reason ? `<div class="leave-item-reason">"${escapeHtml(l.reason)}"</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${l.id ? `<button class="btn" onclick="toggleMemberEvidence('${escapeHtml(l.id)}')" style="font-size:11px;padding:4px 8px;">📎 Evidence</button>` : ''}
            <span class="leave-status-badge ${statusClass}">${escapeHtml(l.status)}</span>
          </div>
        </div>
        ${l.id ? `
        <div id="ev-panel-${escapeHtml(l.id)}" style="display:none;padding:10px 14px;border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;background:#f9f9f8;">
          <div id="ev-list-${escapeHtml(l.id)}"><em style="font-size:12px;color:var(--text3);">Loading…</em></div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
            <label class="btn" style="font-size:12px;cursor:pointer;">
              📁 Add file
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" style="display:none;" onchange="memberUploadFile('${escapeHtml(l.id)}', this)">
            </label>
            <button class="btn" style="font-size:12px;" onclick="memberShowLinkForm('${escapeHtml(l.id)}')">🔗 Add link</button>
          </div>
          <div id="ev-link-form-${escapeHtml(l.id)}" style="display:none;margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <input type="url" id="ev-link-url-${escapeHtml(l.id)}" placeholder="https://drive.google.com/…" style="flex:1;min-width:180px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:inherit;">
            <input type="text" id="ev-link-note-${escapeHtml(l.id)}" placeholder="Note (optional)" style="width:110px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:inherit;">
            <button class="btn btn-primary" style="font-size:12px;" onclick="memberSubmitLink('${escapeHtml(l.id)}')">Add</button>
            <button class="btn" style="font-size:12px;" onclick="memberHideLinkForm('${escapeHtml(l.id)}')">Cancel</button>
          </div>
        </div>` : ''}
      </div>`;
    }).join('');
  }
```

- [ ] **Step 3: Add evidence JS functions**

Find the closing `</script>` tag (last line before `</body>`). **Before** it, add:

```js
  /* ── Leave Evidence (member) ── */
  const _evLoaded = {};

  async function toggleMemberEvidence(leaveId) {
    const panel = document.getElementById(`ev-panel-${leaveId}`);
    const open  = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    if (!open && !_evLoaded[leaveId]) await memberLoadEvidence(leaveId);
  }

  async function memberLoadEvidence(leaveId) {
    const listEl = document.getElementById(`ev-list-${leaveId}`);
    try {
      const res  = await apiFetch(`http://localhost:3000/leave/${leaveId}/evidence`);
      const data = await res.json();
      if (!res.ok) { listEl.innerHTML = `<em style="font-size:12px;color:#c00;">${escapeHtml(data.error)}</em>`; return; }
      _evLoaded[leaveId] = true;
      memberRenderEvidence(leaveId, data.evidence);
    } catch { listEl.innerHTML = `<em style="font-size:12px;color:var(--text3);">Failed to load.</em>`; }
  }

  function memberRenderEvidence(leaveId, items) {
    const listEl = document.getElementById(`ev-list-${leaveId}`);
    if (!items.length) { listEl.innerHTML = `<em style="font-size:12px;color:var(--text3);">No evidence attached yet.</em>`; return; }
    listEl.innerHTML = items.map(ev => {
      const label   = ev.file_name || ev.external_url || 'Evidence';
      const viewBtn = ev.file_name
        ? `<button class="btn" style="font-size:11px;padding:3px 8px;" onclick="memberViewFile('${leaveId}','${ev.id}')">View</button>`
        : `<a href="${escapeHtml(ev.external_url)}" target="_blank" rel="noopener" class="btn" style="font-size:11px;padding:3px 8px;">Open</a>`;
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px;">
        <span>📄 ${escapeHtml(label)}</span>
        ${ev.note ? `<span style="color:var(--text3);">(${escapeHtml(ev.note)})</span>` : ''}
        ${viewBtn}
        <button class="btn" style="font-size:11px;padding:3px 8px;color:#c00;border-color:#c00;" onclick="memberDeleteEvidence('${leaveId}','${ev.id}')">Delete</button>
      </div>`;
    }).join('');
  }

  async function memberUploadFile(leaveId, input) {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const jwt = sessionStorage.getItem('anosupo_jwt');
      const res = await fetch(`http://localhost:3000/leave/${leaveId}/evidence`, {
        method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: formData,
      });
      const data = await res.json();
      if (!res.ok) { showStatus('error', data.error || 'Upload failed.'); return; }
      showStatus('success', 'Evidence uploaded.');
      _evLoaded[leaveId] = false;
      await memberLoadEvidence(leaveId);
    } catch { showStatus('error', 'Upload failed.'); }
    input.value = '';
  }

  function memberShowLinkForm(leaveId) {
    document.getElementById(`ev-link-form-${leaveId}`).style.display = 'flex';
  }
  function memberHideLinkForm(leaveId) {
    document.getElementById(`ev-link-form-${leaveId}`).style.display = 'none';
    document.getElementById(`ev-link-url-${leaveId}`).value  = '';
    document.getElementById(`ev-link-note-${leaveId}`).value = '';
  }

  async function memberSubmitLink(leaveId) {
    const url  = document.getElementById(`ev-link-url-${leaveId}`).value.trim();
    const note = document.getElementById(`ev-link-note-${leaveId}`).value.trim();
    if (!url) { showStatus('error', 'Please enter a URL.'); return; }
    try {
      const res  = await apiFetch(`http://localhost:3000/leave/${leaveId}/evidence`, {
        method: 'POST', body: JSON.stringify({ external_url: url, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { showStatus('error', data.error || 'Failed to add link.'); return; }
      showStatus('success', 'Link added.');
      memberHideLinkForm(leaveId);
      _evLoaded[leaveId] = false;
      await memberLoadEvidence(leaveId);
    } catch { showStatus('error', 'Connection failed.'); }
  }

  async function memberViewFile(leaveId, evidenceId) {
    try {
      const res  = await apiFetch(`http://localhost:3000/leave/${leaveId}/evidence/${evidenceId}/url`);
      const data = await res.json();
      if (!res.ok) { showStatus('error', data.error || 'Failed to get file.'); return; }
      window.open(data.url, '_blank');
    } catch { showStatus('error', 'Connection failed.'); }
  }

  async function memberDeleteEvidence(leaveId, evidenceId) {
    if (!confirm('Delete this evidence?')) return;
    try {
      const res  = await apiFetch(`http://localhost:3000/leave/${leaveId}/evidence/${evidenceId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { showStatus('error', data.error || 'Delete failed.'); return; }
      showStatus('success', 'Evidence removed.');
      _evLoaded[leaveId] = false;
      await memberLoadEvidence(leaveId);
    } catch { showStatus('error', 'Connection failed.'); }
  }
```

- [ ] **Step 4: Commit**

```bash
git add member.html
git commit -m "feat: add evidence panel to leave history in member.html"
```

---

## Task 6: Update `dashboard.html` — evidence panel on leave approval cards

**Files:**
- Modify: `dashboard.html`

- [ ] **Step 1: Update `renderApprovals` to add evidence panel for leave type**

Open `dashboard.html`. Find `function renderApprovals(items, containerId, type)` (around line 1969). Find the `.map()` template inside it:

```js
  el.innerHTML = items.map((item, idx) => `
    <div class="approval-card fade-in" id="appr-${type}-${idx}" style="animation-delay:${idx * 0.05}s">
      <div style="flex:1">
        <div class="appr-name">${item.name || item.Name || '—'}</div>
        <div class="appr-meta">
          <span>📅 ${item.date || item.Date || '—'}</span>
          <span class="appr-sep">·</span>
          <span>⏰ ${item.time || item.clockIn || item['Clock In'] || '—'}</span>
          <span class="appr-sep">·</span>
          <span class="chip c-purple" style="font-size:10px;padding:2px 8px">${item.entryType || item['Entry Type'] || item['Leave Type'] || 'Manual'}</span>
        </div>
        ${(item.reason||item.Reason) ? `<div class="appr-reason">${item.reason||item.Reason}</div>` : ''}
      </div>
      <div class="appr-actions">
        <button class="btn-approve" onclick="handleApproval('${type}',${idx},'approve',this)">✓ Approve</button>
        <button class="btn-reject"  onclick="handleApproval('${type}',${idx},'reject',this)">✕ Reject</button>
      </div>
    </div>`).join('');
```

Replace entirely with:

```js
  el.innerHTML = items.map((item, idx) => {
    const name   = item.name   || item.Name   || '—';
    const date   = item.date   || item.Date   || '—';
    const time   = item.time   || item.clockIn || item['Clock In'] || '—';
    const chip   = item.entryType || item['Entry Type'] || item['Leave Type'] || 'Manual';
    const reason = item.reason || item.Reason || '';
    const leaveId = type === 'leave' ? item.id : null;
    return `
    <div class="approval-card fade-in" id="appr-${type}-${idx}" style="animation-delay:${idx * 0.05}s">
      <div style="flex:1">
        <div class="appr-name">${name}</div>
        <div class="appr-meta">
          <span>📅 ${date}</span>
          <span class="appr-sep">·</span>
          <span>⏰ ${time}</span>
          <span class="appr-sep">·</span>
          <span class="chip c-purple" style="font-size:10px;padding:2px 8px">${chip}</span>
          ${leaveId ? `<span class="appr-sep">·</span><button class="btn" onclick="dashToggleEvidence('${leaveId}')" style="font-size:11px;padding:3px 8px;">📎 Evidence</button>` : ''}
        </div>
        ${reason ? `<div class="appr-reason">${reason}</div>` : ''}
        ${leaveId ? `
        <div id="dash-ev-panel-${leaveId}" style="display:none;margin-top:10px;padding:10px;border:1px solid var(--border);border-radius:8px;background:#f9f9f8;">
          <div id="dash-ev-list-${leaveId}"><em style="font-size:12px;color:var(--text3);">Loading…</em></div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
            <label class="btn" style="font-size:12px;cursor:pointer;">
              📁 Add file
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" style="display:none;" onchange="dashUploadFile('${leaveId}', this)">
            </label>
            <button class="btn" style="font-size:12px;" onclick="dashShowLinkForm('${leaveId}')">🔗 Add link</button>
          </div>
          <div id="dash-ev-link-form-${leaveId}" style="display:none;margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <input type="url" id="dash-ev-url-${leaveId}" placeholder="https://drive.google.com/…" style="flex:1;min-width:180px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:inherit;">
            <input type="text" id="dash-ev-note-${leaveId}" placeholder="Note (optional)" style="width:110px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:inherit;">
            <button class="btn btn-primary" style="font-size:12px;" onclick="dashSubmitLink('${leaveId}')">Add</button>
            <button class="btn" style="font-size:12px;" onclick="dashHideLinkForm('${leaveId}')">Cancel</button>
          </div>
        </div>` : ''}
      </div>
      <div class="appr-actions">
        <button class="btn-approve" onclick="handleApproval('${type}',${idx},'approve',this)">✓ Approve</button>
        <button class="btn-reject"  onclick="handleApproval('${type}',${idx},'reject',this)">✕ Reject</button>
      </div>
    </div>`;
  }).join('');
```

- [ ] **Step 2: Add evidence JS functions for dashboard**

Find the closing `</script>` tag in `dashboard.html`. **Before** it, add:

```js
/* ── Leave Evidence (dashboard) ── */
const _dashEvLoaded = {};

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function dashToggleEvidence(leaveId) {
  const panel = document.getElementById(`dash-ev-panel-${leaveId}`);
  const open  = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  if (!open && !_dashEvLoaded[leaveId]) await dashLoadEvidence(leaveId);
}

async function dashLoadEvidence(leaveId) {
  const listEl = document.getElementById(`dash-ev-list-${leaveId}`);
  try {
    const res  = await apiFetch(`http://localhost:3000/leave/${leaveId}/evidence`);
    const data = await res.json();
    if (!res.ok) { listEl.innerHTML = `<em style="font-size:12px;color:#c00;">${escapeHtml(data.error)}</em>`; return; }
    _dashEvLoaded[leaveId] = true;
    dashRenderEvidence(leaveId, data.evidence);
  } catch { listEl.innerHTML = `<em style="font-size:12px;color:var(--text3);">Failed to load.</em>`; }
}

function dashRenderEvidence(leaveId, items) {
  const listEl = document.getElementById(`dash-ev-list-${leaveId}`);
  if (!items.length) { listEl.innerHTML = `<em style="font-size:12px;color:var(--text3);">No evidence attached.</em>`; return; }
  listEl.innerHTML = items.map(ev => {
    const label   = ev.file_name || ev.external_url || 'Evidence';
    const viewBtn = ev.file_name
      ? `<button class="btn" style="font-size:11px;padding:3px 8px;" onclick="dashViewFile('${leaveId}','${ev.id}')">View</button>`
      : `<a href="${escapeHtml(ev.external_url)}" target="_blank" rel="noopener" class="btn" style="font-size:11px;padding:3px 8px;">Open</a>`;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px;">
      <span>📄 ${escapeHtml(label)}</span>
      ${ev.note ? `<span style="color:var(--text3);">(${escapeHtml(ev.note)})</span>` : ''}
      ${viewBtn}
      <button class="btn" style="font-size:11px;padding:3px 8px;color:#c00;border-color:#c00;" onclick="dashDeleteEvidence('${leaveId}','${ev.id}')">Delete</button>
    </div>`;
  }).join('');
}

async function dashUploadFile(leaveId, input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const jwt = sessionStorage.getItem('anosupo_jwt');
    const res = await fetch(`http://localhost:3000/leave/${leaveId}/evidence`, {
      method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: formData,
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Upload failed.'); return; }
    toast('Evidence uploaded.');
    _dashEvLoaded[leaveId] = false;
    await dashLoadEvidence(leaveId);
  } catch { toast('Upload failed.'); }
  input.value = '';
}

function dashShowLinkForm(leaveId) {
  document.getElementById(`dash-ev-link-form-${leaveId}`).style.display = 'flex';
}
function dashHideLinkForm(leaveId) {
  document.getElementById(`dash-ev-link-form-${leaveId}`).style.display = 'none';
  document.getElementById(`dash-ev-url-${leaveId}`).value  = '';
  document.getElementById(`dash-ev-note-${leaveId}`).value = '';
}

async function dashSubmitLink(leaveId) {
  const url  = document.getElementById(`dash-ev-url-${leaveId}`).value.trim();
  const note = document.getElementById(`dash-ev-note-${leaveId}`).value.trim();
  if (!url) { toast('Please enter a URL.'); return; }
  try {
    const res  = await apiFetch(`http://localhost:3000/leave/${leaveId}/evidence`, {
      method: 'POST', body: JSON.stringify({ external_url: url, note: note || undefined }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed to add link.'); return; }
    toast('Link added.');
    dashHideLinkForm(leaveId);
    _dashEvLoaded[leaveId] = false;
    await dashLoadEvidence(leaveId);
  } catch { toast('Connection failed.'); }
}

async function dashViewFile(leaveId, evidenceId) {
  try {
    const res  = await apiFetch(`http://localhost:3000/leave/${leaveId}/evidence/${evidenceId}/url`);
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed to get file.'); return; }
    window.open(data.url, '_blank');
  } catch { toast('Connection failed.'); }
}

async function dashDeleteEvidence(leaveId, evidenceId) {
  if (!confirm('Delete this evidence?')) return;
  try {
    const res  = await apiFetch(`http://localhost:3000/leave/${leaveId}/evidence/${evidenceId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Delete failed.'); return; }
    toast('Evidence removed.');
    _dashEvLoaded[leaveId] = false;
    await dashLoadEvidence(leaveId);
  } catch { toast('Connection failed.'); }
}
```

- [ ] **Step 3: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard.html
git commit -m "feat: add evidence panel to leave approval cards in dashboard.html"
```

---

## Task 7: Final verification

- [ ] **Step 1: Start the server**

```bash
node server.js
```

- [ ] **Step 2: Member flow smoke test**

1. Log in as a member in `member.html`
2. Submit a leave request (e.g. Sick Leave for today)
3. Navigate to Leave History page
4. Click "📎 Evidence" on the new leave item — panel opens showing "No evidence attached yet"
5. Click "Add link", enter `https://drive.google.com/test`, click Add — link appears in list
6. Click "📁 Add file", select a small PDF or JPEG — file appears in list with "View" button
7. Click "View" — a signed URL opens in a new tab (Supabase serves the file)
8. Click "Delete" on the link — it disappears

- [ ] **Step 3: Admin/dashboard flow smoke test**

1. Log in as admin/owner in `dashboard.html`
2. Find the pending leave request
3. Click "📎 Evidence" on the leave card — panel opens showing the evidence uploaded by the member
4. Click "View" — file opens
5. Add another link from the admin side — it appears in the list
6. Approve the leave — card removes, evidence is preserved in the DB (not deleted on approval)

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: phase 3 smoke-test adjustments"
```
