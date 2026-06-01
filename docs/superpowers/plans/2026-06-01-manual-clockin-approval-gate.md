# Manual Clock-In Approval Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block the member timer from starting on manual clock-in until an admin approves it; show the member an "awaiting approval" state and a "rejected" state with an inline appeal form.

**Architecture:** Add `'Rejected'` handling to `calendarDayStatus` in rules, expose `entryType` + `dateISO` per calendar day from `memberData.js`, update the `CalendarDay` TypeScript type, then gate the member `HomePage` timer and UI on those new fields using two new derived states: `pendingApproval` and `rejected`.

**Tech Stack:** Node.js/Express, Supabase JS v2, Jest + supertest (backend tests), Next.js/React with inline styles (frontend)

---

## File Map

| File | Change |
|------|--------|
| `lib/rules.js` | Add `'Rejected'` case to `calendarDayStatus` |
| `routes/memberData.js` | Add `entryType` + `dateISO` to each calendar day object |
| `tests/rules.test.js` | Add test for `status='Rejected'` → `'rejected'` |
| `frontend/components/member/MemberDashboard.tsx` | Add `entryType?` + `dateISO?` to `CalendarDay` interface |
| `frontend/components/member/pages/HomePage.tsx` | New `pendingApproval` + `rejected` states, updated `working` condition, new UI sections, inline appeal form |

---

## Task 1: Fix `calendarDayStatus` for Rejected records

**Files:**
- Modify: `lib/rules.js:28-35`
- Modify: `tests/rules.test.js:35-54`

- [ ] **Step 1: Add the failing test**

Open `tests/rules.test.js` and add this test inside the `calendarDayStatus` describe block (after the existing `status=Pending` test):

```js
test('status=Rejected → rejected', () =>
  expect(calendarDayStatus({ status: 'Rejected', clock_out: null, late_status: '' }, false)).toBe('rejected'));
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/erwindev/Attendance && npm test -- --testPathPattern=rules --verbose
```

Expected: FAIL — `"present"` received instead of `"rejected"`.

- [ ] **Step 3: Add the Rejected case to `calendarDayStatus`**

In `lib/rules.js`, the `calendarDayStatus` function currently reads:

```js
function calendarDayStatus(record, isWeekend) {
  if (isWeekend) return 'weekend';
  if (!record) return 'absent';
  if (record.status === 'Pending') return 'pending';
  if (record.status === 'leave') return 'leave';
  const isLate = record.late_status && record.late_status !== '' && record.late_status !== 'ON TIME';
  return isLate ? 'late' : 'present';
}
```

Add the `Rejected` check immediately after the `Pending` check:

```js
function calendarDayStatus(record, isWeekend) {
  if (isWeekend) return 'weekend';
  if (!record) return 'absent';
  if (record.status === 'Pending') return 'pending';
  if (record.status === 'Rejected') return 'rejected';
  if (record.status === 'leave') return 'leave';
  const isLate = record.late_status && record.late_status !== '' && record.late_status !== 'ON TIME';
  return isLate ? 'late' : 'present';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/erwindev/Attendance && npm test -- --testPathPattern=rules --verbose
```

Expected: All `calendarDayStatus` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rules.js tests/rules.test.js
git commit -m "fix: calendarDayStatus returns 'rejected' for Rejected attendance records"
```

---

## Task 2: Expose `entryType` and `dateISO` in `memberData.js`

**Files:**
- Modify: `routes/memberData.js:69-79`

No new test file needed — this is a data shape change on an existing GET endpoint. The existing memberData route has no dedicated test file (it's tested via integration). We verify the shape manually in Task 5.

- [ ] **Step 1: Add `entryType` and `dateISO` to the calendar loop**

In `routes/memberData.js`, find the `calendar.push({...})` call (around line 69). It currently ends with:

```js
    calendar.push({
      day,
      date: dateStr,
      status,
      clockIn: record?.clock_in || '-',
      clockOut: record?.clock_out || '-',
      totalHours: record?.clock_out ? record.total_hours : '-',
      lastClockIn: record?.last_clock_in || record?.clock_in || '-',
      accumulatedHours: record?.accumulated_hours || 0,
      isWeekend,
    });
