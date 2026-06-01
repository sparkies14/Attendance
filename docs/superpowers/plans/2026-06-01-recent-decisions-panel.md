# Recent Decisions Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Recent decisions" history strip to the admin Approvals and Leave pages, showing the last 8 approve/reject decisions (team-wide, scoped to each page's type), sourced from the existing `audit_log`.

**Architecture:** A new admin-only backend endpoint `GET /webhook/recent-decisions` reads the relevant audit actions and enriches them with member names from `attendance`/`leave_log`. A new self-contained `RecentDecisions.tsx` component fetches it and renders the strip; `ApprovalsPage` mounts it below the master/detail area and bumps a refresh key after each decision.

**Tech Stack:** Node/Express + Supabase JS client (backend), Jest + supertest (backend tests), Next.js 15 / React 19 / TypeScript (frontend).

---

## File Structure

- **Create** `routes/recentDecisions.js` — the `GET /webhook/recent-decisions` endpoint (filter audit actions by type, enrich with names).
- **Modify** `server.js` — mount the new router at `/webhook/recent-decisions`.
- **Create** `tests/recentDecisions.test.js` — Jest/supertest coverage for the endpoint.
- **Create** `frontend/components/admin/RecentDecisions.tsx` — the strip component.
- **Modify** `frontend/components/admin/pages/ApprovalsPage.tsx` — render the strip, add `onViewAudit` prop + `decisionsRefreshKey` state.
- **Modify** `frontend/components/admin/AdminDashboard.tsx` — pass `onViewAudit={() => setPage('audit')}` to both `ApprovalsPage` usages.

---

## Task 1: Backend endpoint `GET /webhook/recent-decisions`

**Files:**
- Create: `routes/recentDecisions.js`
- Modify: `server.js:54` (add mount line after the `/webhook/approve` mount)
- Test: `tests/recentDecisions.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/recentDecisions.test.js`:

```javascript
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));

const supabase = require('../lib/supabase');
const router = require('../routes/recentDecisions');

// Chainable Supabase stub. `.limit()` resolves (audit query terminal);
// awaiting the chain directly resolves too (enrichment `.in()` terminal).
function chain(result) {
  const ch = {
    select: jest.fn(() => ch),
    in:     jest.fn(() => ch),
    order:  jest.fn(() => ch),
    limit:  jest.fn(() => Promise.resolve(result)),
    then:   (resolve) => resolve(result),
  };
  return ch;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/webhook/recent-decisions', router);
  return app;
}

const adminToken = () => signToken({ user_id: 'u1', email: 'admin@x.com', role: 'admin' });
const memberToken = () => signToken({ user_id: 'u2', email: 'm@x.com', role: 'member' });

beforeEach(() => { jest.clearAllMocks(); });

describe('GET /webhook/recent-decisions', () => {
  test('leave type returns leave decisions enriched with leave_type label', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'audit_log') {
        return chain({ data: [
          { id: 100, action: 'leave_approved', actor_email: 'admin@x.com', target_id: '10', occurred_at: '2026-06-01T10:00:00Z' },
          { id: 99,  action: 'leave_rejected', actor_email: 'owner@x.com', target_id: '11', occurred_at: '2026-06-01T09:00:00Z' },
        ], error: null });
      }
      // leave_log enrichment
      return chain({ data: [
        { id: 10, name: 'Carol Reyes', leave_type: 'Vacation' },
        { id: 11, name: 'Dan Lim',     leave_type: 'Sick leave' },
      ], error: null });
    });

    const res = await request(makeApp())
      .get('/webhook/recent-decisions?type=leave')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({ result: 'approved', name: 'Carol Reyes', label: 'Vacation', actor: 'admin@x.com' });
    expect(res.body.items[1]).toMatchObject({ result: 'rejected', name: 'Dan Lim', label: 'Sick leave' });
  });

  test('attendance type labels rows as clock-in', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'audit_log') {
        return chain({ data: [
          { id: 5, action: 'attendance_approved', actor_email: 'admin@x.com', target_id: '42', occurred_at: '2026-06-01T10:00:00Z' },
        ], error: null });
      }
      return chain({ data: [{ id: 42, name: 'Alice Tan' }], error: null });
    });

    const res = await request(makeApp())
      .get('/webhook/recent-decisions?type=attendance')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ result: 'approved', name: 'Alice Tan', label: 'clock-in' });
  });

  test('missing source row falls back to Entry #id', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'audit_log') {
        return chain({ data: [
          { id: 7, action: 'leave_approved', actor_email: 'admin@x.com', target_id: '999', occurred_at: '2026-06-01T10:00:00Z' },
        ], error: null });
      }
      return chain({ data: [], error: null }); // no matching leave_log row
    });

    const res = await request(makeApp())
      .get('/webhook/recent-decisions?type=leave')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe('Entry #999');
    expect(res.body.items[0].label).toBe('Leave');
  });

  test('limit is clamped to MAX (50)', async () => {
    let capturedLimit = null;
    supabase.from.mockImplementation((table) => {
      const ch = chain({ data: [], error: null });
      if (table === 'audit_log') {
        ch.limit = jest.fn((n) => { capturedLimit = n; return Promise.resolve({ data: [], error: null }); });
      }
      return ch;
    });

    const res = await request(makeApp())
      .get('/webhook/recent-decisions?type=leave&limit=999')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(capturedLimit).toBe(50);
  });

  test('rejects non-admin with 403', async () => {
    const res = await request(makeApp())
      .get('/webhook/recent-decisions?type=leave')
      .set('Authorization', `Bearer ${memberToken()}`);

    expect(res.status).toBe(403);
  });

  test('requires authentication', async () => {
    const res = await request(makeApp()).get('/webhook/recent-decisions?type=leave');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/recentDecisions.test.js`
