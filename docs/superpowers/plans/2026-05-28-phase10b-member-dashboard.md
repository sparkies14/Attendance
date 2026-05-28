# Phase 10B — Member Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full 7-tab member dashboard at `/member` so members can clock in/out, view their attendance, manage leave, see discipline records, submit appeals, and update account settings.

**Architecture:** Server Component (`app/member/page.tsx`) fetches initial data (user profile, leave balance, current month member-data) using the `att_token` cookie, then passes it as props to a Client Component shell (`MemberDashboard`) that owns tab state. Each tab is a focused Client Component; Discipline and Appeals tabs lazy-load on first open.

**Tech Stack:** Next.js App Router, React, TypeScript, inline styles (Compact Mono design — same as login page). No new dependencies.

---

## File Map

| Action | File |
|--------|------|
| Modify | `frontend/middleware.ts` — add `/member` to matcher |
| Modify | `frontend/app/member/page.tsx` — replace placeholder with Server Component |
| Create | `frontend/components/member/MemberDashboard.tsx` — tab shell (Client) |
| Create | `frontend/components/member/tabs/TodayTab.tsx` |
| Create | `frontend/components/member/tabs/OverviewTab.tsx` |
| Create | `frontend/components/member/tabs/AttendanceTab.tsx` |
| Create | `frontend/components/member/tabs/LeaveTab.tsx` |
| Create | `frontend/components/member/tabs/DisciplineTab.tsx` |
| Create | `frontend/components/member/tabs/AppealsTab.tsx` |
| Create | `frontend/components/member/tabs/SettingsTab.tsx` |

---

## Task 1: Protect `/member` via middleware

**Files:**
- Modify: `frontend/middleware.ts`

- [ ] **Step 1: Update the matcher**

In `frontend/middleware.ts` replace:
```typescript
export const config = {
  matcher: ['/insights/:path*', '/help/:path*'],
};
```
with:
```typescript
export const config = {
  matcher: ['/insights/:path*', '/help/:path*', '/member'],
};
```

- [ ] **Step 2: Verify**

Start the dev server (`cd frontend && npm run dev`). Visit `http://localhost:3001/member` without an `att_token` cookie — browser should redirect to `http://localhost:3000/index.html`.

- [ ] **Step 3: Commit**

```bash
git add frontend/middleware.ts
git commit -m "feat: protect /member route via middleware"
```

---

## Task 2: Member page — Server Component

**Files:**
- Modify: `frontend/app/member/page.tsx`

- [ ] **Step 1: Replace the placeholder with the full server component**

```typescript
import { headers, cookies } from 'next/headers';
import MemberDashboard from '@/components/member/MemberDashboard';
import type { UserProfile, LeaveBalance, MemberData } from '@/components/member/MemberDashboard';

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

export default async function MemberPage() {
  const h = await headers();
  const email = h.get('x-user-email') ?? '';

  const cookieStore = await cookies();
  const token = cookieStore.get('att_token')?.value ?? '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [user, leaveBalance, memberData] = await Promise.all([
    safeFetch<UserProfile>(`${apiUrl}/auth/me`, token),
    safeFetch<LeaveBalance>(`${apiUrl}/leave-balance?email=${encodeURIComponent(email)}`, token),
    safeFetch<MemberData>(`${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${month}&year=${year}`, token),
  ]);

  if (!user) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'monospace', textAlign: 'center' }}>
        <p>Unable to load your profile. Please try refreshing.</p>
      </main>
    );
  }

  return (
    <MemberDashboard
      user={user}
      leaveBalance={leaveBalance}
      memberData={memberData}
      apiUrl={apiUrl}
    />
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "member/"
```

Expected: errors only about missing `MemberDashboard` module (not yet created) — no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/member/page.tsx
git commit -m "feat: member page server component fetches initial data"
```

---

## Task 3: MemberDashboard — tab shell

**Files:**
- Create: `frontend/components/member/MemberDashboard.tsx`

- [ ] **Step 1: Create the shell with all type definitions and the tab bar**

```typescript
'use client';

import { useState } from 'react';
import TodayTab from './tabs/TodayTab';
import OverviewTab from './tabs/OverviewTab';
import AttendanceTab from './tabs/AttendanceTab';
import LeaveTab from './tabs/LeaveTab';
import DisciplineTab from './tabs/DisciplineTab';
import AppealsTab from './tabs/AppealsTab';
import SettingsTab from './tabs/SettingsTab';

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  hasPassword: boolean;
  hasGoogle: boolean;
}

export interface LeaveBalance {
  email: string;
  name: string;
  hire_year: number;
  total: number;
  used: number;
  remaining: number;
}