```

Add `entryType` and `dateISO` to produce:

```js
    const isoDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendar.push({
      day,
      date: dateStr,
      status,
      clockIn: record?.clock_in || '-',
      clockOut: record?.clock_out || '-',
      totalHours: record?.clock_out ? record.total_hours : '-',
      lastClockIn: record?.last_clock_in || record?.clock_in || '-',
      accumulatedHours: record?.accumulated_hours || 0,
      entryType: record?.entry_type || 'auto',
      dateISO: isoDate,
      isWeekend,
    });
```

- [ ] **Step 2: Run the full test suite to confirm no regressions**

```bash
cd /home/erwindev/Attendance && npm test
```

Expected: All tests PASS (same count as before).

- [ ] **Step 3: Commit**

```bash
git add routes/memberData.js
git commit -m "feat: expose entryType and dateISO per calendar day in memberData"
```

---

## Task 3: Update `CalendarDay` TypeScript interface

**Files:**
- Modify: `frontend/components/member/MemberDashboard.tsx:30-40`

- [ ] **Step 1: Add the two new optional fields to `CalendarDay`**

Open `frontend/components/member/MemberDashboard.tsx`. The `CalendarDay` interface currently reads:

```ts
export interface CalendarDay {
  day: number;
  date: string; // M/D/YYYY
  status: string;
  clockIn: string;
  clockOut: string;
  totalHours: string | number;
  isWeekend: boolean;
  lastClockIn: string;
  accumulatedHours: number;
}
```

Add `entryType` and `dateISO` as optional fields:

```ts
export interface CalendarDay {
  day: number;
  date: string; // M/D/YYYY
  status: string;
  clockIn: string;
  clockOut: string;
  totalHours: string | number;
  isWeekend: boolean;
  lastClockIn: string;
  accumulatedHours: number;
  entryType?: string;   // 'manual' | 'auto'
  dateISO?: string;     // YYYY-MM-DD, used for attendance appeal submission
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/member/MemberDashboard.tsx
git commit -m "feat: add entryType and dateISO to CalendarDay interface"
```

---

## Task 4: Gate the timer and add pending/rejected UI in `HomePage.tsx`

**Files:**
- Modify: `frontend/components/member/pages/HomePage.tsx`

This is the main frontend task. It has four parts: state derivation, pending UI, rejected UI with appeal form, and weekly strip colors.

### Part A — State derivation and timer guard

- [ ] **Step 1: Add `pendingApproval` and `rejected` derived states**

In `HomePage.tsx`, find the three existing derived booleans (around line 109):

```ts
  const notIn   = !today || today.clockIn === '-';
  const working = !!today && today.clockIn !== '-' && today.clockOut === '-';
  const done    = !!today && today.clockIn !== '-' && today.clockOut !== '-';
```

Replace them with:

```ts
  const pendingApproval = !!today && today.status === 'pending' && today.entryType === 'manual';
  const rejected        = !!today && today.status === 'rejected';
  const notIn           = !today || today.clockIn === '-';
  const working         = !!today && today.clockIn !== '-' && today.clockOut === '-' && !pendingApproval;
  const done            = !!today && today.clockIn !== '-' && today.clockOut !== '-';
```

- [ ] **Step 2: Add appeal state variables**

In `HomePage.tsx`, find the leave form state variables section (around line 101–107):

```ts
  // Leave form
  const [leaveDate,   setLeaveDate]   = useState('');
  ...
```

Add appeal state variables just before the leave form block:

```ts
  // Appeal form (for rejected manual clock-in)
  const [appealReason,    setAppealReason]    = useState('');
  const [appealLoading,   setAppealLoading]   = useState(false);
  const [appealMsg,       setAppealMsg]       = useState<string | null>(null);
  const [appealErr,       setAppealErr]       = useState<string | null>(null);
  const [appealSubmitted, setAppealSubmitted] = useState(false);
```

- [ ] **Step 3: Add `submitAppeal` function**

In `HomePage.tsx`, add this function after the existing `submitLeave` function (around line 195):

```ts
  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!today?.dateISO) return;
    setAppealLoading(true); setAppealMsg(null); setAppealErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/webhook/appeals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: 'attendance', target_id: today.dateISO, reason: appealReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAppealErr(res.status === 409 ? 'Appeal already submitted.' : (data.error ?? 'Request failed.'));
      } else {
        setAppealMsg('Appeal submitted — admin will review.');
        setAppealSubmitted(true);
        setAppealReason('');
      }
    } catch { setAppealErr('Network error.'); }
    finally  { setAppealLoading(false); }
  }