Expected: FAIL — `Cannot find module '../routes/recentDecisions'`.

- [ ] **Step 3: Write the endpoint**

Create `routes/recentDecisions.js`:

```javascript
const router = require('express').Router();
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const audit = require('../lib/audit');

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;

router.use(requireAuth);

router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  const type = req.query.type === 'leave' ? 'leave' : 'attendance';

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const actions = type === 'leave'
    ? [audit.ACTIONS.LEAVE_APPROVED, audit.ACTIONS.LEAVE_REJECTED]
    : [audit.ACTIONS.ATTENDANCE_APPROVED, audit.ACTIONS.ATTENDANCE_REJECTED];

  const { data: rows, error } = await supabase
    .from('audit_log')
    .select('id, action, actor_email, target_id, occurred_at')
    .in('action', actions)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });

  // Best-effort name enrichment — a lookup failure degrades to "Entry #<id>".
  const sourceTable = type === 'leave' ? 'leave_log' : 'attendance';
  const ids = (rows || [])
    .map(r => parseInt(r.target_id, 10))
    .filter(Number.isInteger);

  const nameById = {};
  const labelById = {};
  if (ids.length) {
    const cols = type === 'leave' ? 'id, name, leave_type' : 'id, name';
    const { data: src } = await supabase.from(sourceTable).select(cols).in('id', ids);
    (src || []).forEach(s => {
      nameById[s.id] = s.name;
      if (type === 'leave') labelById[s.id] = s.leave_type;
    });
  }

  const approvedActions = [audit.ACTIONS.LEAVE_APPROVED, audit.ACTIONS.ATTENDANCE_APPROVED];
  const items = (rows || []).map(r => {
    const tid = parseInt(r.target_id, 10);
    return {
      id: r.id,
      result: approvedActions.includes(r.action) ? 'approved' : 'rejected',
      name: nameById[tid] || `Entry #${r.target_id}`,
      label: type === 'leave' ? (labelById[tid] || 'Leave') : 'clock-in',
      actor: r.actor_email,
      occurred_at: r.occurred_at,
    };
  });

  res.json({ items });
});