export interface CalendarDay {
  day: number;
  date: string; // M/D/YYYY (US locale from backend)
  status: string;
  clockIn: string;
  clockOut: string;
  totalHours: string | number;
  isWeekend: boolean;
}

export interface LeaveRecord {
  id: string;
  date: string;
  leaveType: string;
  reason: string;
  status: string;
}

export interface MemberData {
  month: number;
  year: number;
  email: string;
  calendar: CalendarDay[];
  summary: { present: number; late: number; absent: number; pending: number };
  onLunch: boolean;
  onBreak: boolean;
  leaveHistory: LeaveRecord[];
}

export interface MemberDashboardProps {
  user: UserProfile;
  leaveBalance: LeaveBalance | null;
  memberData: MemberData | null;
  apiUrl: string;
}

const TABS = ['Today', 'Overview', 'Attendance', 'Leave', 'Discipline', 'Appeals', 'Settings'] as const;
type Tab = typeof TABS[number];

export default function MemberDashboard({ user, leaveBalance, memberData, apiUrl }: MemberDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Today');

  const gridBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23e5e7eb' stroke-width='0.5'/%3E%3C/svg%3E")`;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa', backgroundImage: gridBg }}>
      {/* Brand bar */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, color: '#111' }}>
          Anosupo AI · 出勤管理
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>
          {user.name} · {user.role}
        </span>
      </div>

      <div style={{ maxWidth: 860, margin: '2rem auto', padding: '0 1rem' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.45rem 0.9rem',
                border: '1px solid',
                borderColor: activeTab === tab ? '#111' : '#d1d5db',
                borderRadius: 999,
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                backgroundColor: activeTab === tab ? '#111' : '#fff',
                color: activeTab === tab ? '#fff' : '#6b7280',
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Active tab */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '2rem' }}>
          {activeTab === 'Today'      && <TodayTab      email={user.email} memberData={memberData} apiUrl={apiUrl} />}
          {activeTab === 'Overview'   && <OverviewTab   user={user} leaveBalance={leaveBalance} memberData={memberData} />}
          {activeTab === 'Attendance' && <AttendanceTab email={user.email} initialData={memberData} apiUrl={apiUrl} />}
          {activeTab === 'Leave'      && <LeaveTab      email={user.email} leaveBalance={leaveBalance} initialLeaveHistory={memberData?.leaveHistory ?? []} apiUrl={apiUrl} />}
          {activeTab === 'Discipline' && <DisciplineTab email={user.email} apiUrl={apiUrl} />}
          {activeTab === 'Appeals'    && <AppealsTab    apiUrl={apiUrl} />}
          {activeTab === 'Settings'   && <SettingsTab   user={user} apiUrl={apiUrl} />}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the tabs directory**

```bash
mkdir -p frontend/components/member/tabs
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/member/MemberDashboard.tsx
git commit -m "feat: MemberDashboard shell with 7-tab bar"
```

---

## Task 4: TodayTab — clock in/out, lunch, break

**Files:**
- Create: `frontend/components/member/tabs/TodayTab.tsx`

- [ ] **Step 1: Create the tab**