```

### Part B — Pending approval UI

- [ ] **Step 4: Add pending approval status badge and headline**

In `HomePage.tsx`, inside the "Hero status card" section find the status badge `<div>` (around line 239) that renders `notIn`, `working`, `done`, `onLunch`, `onBreak` badges:

```tsx
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {notIn   && <StatusBadge bg={C.surface2} color={C.text3} dot={C.text3}>Not clocked in</StatusBadge>}
            {working && <StatusBadge bg={C.greenSoft} color={C.green} dot={C.green} pulse>Working</StatusBadge>}
            {done    && <StatusBadge bg={C.blueSoft}  color={C.blue}  dot={C.blue}>Done for today</StatusBadge>}
            {onLunch && working && <StatusBadge bg={C.accentSoft} color={C.accent} dot={C.accent}>On lunch</StatusBadge>}
            {onBreak && working && <StatusBadge bg={C.purpleSoft} color={C.purple} dot={C.purple}>On break</StatusBadge>}
          </div>
```

Replace with (adds `pendingApproval` and `rejected` badges):

```tsx
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {notIn            && <StatusBadge bg={C.surface2}   color={C.text3}   dot={C.text3}>Not clocked in</StatusBadge>}
            {pendingApproval  && <StatusBadge bg={C.accentSoft} color={C.accent}  dot={C.accent} pulse>Awaiting approval</StatusBadge>}
            {rejected         && <StatusBadge bg={C.redSoft}    color={C.red}     dot={C.red}>Rejected</StatusBadge>}
            {working          && <StatusBadge bg={C.greenSoft}  color={C.green}   dot={C.green} pulse>Working</StatusBadge>}
            {done             && <StatusBadge bg={C.blueSoft}   color={C.blue}    dot={C.blue}>Done for today</StatusBadge>}
            {onLunch && working && <StatusBadge bg={C.accentSoft} color={C.accent} dot={C.accent}>On lunch</StatusBadge>}
            {onBreak && working && <StatusBadge bg={C.purpleSoft} color={C.purple} dot={C.purple}>On break</StatusBadge>}
          </div>
```

- [ ] **Step 5: Add pending approval and rejected to the serif headline**

Find the serif status headline `<div>` (around line 248):

```tsx
          <div style={{ fontFamily: F_SERIF, fontSize: 36, ... }}>
            {notIn   && 'Ready to start your day.'}
            {working && (...)}
            {done    && (...)}
          </div>
```

Add the two new cases:

```tsx
          <div style={{ fontFamily: F_SERIF, fontSize: 36, lineHeight: 1.05, letterSpacing: '-0.02em', color: C.text, marginBottom: 6 }}>
            {notIn           && 'Ready to start your day.'}
            {pendingApproval && <><span style={{ fontStyle: 'normal' }}>Clock-in </span><span style={{ fontStyle: 'italic' }}>pending approval.</span></>}
            {rejected        && <><span style={{ fontStyle: 'normal' }}>Manual clock-in </span><span style={{ fontStyle: 'italic' }}>was rejected.</span></>}
            {working && (
              today!.accumulatedHours > 0
                ? <><span style={{ fontStyle: 'normal' }}>Resumed at </span><span style={{ fontStyle: 'italic' }}>{today!.lastClockIn}.</span></>
                : <><span style={{ fontStyle: 'normal' }}>Working since </span><span style={{ fontStyle: 'italic' }}>{today!.clockIn}.</span></>
            )}
            {done    && <><span style={{ fontStyle: 'normal' }}>Done at </span><span style={{ fontStyle: 'italic' }}>{today!.clockOut}.</span></>}
          </div>
```

- [ ] **Step 6: Add pending approval subtext block**

After the serif headline `<div>` and before the live timer block (around line 259), add the pending subtext and a spacer for the rejected subtext:

```tsx
          {/* Pending approval subtext */}
          {pendingApproval && today && (
            <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.accent, letterSpacing: '0.04em', marginBottom: 22 }}>
              Submitted at {today.clockIn} — waiting for admin review
            </div>
          )}

          {/* Rejected subtext */}
          {rejected && today && (
            <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.red, letterSpacing: '0.04em', marginBottom: 22 }}>
              Submitted at {today.clockIn} — this entry was not approved
            </div>
          )}
