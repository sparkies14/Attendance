'use client';

import { useState } from 'react';
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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const JP_MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const ERA_BASE = 2019; // Reiwa starts 2019

// Status visual config
const STATUS_CONFIG: Record<string, { bg: string; icon: string; label: string; textColor?: string; border?: string }> = {
  present: { bg: 'rgba(22,163,74,0.08)',    icon: '',   label: 'On time' },
  late:    { bg: 'rgba(180,83,9,0.08)',      icon: '⚠', label: 'Late'   },
  absent:  { bg: 'rgba(220,38,38,0.08)',     icon: '●', label: 'Absent' },
  leave:   { bg: 'rgba(124,58,237,0.08)',    icon: '✦', label: 'Leave'  },
  pending: { bg: 'rgba(163,163,163,0.1)',    icon: '○', label: 'Pending'},
};

const STATUS_DOT: Record<string, string> = {
  present: '#16a34a',
  late:    '#b45309',
  absent:  '#dc2626',
  leave:   '#7c3aed',
  pending: '#a3a3a3',
};

function getJST() {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return { month: jst.getMonth() + 1, year: jst.getFullYear(), day: jst.getDate() };
}

function toISO(usDate: string) {
  const [m, d, y] = usDate.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function reiwaYear(year: number) {
  return year - ERA_BASE + 1;
}

function getDOW(year: number, month: number, day: number): string {
  const dow = new Date(year, month - 1, day).getDay();
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow];
}