```typescript
'use client';

import { useState } from 'react';
import type { MemberData, CalendarDay } from '../MemberDashboard';

interface Props {
  email: string;
  memberData: MemberData | null;
  apiUrl: string;
}

function getJST() {
  const now = new Date();
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return {
    date: `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`,
    time: `${String(jst.getHours()).padStart(2, '0')}:${String(jst.getMinutes()).padStart(2, '0')}`,
    hour: jst.getHours(),
    minute: jst.getMinutes(),
  };
}

function findToday(calendar: CalendarDay[]): CalendarDay | null {
  const jst = getJST();
  const todayDay = parseInt(jst.date.split('-')[2]);
  return calendar.find(d => d.day === todayDay && !d.isWeekend) ?? null;
}

export default function TodayTab({ email, memberData, apiUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onLunch, setOnLunch] = useState(memberData?.onLunch ?? false);
  const [onBreak, setOnBreak] = useState(memberData?.onBreak ?? false);
  const [todayRecord, setTodayRecord] = useState<CalendarDay | null>(
    memberData ? findToday(memberData.calendar) : null
  );

  async function doAction(body: Record<string, unknown>) {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Action failed.');
      } else {
        setMessage(data.message ?? 'Done.');
        // Refresh today's record from memberData after action
        const jst = getJST();
        const refreshRes = await fetch(
          `${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${parseInt(jst.date.split('-')[1])}&year=${parseInt(jst.date.split('-')[0])}`,
          { headers: { 'Content-Type': 'application/json' }, credentials: 'include' }
        );
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setTodayRecord(findToday(refreshData.calendar));
          setOnLunch(refreshData.onLunch);
          setOnBreak(refreshData.onBreak);
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function clockIn() {
    const { date, time, hour, minute } = getJST();
    doAction({ action: 'clock-in', entry_type: 'web', local_time: time, date, jst_hour: hour, jst_minute: minute });
  }

  function clockOut() {
    const { date, time } = getJST();
    doAction({ action: 'clock-out', local_time: time, date });
  }

  function lunchOut() {
    const { date, time } = getJST();
    doAction({ action: 'lunch-out', local_time: time, date });
  }

  function lunchIn() {
    const { date, time } = getJST();
    doAction({ action: 'lunch-in', local_time: time, date });
  }

  function breakOut() {
    const { date, time } = getJST();
    doAction({ action: 'break-out', local_time: time, date });
  }

  function breakIn() {
    const { date, time } = getJST();
    doAction({ action: 'break-in', local_time: time, date });
  }

  const notClockedIn = !todayRecord || todayRecord.clockIn === '-';
  const clockedInNotOut = todayRecord && todayRecord.clockIn !== '-' && todayRecord.clockOut === '-';
  const clockedOut = todayRecord && todayRecord.clockIn !== '-' && todayRecord.clockOut !== '-';

  const { date: todayDateStr } = getJST();

  const btnStyle = (color = '#111'): React.CSSProperties => ({
    padding: '0.65rem 1.25rem',
    backgroundColor: color,
    color: '#fff',
    border: 'none',
    borderRadius: 999,
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
    marginRight: '0.5rem',
    marginBottom: '0.5rem',
  });

  const ghostBtnStyle = (): React.CSSProperties => ({
    ...btnStyle(),
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d1d5db',
  });

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '0.25rem',
  };

  return (
    <div>
      <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        {todayDateStr} JST
      </p>

      {message && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem 0.875rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem 0.875rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {notClockedIn && (
        <div>
          <p style={labelStyle}>Attendance</p>
          <button onClick={clockIn} disabled={loading} style={btnStyle()}>Clock In</button>
        </div>
      )}

      {clockedInNotOut && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={labelStyle}>Attendance</p>
            <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#374151', marginBottom: '0.5rem' }}>
              Clocked in at {todayRecord!.clockIn}
            </p>
            <button onClick={clockOut} disabled={loading} style={btnStyle()}>Clock Out</button>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <p style={labelStyle}>Lunch</p>
            {onLunch
              ? <button onClick={lunchIn}  disabled={loading} style={ghostBtnStyle()}>Lunch In</button>
              : <button onClick={lunchOut} disabled={loading} style={ghostBtnStyle()}>Lunch Out</button>
            }
          </div>

          <div>
            <p style={labelStyle}>Break</p>
            {onBreak
              ? <button onClick={breakIn}  disabled={loading} style={ghostBtnStyle()}>Break In</button>
              : <button onClick={breakOut} disabled={loading} style={ghostBtnStyle()}>Break Out</button>
            }
          </div>
        </div>
      )}

      {clockedOut && (
        <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#374151' }}>
          <p style={labelStyle}>Today&apos;s Summary</p>
          <p>Clock In: {todayRecord!.clockIn}</p>
          <p>Clock Out: {todayRecord!.clockOut}</p>
          <p>Total Hours: {todayRecord!.totalHours}</p>
        </div>
      )}

      {!memberData && (
        <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>
          Unable to load today&apos;s data.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/member/tabs/TodayTab.tsx
git commit -m "feat: TodayTab — clock in/out, lunch, break actions"
```

---

## Task 5: OverviewTab — summary stats and leave balance

**Files:**
- Create: `frontend/components/member/tabs/OverviewTab.tsx`

- [ ] **Step 1: Create the tab**

```typescript
import type { CSSProperties } from 'react';
import type { UserProfile, LeaveBalance, MemberData } from '../MemberDashboard';

interface Props {
  user: UserProfile;
  leaveBalance: LeaveBalance | null;
  memberData: MemberData | null;
}

export default function OverviewTab({ user, leaveBalance, memberData }: Props) {
  const s = memberData?.summary;

  const statBox = (label: string, value: number, color: string) => (
    <div key={label} style={{ flex: 1, padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, textAlign: 'center' }}>
      <div style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginTop: '0.25rem' }}>{label}</div>
    </div>
  );

  const labelStyle: CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '0.75rem',
  };

  return (
    <div>
      <div style={{ marginBottom: '0.5rem', fontFamily: 'Georgia, serif', fontSize: '1.1rem', color: '#111' }}>
        {user.name}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', marginBottom: '1.75rem' }}>
        {user.email}
      </div>

      <div style={{ marginBottom: '1.75rem' }}>
        <p style={labelStyle}>This Month</p>
        {s ? (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {statBox('Present', s.present, '#16a34a')}
            {statBox('Late',    s.late,    '#d97706')}
            {statBox('Absent',  s.absent,  '#dc2626')}
            {statBox('Pending', s.pending, '#6b7280')}
          </div>
        ) : (
          <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>No data available.</p>
        )}
      </div>

      <div>
        <p style={labelStyle}>Leave Balance</p>
        {leaveBalance ? (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {statBox('Total',     leaveBalance.total,     '#374151')}
            {statBox('Used',      leaveBalance.used,      '#d97706')}
            {statBox('Remaining', leaveBalance.remaining, '#16a34a')}
          </div>
        ) : (
          <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>No data available.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/member/tabs/OverviewTab.tsx
git commit -m "feat: OverviewTab — monthly summary and leave balance"
```

---

## Task 6: AttendanceTab — monthly calendar with navigation

**Files:**
- Create: `frontend/components/member/tabs/AttendanceTab.tsx`

- [ ] **Step 1: Create the tab**

```typescript
'use client';

import { useState } from 'react';
import type { MemberData, CalendarDay } from '../MemberDashboard';

interface Props {
  email: string;
  initialData: MemberData | null;
  apiUrl: string;
}

const STATUS_COLOR: Record<string, string> = {
  present: '#16a34a',
  late:    '#d97706',
  absent:  '#dc2626',
  pending: '#9ca3af',
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// Convert M/D/YYYY → YYYY-MM-DD for appeal target_id
function toISO(usDate: string): string {
  const [m, d, y] = usDate.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export default function AttendanceTab({ email, initialData, apiUrl }: Props) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const [month, setMonth] = useState(initialData?.month ?? now.getMonth() + 1);
  const [year,  setYear]  = useState(initialData?.year  ?? now.getFullYear());
  const [data,  setData]  = useState<MemberData | null>(initialData);
  const [loading, setLoading] = useState(false);

  const [appealDay,   setAppealDay]   = useState<CalendarDay | null>(null);
  const [appealText,  setAppealText]  = useState('');
  const [appealMsg,   setAppealMsg]   = useState<string | null>(null);
  const [appealErr,   setAppealErr]   = useState<string | null>(null);
  const [appealLoading, setAppealLoading] = useState(false);

  async function navigate(newMonth: number, newYear: number) {
    setLoading(true);
    try {
      const res = await fetch(
        `${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${newMonth}&year=${newYear}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setMonth(newMonth);
        setYear(newYear);
      }
    } finally {
      setLoading(false);
    }
  }

  function prevMonth() {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    navigate(m, y);
  }

  function nextMonth() {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    navigate(m, y);
  }

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!appealDay) return;
    setAppealLoading(true);
    setAppealMsg(null);
    setAppealErr(null);
    try {
      const res = await fetch(`${apiUrl}/appeals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target_type: 'attendance', target_id: toISO(appealDay.date), reason: appealText }),
      });
      const d = await res.json();
      if (!res.ok) {
        setAppealErr(d.error ?? 'Appeal failed.');
      } else {
        setAppealMsg('Appeal submitted.');
        setAppealDay(null);
        setAppealText('');
      }
    } catch {
      setAppealErr('Network error. Please try again.');
    } finally {
      setAppealLoading(false);
    }
  }

  // Build grid: Mon=0 ... Sun=6 offset
  const firstDow = new Date(year, month - 1, 1).getDay();
  const offset   = firstDow === 0 ? 6 : firstDow - 1;
  const calendar = data?.calendar ?? [];
  const cells: (CalendarDay | null)[] = [...Array(offset).fill(null), ...calendar];

  const s = data?.summary;

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
  };

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <button onClick={prevMonth} disabled={loading} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>←</button>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', color: '#111' }}>
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button onClick={nextMonth} disabled={loading} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>→</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', padding: '0.25rem 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', padding: '2rem 0' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((cell, i) => {
            if (!cell) return <div key={`pad-${i}`} />;
            const color = cell.isWeekend ? '#e5e7eb' : (STATUS_COLOR[cell.status] ?? '#e5e7eb');
            const canAppeal = !cell.isWeekend && (cell.status === 'absent' || cell.status === 'late' || cell.status === 'pending');
            return (
              <div
                key={cell.day}
                title={cell.isWeekend ? 'Weekend' : `${cell.status} — in: ${cell.clockIn} out: ${cell.clockOut}`}
                style={{ padding: '0.4rem 0.2rem', textAlign: 'center', borderRadius: 6, cursor: canAppeal ? 'pointer' : 'default', backgroundColor: appealDay?.day === cell.day ? '#f0fdf4' : 'transparent', border: appealDay?.day === cell.day ? '1px solid #bbf7d0' : '1px solid transparent' }}
                onClick={() => { if (canAppeal) { setAppealDay(cell); setAppealMsg(null); setAppealErr(null); } }}
              >
                <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#374151' }}>{cell.day}</div>
                {!cell.isWeekend && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, margin: '2px auto 0' }} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary strip */}
      {s && (
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280', flexWrap: 'wrap' }}>
          <span style={{ color: '#16a34a' }}>● Present: {s.present}</span>
          <span style={{ color: '#d97706' }}>● Late: {s.late}</span>
          <span style={{ color: '#dc2626' }}>● Absent: {s.absent}</span>
          <span>● Pending: {s.pending}</span>
        </div>
      )}

      {/* Appeal form */}
      {appealDay && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <p style={labelStyle}>Appeal — {appealDay.date}</p>
          {appealMsg && <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a', margin: '0.5rem 0' }}>{appealMsg}</p>}
          {appealErr && <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626', margin: '0.5rem 0' }}>{appealErr}</p>}
          <form onSubmit={submitAppeal}>
            <textarea
              value={appealText}
              onChange={e => setAppealText(e.target.value)}
              required
              placeholder="Explain why this record should be reviewed…"
              rows={3}
              style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', boxSizing: 'border-box', resize: 'vertical' }}
            />
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={appealLoading} style={{ padding: '0.5rem 1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: appealLoading ? 'not-allowed' : 'pointer' }}>
                {appealLoading ? 'Submitting…' : 'Submit Appeal'}
              </button>
              <button type="button" onClick={() => setAppealDay(null)} style={{ padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/member/tabs/AttendanceTab.tsx
git commit -m "feat: AttendanceTab — monthly calendar with appeal form"
```

---

## Task 7: LeaveTab — balance, history, request form

**Files:**
- Create: `frontend/components/member/tabs/LeaveTab.tsx`

- [ ] **Step 1: Create the tab**

```typescript
'use client';

import { useState } from 'react';
import type { LeaveBalance, LeaveRecord } from '../MemberDashboard';

interface Props {
  email: string;
  leaveBalance: LeaveBalance | null;
  initialLeaveHistory: LeaveRecord[];
  apiUrl: string;
}

const STATUS_COLOR: Record<string, string> = {
  Approved: '#16a34a',
  Pending:  '#d97706',
  Rejected: '#dc2626',
};

const LEAVE_TYPES = ['Vacation', 'Sick', 'Emergency', 'Other'];

export default function LeaveTab({ email, leaveBalance, initialLeaveHistory, apiUrl }: Props) {
  const [showForm, setShowForm]     = useState(false);
  const [date, setDate]             = useState('');
  const [leaveType, setLeaveType]   = useState(LEAVE_TYPES[0]);
  const [reason, setReason]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [message, setMessage]       = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [history, setHistory]       = useState<LeaveRecord[]>(initialLeaveHistory);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'leave', date, leave_type: leaveType, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Request failed.');
      } else {
        setMessage(data.message ?? 'Leave request submitted.');
        setDate('');
        setReason('');
        setShowForm(false);
        // Refresh leave history
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        const refreshRes = await fetch(
          `${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${now.getMonth()+1}&year=${now.getFullYear()}`,
          { credentials: 'include' }
        );
        if (refreshRes.ok) {
          const d = await refreshRes.json();
          setHistory(d.leaveHistory);
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '0.75rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.55rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#111',
    boxSizing: 'border-box',
  };

  return (
    <div>
      {/* Leave balance */}
      {leaveBalance && (
        <div style={{ marginBottom: '1.75rem' }}>
          <p style={labelStyle}>Leave Balance</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Total',     val: leaveBalance.total,     color: '#374151' },
              { label: 'Used',      val: leaveBalance.used,      color: '#d97706' },
              { label: 'Remaining', val: leaveBalance.remaining, color: '#16a34a' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, minWidth: 80, padding: '0.75rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 700, color }}>{val}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginTop: '0.2rem' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request form toggle */}
      {message && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>
          {message}
        </div>
      )}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{ marginBottom: '1.5rem', padding: '0.55rem 1.1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}
        >
          Request Leave
        </button>
      )}

      {/* Request form */}
      {showForm && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <p style={labelStyle}>New Leave Request</p>
          {error && <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.75rem' }}>{error}</p>}
          <form onSubmit={submitLeave}>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, marginBottom: '0.3rem' }}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inputStyle} />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, marginBottom: '0.3rem' }}>Leave Type</label>
              <select value={leaveType} onChange={e => setLeaveType(e.target.value)} style={inputStyle}>
                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, marginBottom: '0.3rem' }}>Reason</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={loading} style={{ padding: '0.5rem 1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Submitting…' : 'Submit'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Leave history */}
      <div>
        <p style={labelStyle}>Leave History</p>
        {history.length === 0 ? (
          <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>No records.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {history.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.875rem', border: '1px solid #e5e7eb', borderRadius: 8, flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#111' }}>{r.date}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.75rem' }}>{r.leaveType}</span>
                  {r.reason && <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#9ca3af', marginLeft: '0.5rem' }}>— {r.reason}</span>}
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: STATUS_COLOR[r.status] ?? '#6b7280' }}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/member/tabs/LeaveTab.tsx
git commit -m "feat: LeaveTab — balance, history, and leave request form"
```

---

## Task 8: DisciplineTab — warnings and appeal

**Files:**
- Create: `frontend/components/member/tabs/DisciplineTab.tsx`

- [ ] **Step 1: Create the tab**

```typescript
'use client';

import { useState, useEffect } from 'react';

interface DisciplineRecord {
  id: string;
  reason: string;
  issued_by: string;
  issued_at: string;
  voided: boolean;
  void_reason: string | null;
}

interface Props {
  email: string;
  apiUrl: string;
}

export default function DisciplineTab({ email, apiUrl }: Props) {
  const [records, setRecords]       = useState<DisciplineRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error,   setError]         = useState<string | null>(null);
  const [appealId, setAppealId]     = useState<string | null>(null);
  const [appealText, setAppealText] = useState('');
  const [appealMsg,  setAppealMsg]  = useState<Record<string, string>>({});
  const [appealErr,  setAppealErr]  = useState<string | null>(null);
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealed, setAppealed]     = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${apiUrl}/discipline?email=${encodeURIComponent(email)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setRecords(d.records ?? []); setLoading(false); })
      .catch(() => { setError('Failed to load records.'); setLoading(false); });
  }, [apiUrl, email]);

  async function submitAppeal(e: React.FormEvent, recordId: string) {
    e.preventDefault();
    setAppealLoading(true);
    setAppealErr(null);
    try {
      const res = await fetch(`${apiUrl}/appeals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target_type: 'discipline', target_id: recordId, reason: appealText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAppealErr(data.error ?? 'Appeal failed.');
      } else {
        setAppealMsg(prev => ({ ...prev, [recordId]: 'Appeal submitted.' }));
        setAppealed(prev => new Set(prev).add(recordId));
        setAppealId(null);
        setAppealText('');
      }
    } catch {
      setAppealErr('Network error. Please try again.');
    } finally {
      setAppealLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '0.75rem',
  };

  if (loading) return <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>Loading…</p>;
  if (error)   return <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626' }}>{error}</p>;

  return (
    <div>
      <p style={labelStyle}>Discipline Records</p>
      {records.length === 0 ? (
        <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>No records.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {records.map(r => (
            <div key={r.id} style={{ padding: '0.875rem', border: '1px solid #e5e7eb', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#111', flex: 1 }}>{r.reason}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: r.voided ? '#9ca3af' : '#dc2626', whiteSpace: 'nowrap' }}>
                  {r.voided ? 'Voided' : 'Active'}
                </span>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                Issued by {r.issued_by} on {new Date(r.issued_at).toLocaleDateString()}
              </div>
              {r.voided && r.void_reason && (
                <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Void reason: {r.void_reason}
                </div>
              )}
              {appealMsg[r.id] && (
                <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#16a34a', marginBottom: '0.5rem' }}>{appealMsg[r.id]}</p>
              )}
              {!r.voided && !appealed.has(r.id) && appealId !== r.id && (
                <button onClick={() => { setAppealId(r.id); setAppealErr(null); }} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
                  Appeal
                </button>
              )}
              {appealId === r.id && (
                <form onSubmit={e => submitAppeal(e, r.id)} style={{ marginTop: '0.5rem' }}>
                  {appealErr && <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#dc2626', marginBottom: '0.4rem' }}>{appealErr}</p>}
                  <textarea
                    value={appealText}
                    onChange={e => setAppealText(e.target.value)}
                    required
                    placeholder="Explain your appeal…"
                    rows={2}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.75rem', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                  <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" disabled={appealLoading} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', cursor: appealLoading ? 'not-allowed' : 'pointer' }}>
                      {appealLoading ? 'Submitting…' : 'Submit'}
                    </button>
                    <button type="button" onClick={() => setAppealId(null)} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/member/tabs/DisciplineTab.tsx
git commit -m "feat: DisciplineTab — warnings list with inline appeal form"
```

---

## Task 9: AppealsTab — full appeals list and new appeal form

**Files:**
- Create: `frontend/components/member/tabs/AppealsTab.tsx`

- [ ] **Step 1: Create the tab**

```typescript
'use client';

import { useState, useEffect } from 'react';

interface Appeal {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  resolution_note: string | null;
  created_at: string;
}

interface Props {
  apiUrl: string;
}

const STATUS_COLOR: Record<string, string> = {
  Pending:  '#d97706',
  Approved: '#16a34a',
  Rejected: '#dc2626',
};

const APPEAL_TYPES = ['attendance', 'leave', 'discipline'];

export default function AppealsTab({ apiUrl }: Props) {
  const [appeals,  setAppeals]  = useState<Appeal[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  const [showForm,    setShowForm]    = useState(false);
  const [formType,    setFormType]    = useState(APPEAL_TYPES[0]);
  const [formTarget,  setFormTarget]  = useState('');
  const [formReason,  setFormReason]  = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formMsg,     setFormMsg]     = useState<string | null>(null);
  const [formErr,     setFormErr]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/appeals`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setAppeals(d.appeals ?? []); setLoading(false); })
      .catch(() => { setFetchErr('Failed to load appeals.'); setLoading(false); });
  }, [apiUrl]);

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormMsg(null);
    setFormErr(null);
    try {
      const res = await fetch(`${apiUrl}/appeals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target_type: formType, target_id: formTarget, reason: formReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormErr(data.error ?? 'Appeal failed.');
      } else {
        setFormMsg('Appeal submitted.');
        setFormTarget('');
        setFormReason('');
        setShowForm(false);
        // Refresh list
        const refreshRes = await fetch(`${apiUrl}/appeals`, { credentials: 'include' });
        if (refreshRes.ok) {
          const d = await refreshRes.json();
          setAppeals(d.appeals ?? []);
        }
      }
    } catch {
      setFormErr('Network error. Please try again.');
    } finally {
      setFormLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '0.75rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.55rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#111',
    boxSizing: 'border-box',
  };

  if (loading) return <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>Loading…</p>;
  if (fetchErr) return <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626' }}>{fetchErr}</p>;

  return (
    <div>
      {formMsg && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>
          {formMsg}
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{ marginBottom: '1.5rem', padding: '0.55rem 1.1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}
        >
          New Appeal
        </button>
      )}

      {showForm && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <p style={labelStyle}>New Appeal</p>
          {formErr && <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.75rem' }}>{formErr}</p>}
          <form onSubmit={submitAppeal}>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, marginBottom: '0.3rem' }}>Type</label>
              <select value={formType} onChange={e => setFormType(e.target.value)} style={inputStyle}>
                {APPEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, marginBottom: '0.3rem' }}>
                {formType === 'attendance' ? 'Date (YYYY-MM-DD)' : 'Record ID (UUID)'}
              </label>
              <input
                type={formType === 'attendance' ? 'date' : 'text'}
                value={formTarget}
                onChange={e => setFormTarget(e.target.value)}
                required
                placeholder={formType === 'attendance' ? 'YYYY-MM-DD' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, marginBottom: '0.3rem' }}>Reason</label>
              <textarea value={formReason} onChange={e => setFormReason(e.target.value)} required rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={formLoading} style={{ padding: '0.5rem 1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: formLoading ? 'not-allowed' : 'pointer' }}>
                {formLoading ? 'Submitting…' : 'Submit'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <p style={labelStyle}>My Appeals</p>
      {appeals.length === 0 ? (
        <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>No appeals submitted.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {appeals.map(a => (
            <div key={a.id} style={{ padding: '0.875rem', border: '1px solid #e5e7eb', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#374151' }}>
                  {a.target_type} — {a.target_id}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: STATUS_COLOR[a.status] ?? '#6b7280' }}>
                  {a.status}
                </span>
              </div>
              <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#374151', margin: '0 0 0.3rem' }}>{a.reason}</p>
              {a.resolution_note && (
                <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                  Resolution: {a.resolution_note}
                </p>
              )}
              <p style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.3rem' }}>
                {new Date(a.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/member/tabs/AppealsTab.tsx
git commit -m "feat: AppealsTab — appeals list with new appeal form"
```

---

## Task 10: SettingsTab — change password and link Google

**Files:**
- Create: `frontend/components/member/tabs/SettingsTab.tsx`

- [ ] **Step 1: Create the tab**

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';
import type { UserProfile } from '../MemberDashboard';

interface Props {
  user: UserProfile;
  apiUrl: string;
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function SettingsTab({ user, apiUrl }: Props) {
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [pwLoading,  setPwLoading]  = useState(false);
  const [pwMsg,      setPwMsg]      = useState<string | null>(null);
  const [pwErr,      setPwErr]      = useState<string | null>(null);

  const [googleMsg,  setGoogleMsg]  = useState<string | null>(null);
  const [googleErr,  setGoogleErr]  = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [hasGoogle, setHasGoogle]   = useState(user.hasGoogle);

  const gsiLoaded = useRef(false);

  useEffect(() => {
    if (gsiLoaded.current) return;
    gsiLoaded.current = true;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwErr('Passwords do not match.'); return; }
    setPwLoading(true);
    setPwMsg(null);
    setPwErr(null);
    try {
      const body: Record<string, string> = { new_password: newPw };
      if (user.hasPassword) body.current_password = currentPw;
      const res = await fetch(`${apiUrl}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwErr(data.error ?? 'Password change failed.');
      } else {
        setPwMsg('Password updated successfully.');
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      }
    } catch {
      setPwErr('Network error. Please try again.');
    } finally {
      setPwLoading(false);
    }
  }

  function linkGoogle() {
    if (!GOOGLE_CLIENT_ID) { setGoogleErr('Google sign-in is not configured.'); return; }
    if (!window.google)    { setGoogleErr('Google not ready. Please try again.'); return; }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        setGoogleLoading(true);
        setGoogleErr(null);
        try {
          const res = await fetch(`${apiUrl}/auth/link-google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ credential }),
          });
          const data = await res.json();
          if (!res.ok) {
            setGoogleErr(data.error ?? 'Failed to link Google account.');
          } else {
            setGoogleMsg('Google account linked.');
            setHasGoogle(true);
          }
        } catch {
          setGoogleErr('Network error. Please try again.');
        } finally {
          setGoogleLoading(false);
        }
      },
    });
    window.google.accounts.id.prompt();
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '0.75rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.55rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#111',
    boxSizing: 'border-box',
    marginBottom: '0.75rem',
  };

  return (
    <div>
      {/* Change password */}
      <div style={{ marginBottom: '2rem' }}>
        <p style={labelStyle}>Change Password</p>
        {pwMsg && <div style={{ marginBottom: '0.75rem', padding: '0.65rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>{pwMsg}</div>}
        {pwErr && <div style={{ marginBottom: '0.75rem', padding: '0.65rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626' }}>{pwErr}</div>}
        <form onSubmit={changePassword}>
          {user.hasPassword && (
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required placeholder="Current password" style={inputStyle} />
          )}
          <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required placeholder="New password (8–128 chars)" style={inputStyle} />
          <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required placeholder="Confirm new password" style={{ ...inputStyle, marginBottom: 0 }} />
          <button type="submit" disabled={pwLoading} style={{ marginTop: '0.75rem', padding: '0.55rem 1.1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: pwLoading ? 'not-allowed' : 'pointer', opacity: pwLoading ? 0.6 : 1 }}>
            {pwLoading ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Link Google */}
      <div>
        <p style={labelStyle}>Google Account</p>
        {googleMsg && <div style={{ marginBottom: '0.75rem', padding: '0.65rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>{googleMsg}</div>}
        {googleErr && <div style={{ marginBottom: '0.75rem', padding: '0.65rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626' }}>{googleErr}</div>}
        {hasGoogle ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.875rem', border: '1px solid #bbf7d0', borderRadius: 999, backgroundColor: '#f0fdf4', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>
            ✓ Google account linked
          </div>
        ) : (
          <button onClick={linkGoogle} disabled={googleLoading} style={{ padding: '0.55rem 1.1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, cursor: googleLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: googleLoading ? 0.6 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Link Google Account
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run final type check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep "member/"
```

Expected: no errors under `member/`.

- [ ] **Step 3: Run backend tests to confirm nothing broken**

```bash
cd /home/erwindev/Attendance && npm test -- --silent 2>&1 | tail -6
```

Expected: `14 passed, 264 total`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/member/tabs/SettingsTab.tsx
git commit -m "feat: SettingsTab — change password and link Google"
```

---

## Final verification

- [ ] Start servers: `node server.js` (port 3000) + `cd frontend && npm run dev` (port 3001)
- [ ] Log in as a member → redirected to `/member`, Today tab shows correct button state
- [ ] Clock In → success banner, buttons change to Clock Out / Lunch / Break
- [ ] Switch to Overview → summary counts and leave balance visible
- [ ] Switch to Attendance → calendar renders with colour dots, month nav works
- [ ] Switch to Leave → history table shown, Request Leave form submits
- [ ] Switch to Discipline → records listed, Appeal form opens inline
- [ ] Switch to Appeals → list shown, New Appeal form works
- [ ] Switch to Settings → Change Password form and Google section visible
- [ ] Visit `/member` without cookie → redirected to Express login
