'use client';

import { useState, useEffect } from 'react';
import type { MemberData, CalendarDay } from '../MemberDashboard';

interface Props {
  email: string;
  initialData: MemberData | null;
  apiUrl: string;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS         = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function getJST() {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return { year: jst.getFullYear(), month: jst.getMonth() + 1, day: jst.getDate(), raw: jst };
}

// Pay period: 25th → 24th
function payPeriod(y: number, m: number, d: number) {
  let sm: number, sy: number;
  if (d >= 25) { sm = m;          sy = y; }
  else         { sm = m === 1 ? 12 : m-1; sy = m === 1 ? y-1 : y; }
  const em = sm === 12 ? 1 : sm + 1;
  const ey = sm === 12 ? sy + 1 : sy;
  return { startYear: sy, startMonth: sm, endYear: ey, endMonth: em };
}

function countWorkDays(sy: number, sm: number, sd: number, ey: number, em: number, ed: number): number {
  let c = 0;
  const d = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (d <= end) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) c++; d.setDate(d.getDate() + 1); }
  return c;
}

function workDayList(sy: number, sm: number, sd: number, ey: number, em: number, ed: number): Date[] {
  const days: Date[] = [];
  const d = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (d <= end) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) days.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return days;
}

function parseHours(h: string | number): number {
  return typeof h === 'number' ? h : parseFloat(String(h)) || 0;
}

// M/D/YYYY ↔ Date matching
function dateToUsStr(d: Date): string {
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
}

