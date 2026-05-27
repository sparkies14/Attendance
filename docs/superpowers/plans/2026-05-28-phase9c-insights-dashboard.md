# Phase 9C — Insights Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/insights` placeholder with a real dashboard showing tardy, leave, discipline, and attention data with date filtering and CSV/PDF export buttons.

**Architecture:** Next.js Server Component fetches all 4 Express report endpoints in parallel (via `Promise.all`) forwarding the JWT from the `att_token` cookie as a Bearer token; data is passed as props to Recharts Client Components. The date range is driven by URL search params so SSR re-runs on every navigation. A cookie fallback is added to `requireAuth` so browser-direct export download links work without JavaScript setting the Authorization header.

**Tech Stack:** Node.js/Express, Next.js 15 App Router, React 19, Recharts, next-intl v3, TypeScript

---

## File Map

**Modify — Express:**
- `middleware/requireAuth.js` — add `req.cookies?.att_token` fallback when no Bearer header
- `server.js` — register `cookie-parser` middleware so `req.cookies` is populated
- `package.json` (Express) — add `cookie-parser` dependency
- `tests/middleware.test.js` — add 3 tests for cookie fallback behaviour

**Modify — Next.js:**
- `frontend/package.json` — add `recharts` dependency
- `frontend/messages/en.json` — add all Phase 9C i18n keys
- `frontend/messages/ja.json` — same keys with English values (Phase 9D fills in Japanese)
- `frontend/app/insights/page.tsx` — replace placeholder with full dashboard server component

**Create — Next.js components:**
- `frontend/components/insights/DateRangePicker.tsx` — Client Component; date inputs + Apply; URL push
- `frontend/components/insights/AttentionWidget.tsx` — Client Component; cards for members needing attention
- `frontend/components/insights/TardyChart.tsx` — Client Component; Recharts stacked BarChart
- `frontend/components/insights/LeaveChart.tsx` — Client Component; Recharts grouped BarChart
- `frontend/components/insights/DisciplineChart.tsx` — Client Component; Recharts single BarChart
- `frontend/components/insights/ExportButtons.tsx` — Client Component; CSV + PDF anchor links

---

### Task 1: requireAuth cookie fallback

**Files:**
- Modify: `middleware/requireAuth.js`
- Modify: `server.js`
- Modify: `package.json` (Express root)
- Modify: `tests/middleware.test.js`

- [ ] **Step 1: Write the failing tests**

Add these 3 tests to the existing `describe('requireAuth', ...)` block in `tests/middleware.test.js`. The first two tests use a mock `req` with `cookies` populated (no Bearer header); the third verifies the existing "no header and no cookie" path stays 401:

```javascript
// In tests/middleware.test.js — add inside describe('requireAuth', () => { ... })

test('authenticates via att_token cookie when no Bearer header', () => {
  const token = signToken({ user_id: 'u2', email: 'b@c.com', role: 'admin' });
  const req = mockReq();
  req.cookies = { att_token: token };
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(next).toHaveBeenCalled();
  expect(req.user.user_id).toBe('u2');
  expect(req.user.email).toBe('b@c.com');
});

test('401 when cookie token is invalid', () => {
  const req = mockReq();
  req.cookies = { att_token: 'not-a-valid-jwt' };
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('401 when no Bearer header and no att_token cookie', () => {
  const req = mockReq();
  req.cookies = {};
  const res = mockRes();
  const next = jest.fn();
  requireAuth(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx jest tests/middleware.test.js --testNamePattern="cookie" -t "cookie"
```

