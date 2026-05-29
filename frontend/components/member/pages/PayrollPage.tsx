'use client';

import { clientFetch } from '@/lib/clientFetch';

import { useState, useEffect } from 'react';
import type { MemberData, CalendarDay } from '../MemberDashboard';

interface Props {
  email: string;
  initialData: MemberData | null;
  apiUrl: string;
}

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
};

const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const BAR_COLOR: Record<string, string> = {
  present: '#16a34a', late: '#b45309', absent: '#dc2626', leave: '#7c3aed',
};

function getJST() {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return { year: jst.getFullYear(), month: jst.getMonth() + 1, day: jst.getDate() };
}

function payPeriod(y: number, m: number, d: number) {
  let sm: number, sy: number;
  if (d >= 25) { sm = m; sy = y; }
  else         { sm = m === 1 ? 12 : m-1; sy = m === 1 ? y-1 : y; }
  const em = sm === 12 ? 1 : sm + 1;
  const ey = sm === 12 ? sy + 1 : sy;
  return { startYear: sy, startMonth: sm, endYear: ey, endMonth: em };
}

function workDayList(sy: number, sm: number, sd: number, ey: number, em: number, ed: number): Date[] {
  const days: Date[] = [];
  const d = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (d <= end) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) days.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return days;
}

function countWorkDays(sy: number, sm: number, sd: number, ey: number, em: number, ed: number): number {
  return workDayList(sy, sm, sd, ey, em, ed).length;
}

function dateToUsStr(d: Date): string {
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
}

function parseHours(h: string | number): number {
  return typeof h === 'number' ? h : parseFloat(String(h)) || 0;
}