export default function CalendarPage({ email, initialData, apiUrl }: Props) {
  const now = getJST();
  const [month,  setMonth]      = useState(initialData?.month ?? now.month);
  const [year,   setYear]       = useState(initialData?.year  ?? now.year);
  const [data,   setData]       = useState<MemberData | null>(initialData);
  const [busy,   setBusy]       = useState(false);
  const [navErr, setNavErr]     = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [appDay,   setAppDay]   = useState<CalendarDay | null>(null);
  const [appText,  setAppText]  = useState('');
  const [appMsg,   setAppMsg]   = useState<string | null>(null);
  const [appErr,   setAppErr]   = useState<string | null>(null);
  const [appBusy,  setAppBusy]  = useState(false);

  async function navigate(m: number, y: number) {
    setNavErr(null); setBusy(true); setSelected(null); setAppDay(null);
    try {
      const r = await fetch(`${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${m}&year=${y}`, { credentials: 'include' });
      if (r.ok) { setData(await r.json()); setMonth(m); setYear(y); }
      else setNavErr('Failed to load data.');
    } finally { setBusy(false); }
  }

  function prev() { navigate(month === 1 ? 12 : month - 1, month === 1 ? year - 1 : year); }
  function next() { navigate(month === 12 ? 1 : month + 1, month === 12 ? year + 1 : year); }

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!appDay) return;
    setAppBusy(true); setAppMsg(null); setAppErr(null);
    try {
      const r = await fetch(`${apiUrl}/appeals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ target_type: 'attendance', target_id: toISO(appDay.date), reason: appText }) });
      const d = await r.json();
      if (!r.ok) setAppErr(d.error ?? 'Appeal failed.');
      else { setAppMsg('Appeal submitted.'); setAppDay(null); setAppText(''); }
    } catch { setAppErr('Network error.'); }
    finally  { setAppBusy(false); }
  }

  const calendar     = data?.calendar ?? [];
  const summary      = data?.summary;
  const leaveDays    = calendar.filter(d => d.status === 'leave').length;
  const isThisMonth  = month === now.month && year === now.year;
  const firstDow     = new Date(year, month - 1, 1).getDay();
  const cells: (CalendarDay | null)[] = [...Array(firstDow).fill(null), ...calendar];

  // Attendance rate
  const totalDays   = (summary?.present ?? 0) + (summary?.late ?? 0) + (summary?.absent ?? 0);
  const presentDays = (summary?.present ?? 0) + (summary?.late ?? 0);
  const attRate     = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  const reiwa = reiwaYear(year);

  return (
    <div>
      {/* Serif heading */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>
          My calendar.
        </div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
          Attendance history · {MONTHS[month-1].toUpperCase()} {year}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Calendar grid ── */}
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 22px 18px' }}>

            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <button onClick={prev} disabled={busy} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 14, color: C.text2 }}>←</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: F_SERIF, fontSize: 22, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {MONTHS[month-1]} <span style={{ fontStyle: 'italic' }}>{year}</span>
                </div>
                <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.06em', marginTop: 4 }}>
                  令和{reiwa}年{JP_MONTHS[month-1]} · Reiwa {reiwa}
                </div>
              </div>
              <button onClick={next} disabled={busy} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 14, color: C.text2 }}>→</button>
            </div>

            {navErr && <p style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>{navErr}</p>}

            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 0' }}>{d}</div>
              ))}
            </div>

            {/* Grid */}
            {busy ? (
              <div style={{ textAlign: 'center', padding: '40px', fontSize: 13, color: C.text3 }}>Loading…</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                {cells.map((cell, i) => {
                  if (!cell) return <div key={`pad-${i}`} />;
                  const isToday   = isThisMonth && cell.day === now.day && !cell.isWeekend;
                  const config    = STATUS_CONFIG[cell.status];
                  const isSel     = selected?.day === cell.day;
                  const isFuture  = isThisMonth && cell.day > now.day;
                  const canSelect = !cell.isWeekend;

                  // Cell background
                  const cellBg = isToday ? C.text : cell.isWeekend ? 'transparent' : (config?.bg ?? 'transparent');
                  const textCol = isToday ? '#fafafa' : cell.isWeekend ? C.text3 : C.text;

                  return (
                    <div
                      key={cell.day}
                      onClick={() => { if (canSelect) setSelected(isSel ? null : cell); }}
                      style={{
                        position: 'relative',
                        padding: '8px 6px 6px',
                        borderRadius: 10,
                        cursor: canSelect ? 'pointer' : 'default',
                        background: cellBg,
                        border: isSel ? `1.5px solid ${C.accent}` : `1.5px solid ${cell.isWeekend ? 'transparent' : 'transparent'}`,
                        opacity: isFuture ? 0.5 : 1,
                        minHeight: 62,
                      }}
                    >
                      {/* Day number row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: isToday ? 600 : 500, color: textCol, fontFamily: F_SANS, lineHeight: 1 }}>
                          {cell.day}
                        </span>
                        {isToday && (
                          <span style={{ fontFamily: F_MONO, fontSize: 7.5, letterSpacing: '0.08em', color: C.accent, background: 'rgba(244,185,66,0.15)', padding: '1px 4px', borderRadius: 3 }}>NOW</span>
                        )}
                        {!isToday && config?.icon && (
                          <span style={{ fontSize: 10, color: STATUS_DOT[cell.status] ?? C.text3 }}>{config.icon}</span>
                        )}
                      </div>
                      {/* Clock-in time */}
                      {!cell.isWeekend && cell.clockIn && cell.clockIn !== '-' && (
                        <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: isToday ? 'rgba(255,255,255,0.7)' : C.text3, letterSpacing: '0.02em', lineHeight: 1.2 }}>
                          {cell.clockIn}
                        </div>
                      )}
                      {/* Hours */}
                      {!cell.isWeekend && cell.totalHours && cell.totalHours !== '-' && parseFloat(String(cell.totalHours)) > 0 && (
                        <div style={{ fontFamily: F_MONO, fontSize: 9, color: isToday ? 'rgba(255,255,255,0.6)' : STATUS_DOT[cell.status] ?? C.text3, marginTop: 1, lineHeight: 1 }}>
                          {parseFloat(String(cell.totalHours)).toFixed(1)}h
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.04em' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_DOT[k] ?? C.text3, display: 'inline-block' }} />
                  {v.label}
                </span>
              ))}
            </div>
          </div>

          {/* Appeal success */}
          {appMsg && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 10, fontSize: 13, color: C.green }}>
              {appMsg}
            </div>
          )}

          {/* Selected day detail */}
          {selected && (
            <div style={{ marginTop: 12, background: C.surface, border: `1px solid ${C.border}`, borderTopColor: C.accent, borderTopWidth: 2, borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: F_SERIF, fontSize: 18, color: C.text, letterSpacing: '-0.015em' }}>
                    {MONTHS[month-1]} {selected.day}, {year}
                    <span style={{ fontFamily: F_MONO, fontSize: 10, marginLeft: 10, color: C.text3 }}>
                      {getDOW(year, month, selected.day).toUpperCase()}
                    </span>
                  </div>
                  {selected.status && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, padding: '3px 9px', borderRadius: 999, background: STATUS_CONFIG[selected.status]?.bg ?? C.surface2 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_DOT[selected.status] ?? C.text3 }} />
                      <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: STATUS_DOT[selected.status] ?? C.text3, letterSpacing: '0.04em' }}>
                        {STATUS_CONFIG[selected.status]?.label ?? selected.status}
                      </span>
                    </div>
                  )}
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.text3, padding: '2px 4px', lineHeight: 1 }}>×</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { lbl: 'Clock in',   val: selected.clockIn  !== '-' ? selected.clockIn  : '—' },
                  { lbl: 'Clock out',  val: selected.clockOut !== '-' ? selected.clockOut : '—' },
                  { lbl: 'Total hours',val: selected.totalHours !== '-' ? String(selected.totalHours) + 'h' : '—' },
                  { lbl: 'Status',     val: STATUS_CONFIG[selected.status]?.label ?? selected.status },
                ].map(({ lbl, val }) => (
                  <div key={lbl} style={{ background: C.surface2, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{lbl}</div>
                    <div style={{ fontFamily: F_MONO, fontSize: 14, color: C.text, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{val || '—'}</div>
                  </div>
                ))}
              </div>

              {/* Appeal button */}
              {(selected.status === 'absent' || selected.status === 'late' || selected.status === 'pending') && !appDay && (
                <button
                  onClick={() => { setAppDay(selected); setAppErr(null); setAppMsg(null); }}
                  style={{ padding: '7px 14px', background: C.surface, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer' }}
                >
                  Submit appeal for this day
                </button>
              )}

              {/* Appeal form */}
              {appDay?.day === selected.day && (
                <div style={{ marginTop: 12, padding: '14px 16px', background: C.accentSoft, border: `1px solid ${C.accentBorder}`, borderRadius: 10 }}>
                  <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Appeal — {appDay.date}</div>
                  {appErr && <p style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{appErr}</p>}
                  <form onSubmit={submitAppeal}>
                    <textarea
                      value={appText} onChange={e => setAppText(e.target.value)} required rows={3}
                      placeholder="Explain why this record should be reviewed…"
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.accentBorder}`, borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, resize: 'vertical', boxSizing: 'border-box', background: C.surface }}
                    />
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <button type="submit" disabled={appBusy} style={{ padding: '7px 14px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, fontWeight: 500, cursor: appBusy ? 'not-allowed' : 'pointer' }}>
                        {appBusy ? 'Submitting…' : 'Submit appeal'}
                      </button>
                      <button type="button" onClick={() => setAppDay(null)} style={{ padding: '7px 14px', background: C.surface, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right: May at a glance ── */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 20px' }}>
            <div style={{ fontFamily: F_SERIF, fontSize: 16, color: C.text, letterSpacing: '-0.01em', marginBottom: 2 }}>
              {MONTHS[month-1]} at a glance.
            </div>
            <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 18 }}>{year}</div>

            {summary ? (
              <>
                {/* Big attendance number */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontFamily: F_SERIF, fontSize: 56, color: attRate >= 90 ? C.green : attRate >= 70 ? C.accent : C.red, letterSpacing: '-0.03em', lineHeight: 0.85 }}>{attRate}</span>
                  <span style={{ fontFamily: F_SERIF, fontSize: 24, color: C.text3, letterSpacing: '-0.02em' }}>%</span>
                </div>
                {/* Color bar */}
                <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', marginBottom: 16, gap: 1 }}>
                  {totalDays > 0 && summary.present > 0 && <div style={{ flex: summary.present, background: C.green, borderRadius: '999px 0 0 999px' }} />}
                  {totalDays > 0 && summary.late    > 0 && <div style={{ flex: summary.late,    background: C.accent }} />}
                  {totalDays > 0 && summary.absent  > 0 && <div style={{ flex: summary.absent,  background: C.red }} />}
                  {leaveDays                         > 0 && <div style={{ flex: leaveDays,       background: C.purple, borderRadius: '0 999px 999px 0' }} />}
                </div>

                {[
                  { lbl: 'Present',  val: summary.present, dot: C.green  },
                  { lbl: 'Late',     val: summary.late,    dot: C.accent },
                  { lbl: 'Absent',   val: summary.absent,  dot: C.red    },
                  { lbl: 'Leave',    val: leaveDays,        dot: C.purple },
                  { lbl: 'Pending',  val: summary.pending, dot: C.text3  },
                ].map(({ lbl, val, dot }) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.text2, fontFamily: F_SANS }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: dot, display: 'inline-block', flexShrink: 0 }} />
                      {lbl}
                    </span>
                    <span style={{ fontFamily: F_MONO, fontSize: 13, fontWeight: 500, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                  </div>
                ))}
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: C.text3 }}>No data for this month.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