```

### Part C — Rejected: inline appeal form

- [ ] **Step 7: Add the appeal form in the action buttons section**

Find the "Action buttons" `<div>` (around line 324):

```tsx
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {notIn && (
              <ActionBtn onClick={clockIn} disabled={loading} primary>Clock in</ActionBtn>
            )}
            ...
          </div>
```

Add the appeal form block as a new sibling `{rejected && ...}` block inside the same action div, after the existing `{notIn && ...}` block:

```tsx
            {rejected && today && (
              <div style={{ width: '100%' }}>
                {appealMsg && (
                  <div style={{ marginBottom: 10, padding: '8px 12px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 8, fontSize: 12.5, color: C.green }}>
                    {appealMsg}
                  </div>
                )}
                {appealErr && (
                  <div style={{ marginBottom: 10, padding: '8px 12px', background: C.redSoft, border: `1px solid ${C.redBorder}`, borderRadius: 8, fontSize: 12.5, color: C.red }}>
                    {appealErr}
                  </div>
                )}
                {!appealSubmitted && (
                  <form onSubmit={submitAppeal}>
                    <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>
                      Appeal reason
                    </label>
                    <textarea
                      value={appealReason}
                      onChange={e => setAppealReason(e.target.value)}
                      required
                      rows={2}
                      placeholder="Explain why this clock-in should be reconsidered…"
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box' as const, fontFamily: F_SANS, resize: 'vertical' as const, marginBottom: 8 }}
                    />
                    <button
                      type="submit"
                      disabled={appealLoading}
                      style={{ padding: '10px 20px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 9, fontSize: 13, fontFamily: F_SANS, fontWeight: 500, cursor: appealLoading ? 'not-allowed' : 'pointer', opacity: appealLoading ? 0.6 : 1 }}
                    >
                      {appealLoading ? 'Submitting…' : 'Submit appeal'}
                    </button>
                  </form>
                )}
              </div>
            )}
```

### Part D — Weekly strip colors

- [ ] **Step 8: Add `pending` and `rejected` to `STATUS_COLOR`**

Find `STATUS_COLOR` near the top of `HomePage.tsx` (around line 30):

```ts
const STATUS_COLOR: Record<string, string> = {
  present: '#16a34a',
  late:    '#b45309',
  absent:  '#dc2626',
  leave:   '#7c3aed',
};
```

Add the two new statuses:

```ts
const STATUS_COLOR: Record<string, string> = {
  present:  '#16a34a',
  late:     '#b45309',
  absent:   '#dc2626',
  leave:    '#7c3aed',
  pending:  '#b45309',
  rejected: '#dc2626',
};
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/components/member/pages/HomePage.tsx
git commit -m "feat: add pending-approval and rejected states to member clock-in UI"
```

---

## Task 5: End-to-end smoke test

- [ ] **Step 1: Run the full backend test suite**

```bash
cd /home/erwindev/Attendance && npm test
```

Expected: All tests pass, same or higher count as before this feature.

- [ ] **Step 2: Start both servers and verify the flow manually**

Terminal 1:
```bash
cd /home/erwindev/Attendance && node server.js
```

Terminal 2:
```bash
cd /home/erwindev/Attendance/frontend && npm run dev
```

Navigate to `http://localhost:3001/member`.

**Verify pending state:**
- Switch toggle to Manual, enter a reason, click Clock in
- Page should show amber "Awaiting approval" badge and "Clock-in pending approval." headline — no timer
- Submitted time shown in mono subtext

**Verify approval unblocks timer:**
- In admin at `http://localhost:3001/admin`, go to Approvals, find the entry, click Approve
- Return to member page and refresh — timer should now be running from the original submitted time

**Verify rejected state:**
- Submit another manual clock-in, then reject it in admin
- Member page should show red "Rejected" badge and appeal form
- Submit an appeal — "Appeal submitted — admin will review." message should appear and form should disappear

- [ ] **Step 3: Push to origin**

```bash
git push origin main
```

Expected: Vercel and Render auto-deploy.