module.exports = router;
```

- [ ] **Step 4: Mount the router**

In `server.js`, immediately after the line `app.use('/webhook/approve',     require('./routes/approve'));` (line 54), add:

```javascript
app.use('/webhook/recent-decisions', require('./routes/recentDecisions'));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest tests/recentDecisions.test.js`
Expected: PASS (6 passing).

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `npx jest`
Expected: all suites pass (the existing ~255 tests plus the 6 new ones).

- [ ] **Step 7: Commit**

```bash
git add routes/recentDecisions.js server.js tests/recentDecisions.test.js
git commit -m "feat: add GET /webhook/recent-decisions endpoint for approval history"
```

---

## Task 2: Frontend `RecentDecisions` component

**Files:**
- Create: `frontend/components/admin/RecentDecisions.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/components/admin/RecentDecisions.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Decision {
  id: number | string;
  result: 'approved' | 'rejected';
  name: string;
  label: string;
  actor: string;
  occurred_at: string;
}

interface Props {
  apiUrl: string;
  type: 'leave' | 'attendance';
  refreshKey?: number;
  onViewAudit?: () => void;
}

const C = {
  surface: '#ffffff', surface2: '#f5f5f5', border: '#e6e6e6',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  green: '#16a34a', red: '#dc2626', blue: '#2563eb',
};
const F_SANS = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

export default function RecentDecisions({ apiUrl, type, refreshKey, onViewAudit }: Props) {
  const [items, setItems] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const res = await clientFetch(`${apiUrl}/webhook/recent-decisions?type=${type}&limit=8`);
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, type]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Recent decisions
        </div>
        {onViewAudit && (
          <button onClick={onViewAudit} style={{ background: 'transparent', border: 'none', color: C.blue, fontFamily: F_SANS, fontSize: 11.5, cursor: 'pointer' }}>
            View all in audit log →
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '18px 16px', fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: '18px 16px', fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>Couldn&apos;t load recent decisions.</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '18px 16px', fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>No decisions yet.</div>
      ) : (
        items.map((it) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: `1px solid ${C.surface2}` }}>
            <span style={{ width: 18, textAlign: 'center', color: it.result === 'approved' ? C.green : C.red, fontWeight: 700 }}>
              {it.result === 'approved' ? '✓' : '✕'}
            </span>
            <span style={{ fontFamily: F_SANS, fontSize: 13, color: C.text, fontWeight: 500 }}>{it.name}</span>
            <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>· {it.label}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3 }}>by {it.actor}</span>
            <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text2, minWidth: 64, textAlign: 'right' }}>{timeAgo(it.occurred_at)}</span>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0 (no errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/RecentDecisions.tsx
git commit -m "feat: add RecentDecisions strip component for approval history"
```

---

## Task 3: Integrate the strip into ApprovalsPage and wire navigation

**Files:**
- Modify: `frontend/components/admin/pages/ApprovalsPage.tsx`
- Modify: `frontend/components/admin/AdminDashboard.tsx`

- [ ] **Step 1: Import the component and extend Props in ApprovalsPage**

In `frontend/components/admin/pages/ApprovalsPage.tsx`, add the import after the existing `clientFetch` import (near line 5):

```tsx
import RecentDecisions from '@/components/admin/RecentDecisions';
```

Then extend the `Props` interface (near line 7) to add `onViewAudit`:

```tsx
interface Props {
  dashboard: DashboardData | null;
  apiUrl: string;
  token: string;
  onRefresh?: () => Promise<void>;
  filterKind?: string;
  onViewAudit?: () => void;
}
```

And update the function signature (the `export default function ApprovalsPage({ ... }: Props)` line) to destructure it:

```tsx
export default function ApprovalsPage({ dashboard, apiUrl, onRefresh, filterKind, onViewAudit }: Props) {
```

- [ ] **Step 2: Add the refresh-key state**

Just after the existing `const [search, setSearch] = useState('');` line, add:

```tsx
  const [decisionsRefreshKey, setDecisionsRefreshKey] = useState(0);
```

- [ ] **Step 3: Bump the refresh key after a decision**

In `doAction`, inside the success branch, immediately after the existing `await onRefresh?.();` line, add:

```tsx
        setDecisionsRefreshKey(k => k + 1);
```

- [ ] **Step 4: Render the strip below the master/detail grid**

Find the closing of the master/detail grid — the `</div>` that closes the
`{/* ── Master/detail ── */}` block (the one immediately before the final
`</div>` and `);` of the component's return). Insert the strip between that
closing `</div>` and the outermost closing `</div>`:

```tsx
      </div>

      {/* ── Recent decisions history ── */}
      <RecentDecisions
        apiUrl={apiUrl}
        type={leaveMode ? 'leave' : 'attendance'}
        refreshKey={decisionsRefreshKey}
        onViewAudit={onViewAudit}
      />
    </div>
  );
}
```

(The first `</div>` shown closes the master/detail grid; the last `</div>` closes the page's outer flex container.)

- [ ] **Step 5: Pass `onViewAudit` from AdminDashboard**

In `frontend/components/admin/AdminDashboard.tsx`, update both `ApprovalsPage`
usages (currently around lines 275–276) to pass the navigation callback:

```tsx
          {page === 'approvals'  && <ApprovalsPage  dashboard={dashData} apiUrl={apiUrl} token={token} onRefresh={refreshDashboard} onViewAudit={() => setPage('audit')} />}
          {page === 'leave'      && <ApprovalsPage  dashboard={dashData} apiUrl={apiUrl} token={token} onRefresh={refreshDashboard} filterKind="leave" onViewAudit={() => setPage('audit')} />}
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/admin/pages/ApprovalsPage.tsx frontend/components/admin/AdminDashboard.tsx
git commit -m "feat: show RecentDecisions strip on Approvals & Leave pages"
```

---

## Task 4: Verify in the running app

**Files:** none (verification only).

- [ ] **Step 1: Create a temporary harness route**

Create `frontend/app/verify-tmp/page.tsx`:

```tsx
// TEMPORARY verification harness — delete after verifying.
'use client';
import RecentDecisions from '@/components/admin/RecentDecisions';