export default function PayrollPage({ email, initialData, apiUrl }: Props) {
  const [data1, setData1] = useState<MemberData | null>(initialData);
  const [data2, setData2] = useState<MemberData | null>(null);
  const [busy,  setBusy]  = useState(false);

  const jst  = getJST();
  const pp   = payPeriod(jst.year, jst.month, jst.day);

  // Fetch months needed for pay period
  useEffect(() => {
    const needBoth = !(pp.startMonth === jst.month && pp.startYear === jst.year);
    const fetches: Promise<void>[] = [];

    // Always ensure current month is loaded
    if (!data1 || data1.month !== jst.month || data1.year !== jst.year) {
      fetches.push(
        fetch(`${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${jst.month}&year=${jst.year}`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null).then(d => { if (d) setData1(d); }).catch(() => {})
      );
    }

    // If period started previous month, fetch that too
    if (needBoth) {
      fetches.push(
        fetch(`${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${pp.startMonth}&year=${pp.startYear}`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null).then(d => { if (d) setData2(d); }).catch(() => {})
      );
    }

    if (fetches.length > 0) {
      setBusy(true);
      Promise.all(fetches).finally(() => setBusy(false));
    }
  }, []);

  // Merge calendars from both months
  const allCal: CalendarDay[] = [
    ...(data2?.calendar ?? []).map(d => ({ ...d, _month: pp.startMonth, _year: pp.startYear })),
    ...(data1?.calendar ?? []).map(d => ({ ...d, _month: jst.month, _year: jst.year })),
  ] as CalendarDay[];

  // All working days in pay period
  const today    = new Date(jst.year, jst.month - 1, jst.day);
  const allWDs   = workDayList(pp.startYear, pp.startMonth, 25, pp.endYear, pp.endMonth, 24);
  const totalWDs = allWDs.length;
  const reqHours = totalWDs * 8;

  // Map calendar records by date string
  const calMap: Record<string, CalendarDay & { _month?: number; _year?: number }> = {};
  (allCal as (CalendarDay & { _month?: number; _year?: number })[]).forEach(d => {
    calMap[d.date] = d;
  });

  // Hours this period (past + today)
  let hoursThisPeriod = 0;
  let daysOnTime = 0, lateDays = 0, absentDays = 0, leaveDays = 0;
  let totalLunchMins = 0, lunchCount = 0;

  const periodDays = allWDs.filter(d => d <= today);
  periodDays.forEach(d => {
    const key = dateToUsStr(d);
    const rec = calMap[key];
    if (rec) {
      const h = parseHours(rec.totalHours);
      hoursThisPeriod += h;
      if (rec.status === 'present') daysOnTime++;
      else if (rec.status === 'late') lateDays++;
      else if (rec.status === 'absent') absentDays++;
      else if (rec.status === 'leave') leaveDays++;
    }
  });

  const doneDays = periodDays.length;
  const leftDays = allWDs.filter(d => d > today).length;
  const avgPerDay = doneDays > 0 ? hoursThisPeriod / doneDays : 0;
  const projected = hoursThisPeriod + avgPerDay * leftDays;
  const overUnder = projected - reqHours;
  const pct       = reqHours > 0 ? Math.min(100, (hoursThisPeriod / reqHours) * 100) : 0;

  // Format hours as "Xh Ym"
  function fmtHours(h: number): string {
    const hrs = Math.floor(h);
    const m   = Math.round((h - hrs) * 60);
    return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`;
  }

  // Day of pay period (day N of M)
  const dayOfPeriod  = countWorkDays(pp.startYear, pp.startMonth, 25, jst.year, jst.month, jst.day);

  // Period label
  const startLabel = `${MONTHS_SHORT[pp.startMonth-1]} 25`;
  const endLabel   = `${MONTHS_SHORT[pp.endMonth-1]} 24, ${pp.endYear}`;

  // Daily ledger (all working days in period up to today)
  const ledgerDays = allWDs.filter(d => d <= today).slice(-14); // show last 14

  const label: React.CSSProperties = { fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.1em' };
  const card: React.CSSProperties  = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.25rem' };

  const BAR_COLOR: Record<string, string> = { present: '#22c55e', late: '#f59e0b', absent: '#ef4444', leave: '#8b5cf6' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#111', margin: 0, lineHeight: 1.1 }}>Payroll.</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ ...label }}>
            Cycle 25 → 24 · day {dayOfPeriod} of {totalWDs}
          </span>
        </div>
      </div>
      <p style={{ ...label, marginBottom: '1.5rem' }}>
        Hours tracker · Pay period {startLabel} – {endLabel}
      </p>

      {busy && <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '1rem' }}>Loading payroll data…</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.25rem', marginBottom: '1.25rem' }}>

        {/* ── Main hours card ── */}
        <div style={card}>
          <div style={{ ...label, marginBottom: '0.75rem' }}>Hours this period</div>

          {/* Big number */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '0.5rem' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '3rem', fontWeight: 800, color: '#111', lineHeight: 1, letterSpacing: '-0.02em' }}>
              {fmtHours(hoursThisPeriod)}
            </span>
            <span style={{ fontSize: '1rem', color: '#9ca3af', fontWeight: 400 }}>/ {reqHours}h required</span>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.72rem', color: pct >= 100 ? '#16a34a' : '#9ca3af' }}>
                {pct >= 100 ? 'Target reached!' : `${pct.toFixed(0)}% of target · ${fmtHours(reqHours - hoursThisPeriod)} to go`}
              </span>
              <span style={{ ...label }}>Target</span>
            </div>
            <div style={{ height: 8, backgroundColor: '#f3f4f6', borderRadius: 999, position: 'relative', overflow: 'visible' }}>
              <div style={{ height: '100%', width: `${pct}%`, backgroundColor: pct >= 100 ? '#22c55e' : '#111', borderRadius: 999 }} />
              {/* Today marker */}
              {pct > 0 && pct < 100 && (
                <div style={{ position: 'absolute', left: `${pct}%`, top: -3, bottom: -3, width: 2, backgroundColor: '#6b7280', borderRadius: 1 }} />
              )}
            </div>
          </div>

          {/* Period markers */}
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem', color: '#9ca3af', flexWrap: 'wrap' }}>
            <span>● {doneDays} day{doneDays !== 1 ? 's' : ''} done</span>
            <span>● {leftDays} left</span>
            <span>● avg {avgPerDay.toFixed(1)}h / day</span>
          </div>

          <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', backgroundColor: '#f9fafb', borderRadius: 8, fontSize: '0.7rem', color: '#6b7280' }}>
            All hours calculated in JST · lunch excluded · pay period runs the 25th → 24th of each month
          </div>
        </div>

        {/* ── Projection + breakdown ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Projection */}
          <div style={card}>
            <div style={{ ...label, marginBottom: '0.5rem' }}>Projection</div>
            <div style={{ fontFamily: 'monospace', fontSize: '1.6rem', fontWeight: 800, color: '#111', lineHeight: 1 }}>
              {fmtHours(projected)}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: overUnder >= 0 ? '#16a34a' : '#dc2626', marginTop: '0.25rem' }}>
              {overUnder >= 0 ? '+' : ''}{fmtHours(Math.abs(overUnder))} {overUnder >= 0 ? 'over' : 'under'} target
            </div>
            {overUnder >= 0 && avgPerDay > 0 && (
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.5rem', lineHeight: 1.5 }}>
                At {avgPerDay.toFixed(1)}h/day you&apos;ll finish ahead.
              </p>
            )}
          </div>

          {/* Period breakdown */}
          <div style={card}>
            <div style={{ ...label, marginBottom: '0.75rem' }}>Period breakdown</div>
            {[
              { lbl: 'Regular hours',  val: fmtHours(hoursThisPeriod) },
              { lbl: 'Days on time',   val: `${daysOnTime} / ${doneDays}` },
              { lbl: 'Late days',      val: lateDays },
              { lbl: 'Absent days',    val: absentDays },
              { lbl: 'Leave taken',    val: `${leaveDays} days` },
            ].map(({ lbl: l, val }) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.82rem' }}>
                <span style={{ color: '#6b7280' }}>{l}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily ledger */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111' }}>Daily ledger</div>
          <span style={{ ...label }}>Day-by-day hours this period</span>
        </div>
        <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {ledgerDays.length === 0 && (
            <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No data for this period yet.</p>
          )}
          {ledgerDays.map(d => {
            const key  = dateToUsStr(d);
            const rec  = calMap[key];
            const hrs  = rec ? parseHours(rec.totalHours) : 0;
            const isNow = d.toDateString() === new Date(jst.year, jst.month-1, jst.day).toDateString();
            const barW  = Math.min(100, (hrs / 10) * 100);
            const bColor = rec ? (BAR_COLOR[rec.status] ?? '#e5e7eb') : '#e5e7eb';
            const dayLabel = DAYS[(d.getDay() + 6) % 7]; // Mon=0
            const cin  = rec?.clockIn  ?? '—';
            const cout = rec?.clockOut ?? '—';

            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.55rem 0', borderBottom: '1px solid #f9fafb' }}>
                <div style={{ width: 56, flexShrink: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: isNow ? 700 : 500, color: isNow ? '#111' : '#374151' }}>{dayLabel} {isNow ? <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>NOW</span> : ''}</div>
                  <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace' }}>{MONTHS_SHORT[d.getMonth()]} {d.getDate()}</div>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontFamily: 'monospace', width: 90, flexShrink: 0 }}>
                  {cin !== '—' ? `${cin} → ${cout}` : '—'}
                </div>
                <div style={{ flex: 1, height: 6, backgroundColor: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                  {hrs > 0 && <div style={{ height: '100%', width: `${barW}%`, backgroundColor: bColor, borderRadius: 999 }} />}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700, color: hrs > 0 ? '#111' : '#d1d5db', width: 40, textAlign: 'right', flexShrink: 0 }}>
                  {hrs > 0 ? `${hrs.toFixed(2)}h` : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
