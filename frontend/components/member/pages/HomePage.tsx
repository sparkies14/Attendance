'use client';

import { useState, useEffect } from 'react';
import type { UserProfile, MemberData, LeaveBalance, CalendarDay } from '../MemberDashboard';

interface Props {
  user: UserProfile;
  memberData: MemberData | null;
  leaveBalance: LeaveBalance | null;
  apiUrl: string;
}

function getJST() {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return {
    date: `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2,'0')}-${String(jst.getDate()).padStart(2,'0')}`,
    time: `${String(jst.getHours()).padStart(2,'0')}:${String(jst.getMinutes()).padStart(2,'0')}`,
    hour: jst.getHours(), minute: jst.getMinutes(), second: jst.getSeconds(), raw: jst,
  };
}

function findToday(calendar: CalendarDay[]): CalendarDay | null {
  const { date } = getJST();
  const d = parseInt(date.split('-')[2]);
  return calendar.find(c => c.day === d && !c.isWeekend) ?? null;
}

function timeMins(t: string): number {
  if (!t || t === '-') return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fmtSecs(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// Get Mon–Sun dates for current week as M/D/YYYY (matching CalendarDay.date)
function weekDates(jstDate: string) {
  const [y, mo, d] = jstDate.split('-').map(Number);
  const date = new Date(y, mo - 1, d);
  const dow = date.getDay();
  const mon = new Date(date);
  mon.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1));
  const LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(mon);
    dd.setDate(mon.getDate() + i);
    return { label: LABELS[i], dateStr: `${dd.getMonth()+1}/${dd.getDate()}/${dd.getFullYear()}`, isWeekend: i >= 5 };
  });
}

const LEAVE_TYPES = ['Vacation', 'Sick', 'Personal', 'Other'];

const STATUS_BAR: Record<string, string> = {
  present: '#22c55e',
  late:    '#f59e0b',
  absent:  '#ef4444',
  leave:   '#8b5cf6',
};