export default function VerifyTmp() {
  return (
    <div style={{ padding: 24, background: '#fafafa', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RecentDecisions apiUrl="http://localhost:3000" type="leave" onViewAudit={() => alert('audit')} />
      <RecentDecisions apiUrl="http://localhost:3000" type="attendance" />
    </div>
  );
}
```

Note: with no backend running at `:3000`, the fetch fails and the component
should show the **"Couldn't load recent decisions."** error state — which itself
verifies the error path renders without crashing.

- [ ] **Step 2: Start the dev server**

Run: `cd frontend && npm run dev` (background) and wait for "Ready".

- [ ] **Step 3: Fetch the harness HTML and confirm it renders**

Run: `curl -s http://localhost:3001/verify-tmp -o /tmp/rd.html -w "HTTP %{http_code}\n"` then grep:
`grep -c "Recent decisions" /tmp/rd.html` (expect ≥ 1) and
`grep -c "Couldn't load recent decisions\|No decisions yet\|Loading" /tmp/rd.html` (expect ≥ 1).
Expected: HTTP 200, both greps > 0 — the strip header and a state line render.

- [ ] **Step 4: Clean up the harness**

```bash
rm -rf frontend/app/verify-tmp frontend/.next
pkill -f "next dev"
```

- [ ] **Step 5: No commit needed** (verification only; harness removed).

---

## Self-Review Notes

- **Spec coverage:** endpoint + filter by type (Task 1) ✓; name enrichment + `Entry #<id>` fallback (Task 1, tests) ✓; admin-only guard (Task 1, test) ✓; component with rows/empty/error states (Task 2) ✓; placement below master/detail (Task 3) ✓; refresh after decision (Task 3) ✓; "View all in audit log →" link (Task 2 + Task 3 wiring) ✓; last 8 (limit=8 in component) ✓.
- **Type consistency:** `Decision` fields (`result`/`name`/`label`/`actor`/`occurred_at`) match the endpoint's `items` shape from Task 1. `type` is `'leave' | 'attendance'` in both. `onViewAudit` optional in both component and ApprovalsPage Props.
- **No placeholders:** all code blocks are complete and runnable.
