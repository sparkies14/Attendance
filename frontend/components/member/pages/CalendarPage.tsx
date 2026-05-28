'use client';

import { useState } from 'react';
import type { MemberData, CalendarDay } from '../MemberDashboard';

interface Props {
  email: string;
  initialData: MemberData | null;
  apiUrl: string;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const STATUS: Record<string, { bg: string; dot: string; text: string }> = {
  present: { bg: '#f0fdf4', dot: '#22c55e', text: 'On time'  },
  late:    { bg: '#fffbeb', dot: '#f59e0b', text: 'Late'     },
  absent:  { bg: '#fef2f2', dot: '#ef4444', text: 'Absent'   },
  leave:   { bg: '#f5f3ff', dot: '#8b5cf6', text: 'Leave'    },
  pending: { bg: '#f9fafb', dot: '#9ca3af', text: 'Pending'  },
};

function getJST() {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return { month: jst.getMonth() + 1, year: jst.getFullYear(), day: jst.getDate() };
}

function toISO(usDate: string) {
  const [m, d, y] = usDate.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

export default function CalendarPage({ email, initialData, apiUrl }: Props) {
  const now = getJST();
  const [month,  setMonth]       = useState(initialData?.month ?? now.month);
  const [year,   setYear]        = useState(initialData?.year  ?? now.year);
  const [data,   setData]        = useState<MemberData | null>(initialData);
  const [busy,   setBusy]        = useState(false);
  const [navErr, setNavErr]      = useState<string | null>(null);

  const [selected, setSelected]  = useState<CalendarDay | null>(null);
  const [appDay,   setAppDay]    = useState<CalendarDay | null>(null);
  const [appText,  setAppText]   = useState('');
  const [appMsg,   setAppMsg]    = useState<string | null>(null);
  const [appErr,   setAppErr]    = useState<string | null>(null);
  const [appBusy,  setAppBusy]   = useState(false);

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

  const calendar  = data?.calendar ?? [];
  const summary   = data?.summary;
  // Sunday-first offset
  const firstDow  = new Date(year, month - 1, 1).getDay();
  const cells: (CalendarDay | null)[] = [...Array(firstDow).fill(null), ...calendar];
  const isThisMonth = month === now.month && year === now.year;

  const label: React.CSSProperties = { fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.1em' };
  const card: React.CSSProperties  = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.25rem' };

  // Leave count from leaveHistory
  const leaveDays = calendar.filter(d => d.status === 'leave').length;

  return (
    <div>
      <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#111', margin: '0 0 0.25rem', lineHeight: 1.1 }}>My calendar.</h2>
      <p style={{ ...label, marginBottom: '1.5rem' }}>Attendance history · {MONTHS[month - 1].toUpperCase()} {year}</p>

      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>

        {/* ── Calendar ── */}
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <div style={{ ...card }}>
            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <button onClick={prev} disabled={busy} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 7, padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}>←</button>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111' }}>{MONTHS[month - 1]} {year}</span>
              <button onClick={next} disabled={busy} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 7, padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}>→</button>
            </div>

            {navErr && <p style={{ fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.75rem' }}>{navErr}</p>}

            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {DAYS_SHORT.map(d => (
                <div key={d} style={{ textAlign: 'center', ...label, padding: '0.3rem 0' }}>{d}</div>
              ))}
            </div>

            {/* Grid */}
            {busy ? (
              <p style={{ textAlign: 'center', padding: '2rem', fontSize: '0.85rem', color: '#9ca3af' }}>Loading…</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                {cells.map((cell, i) => {
                  if (!cell) return <div key={`pad-${i}`} />;
                  const isToday  = isThisMonth && cell.day === now.day && !cell.isWeekend;
                  const info     = STATUS[cell.status];
                  const canSelect = !cell.isWeekend;
                  const isSel    = selected?.day === cell.day;
                  const canAppeal = canSelect && (cell.status === 'absent' || cell.status === 'late' || cell.status === 'pending');

                  return (
                    <div
                      key={cell.day}
                      onClick={() => { if (canSelect) setSelected(isSel ? null : cell); }}
                      style={{
                        padding: '0.5rem 0.25rem 0.4rem',
                        textAlign: 'center',
                        borderRadius: 9,
                        cursor: canSelect ? 'pointer' : 'default',
                        backgroundColor: isSel ? '#f0fdf4' : cell.isWeekend ? 'transparent' : (info?.bg ?? 'transparent'),
                        border: isSel ? '1.5px solid #22c55e' : '1.5px solid transparent',
                        transition: 'background 0.1s',
                      }}
                    >
                      {isToday ? (
                        <div style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 3px' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff' }}>{cell.day}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.82rem', fontWeight: 500, color: cell.isWeekend ? '#d1d5db' : '#374151', marginBottom: 3 }}>{cell.day}</div>
                      )}
                      {!cell.isWeekend && info && (
                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: info.dot, margin: '0 auto' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              {Object.entries(STATUS).map(([k, v]) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem', color: '#6b7280' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: v.dot, display: 'inline-block' }} />
                  {v.text}
                </span>
              ))}
            </div>
          </div>

          {/* Appeal success */}
          {appMsg && (
            <div style={{ marginTop: '1rem', padding: '0.65rem 0.875rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: '0.8rem', color: '#16a34a' }}>
              {appMsg}
            </div>
          )}

          {/* Selected day detail */}
          {selected && (
            <div style={{ ...card, marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <div style={{ ...label, marginBottom: '0.25rem' }}>Selected day</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111' }}>
                    {MONTHS[month - 1]} {selected.day}, {year}
                    {selected.status && (
                      <span style={{ marginLeft: '0.65rem', fontSize: '0.7rem', fontWeight: 700, color: STATUS[selected.status]?.dot ?? '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {STATUS[selected.status]?.text ?? selected.status}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#9ca3af', padding: '0.25rem' }}>×</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                {[
                  { lbl: 'Clock in',   val: selected.clockIn   },
                  { lbl: 'Clock out',  val: selected.clockOut  },
                  { lbl: 'Total hours',val: String(selected.totalHours) },
                  { lbl: 'Status',     val: STATUS[selected.status]?.text ?? selected.status },
                ].map(({ lbl, val }) => (
                  <div key={lbl} style={{ backgroundColor: '#f9fafb', borderRadius: 10, padding: '0.75rem' }}>
                    <div style={{ ...label, marginBottom: '0.3rem' }}>{lbl}</div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#111', fontFamily: 'monospace' }}>{val || '—'}</div>
                  </div>
                ))}
              </div>

              {/* Appeal button */}
              {(selected.status === 'absent' || selected.status === 'late' || selected.status === 'pending') && !appDay && (
                <button
                  onClick={() => { setAppDay(selected); setAppErr(null); setAppMsg(null); }}
                  style={{ padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Submit appeal for this day
                </button>
              )}

              {/* Appeal form */}
              {appDay?.day === selected.day && (
                <div style={{ marginTop: '0.75rem', padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                  <div style={{ ...label, marginBottom: '0.5rem' }}>Appeal — {appDay.date}</div>
                  {appErr && <p style={{ fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.5rem' }}>{appErr}</p>}
                  <form onSubmit={submitAppeal}>
                    <textarea
                      value={appText} onChange={e => setAppText(e.target.value)} required rows={3}
                      placeholder="Explain why this record should be reviewed…"
                      style={{ width: '100%', padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.8rem', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                      <button type="submit" disabled={appBusy} style={{ padding: '0.5rem 1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, cursor: appBusy ? 'not-allowed' : 'pointer' }}>
                        {appBusy ? 'Submitting…' : 'Submit appeal'}
                      </button>
                      <button type="button" onClick={() => setAppDay(null)} style={{ padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Stats panel ── */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={card}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111', marginBottom: '0.2rem' }}>
              {MONTHS[month - 1]} at a glance.
            </div>
            <div style={{ ...label, marginBottom: '1rem' }}>{year}</div>

            {summary ? (
              <>
                {[
                  { lbl: 'Present',  val: summary.present,                         color: '#22c55e' },
                  { lbl: 'Late',     val: summary.late,                            color: '#f59e0b' },
                  { lbl: 'Absent',   val: summary.absent,                          color: '#ef4444' },
                  { lbl: 'Leave',    val: leaveDays,                               color: '#8b5cf6' },
                  { lbl: 'Pending',  val: summary.pending,                         color: '#9ca3af' },
                ].map(({ lbl, val, color }) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#374151' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0 }} />
                      {lbl}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: '#111' }}>{val}</span>
                  </div>
                ))}
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ ...label, marginBottom: '0.4rem' }}>Attendance rate</div>
                  {(() => {
                    const total   = summary.present + summary.late + summary.absent;
                    const present = summary.present + summary.late;
                    const pct     = total > 0 ? Math.round((present / total) * 100) : 0;
                    return (
                      <>
                        <div style={{ fontFamily: 'monospace', fontSize: '1.4rem', fontWeight: 800, color: '#111', lineHeight: 1 }}>{pct}%</div>
                        <div style={{ height: 5, backgroundColor: '#f3f4f6', borderRadius: 999, marginTop: '0.4rem' }}>
                          <div style={{ height: '100%', width: `${pct}%`, backgroundColor: pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444', borderRadius: 999 }} />
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            ) : (
              <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No data for this month.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