function fmtHours(h: number): string {
  const hrs = Math.floor(h);
  const m   = Math.round((h - hrs) * 60);
  return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`;
}

export default function PayrollPage({ email, initialData, apiUrl }: Props) {
  const [data1, setData1] = useState<MemberData | null>(initialData);
  const [data2, setData2] = useState<MemberData | null>(null);
  const [busy,  setBusy]  = useState(false);

  const jst = getJST();
  const pp  = payPeriod(jst.year, jst.month, jst.day);

  useEffect(() => {
    const needBoth = !(pp.startMonth === jst.month && pp.startYear === jst.year);
    const fetches: Promise<void>[] = [];

    if (!data1 || data1.month !== jst.month || data1.year !== jst.year) {
      fetches.push(
        clientFetch(`${apiUrl}/webhook/member-data?email=${encodeURIComponent(email)}&month=${jst.month}&year=${jst.year}`, { })
          .then(r => r.ok ? r.json() : null).then(d => { if (d) setData1(d); }).catch(() => {})
      );
    }

    if (needBoth) {
      fetches.push(
        clientFetch(`${apiUrl}/webhook/member-data?email=${encodeURIComponent(email)}&month=${pp.startMonth}&year=${pp.startYear}`, { })
          .then(r => r.ok ? r.json() : null).then(d => { if (d) setData2(d); }).catch(() => {})
      );
    }

    if (fetches.length > 0) {
      setBusy(true);
      Promise.all(fetches).finally(() => setBusy(false));
    }
  }, []);

  const allCal: (CalendarDay & { _month?: number; _year?: number })[] = [
    ...(data2?.calendar ?? []).map(d => ({ ...d, _month: pp.startMonth, _year: pp.startYear })),
    ...(data1?.calendar ?? []).map(d => ({ ...d, _month: jst.month, _year: jst.year })),
  ];

  const today    = new Date(jst.year, jst.month - 1, jst.day);
  const allWDs   = workDayList(pp.startYear, pp.startMonth, 25, pp.endYear, pp.endMonth, 24);
  const totalWDs = allWDs.length;
  const reqHours = totalWDs * 8;

  const calMap: Record<string, typeof allCal[0]> = {};
  allCal.forEach(d => { calMap[d.date] = d; });

  let hoursThisPeriod = 0, daysOnTime = 0, lateDays = 0, absentDays = 0, leaveDays = 0;
  const periodDays = allWDs.filter(d => d <= today);
  periodDays.forEach(d => {
    const rec = calMap[dateToUsStr(d)];
    if (rec) {
      hoursThisPeriod += parseHours(rec.totalHours);
      if (rec.status === 'present')      daysOnTime++;
      else if (rec.status === 'late')    lateDays++;
      else if (rec.status === 'absent')  absentDays++;
      else if (rec.status === 'leave')   leaveDays++;
    }
  });

  const doneDays  = periodDays.length;
  const leftDays  = allWDs.filter(d => d > today).length;
  const avgPerDay = doneDays > 0 ? hoursThisPeriod / doneDays : 0;
  const projected = hoursThisPeriod + avgPerDay * leftDays;
  const overUnder = projected - reqHours;
  const pct       = reqHours > 0 ? Math.min(100, (hoursThisPeriod / reqHours) * 100) : 0;
  const projPct   = reqHours > 0 ? Math.min(100, (projected / reqHours) * 100) : 0;

  const dayOfPeriod = countWorkDays(pp.startYear, pp.startMonth, 25, jst.year, jst.month, jst.day);
  const startLabel  = `${MONTHS_SHORT[pp.startMonth-1]} 25`;
  const endLabel    = `${MONTHS_SHORT[pp.endMonth-1]} 24`;
  const ledgerDays  = allWDs.filter(d => d <= today).slice(-10);

  const hFull = Math.floor(hoursThisPeriod);
  const mPart = Math.round((hoursThisPeriod - hFull) * 60);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1280 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Timesheet.</div>
          <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
            Hours tracker · pay period {startLabel} – {endLabel}, {pp.endYear}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, fontFamily: F_MONO, fontSize: 11, color: C.text2, letterSpacing: '0.04em' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} />
            Cycle 25→24 · day {dayOfPeriod} of {totalWDs}
          </span>
        </div>
      </div>

      {busy && <div style={{ fontSize: 12.5, color: C.text3, fontFamily: F_MONO }}>Loading timesheet data…</div>}

      {/* Hero: progress + projection */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px' }}>

          {/* Left: big hours */}
          <div style={{ padding: '26px 30px', borderRight: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Hours this period</div>

            {/* Big serif number */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
              <div style={{ fontFamily: F_SERIF, fontSize: 96, lineHeight: 0.85, color: C.text, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                {hFull}<span style={{ fontSize: 56, color: C.text2 }}>h</span>
              </div>
              {mPart > 0 && (
                <div style={{ fontFamily: F_SERIF, fontSize: 48, color: C.text2, letterSpacing: '-0.03em', lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>
                  {mPart}<span style={{ fontSize: 28 }}>m</span>
                </div>
              )}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: F_SERIF, fontSize: 22, color: C.text3, letterSpacing: '-0.015em', lineHeight: 1 }}>/ {reqHours}h</div>
                <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>Required</div>
              </div>
            </div>

            {/* Status badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 999, background: C.accentSoft, border: `1px solid ${C.accentBorder}`, color: C.accent, fontSize: 12, fontWeight: 500, marginBottom: 20, fontFamily: F_SANS }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent }} />
              {Math.round(pct)}% of target · {fmtHours(Math.max(0, reqHours - hoursThisPeriod))} to go
            </div>

            {/* Gradient progress bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ position: 'relative', height: 10, background: C.border, borderRadius: 999, overflow: 'visible' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.green})`, borderRadius: 999 }} />
                {/* Projection ghost */}
                {projPct > pct && (
                  <div style={{ position: 'absolute', top: 0, left: `${pct}%`, height: '100%', width: `${projPct - pct}%`, background: `repeating-linear-gradient(-45deg, ${C.green}44 0 4px, transparent 4px 8px)`, borderRadius: 999 }} />
                )}
                {/* Target marker */}
                <div style={{ position: 'absolute', top: -4, left: '100%', width: 2, height: 18, background: C.text, borderRadius: 1, transform: 'translateX(-1px)' }} />
                <div style={{ position: 'absolute', top: -20, left: '100%', fontFamily: F_MONO, fontSize: 9.5, color: C.text2, letterSpacing: '0.08em', textTransform: 'uppercase', transform: 'translateX(-50%)' }}>Target</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em' }}>
                <span>{startLabel} · start</span>
                <span style={{ color: C.accent }}>● Today</span>
                <span>cutoff · {endLabel}</span>
              </div>
            </div>

            {/* Chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
              <Chip tint={C.green} label={`${doneDays} days done`} />
              <Chip tint={C.text3} label={`${leftDays} days left`} hollow />
              {avgPerDay > 0 && <Chip tint={C.accent} label={`avg ${avgPerDay.toFixed(1)}h/day`} hollow />}
            </div>
          </div>

          {/* Right: projection */}
          <div style={{ padding: '24px 26px', background: C.surface2, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Projection</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontFamily: F_SERIF, fontSize: 44, lineHeight: 0.9, color: C.text, letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.floor(projected)}<span style={{ color: C.text2 }}>h</span>
                </div>
                <div style={{ fontFamily: F_MONO, fontSize: 12.5, color: overUnder >= 0 ? C.green : C.red, letterSpacing: '0.04em' }}>
                  {overUnder >= 0 ? '+' : ''}{fmtHours(Math.abs(overUnder))} {overUnder >= 0 ? 'over' : 'under'}
                </div>
              </div>
              {avgPerDay > 0 && (
                <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em', marginTop: 6, lineHeight: 1.5 }}>
                  At {avgPerDay.toFixed(1)}h/day average, you{overUnder >= 0 ? "'ll finish ahead" : ' may fall short'}.
                </div>
              )}
            </div>

            <div style={{ height: 1, background: C.border, margin: '18px 0' }} />

            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Period breakdown</div>
            {[
              { lbl: 'Regular hours', v: fmtHours(hoursThisPeriod), tint: C.green  },
              { lbl: 'Days on time',  v: `${daysOnTime} / ${doneDays}`, tint: C.green  },
              { lbl: 'Late days',     v: String(lateDays),           tint: lateDays  > 0 ? C.accent : C.text2 },
              { lbl: 'Absent days',   v: String(absentDays),         tint: absentDays > 0 ? C.red   : C.text2 },
              { lbl: 'Leave taken',   v: `${leaveDays} days`,        tint: leaveDays > 0 ? C.purple : C.text2 },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
                <span style={{ fontSize: 12, color: C.text2, fontFamily: F_SANS }}>{r.lbl}</span>
                <span style={{ fontFamily: F_MONO, fontSize: 12, color: r.tint, fontVariantNumeric: 'tabular-nums' }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Note row */}
        <div style={{ padding: '10px 24px', borderTop: `1px solid ${C.border}`, background: C.bg, display: 'flex', alignItems: 'center', gap: 10, fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em' }}>
          <span style={{ color: C.accent }}>ⓘ</span>
          <span>All hours in JST · lunch excluded · pay period runs the <span style={{ color: C.text2 }}>25th → 24th</span> of each month</span>
        </div>
      </div>

      {/* Daily ledger */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: F_SERIF, fontSize: 20, color: C.text, letterSpacing: '-0.015em' }}>Daily ledger</div>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 3 }}>Day-by-day hours · this period</div>
          </div>
          <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em' }}>
            8h at 80% ▏ mark
          </span>
        </div>

        {ledgerDays.length === 0 && <p style={{ fontSize: 12.5, color: C.text3 }}>No data for this period yet.</p>}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ledgerDays.map((d, i) => {
            const key    = dateToUsStr(d);
            const rec    = calMap[key];
            const hrs    = rec ? parseHours(rec.totalHours) : 0;
            const isNow  = d.toDateString() === today.toDateString();
            const barW   = Math.min(100, (hrs / 10) * 100);
            const tint   = isNow ? C.accent : rec ? (BAR_COLOR[rec.status] ?? C.border) : C.border;
            const dayLbl = DAYS[(d.getDay() + 6) % 7];
            const cin    = rec?.clockIn  !== '-' ? rec?.clockIn  : null;
            const cout   = rec?.clockOut !== '-' ? rec?.clockOut : null;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: i < ledgerDays.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                {/* Day */}
                <div style={{ width: 56, flexShrink: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: isNow ? 600 : 500, color: isNow ? C.accent : C.text, lineHeight: 1.1 }}>
                    {dayLbl} {isNow && <span style={{ fontFamily: F_MONO, fontSize: 8.5, letterSpacing: '0.06em', color: C.accent }}>NOW</span>}
                  </div>
                  <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, marginTop: 1 }}>{MONTHS_SHORT[d.getMonth()]} {d.getDate()}</div>
                </div>
                {/* Clock in/out */}
                <div style={{ width: 96, flexShrink: 0, fontFamily: F_MONO, fontSize: 11, color: C.text2 }}>
                  {cin ? <>{cin} <span style={{ color: C.text3 }}>→</span> {cout ?? '—'}</> : <span style={{ color: C.text3 }}>—</span>}
                </div>
                {/* Bar */}
                <div style={{ flex: 1, position: 'relative', height: 12, background: C.surface2, borderRadius: 4, overflow: 'hidden' }}>
                  {hrs > 0 && <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${barW}%`, background: tint, borderRadius: 4 }} />}
                  <div style={{ position: 'absolute', top: -1, bottom: -1, left: '80%', width: 1, background: C.borderStrong, opacity: 0.5 }} />
                </div>
                {/* Hours */}
                <div style={{ width: 56, flexShrink: 0, textAlign: 'right', fontFamily: F_MONO, fontSize: 12.5, color: hrs > 0 ? tint : C.text3, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                  {hrs > 0 ? `${hrs.toFixed(2)}h` : '—'}
                </div>
              </div>
            );
          })}
          {/* Total row */}
          {ledgerDays.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px 4px', borderTop: `1.5px solid ${C.text}`, marginTop: 4 }}>
              <div style={{ width: 56, flexShrink: 0, fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total</div>
              <div style={{ width: 96, flexShrink: 0 }} />
              <div style={{ flex: 1 }} />
              <div style={{ fontFamily: F_MONO, fontSize: 14, color: C.text, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {fmtHours(hoursThisPeriod)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ tint, label, hollow }: { tint: string; label: string; hollow?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 11px', borderRadius: 999,
      background: hollow ? 'transparent' : `${tint}18`,
      border: `1px solid ${hollow ? '#e6e6e6' : tint + '44'}`,
      color: tint, fontSize: 11.5,
      fontFamily: "'Geist', system-ui, sans-serif",
      fontWeight: 500,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: tint }} />
      {label}
    </span>
  );
}