export default function HomePage({ user, memberData, leaveBalance, apiUrl }: Props) {
  const [loading, setLoading]       = useState(false);
  const [msg, setMsg]               = useState<string | null>(null);
  const [err, setErr]               = useState<string | null>(null);
  const [onLunch, setOnLunch]       = useState(memberData?.onLunch ?? false);
  const [onBreak, setOnBreak]       = useState(memberData?.onBreak ?? false);
  const [today, setToday]           = useState<CalendarDay | null>(
    memberData ? findToday(memberData.calendar) : null
  );
  const [elapsed, setElapsed]       = useState(0);
  const [entryType, setEntryType]   = useState<'auto'|'web'>('web');

  // Leave form
  const [leaveDate,   setLeaveDate]   = useState('');
  const [leaveType,   setLeaveType]   = useState(LEAVE_TYPES[0]);
  const [leaveReason, setLeaveReason] = useState('');
  const [lLeading,    setLLoading]    = useState(false);
  const [lMsg,        setLMsg]        = useState<string | null>(null);
  const [lErr,        setLErr]        = useState<string | null>(null);

  const notIn   = !today || today.clockIn === '-';
  const working = !!today && today.clockIn !== '-' && today.clockOut === '-';
  const done    = !!today && today.clockIn !== '-' && today.clockOut !== '-';

  // Elapsed timer
  useEffect(() => {
    if (!working) return;
    function calc() {
      const jst = getJST();
      const nowMins = jst.hour * 60 + jst.minute;
      const inMins  = timeMins(today!.clockIn);
      return Math.max(0, nowMins - inMins) * 60 + jst.second;
    }
    setElapsed(calc());
    const id = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(id);
  }, [working, today?.clockIn]);

  async function doAction(body: Record<string, unknown>) {
    setLoading(true); setMsg(null); setErr(null);
    try {
      const res  = await fetch(`${apiUrl}/attendance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Action failed.'); }
      else {
        setMsg(data.message ?? 'Done.');
        const jst = getJST();
        const r = await fetch(`${apiUrl}/member-data?email=${encodeURIComponent(user.email)}&month=${parseInt(jst.date.split('-')[1])}&year=${parseInt(jst.date.split('-')[0])}`, { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          setToday(findToday(d.calendar));
          setOnLunch(d.onLunch);
          setOnBreak(d.onBreak);
        }
      }
    } catch { setErr('Network error. Please try again.'); }
    finally  { setLoading(false); }
  }

  const { date, time, hour, minute } = getJST();
  function clockIn()  { doAction({ action: 'clock-in',  entry_type: entryType, local_time: time, date, jst_hour: hour, jst_minute: minute }); }
  function clockOut() { doAction({ action: 'clock-out', local_time: time, date }); }
  function lunchToggle() { doAction({ action: onLunch ? 'lunch-in'  : 'lunch-out',  local_time: time, date }); }
  function breakToggle() { doAction({ action: onBreak ? 'break-in'  : 'break-out',  local_time: time, date }); }

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    setLLoading(true); setLMsg(null); setLErr(null);
    try {
      const res  = await fetch(`${apiUrl}/attendance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'leave', date: leaveDate, leave_type: leaveType, reason: leaveReason }) });
      const data = await res.json();
      if (!res.ok) { setLErr(data.error ?? 'Request failed.'); }
      else { setLMsg('Leave request submitted.'); setLeaveDate(''); setLeaveReason(''); }
    } catch { setLErr('Network error.'); }
    finally  { setLLoading(false); }
  }

  // Hours worked
  const hoursWorked = working ? elapsed / 3600 : done ? parseFloat(String(today?.totalHours ?? 0)) || 0 : 0;
  const targetH     = 8;
  const pct         = Math.min(100, (hoursWorked / targetH) * 100);

  // Weekly bars
  const jstNow       = getJST();
  const jstDateParts = jstNow.date.split('-');
  const todayStr     = `${parseInt(jstDateParts[1])}/${parseInt(jstDateParts[2])}/${jstDateParts[0]}`;
  const wd           = weekDates(jstNow.date);
  const calendar     = memberData?.calendar ?? [];

  const bars = wd.map(({ label, dateStr, isWeekend }) => {
    const rec   = calendar.find(c => c.date === dateStr);
    const isNow = dateStr === todayStr;
    const hrs   = isNow && working ? hoursWorked : (rec && !rec.isWeekend ? parseFloat(String(rec.totalHours || 0)) || 0 : 0);
    const color = isNow ? '#111' : (rec ? (STATUS_BAR[rec.status] ?? '#d1d5db') : (isWeekend ? '#f3f4f6' : '#e5e7eb'));
    const h     = Math.min(100, (hrs / 10) * 100);
    return { label, hrs, h, color, isNow, isWeekend };
  });

  /* ── Styles ── */
  const card: React.CSSProperties  = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '1.5rem' };
  const label: React.CSSProperties = { fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.1em' };
  const inp: React.CSSProperties   = { width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: '0.82rem', color: '#111', backgroundColor: '#fff', boxSizing: 'border-box' as const };
  function btn(bg: string, color = '#fff', border = 'none'): React.CSSProperties {
    return { padding: '0.55rem 1.1rem', backgroundColor: bg, color, border, borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 };
  }

  return (
    <div>
      {msg && <div style={{ marginBottom: '1rem', padding: '0.65rem 0.875rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: '0.8rem', color: '#16a34a' }}>{msg}</div>}
      {err && <div style={{ marginBottom: '1rem', padding: '0.65rem 0.875rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: '0.8rem', color: '#dc2626' }}>{err}</div>}

      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>

        {/* ── Left column ── */}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Status card */}
          <div style={card}>
            {/* Badge row */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              {notIn  && <Badge bg="#f3f4f6" color="#6b7280" dot="#9ca3af">Not clocked in</Badge>}
              {working && <Badge bg="#f0fdf4" color="#16a34a" dot="#22c55e" pulse>Working</Badge>}
              {done   && <Badge bg="#eff6ff" color="#3b82f6" dot="#3b82f6">Done for today</Badge>}
              {onLunch && working && <Badge bg="#fffbeb" color="#d97706" dot="#f59e0b">On lunch</Badge>}
              {onBreak && working && <Badge bg="#f5f3ff" color="#7c3aed" dot="#8b5cf6">On break</Badge>}
            </div>

            {/* Status heading */}
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111', margin: '0 0 0.3rem', lineHeight: 1.1 }}>
              {notIn   && 'Ready to start your day.'}
              {working && `Working since ${today!.clockIn}.`}
              {done    && `Done at ${today!.clockOut}.`}
            </h2>

            {/* Live timer or total */}
            {working && (
              <div style={{ fontFamily: 'monospace', fontSize: '2.75rem', fontWeight: 800, color: '#111', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: '1.25rem' }}>
                {fmtSecs(elapsed)}
              </div>
            )}
            {done && today?.totalHours && (
              <div style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700, color: '#374151', lineHeight: 1, marginBottom: '1.25rem' }}>
                {String(today.totalHours)}h total
              </div>
            )}

            {/* Progress bar */}
            {(working || done) && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ ...label, color: pct >= 100 ? '#16a34a' : '#9ca3af' }}>
                    {pct >= 100 ? 'Target reached!' : `${(targetH - hoursWorked).toFixed(1)}h to go`}
                  </span>
                  <span style={{ ...label }}>TARGET {targetH}h</span>
                </div>
                <div style={{ height: 6, backgroundColor: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, backgroundColor: pct >= 100 ? '#22c55e' : '#111', borderRadius: 999, transition: 'width 1s linear' }} />
                </div>
                <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', color: '#9ca3af' }}>
                  {hoursWorked.toFixed(2)}h worked
                </div>
              </div>
            )}

            {/* Entry type toggle */}
            {notIn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={label}>Entry</span>
                {(['auto','web'] as const).map(t => (
                  <button key={t} onClick={() => setEntryType(t)}
                    style={{ padding: '0.3rem 0.65rem', backgroundColor: entryType === t ? '#111' : '#f3f4f6', color: entryType === t ? '#fff' : '#6b7280', border: 'none', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', cursor: 'pointer' }}>
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {notIn && (
                <button onClick={clockIn} disabled={loading} style={btn('#111')}>Clock in</button>
              )}
              {working && (
                <>
                  <button onClick={clockOut}    disabled={loading} style={btn('#dc2626')}>Clock out</button>
                  <button onClick={lunchToggle} disabled={loading} style={btn('#fff', '#374151', '1px solid #e5e7eb')}>{onLunch ? 'Lunch in' : 'Lunch'}</button>
                  <button onClick={breakToggle} disabled={loading} style={btn('#fff', '#374151', '1px solid #e5e7eb')}>{onBreak ? 'Break in' : 'Break'}</button>
                </>
              )}
            </div>
          </div>

          {/* Weekly bar chart */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111' }}>This week</div>
                <div style={{ ...label, marginTop: '0.15rem' }}>Daily hours</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.65rem', color: '#9ca3af' }}>
                {[['#22c55e','On time'],['#f59e0b','Late'],['#ef4444','Absent']].map(([c,l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: c, display: 'inline-block' }} />{l}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: 90 }}>
              {bars.map(({ label: lbl, hrs, h, color, isNow, isWeekend }) => (
                <div key={lbl} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', height: '100%' }}>
                  <div style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: '#9ca3af', height: 14, display: 'flex', alignItems: 'flex-end' }}>
                    {hrs > 0 ? hrs.toFixed(1) : ''}
                  </div>
                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', backgroundColor: color, borderRadius: 5, height: `${Math.max(h, hrs > 0 ? 8 : 3)}%`, opacity: isWeekend && hrs === 0 ? 0.3 : 1, minHeight: isWeekend ? 0 : 3, transition: 'height 0.3s ease' }} />
                  </div>
                  <div style={{ fontSize: '0.65rem', fontWeight: isNow ? 700 : 400, color: isNow ? '#111' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 2 }}>{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ width: 245, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Quick leave form */}
          <div style={card}>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#111', marginBottom: '0.2rem' }}>Request leave</div>
            <div style={{ ...label, marginBottom: '1rem' }}>Quick request</div>

            {lMsg && <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.7rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: '0.75rem', color: '#16a34a' }}>{lMsg}</div>}
            {lErr && <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.7rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: '0.75rem', color: '#dc2626' }}>{lErr}</div>}

            <form onSubmit={submitLeave}>
              <div style={{ marginBottom: '0.7rem' }}>
                <label style={{ ...label, display: 'block', marginBottom: '0.3rem' }}>Type</label>
                <select value={leaveType} onChange={e => setLeaveType(e.target.value)} style={inp}>
                  {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '0.7rem' }}>
                <label style={{ ...label, display: 'block', marginBottom: '0.3rem' }}>Date</label>
                <input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} required style={inp} />
              </div>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ ...label, display: 'block', marginBottom: '0.3rem' }}>Reason</label>
                <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)} required rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
              <button type="submit" disabled={lLeading} style={{ ...btn('#111'), width: '100%', textAlign: 'center' as const, justifyContent: 'center' }}>
                {lLeading ? 'Submitting…' : '+ Request leave'}
              </button>
            </form>
          </div>

          {/* Heads up — leave balance */}
          {leaveBalance && (
            <div style={card}>
              <div style={{ ...label, marginBottom: '0.85rem' }}>Heads up</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Available</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#22c55e' }}>{Math.max(0, leaveBalance.remaining)} days</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Used</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>{leaveBalance.used} / {leaveBalance.total}</span>
              </div>
              <div style={{ height: 5, backgroundColor: '#f3f4f6', borderRadius: 999 }}>
                <div style={{ height: '100%', width: `${Math.min(100, (leaveBalance.used / (leaveBalance.total || 1)) * 100)}%`, backgroundColor: '#111', borderRadius: 999 }} />
              </div>
              {leaveBalance.remaining <= 5 && leaveBalance.remaining > 0 && (
                <p style={{ fontSize: '0.72rem', color: '#d97706', marginTop: '0.65rem', lineHeight: 1.5 }}>
                  Only {leaveBalance.remaining} day{leaveBalance.remaining !== 1 ? 's' : ''} remaining this year.
                </p>
              )}
              {leaveBalance.remaining <= 0 && (
                <p style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '0.65rem', lineHeight: 1.5 }}>
                  No leave balance remaining.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Helper badge component */
function Badge({ bg, color, dot, pulse, children }: { bg: string; color: string; dot: string; pulse?: boolean; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: bg, borderRadius: 999, padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: dot, display: 'inline-block', flexShrink: 0 }} />
      {children}
    </span>
  );
}