Expected: 3 failures (requireAuth doesn't check cookies yet).

- [ ] **Step 3: Install cookie-parser**

```bash
npm install cookie-parser
```

Expected: `cookie-parser` appears in `package.json` dependencies.

- [ ] **Step 4: Register cookie-parser in server.js**

In `server.js`, add `cookie-parser` middleware after `express.json()` and before any routes:

```javascript
// After: app.use(express.json());
// Before: app.use(express.static(__dirname));
app.use(require('cookie-parser')());
```

The relevant section of `server.js` should now look like:

```javascript
app.use(express.json());
app.use(require('cookie-parser')());
app.use(express.static(__dirname));
```

- [ ] **Step 5: Update requireAuth.js to check cookie as fallback**

Replace the entire contents of `middleware/requireAuth.js`:

```javascript
const { verifyToken } = require('../lib/auth');

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  let token;

  if (header && header.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else if (req.cookies?.att_token) {
    token = req.cookies.att_token;
  } else {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  req.user = { user_id: payload.user_id, email: payload.email, role: payload.role };
  next();
};
```

- [ ] **Step 6: Run all tests to verify everything passes**

```bash
npm test
```

Expected: All tests pass (the 3 new cookie tests + all existing tests). Output ends with something like `Tests: N passed, N total`.

- [ ] **Step 7: Commit**

```bash
git add middleware/requireAuth.js server.js package.json package-lock.json tests/middleware.test.js
git commit -m "$(cat <<'EOF'
feat: add att_token cookie fallback to requireAuth for browser export downloads

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Frontend setup — recharts + i18n keys

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/ja.json`

- [ ] **Step 1: Add recharts to frontend/package.json**

In `frontend/package.json`, add `"recharts": "^2.15.0"` to the `dependencies` object:

```json
{
  "name": "attendance-ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001"
  },
  "dependencies": {
    "jose": "^5.9.0",
    "next": "^15.0.0",
    "next-intl": "^3.22.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Install recharts**

```bash
cd frontend && npm install && cd ..
```

Expected: `recharts` appears in `frontend/node_modules/recharts/`.

- [ ] **Step 3: Replace frontend/messages/en.json with full key set**

```json
{
  "InsightsPage": {
    "title": "Insights",
    "welcome": "Welcome, {name}",
    "role": "Role: {role}",
    "comingSoon": "Dashboard coming soon.",
    "dateFrom": "From",
    "dateTo": "To",
    "apply": "Apply",
    "dateError": "End date must be after start date.",
    "attentionTitle": "Needs Attention (this month)",
    "noAttention": "No members need attention this month.",
    "tardyTitle": "Tardy",
    "leaveTitle": "Leave Utilization",
    "disciplineTitle": "Discipline",
    "noTardy": "No tardy records in this date range.",
    "noWarnings": "No active warnings in this date range.",
    "downloadCsv": "↓ CSV",
    "downloadPdf": "↓ PDF",
    "errorLoad": "Failed to load {section} data — try refreshing.",
    "legendMinor": "Minor",
    "legendMajor": "Major",
    "legendAwolHalf": "AWOL Half Day",
    "legendAwolFull": "AWOL Full Day",
    "legendUsed": "Used",
    "legendRemaining": "Remaining",
    "legendActive": "Active Warnings"
  }
}
```

- [ ] **Step 4: Replace frontend/messages/ja.json with same keys (English values — Phase 9D fills Japanese)**

```json
{
  "InsightsPage": {
    "title": "Insights",
    "welcome": "Welcome, {name}",
    "role": "Role: {role}",
    "comingSoon": "Dashboard coming soon.",
    "dateFrom": "From",
    "dateTo": "To",
    "apply": "Apply",
    "dateError": "End date must be after start date.",
    "attentionTitle": "Needs Attention (this month)",
    "noAttention": "No members need attention this month.",
    "tardyTitle": "Tardy",
    "leaveTitle": "Leave Utilization",
    "disciplineTitle": "Discipline",
    "noTardy": "No tardy records in this date range.",
    "noWarnings": "No active warnings in this date range.",
    "downloadCsv": "↓ CSV",
    "downloadPdf": "↓ PDF",
    "errorLoad": "Failed to load {section} data — try refreshing.",
    "legendMinor": "Minor",
    "legendMajor": "Major",
    "legendAwolHalf": "AWOL Half Day",
    "legendAwolFull": "AWOL Full Day",
    "legendUsed": "Used",
    "legendRemaining": "Remaining",
    "legendActive": "Active Warnings"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/messages/en.json frontend/messages/ja.json
git commit -m "$(cat <<'EOF'
feat: add recharts dependency and Phase 9C i18n keys

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: DateRangePicker component

**Files:**
- Create: `frontend/components/insights/DateRangePicker.tsx`

- [ ] **Step 1: Create the components/insights directory and DateRangePicker.tsx**

Create `frontend/components/insights/DateRangePicker.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  initialFrom: string;
  initialTo: string;
  labelFrom: string;
  labelTo: string;
  labelApply: string;
  errorMessage: string;
}

export default function DateRangePicker({
  initialFrom,
  initialTo,
  labelFrom,
  labelTo,
  labelApply,
  errorMessage,
}: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [hasError, setHasError] = useState(false);

  function handleApply() {
    if (from > to) {
      setHasError(true);
      return;
    }
    setHasError(false);
    router.push(`/insights?from=${from}&to=${to}`);
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <label style={{ marginRight: '0.5rem' }}>
        {labelFrom}{' '}
        <input
          type="date"
          value={from}
          onChange={e => setFrom(e.target.value)}
          style={{ marginRight: '1rem' }}
        />
      </label>
      <label style={{ marginRight: '0.5rem' }}>
        {labelTo}{' '}
        <input
          type="date"
          value={to}
          onChange={e => setTo(e.target.value)}
          style={{ marginRight: '1rem' }}
        />
      </label>
      <button onClick={handleApply}>{labelApply}</button>
      {hasError && (
        <span style={{ color: 'red', marginLeft: '1rem', fontSize: '0.875rem' }}>
          {errorMessage}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/insights/DateRangePicker.tsx
git commit -m "$(cat <<'EOF'
feat: add DateRangePicker client component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: AttentionWidget component

**Files:**
- Create: `frontend/components/insights/AttentionWidget.tsx`

- [ ] **Step 1: Create AttentionWidget.tsx**

Create `frontend/components/insights/AttentionWidget.tsx`:

```typescript
'use client';

interface AttentionMember {
  name: string;
  email: string;
  reasons: string[];
}

interface Props {
  members: AttentionMember[];
  emptyMessage: string;
}

export default function AttentionWidget({ members, emptyMessage }: Props) {
  if (members.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
      {members.map(m => (
        <div
          key={m.email}
          style={{
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            padding: '1rem',
            background: '#fff7ed',
            minWidth: '200px',
          }}
        >
          <strong>{m.name}</strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
            {m.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/insights/AttentionWidget.tsx
git commit -m "$(cat <<'EOF'
feat: add AttentionWidget client component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: TardyChart component

**Files:**
- Create: `frontend/components/insights/TardyChart.tsx`

- [ ] **Step 1: Create TardyChart.tsx**

Create `frontend/components/insights/TardyChart.tsx`:

```typescript
'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface TardyMember {
  name: string;
  minor: number;
  major: number;
  awolHalf: number;
  awolFull: number;
}

interface Props {
  members: TardyMember[];
  emptyMessage: string;
  legendMinor: string;
  legendMajor: string;
  legendAwolHalf: string;
  legendAwolFull: string;
}

export default function TardyChart({
  members,
  emptyMessage,
  legendMinor,
  legendMajor,
  legendAwolHalf,
  legendAwolFull,
}: Props) {
  const allZero = members.every(
    m => m.minor + m.major + m.awolHalf + m.awolFull === 0
  );
  if (allZero) return <p>{emptyMessage}</p>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={members} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <XAxis dataKey="name" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="minor" name={legendMinor} stackId="tardy" fill="#facc15" />
        <Bar dataKey="major" name={legendMajor} stackId="tardy" fill="#f97316" />
        <Bar dataKey="awolHalf" name={legendAwolHalf} stackId="tardy" fill="#ef4444" />
        <Bar dataKey="awolFull" name={legendAwolFull} stackId="tardy" fill="#991b1b" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/insights/TardyChart.tsx
git commit -m "$(cat <<'EOF'
feat: add TardyChart stacked bar client component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: LeaveChart component

**Files:**
- Create: `frontend/components/insights/LeaveChart.tsx`

- [ ] **Step 1: Create LeaveChart.tsx**

Create `frontend/components/insights/LeaveChart.tsx`:

```typescript
'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface LeaveMember {
  name: string;
  used: number;
  remaining: number;
}

interface Props {
  members: LeaveMember[];
  legendUsed: string;
  legendRemaining: string;
}

export default function LeaveChart({ members, legendUsed, legendRemaining }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={members} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <XAxis dataKey="name" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="used" name={legendUsed} fill="#3b82f6" />
        <Bar dataKey="remaining" name={legendRemaining} fill="#22c55e" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/insights/LeaveChart.tsx
git commit -m "$(cat <<'EOF'
feat: add LeaveChart grouped bar client component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: DisciplineChart component

**Files:**
- Create: `frontend/components/insights/DisciplineChart.tsx`

- [ ] **Step 1: Create DisciplineChart.tsx**

Create `frontend/components/insights/DisciplineChart.tsx`:

```typescript
'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DisciplineMember {
  name: string;
  active: number;
}

interface Props {
  members: DisciplineMember[];
  emptyMessage: string;
  legendActive: string;
}

export default function DisciplineChart({ members, emptyMessage, legendActive }: Props) {
  const allZero = members.every(m => m.active === 0);
  if (allZero) return <p>{emptyMessage}</p>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={members} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <XAxis dataKey="name" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="active" name={legendActive} fill="#8b5cf6" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/insights/DisciplineChart.tsx
git commit -m "$(cat <<'EOF'
feat: add DisciplineChart bar client component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: ExportButtons component

**Files:**
- Create: `frontend/components/insights/ExportButtons.tsx`

- [ ] **Step 1: Create ExportButtons.tsx**

Create `frontend/components/insights/ExportButtons.tsx`:

```typescript
'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const btnStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  padding: '0.25rem 0.5rem',
  background: '#e5e7eb',
  color: '#374151',
  border: '1px solid #9ca3af',
  borderRadius: '4px',
  textDecoration: 'none',
  cursor: 'pointer',
  display: 'inline-block',
};

interface Props {
  section: 'tardy' | 'leave' | 'discipline';
  from: string;
  to: string;
  csvLabel: string;
  pdfLabel: string;
}

export default function ExportButtons({ section, from, to, csvLabel, pdfLabel }: Props) {
  return (
    <span style={{ display: 'inline-flex', gap: '0.5rem' }}>
      <a
        href={`${API_URL}/reports/export/${section}.csv?from=${from}&to=${to}`}
        target="_blank"
        rel="noopener noreferrer"
        style={btnStyle}
      >
        {csvLabel}
      </a>
      <a
        href={`${API_URL}/reports/export/${section}.pdf?from=${from}&to=${to}`}
        target="_blank"
        rel="noopener noreferrer"
        style={btnStyle}
      >
        {pdfLabel}
      </a>
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/insights/ExportButtons.tsx
git commit -m "$(cat <<'EOF'
feat: add ExportButtons client component for CSV and PDF downloads

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Replace InsightsPage with full dashboard

**Files:**
- Modify: `frontend/app/insights/page.tsx`

- [ ] **Step 1: Replace page.tsx with the full server component**

Replace the entire contents of `frontend/app/insights/page.tsx`:

```typescript
import { getTranslations } from 'next-intl/server';
import { headers, cookies } from 'next/headers';
import DateRangePicker from '@/components/insights/DateRangePicker';
import AttentionWidget from '@/components/insights/AttentionWidget';
import TardyChart from '@/components/insights/TardyChart';
import LeaveChart from '@/components/insights/LeaveChart';
import DisciplineChart from '@/components/insights/DisciplineChart';
import ExportButtons from '@/components/insights/ExportButtons';

interface TardyMember  { name: string; minor: number; major: number; awolHalf: number; awolFull: number; }
interface LeaveMember  { name: string; used: number; remaining: number; }
interface DisciplineMember { name: string; active: number; }
interface AttentionMember  { name: string; email: string; reasons: string[]; }

function getDefaultDates(): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

async function safeFetch<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const t = await getTranslations('InsightsPage');
  const h = await headers();
  const name = h.get('x-user-name') || h.get('x-user-email') || 'Unknown';
  const role = h.get('x-user-role') || 'Unknown';

  const params = await searchParams;
  const defaults = getDefaultDates();
  const from = params.from && isValidDate(params.from) ? params.from : defaults.from;
  const to   = params.to   && isValidDate(params.to)   ? params.to   : defaults.to;

  const cookieStore = await cookies();
  const token  = cookieStore.get('att_token')?.value ?? '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  const [tardyRaw, leaveRaw, disciplineRaw, attentionRaw] = await Promise.all([
    safeFetch<{ members: Record<string, unknown>[] }>(`${apiUrl}/reports/tardy?from=${from}&to=${to}`, token),
    safeFetch<{ members: Record<string, unknown>[] }>(`${apiUrl}/reports/leave?from=${from}&to=${to}`, token),
    safeFetch<{ members: Record<string, unknown>[] }>(`${apiUrl}/reports/discipline?from=${from}&to=${to}`, token),
    safeFetch<{ members: AttentionMember[] }>(`${apiUrl}/reports/attention`, token),
  ]);

  const tardyMembers: TardyMember[] | null = tardyRaw?.members?.map(m => ({
    name: String(m.name), minor: Number(m.minor), major: Number(m.major),
    awolHalf: Number(m.awolHalf), awolFull: Number(m.awolFull),
  })) ?? null;

  const leaveMembers: LeaveMember[] | null = leaveRaw?.members?.map(m => ({
    name: String(m.name), used: Number(m.used), remaining: Number(m.remaining),
  })) ?? null;

  const disciplineMembers: DisciplineMember[] | null = disciplineRaw?.members?.map(m => ({
    name: String(m.name), active: Number(m.active),
  })) ?? null;

  const attentionMembers: AttentionMember[] = attentionRaw?.members ?? [];

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    margin: '0 0 0.75rem 0',
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>{t('title')}</h1>
      <p>
        {t('welcome', { name })} &mdash; {t('role', { role })}
      </p>

      <DateRangePicker
        initialFrom={from}
        initialTo={to}
        labelFrom={t('dateFrom')}
        labelTo={t('dateTo')}
        labelApply={t('apply')}
        errorMessage={t('dateError')}
      />

      <section>
        <h2>{t('attentionTitle')}</h2>
        <AttentionWidget
          members={attentionMembers}
          emptyMessage={t('noAttention')}
        />
      </section>

      <section style={{ marginTop: '2rem' }}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0 }}>{t('tardyTitle')}</h2>
          <ExportButtons
            section="tardy"
            from={from}
            to={to}
            csvLabel={t('downloadCsv')}
            pdfLabel={t('downloadPdf')}
          />
        </div>
        {tardyMembers === null ? (
          <p style={{ color: 'red' }}>{t('errorLoad', { section: 'tardy' })}</p>
        ) : (
          <TardyChart
            members={tardyMembers}
            emptyMessage={t('noTardy')}
            legendMinor={t('legendMinor')}
            legendMajor={t('legendMajor')}
            legendAwolHalf={t('legendAwolHalf')}
            legendAwolFull={t('legendAwolFull')}
          />
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0 }}>{t('leaveTitle')}</h2>
          <ExportButtons
            section="leave"
            from={from}
            to={to}
            csvLabel={t('downloadCsv')}
            pdfLabel={t('downloadPdf')}
          />
        </div>
        {leaveMembers === null ? (
          <p style={{ color: 'red' }}>{t('errorLoad', { section: 'leave' })}</p>
        ) : (
          <LeaveChart
            members={leaveMembers}
            legendUsed={t('legendUsed')}
            legendRemaining={t('legendRemaining')}
          />
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0 }}>{t('disciplineTitle')}</h2>
          <ExportButtons
            section="discipline"
            from={from}
            to={to}
            csvLabel={t('downloadCsv')}
            pdfLabel={t('downloadPdf')}
          />
        </div>
        {disciplineMembers === null ? (
          <p style={{ color: 'red' }}>{t('errorLoad', { section: 'discipline' })}</p>
        ) : (
          <DisciplineChart
            members={disciplineMembers}
            emptyMessage={t('noWarnings')}
            legendActive={t('legendActive')}
          />
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/insights/page.tsx
git commit -m "$(cat <<'EOF'
feat: replace insights placeholder with full dashboard server component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Run test suite and E2E verification

**Files:** None (verification only)

- [ ] **Step 1: Run Express test suite**

```bash
npm test
```

Expected: All tests pass. The output should show the 3 new requireAuth cookie tests passing alongside all prior tests.

- [ ] **Step 2: Start both servers**

Terminal 1:
```bash
node server.js
```
Expected: `Attendance server running on http://localhost:3000`

Terminal 2:
```bash
cd frontend && npm run dev
```
Expected: `✓ Ready on http://localhost:3001`

- [ ] **Step 3: Verify the dashboard renders**

Open `http://localhost:3001/insights` in a browser (must already be logged in — the `att_token` cookie must be set from a prior login on port 3000).

Expected checklist:
- [ ] Page title "Insights" is visible
- [ ] Welcome line shows the logged-in user's name and role
- [ ] Date range picker shows two date inputs defaulting to first of current month → today
- [ ] "Needs Attention (this month)" section renders (either cards or the empty state message)
- [ ] "Tardy" section renders with `↓ CSV` and `↓ PDF` buttons; chart or empty state shown
- [ ] "Leave Utilization" section renders with export buttons; chart or empty state shown
- [ ] "Discipline" section renders with export buttons; chart or empty state shown

- [ ] **Step 4: Verify date range filter works**

Change the "From" date to an earlier month in the picker, click "Apply".

Expected: URL updates to `?from=...&to=...`, page re-renders with new data. Chart data changes (or stays the same if no data exists for that range).

- [ ] **Step 5: Verify date validation**

Set "From" to a date after "To", click "Apply".

Expected: Red error message "End date must be after start date." appears; URL does not change.

- [ ] **Step 6: Verify CSV export**

Click `↓ CSV` next to "Tardy".

Expected: Browser opens a new tab and downloads a `.csv` file (or shows CSV content). No 401 error — the `att_token` cookie authenticates the request.

- [ ] **Step 7: Verify PDF export**

Click `↓ PDF` next to one section.

Expected: Browser downloads a PDF. No 401 error.

- [ ] **Step 8: Verify invalid URL params fall back to defaults**

Navigate to `http://localhost:3001/insights?from=not-a-date&to=also-bad`.

Expected: Page renders normally with current month defaults in the date inputs.
