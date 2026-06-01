'use client';

import { clientFetch } from '@/lib/clientFetch';

import { useState, useEffect } from 'react';
import type { UserProfile, MemberData, LeaveBalance, CalendarDay } from '../MemberDashboard';

interface Props {
  user: UserProfile;
  memberData: MemberData | null;
  leaveBalance: LeaveBalance | null;
  apiUrl: string;
}

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
};

const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

const STATUS_COLOR: Record<string, string> = {
  present:  '#16a34a',
  late:     '#b45309',
  absent:   '#dc2626',
  leave:    '#7c3aed',
  pending:  '#b45309',
  rejected: '#dc2626',
};

const LEAVE_TYPES = ['Vacation', 'Sick', 'Personal', 'Other'];

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

// Returns Mon–Sun (7 days) for the week containing jstDate
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
    const iso = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
    const usStr = `${dd.getMonth()+1}/${dd.getDate()}/${dd.getFullYear()}`;
    return { label: LABELS[i], iso, usStr, isWeekend: i >= 5, dateNum: dd.getDate(), monthLabel: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dd.getMonth()] };
  });
}

export default function HomePage({ user, memberData, leaveBalance, apiUrl }: Props) {
  const [loading,    setLoading]   = useState(false);
  const [msg,        setMsg]       = useState<string | null>(null);
  const [err,        setErr]       = useState<string | null>(null);
  const [onLunch,    setOnLunch]   = useState(memberData?.onLunch ?? false);
  const [onBreak,    setOnBreak]   = useState(memberData?.onBreak ?? false);
  const [hadLunch,   setHadLunch]  = useState(memberData?.hadLunch ?? false);
  const [lunchStart, setLunchStart] = useState<string | null>(memberData?.lunchStart ?? null);
  const [lunchEnd,   setLunchEnd]   = useState<string | null>(memberData?.lunchEnd ?? null);
  const [breakStart, setBreakStart] = useState<string | null>(memberData?.breakStart ?? null);
  const [breakEnd,   setBreakEnd]   = useState<string | null>(memberData?.breakEnd ?? null);
  const [today,      setToday]     = useState<CalendarDay | null>(
    memberData ? findToday(memberData.calendar) : null
  );
  const [calendar,   setCalendar]  = useState<CalendarDay[]>(memberData?.calendar ?? []);
  const [elapsed,    setElapsed]   = useState(0);
  const [entryType,  setEntryType] = useState<'auto'|'manual'>('auto');
  const [isLate,     setIsLate]    = useState(false);
  const [manualReason, setManualReason] = useState('');

  // Appeal form (for rejected manual clock-in)
  const [appealReason,    setAppealReason]    = useState('');
  const [appealLoading,   setAppealLoading]   = useState(false);
  const [appealMsg,       setAppealMsg]       = useState<string | null>(null);
  const [appealErr,       setAppealErr]       = useState<string | null>(null);
  const [appealSubmitted, setAppealSubmitted] = useState(false);

  // Leave form
  const [leaveDate,   setLeaveDate]   = useState('');
  const [leaveType,   setLeaveType]   = useState(LEAVE_TYPES[0]);
  const [leaveReason, setLeaveReason] = useState('');
  const [lLoading,    setLLoading]    = useState(false);
  const [lMsg,        setLMsg]        = useState<string | null>(null);
  const [lErr,        setLErr]        = useState<string | null>(null);

  const pendingApproval = !!today && today.status === 'pending' && today.entryType === 'manual';
  const rejected        = !!today && today.status === 'rejected';
  const notIn           = !today || today.clockIn === '-';
  const working         = !!today && today.clockIn !== '-' && today.clockOut === '-' && !pendingApproval && !rejected;
  const done            = !!today && today.clockIn !== '-' && today.clockOut !== '-';
  const todayIsWeekend  = getJST().raw.getDay() === 0 || getJST().raw.getDay() === 6;

  useEffect(() => {
    if (!working) return;
    function calc() {
      const jst = getJST();
      const nowMins = jst.hour * 60 + jst.minute;
      const inMins  = timeMins(today!.lastClockIn !== '-' ? today!.lastClockIn : today!.clockIn);
      return Math.max(0, nowMins - inMins) * 60 + jst.second;
    }
    setElapsed(calc());
    const id = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(id);
  }, [working, today?.clockIn, today?.lastClockIn]);

  useEffect(() => {
    function checkLate() {
      const { hour, minute } = getJST();
      const late = hour > 9 || (hour === 9 && minute > 10);
      setIsLate(late);
      setEntryType(late ? 'manual' : 'auto');
    }
    checkLate();
    const id = setInterval(checkLate, 60_000);
    return () => clearInterval(id);
  }, []);

  async function refreshData() {
    const jst = getJST();
    try {
      const r = await clientFetch(`${apiUrl}/webhook/member-data?email=${encodeURIComponent(user.email)}&month=${parseInt(jst.date.split('-')[1])}&year=${parseInt(jst.date.split('-')[0])}`, {});
      if (r.ok) {
        const d = await r.json();
        setToday(findToday(d.calendar));
        setCalendar(d.calendar ?? []);
        setOnLunch(d.onLunch);
        setOnBreak(d.onBreak);
        setHadLunch(d.hadLunch ?? false);
        setLunchStart(d.lunchStart ?? null);
        setLunchEnd(d.lunchEnd ?? null);
        setBreakStart(d.breakStart ?? null);
        setBreakEnd(d.breakEnd ?? null);
      }
    } catch { /* silent on background poll */ }
  }

  // Poll every 15 s so admin approve/reject is reflected without manual refresh
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) refreshData(); }, 15_000);
    return () => clearInterval(id);
  }, []);

  async function doAction(body: Record<string, unknown>) {
    setLoading(true); setMsg(null); setErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/webhook/attendance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Action failed.'); }
      else {
        setMsg(data.message ?? 'Done.');
        setTimeout(() => setMsg(null), 4_000);
        setManualReason('');
        await refreshData();
      }
    } catch { setErr('Network error. Please try again.'); }
    finally  { setLoading(false); }
  }

  const { date, time, hour, minute } = getJST();
  function clockIn() {
    if (entryType === 'manual' && !manualReason.trim()) {
      setErr('Please enter a reason for manual clock-in.');
      return;
    }
    doAction({
      action: 'clock-in',
      entry_type: entryType,
      local_time: time,
      date,
      jst_hour: hour,
      jst_minute: minute,
      ...(entryType === 'manual' ? { reason: manualReason } : {}),
    });
  }
  function clockOut()   { doAction({ action: 'clock-out', local_time: time, date }); }
  function lunchToggle(){ doAction({ action: onLunch ? 'lunch-in' : 'lunch-out', local_time: time, date }); }
  function breakToggle(){ doAction({ action: onBreak ? 'break-in' : 'break-out', local_time: time, date }); }

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    setLLoading(true); setLMsg(null); setLErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/webhook/attendance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'leave', date: leaveDate, leave_type: leaveType, reason: leaveReason }) });
      const data = await res.json();
      if (!res.ok) { setLErr(data.error ?? 'Request failed.'); }
      else { setLMsg('Leave request submitted.'); setTimeout(() => setLMsg(null), 4_000); setLeaveDate(''); setLeaveReason(''); }
    } catch { setLErr('Network error.'); }
    finally  { setLLoading(false); }
  }

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!today?.dateISO) return;
    setAppealLoading(true); setAppealMsg(null); setAppealErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/appeals`, {
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

  const hoursWorked = working
    ? (today?.accumulatedHours ?? 0) + elapsed / 3600
    : done
    ? parseFloat(String(today?.totalHours ?? 0)) || 0
    : 0;
  const targetH     = 8;
  const pct         = Math.min(100, (hoursWorked / targetH) * 100);

  // Weekly rows — uses `calendar` state (kept fresh by refreshData/polling)
  const jstNow   = getJST();
  const wd       = weekDates(jstNow.date);
  const jstDateParts = jstNow.date.split('-');
  const todayUsStr = `${parseInt(jstDateParts[1])}/${parseInt(jstDateParts[2])}/${jstDateParts[0]}`;

  const weekRows = wd.map(({ label, usStr, isWeekend, dateNum, monthLabel }) => {
    const rec    = calendar.find(c => c.date === usStr);
    const isNow  = usStr === todayUsStr;
    const hrs    = isNow && working ? hoursWorked : (rec && !rec.isWeekend ? parseFloat(String(rec.totalHours || 0)) || 0 : 0);
    const status = rec?.status ?? (isWeekend ? 'weekend' : '');
    const tint   = isNow ? C.accent : (status === 'present' ? C.green : status === 'late' ? C.accent : status === 'absent' ? C.red : status === 'leave' ? C.purple : C.border);
    return { label, usStr, dateNum, monthLabel, isWeekend, isNow, rec, hrs, status, tint };
  });

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8,
    fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box', fontFamily: F_SANS,
  };

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

      {/* ── Left column ── */}
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {msg && <div style={{ padding: '10px 14px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 10, fontSize: 13, color: C.green }}>{msg}</div>}
        {err && <div style={{ padding: '10px 14px', background: C.redSoft, border: `1px solid ${C.redBorder}`, borderRadius: 10, fontSize: 13, color: C.red }}>{err}</div>}

        {/* Hero status card */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '26px 28px' }}>

          {/* Status badge */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {notIn && !todayIsWeekend && <StatusBadge bg={C.surface2}   color={C.text3}   dot={C.text3}>Not clocked in</StatusBadge>}
            {notIn && todayIsWeekend  && <StatusBadge bg={C.purpleSoft} color={C.purple}  dot={C.purple}>Weekend</StatusBadge>}
            {pendingApproval          && <StatusBadge bg={C.accentSoft} color={C.accent}  dot={C.accent} pulse>Awaiting approval</StatusBadge>}
            {rejected                 && <StatusBadge bg={C.redSoft}    color={C.red}     dot={C.red}>Rejected</StatusBadge>}
            {working                  && <StatusBadge bg={C.greenSoft}  color={C.green}   dot={C.green} pulse>Working</StatusBadge>}
            {done                     && <StatusBadge bg={C.blueSoft}   color={C.blue}    dot={C.blue}>Done for today</StatusBadge>}
            {onLunch && working       && <StatusBadge bg={C.accentSoft} color={C.accent}  dot={C.accent}>On lunch</StatusBadge>}
            {onBreak && working       && <StatusBadge bg={C.purpleSoft} color={C.purple}  dot={C.purple}>On break</StatusBadge>}
          </div>

          {/* Serif status headline */}
          <div style={{ fontFamily: F_SERIF, fontSize: 36, lineHeight: 1.05, letterSpacing: '-0.02em', color: C.text, marginBottom: 6 }}>
            {notIn && !todayIsWeekend && 'Ready to start your day.'}
            {notIn && todayIsWeekend  && <><span style={{ fontStyle: 'normal' }}>It&apos;s the weekend — </span><span style={{ fontStyle: 'italic' }}>enjoy your time off.</span></>}
            {pendingApproval && <><span style={{ fontStyle: 'normal' }}>Clock-in </span><span style={{ fontStyle: 'italic' }}>pending approval.</span></>}
            {rejected        && <><span style={{ fontStyle: 'normal' }}>Manual clock-in </span><span style={{ fontStyle: 'italic' }}>was rejected.</span></>}
            {working && (
              today!.accumulatedHours > 0
                ? <><span style={{ fontStyle: 'normal' }}>Resumed at </span><span style={{ fontStyle: 'italic' }}>{today!.lastClockIn}.</span></>
                : <><span style={{ fontStyle: 'normal' }}>Working since </span><span style={{ fontStyle: 'italic' }}>{today!.clockIn}.</span></>
            )}
            {done    && <><span style={{ fontStyle: 'normal' }}>Done at </span><span style={{ fontStyle: 'italic' }}>{today!.clockOut}.</span></>}
          </div>

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

          {/* Live timer or total */}
          {working && (
            <div style={{ fontFamily: F_MONO, fontSize: 84, fontWeight: 400, color: C.text, letterSpacing: '-0.04em', lineHeight: 0.85, marginBottom: 22, fontVariantNumeric: 'tabular-nums' }}>
              {fmtSecs(elapsed)}
            </div>
          )}
          {done && today?.totalHours && (
            <div style={{ fontFamily: F_MONO, fontSize: 56, fontWeight: 400, color: C.text, letterSpacing: '-0.03em', lineHeight: 0.9, marginBottom: 22, fontVariantNumeric: 'tabular-nums' }}>
              {String(today.totalHours)}<span style={{ fontSize: 28, color: C.text2 }}>h</span>
            </div>
          )}
          {notIn && (
            <div style={{ height: 16 }} />
          )}

          {/* Progress bar */}
          {(working || done) && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ position: 'relative', height: 6, background: C.border, borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.green})`, borderRadius: 999, transition: 'width 1s linear' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em' }}>
                <span style={{ color: pct >= 100 ? C.green : C.text3 }}>{pct >= 100 ? 'Target reached!' : `${(targetH - hoursWorked).toFixed(1)}h to go`}</span>
                <span>TARGET {targetH}h</span>
              </div>
            </div>
          )}

          {/* Auto / Manual toggle */}
          {notIn && !todayIsWeekend && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Entry</span>
                {isLate ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 12px', background: C.accentSoft, color: C.accent, border: `1px solid ${C.accentBorder}`, borderRadius: 999, fontSize: 11.5, fontFamily: F_SANS, fontWeight: 500, letterSpacing: '0.04em' }}>
                    Past 9:10 — manual entry required
                  </span>
                ) : (
                  <div style={{ display: 'inline-flex', background: C.surface2, borderRadius: 999, padding: 3, border: `1px solid ${C.border}` }}>
                    {(['auto','manual'] as const).map(t => (
                      <button key={t} onClick={() => setEntryType(t)}
                        style={{ padding: '5px 14px', background: entryType === t ? C.text : 'transparent', color: entryType === t ? '#fafafa' : C.text3, border: 'none', borderRadius: 999, fontSize: 11.5, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em', transition: 'all 0.15s' }}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {entryType === 'manual' && (
                <div style={{ marginTop: 12, marginBottom: 2 }}>
                  <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>
                    Reason for manual entry
                  </label>
                  <textarea
                    value={manualReason}
                    onChange={e => setManualReason(e.target.value)}
                    rows={2}
                    placeholder="Brief reason (required for approval)…"
                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box' as const, fontFamily: F_SANS, resize: 'vertical' as const }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {notIn && !todayIsWeekend && (
              <ActionBtn onClick={clockIn} disabled={loading} primary>Clock in</ActionBtn>
            )}
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
            {working && (
              <>
                <ActionBtn onClick={clockOut} disabled={loading} danger>Clock out</ActionBtn>
                <ActionBtn onClick={lunchToggle} disabled={loading} active={onLunch} activeColor={C.accent}>
                  {onLunch ? '🍱 On Lunch — tap to return' : '🍱 Lunch'}
                </ActionBtn>
                <ActionBtn onClick={breakToggle} disabled={loading} active={onBreak} activeColor={C.purple}>
                  {onBreak ? '☕ On Break — tap to return' : '☕ Break'}
                </ActionBtn>
              </>
            )}
            {done && today && (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 500, color: C.green, fontFamily: F_SANS }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
                  Clocked out at {today.clockOut}
                </span>
                {isLate && (
                  <div style={{ width: '100%', marginTop: 10 }}>
                    <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>
                      Reason to resume
                    </label>
                    <textarea
                      value={manualReason}
                      onChange={e => setManualReason(e.target.value)}
                      rows={2}
                      placeholder="Brief reason (required for approval)…"
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box' as const, fontFamily: F_SANS, resize: 'vertical' as const }}
                    />
                  </div>
                )}
                <ActionBtn onClick={clockIn} disabled={loading}>Resume</ActionBtn>
              </>
            )}
          </div>
        </div>

        {/* Weekly timesheet rows */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: F_SERIF, fontSize: 20, color: C.text, letterSpacing: '-0.015em' }}>This week</div>
              <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 3 }}>Daily hours</div>
            </div>
            <div style={{ display: 'flex', gap: 12, fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.04em' }}>
              <span><span style={{ color: C.green }}>●</span> On time</span>
              <span><span style={{ color: C.accent }}>●</span> Late</span>
              <span><span style={{ color: C.red }}>●</span> Absent</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {weekRows.map(({ label, dateNum, monthLabel, isWeekend, isNow, rec, hrs, status, tint }, i) => {
              const barW = Math.min(100, (hrs / 10) * 100);
              const cin  = rec?.clockIn  !== '-' ? rec?.clockIn  : null;
              const cout = rec?.clockOut !== '-' ? rec?.clockOut : null;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 4px', borderBottom: i < 6 ? `1px solid ${C.border}` : 'none', opacity: isWeekend && hrs === 0 ? 0.4 : 1 }}>
                  {/* Day */}
                  <div style={{ width: 48, flexShrink: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: isNow ? 600 : 500, color: isNow ? C.accent : C.text, lineHeight: 1.1 }}>
                      {label} {isNow && <span style={{ fontFamily: F_MONO, fontSize: 8.5, letterSpacing: '0.06em', color: C.accent }}>NOW</span>}
                    </div>
                    <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, marginTop: 1 }}>{monthLabel} {dateNum}</div>
                  </div>
                  {/* Clock in/out */}
                  <div style={{ width: 96, flexShrink: 0, fontFamily: F_MONO, fontSize: 11, color: C.text2 }}>
                    {isWeekend ? <span style={{ color: C.text3 }}>Weekend</span> : cin ? <>{cin} <span style={{ color: C.text3 }}>→</span> {cout ?? '—'}</> : <span style={{ color: C.text3 }}>—</span>}
                  </div>
                  {/* Bar */}
                  <div style={{ flex: 1, position: 'relative', height: 12, background: C.surface2, borderRadius: 4, overflow: 'hidden' }}>
                    {hrs > 0 && (
                      <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${barW}%`, background: tint, borderRadius: 4 }} />
                    )}
                    {/* 8h marker at 80% */}
                    <div style={{ position: 'absolute', top: -1, bottom: -1, left: '80%', width: 1, background: C.borderStrong, opacity: 0.5 }} />
                  </div>
                  {/* Hours */}
                  <div style={{ width: 48, flexShrink: 0, textAlign: 'right', fontFamily: F_MONO, fontSize: 12, color: hrs > 0 ? tint : C.text3, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                    {hrs > 0 ? `${hrs.toFixed(2)}h` : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Right column ── */}
      <div style={{ width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Pending anatomy — shown while awaiting admin approval */}
        {pendingApproval && today && (
          <div style={{ background: C.surface, border: `1px solid ${C.accentBorder}`, borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.accent, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Pending review</div>
            {[
              { lbl: 'Submitted', val: today.clockIn !== '-' ? today.clockIn : '—', tint: C.accent },
              { lbl: 'Entry',     val: 'Manual',                                    tint: C.text2  },
              { lbl: 'Status',    val: 'Awaiting approval',                         tint: C.accent },
              { lbl: 'Timer',     val: 'Starts once approved',                      tint: C.text3  },
            ].map(({ lbl, val, tint }) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>{lbl}</span>
                <span style={{ fontFamily: F_MONO, fontSize: 12.5, color: tint, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Today's anatomy */}
        {(working || done) && today && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Today&apos;s anatomy</div>
            {[
              { lbl: 'Clock in',  val: today.clockIn  !== '-' ? today.clockIn  : '—', tint: C.green },
              ...(today.accumulatedHours > 0 ? [{ lbl: 'Previous', val: `${today.accumulatedHours.toFixed(2)}h`, tint: C.text3 }] : []),
              { lbl: 'Lunch',     val: lunchStart ? `${lunchStart} – ${lunchEnd ?? '…'}` : onLunch ? 'In progress' : hadLunch ? 'Taken' : '—', tint: onLunch ? C.accent : hadLunch ? C.green : C.text3 },
              { lbl: 'Break',     val: breakStart ? `${breakStart} – ${breakEnd ?? '…'}` : onBreak ? 'In progress' : '—', tint: onBreak ? C.purple : breakStart ? C.text2 : C.text3 },
              { lbl: 'Clock out', val: today.clockOut !== '-' ? today.clockOut : '—', tint: C.text2 },
              { lbl: 'Status',    val: today.status.charAt(0).toUpperCase() + today.status.slice(1), tint: STATUS_COLOR[today.status] ?? C.text2 },
              { lbl: 'Net hours', val: working
  ? `${((today!.accumulatedHours ?? 0) + elapsed / 3600).toFixed(2)}h`
  : String(today.totalHours) + 'h', tint: C.text },
            ].map(({ lbl, val, tint }) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>{lbl}</span>
                <span style={{ fontFamily: F_MONO, fontSize: 12.5, color: tint, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Leave balance */}
        {leaveBalance && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Leave balance</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
              <span style={{ fontFamily: F_SERIF, fontSize: 38, color: C.text, letterSpacing: '-0.025em', lineHeight: 1 }}>{leaveBalance.used}</span>
              <span style={{ fontFamily: F_SERIF, fontSize: 22, color: C.text3, letterSpacing: '-0.015em' }}>/ {leaveBalance.grantsEarned}</span>
            </div>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.green, letterSpacing: '0.04em', marginBottom: 12 }}>
              {Math.max(0, leaveBalance.balance)} days available
            </div>
            <div style={{ height: 4, background: C.border, borderRadius: 999 }}>
              <div style={{ height: '100%', width: `${Math.min(100, (leaveBalance.used / (leaveBalance.grantsEarned || 1)) * 100)}%`, background: leaveBalance.balance <= 5 ? C.accent : C.text, borderRadius: 999 }} />
            </div>
            {leaveBalance.balance <= 5 && leaveBalance.balance > 0 && (
              <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.accent, marginTop: 8, letterSpacing: '0.02em' }}>
                Only {leaveBalance.balance} day{leaveBalance.balance !== 1 ? 's' : ''} remaining.
              </div>
            )}
          </div>
        )}

        {/* Leave request form */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontFamily: F_SERIF, fontSize: 20, color: C.text, letterSpacing: '-0.015em', marginBottom: 4 }}>
            Need a day off?
          </div>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Quick leave request</div>

          {lMsg && <div style={{ marginBottom: 10, padding: '8px 10px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 8, fontSize: 12, color: C.green }}>{lMsg}</div>}
          {lErr && <div style={{ marginBottom: 10, padding: '8px 10px', background: C.redSoft,   border: `1px solid ${C.redBorder}`,   borderRadius: 8, fontSize: 12, color: C.red }}>{lErr}</div>}

          <form onSubmit={submitLeave}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Type</label>
              <select value={leaveType} onChange={e => setLeaveType(e.target.value)} style={inp}>
                {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Date</label>
              <input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} required style={inp} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Reason</label>
              <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)} required rows={2} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <button type="submit" disabled={lLoading} style={{ width: '100%', padding: '9px 16px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 9, fontSize: 13, fontFamily: F_SANS, fontWeight: 500, cursor: lLoading ? 'not-allowed' : 'pointer', opacity: lLoading ? 0.6 : 1 }}>
              {lLoading ? 'Submitting…' : '+ Request leave'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ bg, color, dot, pulse, children }: { bg: string; color: string; dot: string; pulse?: boolean; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: bg, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 500, color, fontFamily: "'Geist', system-ui, sans-serif" }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0, ...(pulse ? { animation: 'pulse 1.5s infinite' } : {}) }} />
      {children}
    </span>
  );
}

function ActionBtn({ onClick, disabled, primary, danger, active, activeColor, children }: { onClick: () => void; disabled?: boolean; primary?: boolean; danger?: boolean; active?: boolean; activeColor?: string; children: React.ReactNode }) {
  const bg     = active ? `${activeColor}18` : danger ? 'transparent' : primary ? '#0a0a0a' : 'transparent';
  const color  = active ? activeColor! : danger ? '#dc2626' : primary ? '#fafafa' : '#525252';
  const border = active ? `1.5px solid ${activeColor}55` : danger ? '1px solid rgba(220,38,38,0.3)' : primary ? 'none' : '1px solid #e6e6e6';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ padding: '10px 20px', background: bg, color, border, borderRadius: 9, fontSize: 13.5, fontFamily: "'Geist', system-ui, sans-serif", fontWeight: active ? 600 : 500, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
    >
      {children}
    </button>
  );
}
