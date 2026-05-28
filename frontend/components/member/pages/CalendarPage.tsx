'use client';

import { clientFetch } from '@/lib/clientFetch';
import { useState, useEffect } from 'react';
import type { MemberData, CalendarDay, PlanEvent } from '../MemberDashboard';

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
  blue: '#2563eb',
};

const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const JP_MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const ERA_BASE = 2019;

const STATUS_CONFIG: Record<string, { bg: string; icon: string; label: string }> = {
  present: { bg: 'rgba(22,163,74,0.08)',  icon: '',  label: 'On time' },
  late:    { bg: 'rgba(180,83,9,0.08)',   icon: '⚠', label: 'Late'   },
  absent:  { bg: 'rgba(220,38,38,0.08)', icon: '●', label: 'Absent' },
  leave:   { bg: 'rgba(124,58,237,0.08)',icon: '✦', label: 'Leave'  },
  pending: { bg: 'rgba(163,163,163,0.1)',icon: '○', label: 'Pending'},
};

const STATUS_DOT: Record<string, string> = {
  present: '#16a34a', late: '#b45309', absent: '#dc2626', leave: '#7c3aed', pending: '#a3a3a3',
};

const PRIO_COLOR: Record<string, string> = { p1: '#dc2626', p2: '#b45309', p3: '#a3a3a3' };
const PRIO_LABEL: Record<string, string> = { p1: 'P1', p2: 'P2', p3: 'P3' };

function getJST() {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return { month: jst.getMonth() + 1, year: jst.getFullYear(), day: jst.getDate() };
}

function toISO(usDate: string) {
  const [m, d, y] = usDate.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function reiwaYear(year: number) { return year - ERA_BASE + 1; }

function getDOW(year: number, month: number, day: number): string {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(year, month - 1, day).getDay()];
}

function formatPlanDate(isoDate: string, todayISO: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(y, m - 1, d).getDay()];
  if (isoDate === todayISO) return `Today · ${MONTHS[m - 1]} ${d}`;
  return `${dow} · ${MONTHS[m - 1]} ${d}`;
}

export default function CalendarPage({ email, initialData, apiUrl }: Props) {
  const now = getJST();
  const todayISO = `${now.year}-${String(now.month).padStart(2,'0')}-${String(now.day).padStart(2,'0')}`;

  const [mode,    setMode]    = useState<'plan'|'recap'>('plan');
  const [month,   setMonth]   = useState(initialData?.month ?? now.month);
  const [year,    setYear]    = useState(initialData?.year  ?? now.year);
  const [data,    setData]    = useState<MemberData | null>(initialData);
  const [busy,    setBusy]    = useState(false);
  const [navErr,  setNavErr]  = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarDay | null>(null);

  // Appeal state (recap mode)
  const [appDay,  setAppDay]  = useState<CalendarDay | null>(null);
  const [appText, setAppText] = useState('');
  const [appMsg,  setAppMsg]  = useState<string | null>(null);
  const [appErr,  setAppErr]  = useState<string | null>(null);
  const [appBusy, setAppBusy] = useState(false);

  // Plan events state
  const [planDate,     setPlanDate]     = useState(todayISO);
  const [events,       setEvents]       = useState<PlanEvent[]>([]);
  const [eventsBusy,   setEventsBusy]   = useState(false);
  const [eventErr,     setEventErr]     = useState<string | null>(null);
  const [addTitle,     setAddTitle]     = useState('');
  const [addStart,     setAddStart]     = useState('09:00');
  const [addEnd,       setAddEnd]       = useState('10:00');
  const [addPriority,  setAddPriority]  = useState<'p1'|'p2'|'p3'>('p2');
  const [addTag,       setAddTag]       = useState('');
  const [addBusy,      setAddBusy]      = useState(false);
  const [showAddForm,  setShowAddForm]  = useState(false);

  useEffect(() => { fetchEvents(todayISO); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function navigate(m: number, y: number) {
    setNavErr(null); setBusy(true); setSelected(null); setAppDay(null);
    try {
      const r = await clientFetch(`${apiUrl}/webhook/member-data?email=${encodeURIComponent(email)}&month=${m}&year=${y}`, {});
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
      const r = await clientFetch(`${apiUrl}/appeals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: 'attendance', target_id: toISO(appDay.date), reason: appText }),
      });
      const d = await r.json();
      if (!r.ok) setAppErr(d.error ?? 'Appeal failed.');
      else { setAppMsg('Appeal submitted.'); setAppDay(null); setAppText(''); }
    } catch { setAppErr('Network error.'); }
    finally  { setAppBusy(false); }
  }

  async function fetchEvents(isoDate: string) {
    setPlanDate(isoDate); setEventsBusy(true); setEventErr(null); setEvents([]);
    try {
      const r = await clientFetch(`${apiUrl}/plan-events?date=${isoDate}`);
      if (r.ok) setEvents((await r.json()).events ?? []);
      else setEventErr('Could not load plan.');
    } catch { setEventErr('Network error.'); }
    finally  { setEventsBusy(false); }
  }

  async function addEvent(keepForm: boolean) {
    if (!addTitle.trim()) return;
    setAddBusy(true);
    try {
      const r = await clientFetch(`${apiUrl}/plan-events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: planDate, title: addTitle.trim(), start_time: addStart, end_time: addEnd, priority: addPriority, tag: addTag.trim() || null }),
      });
      if (r.ok) {
        const { event } = await r.json();
        setEvents(prev => [...prev, event].sort((a, b) => a.start_time.localeCompare(b.start_time)));
        setAddTitle(''); setAddTag('');
        if (!keepForm) { setShowAddForm(false); setAddStart('09:00'); setAddEnd('10:00'); setAddPriority('p2'); }
      } else { setEventErr('Could not save event.'); }
    } catch { setEventErr('Network error.'); }
    finally  { setAddBusy(false); }
  }

  async function toggleEvent(id: number, completed: boolean) {
    try {
      const r = await clientFetch(`${apiUrl}/plan-events/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      if (r.ok) {
        const { event } = await r.json();
        setEvents(prev => prev.map(e => e.id === id ? event : e));
      } else { setEventErr('Could not update event.'); }
    } catch { setEventErr('Network error.'); }
  }

  async function deleteEvent(id: number) {
    try {
      const r = await clientFetch(`${apiUrl}/plan-events/${id}`, { method: 'DELETE' });
      if (r.ok) setEvents(prev => prev.filter(e => e.id !== id));
      else setEventErr('Could not delete event.');
    } catch { setEventErr('Network error.'); }
  }

  // Derived
  const calendar    = data?.calendar ?? [];
  const summary     = data?.summary;
  const leaveDays   = calendar.filter(d => d.status === 'leave').length;
  const isThisMonth = month === now.month && year === now.year;
  const firstDow    = new Date(year, month - 1, 1).getDay();
  const cells: (CalendarDay | null)[] = [...Array(firstDow).fill(null), ...calendar];
  const totalDays   = (summary?.present ?? 0) + (summary?.late ?? 0) + (summary?.absent ?? 0);
  const presentDays = (summary?.present ?? 0) + (summary?.late ?? 0);
  const attRate     = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
  const reiwa       = reiwaYear(year);
  const doneCount   = events.filter(e => e.completed).length;

  function handleDayClick(cell: CalendarDay) {
    if (cell.isWeekend) return;
    const iso = toISO(cell.date);
    if (mode === 'plan') {
      if (planDate === iso) {
        fetchEvents(todayISO);
        setSelected(null);
      } else {
        setSelected(cell);
        fetchEvents(iso);
        setShowAddForm(false);
      }
    } else {
      if (selected?.day === cell.day) {
        setSelected(null);
      } else {
        setSelected(cell);
        setAppDay(null); setAppMsg(null); setAppErr(null);
      }
    }
  }

  function switchMode(next: 'plan' | 'recap') {
    setMode(next);
    setSelected(null);
    setAppDay(null); setAppMsg(null); setAppErr(null);
    if (next === 'plan') fetchEvents(planDate);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const planLabel = formatPlanDate(planDate, todayISO);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>
            My calendar.
          </div>
          <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
            Personal attendance + daily plan · JST
          </div>
        </div>
        {/* Recap / Plan toggle */}
        <div style={{ display: 'flex', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: 3 }}>
          <button
            onClick={() => switchMode('recap')}
            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: F_SANS, fontSize: 12, fontWeight: mode === 'recap' ? 500 : 400, background: mode === 'recap' ? C.text : 'transparent', color: mode === 'recap' ? C.surface : C.text3, transition: 'all 0.15s' }}
          >Recap</button>
          <button
            onClick={() => switchMode('plan')}
            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: F_SANS, fontSize: 12, fontWeight: mode === 'plan' ? 500 : 400, background: mode === 'plan' ? C.text : 'transparent', color: mode === 'plan' ? C.surface : C.text3, transition: 'all 0.15s' }}
          >Plan</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>

        {/* ── Calendar card ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 22px 18px' }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <button onClick={prev} disabled={busy} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 14, color: C.text2 }}>←</button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: F_SERIF, fontSize: 22, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {MONTHS[month-1]} <span style={{ fontStyle: 'italic' }}>{year}</span>
              </div>
              <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.06em', marginTop: 4 }}>
                令和{reiwa}年{JP_MONTHS[month-1]} · {summary ? `${(summary.present + summary.late)} of ${totalDays + leaveDays} days` : 'Reiwa ' + reiwa}
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
                const iso       = toISO(cell.date);
                const isToday   = isThisMonth && cell.day === now.day && !cell.isWeekend;
                const config    = STATUS_CONFIG[cell.status];
                const isFuture  = isThisMonth && cell.day > now.day;
                const isPlanSel = mode === 'plan' && planDate === iso && !cell.isWeekend;
                const isRecapSel = mode === 'recap' && selected?.day === cell.day;
                const isHighlit = isPlanSel || isRecapSel;
                const cellBg    = isToday ? C.text : cell.isWeekend ? 'transparent' : (config?.bg ?? 'transparent');
                const textCol   = isToday ? '#fafafa' : cell.isWeekend ? C.text3 : C.text;

                return (
                  <div
                    key={cell.day}
                    onClick={() => handleDayClick(cell)}
                    style={{
                      position: 'relative', padding: '8px 6px 6px', borderRadius: 10,
                      cursor: cell.isWeekend ? 'default' : 'pointer',
                      background: cellBg,
                      border: isHighlit ? `1.5px solid ${C.accent}` : '1.5px solid transparent',
                      opacity: isFuture ? 0.5 : 1,
                      minHeight: 62,
                    }}
                  >
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
                    {!cell.isWeekend && cell.clockIn && cell.clockIn !== '-' && (
                      <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: isToday ? 'rgba(255,255,255,0.7)' : C.text3, letterSpacing: '0.02em', lineHeight: 1.2 }}>
                        {cell.clockIn}
                      </div>
                    )}
                    {!cell.isWeekend && cell.totalHours && cell.totalHours !== '-' && parseFloat(String(cell.totalHours)) > 0 && (
                      <div style={{ fontFamily: F_MONO, fontSize: 9, color: isToday ? 'rgba(255,255,255,0.6)' : STATUS_DOT[cell.status] ?? C.text3, marginTop: 1, lineHeight: 1 }}>
                        {parseFloat(String(cell.totalHours)).toFixed(1)}h
                      </div>
                    )}
                    {!cell.isWeekend && (data?.planEventsByDate?.[iso] ?? 0) > 0 && (
                      <div style={{ position: 'absolute', bottom: 5, right: 6, width: 5, height: 5, borderRadius: '50%', background: isToday ? 'rgba(255,255,255,0.6)' : C.purple }} />
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
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.04em' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.purple, display: 'inline-block' }} />
              Has plans
            </span>
          </div>
        </div>

        {/* ── Right rail ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {mode === 'plan' ? (
            <>
              {/* ── Plan card ── */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', position: 'relative' }}>
                {/* Accent top bar */}
                <div style={{ position: 'absolute', top: 0, left: 20, right: 20, height: 2, background: C.accent, borderRadius: '0 0 2px 2px' }} />

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                  <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.accent, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Today's plan</div>
                  <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em' }}>{doneCount}/{events.length} done</div>
                </div>
                <div style={{ fontFamily: F_SERIF, fontSize: 24, color: C.text, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 12 }}>
                  {planLabel}
                </div>

                {/* Progress bar */}
                {events.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ height: 4, borderRadius: 999, background: C.border, overflow: 'hidden' }}>
                      <div style={{ width: `${events.length > 0 ? (doneCount / events.length) * 100 : 0}%`, height: '100%', background: `linear-gradient(90deg, ${C.accent}, ${C.green})`, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )}

                {/* Quick-add prompt */}
                {!showAddForm && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 11px', borderRadius: 9, background: C.surface2, border: `1px dashed ${C.borderStrong}`, marginBottom: events.length > 0 ? 12 : 0, cursor: 'text', textAlign: 'left' }}
                  >
                    <span style={{ fontFamily: F_MONO, fontSize: 13, color: C.text3 }}>+</span>
                    <span style={{ fontSize: 12.5, color: C.text3, flex: 1 }}>Add a task…</span>
                    <span style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.08em', padding: '2px 6px', border: `1px solid ${C.border}`, borderRadius: 4 }}>⏎</span>
                  </button>
                )}

                {/* Add form */}
                {showAddForm && (
                  <div style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 10, padding: 14, marginBottom: events.length > 0 ? 12 : 0 }}>
                    <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.purple, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>New task</div>
                    <input
                      autoFocus
                      value={addTitle}
                      onChange={e => setAddTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && addTitle.trim()) addEvent(false); }}
                      placeholder="What are you doing?"
                      style={{ width: '100%', padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, background: C.surface, color: C.text, outline: 'none', marginBottom: 8, boxSizing: 'border-box' as const }}
                    />
                    {/* Time row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.06em', flexShrink: 0 }}>FROM</span>
                      <input type="time" value={addStart} onChange={e => setAddStart(e.target.value)} style={{ padding: '5px 8px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, fontFamily: F_MONO, background: C.surface, color: C.text }} />
                      <span style={{ color: C.text3, fontSize: 11 }}>→</span>
                      <span style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.06em', flexShrink: 0 }}>TO</span>
                      <input type="time" value={addEnd} onChange={e => setAddEnd(e.target.value)} style={{ padding: '5px 8px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, fontFamily: F_MONO, background: C.surface, color: C.text }} />
                    </div>
                    {/* Priority + tag row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['p1','p2','p3'] as const).map(p => (
                          <button
                            key={p}
                            onClick={() => setAddPriority(p)}
                            style={{ padding: '4px 9px', border: `1.5px solid ${addPriority === p ? PRIO_COLOR[p] : C.border}`, borderRadius: 6, fontSize: 11, fontFamily: F_MONO, fontWeight: 600, background: addPriority === p ? PRIO_COLOR[p] + '18' : 'transparent', color: addPriority === p ? PRIO_COLOR[p] : C.text3, cursor: 'pointer' }}
                          >{PRIO_LABEL[p]}</button>
                        ))}
                      </div>
                      <input
                        value={addTag}
                        onChange={e => setAddTag(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())}
                        placeholder="#tag"
                        style={{ flex: 1, padding: '4px 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11.5, fontFamily: F_MONO, background: C.surface, color: C.text, outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => addEvent(false)} disabled={addBusy || !addTitle.trim()} style={{ padding: '6px 12px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: F_SANS, fontWeight: 500, cursor: addBusy ? 'not-allowed' : 'pointer' }}>
                        {addBusy ? '…' : 'Save'}
                      </button>
                      <button onClick={() => addEvent(true)} disabled={addBusy || !addTitle.trim()} style={{ padding: '6px 12px', background: 'rgba(124,58,237,0.08)', color: C.purple, border: `1px solid rgba(124,58,237,0.2)`, borderRadius: 8, fontSize: 12, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer' }}>
                        Save + add another
                      </button>
                      <button onClick={() => { setShowAddForm(false); setAddTitle(''); setAddStart('09:00'); setAddEnd('10:00'); setAddPriority('p2'); setAddTag(''); }} style={{ padding: '6px 10px', background: 'transparent', color: C.text2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: F_SANS, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Events list */}
                {eventErr && <p style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{eventErr}</p>}
                {eventsBusy && <p style={{ fontSize: 12, color: C.text3 }}>Loading…</p>}

                {!eventsBusy && events.length === 0 && !showAddForm && (
                  <p style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>No tasks planned for this day.</p>
                )}

                {!eventsBusy && events.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {events.map((ev, i) => (
                      <div
                        key={ev.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', borderBottom: i < events.length - 1 ? `1px solid ${C.border}` : 'none', opacity: ev.completed ? 0.55 : 1 }}
                      >
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleEvent(ev.id, !ev.completed)}
                          style={{ width: 16, height: 16, borderRadius: 4, border: ev.completed ? 'none' : `1.5px solid ${C.borderStrong}`, background: ev.completed ? C.green : 'transparent', color: '#fff', fontSize: 10, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {ev.completed && '✓'}
                        </button>
                        {/* Priority dot */}
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: PRIO_COLOR[ev.priority ?? 'p2'], flexShrink: 0 }} />
                        {/* Title */}
                        <span style={{ flex: 1, fontSize: 12.5, color: ev.completed ? C.text3 : C.text, textDecoration: ev.completed ? 'line-through' : 'none', textDecorationColor: C.text3, textDecorationThickness: '1px', lineHeight: 1.3 }}>
                          {ev.title}
                        </span>
                        {/* Tag */}
                        {ev.tag && (
                          <span style={{ fontFamily: F_MONO, fontSize: 9, color: C.text3, letterSpacing: '0.06em', padding: '1px 6px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4 }}>#{ev.tag}</span>
                        )}
                        {/* Time */}
                        <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{ev.start_time}</span>
                        {/* Delete */}
                        <button onClick={() => deleteEvent(ev.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: C.text3, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── At a glance (plan mode) ── */}
              <AtAGlanceCard summary={summary} attRate={attRate} totalDays={totalDays} leaveDays={leaveDays} month={month} year={year} />
            </>
          ) : (
            <>
              {/* ── At a glance (recap mode) ── */}
              <AtAGlanceCard summary={summary} attRate={attRate} totalDays={totalDays} leaveDays={leaveDays} month={month} year={year} />

              {/* ── Selected day detail ── */}
              {selected ? (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderTopColor: C.accent, borderTopWidth: 2, borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: F_SERIF, fontSize: 18, color: C.text, letterSpacing: '-0.015em' }}>
                        {MONTHS[month-1]} {selected.day}, {year}
                        <span style={{ fontFamily: F_MONO, fontSize: 10, marginLeft: 10, color: C.text3 }}>
                          {getDOW(year, month, selected.day).toUpperCase()}
                        </span>
                      </div>
                      {selected.status && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, padding: '3px 9px', borderRadius: 999, background: STATUS_CONFIG[selected.status]?.bg ?? C.surface2 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_DOT[selected.status] ?? C.text3 }} />
                          <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: STATUS_DOT[selected.status] ?? C.text3, letterSpacing: '0.04em' }}>
                            {STATUS_CONFIG[selected.status]?.label ?? selected.status}
                          </span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.text3, padding: '2px 4px', lineHeight: 1 }}>×</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
                    {[
                      { lbl: 'Clock in',    val: selected.clockIn    !== '-' ? selected.clockIn    : '—' },
                      { lbl: 'Clock out',   val: selected.clockOut   !== '-' ? selected.clockOut   : '—' },
                      { lbl: 'Total hours', val: selected.totalHours !== '-' ? String(selected.totalHours) + 'h' : '—' },
                      { lbl: 'Status',      val: STATUS_CONFIG[selected.status]?.label ?? selected.status },
                    ].map(({ lbl, val }) => (
                      <div key={lbl} style={{ background: C.surface2, borderRadius: 9, padding: '9px 11px' }}>
                        <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{lbl}</div>
                        <div style={{ fontFamily: F_MONO, fontSize: 13, color: C.text, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{val || '—'}</div>
                      </div>
                    ))}
                  </div>

                  {/* Appeal */}
                  {appMsg && (
                    <div style={{ padding: '9px 12px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 9, fontSize: 12.5, color: C.green, marginBottom: 10 }}>{appMsg}</div>
                  )}
                  {(selected.status === 'absent' || selected.status === 'late' || selected.status === 'pending') && !appDay && !appMsg && (
                    <button
                      onClick={() => { setAppDay(selected); setAppErr(null); setAppMsg(null); }}
                      style={{ padding: '7px 14px', background: C.surface, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer' }}
                    >Submit appeal for this day</button>
                  )}
                  {appDay?.day === selected.day && (
                    <div style={{ marginTop: 10, padding: '12px 14px', background: C.accentSoft, border: `1px solid ${C.accentBorder}`, borderRadius: 9 }}>
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
              ) : (
                <div style={{ padding: '16px 18px', background: C.surface2, border: `1px dashed ${C.border}`, borderRadius: 12, fontSize: 12.5, color: C.text3, textAlign: 'center' }}>
                  Click a day to see attendance detail
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── At a Glance card (shared between modes) ─────────────────────────────────
function AtAGlanceCard({ summary, attRate, totalDays, leaveDays, month, year }: {
  summary: { present: number; late: number; absent: number; pending: number } | undefined;
  attRate: number; totalDays: number; leaveDays: number; month: number; year: number;
}) {
  return (
    <div style={{ background: '#ffffff', border: `1px solid #e6e6e6`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ fontFamily: F_SERIF, fontSize: 15, color: '#0a0a0a', letterSpacing: '-0.01em', marginBottom: 2 }}>
        {MONTHS[month-1]} at a glance.
      </div>
      <div style={{ fontFamily: F_MONO, fontSize: 10, color: '#a3a3a3', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>{year}</div>

      {summary ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
            <span style={{ fontFamily: F_SERIF, fontSize: 48, color: attRate >= 90 ? '#16a34a' : attRate >= 70 ? '#b45309' : '#dc2626', letterSpacing: '-0.03em', lineHeight: 0.9 }}>{attRate}</span>
            <span style={{ fontFamily: F_SERIF, fontSize: 22, color: '#a3a3a3', letterSpacing: '-0.02em' }}>%</span>
          </div>
          <div style={{ display: 'flex', height: 5, borderRadius: 999, overflow: 'hidden', marginBottom: 14, gap: 1 }}>
            {totalDays > 0 && (summary.present ?? 0) > 0 && <div style={{ flex: summary.present, background: '#16a34a', borderRadius: '999px 0 0 999px' }} />}
            {totalDays > 0 && (summary.late    ?? 0) > 0 && <div style={{ flex: summary.late,    background: '#b45309' }} />}
            {totalDays > 0 && (summary.absent  ?? 0) > 0 && <div style={{ flex: summary.absent,  background: '#dc2626' }} />}
            {leaveDays > 0                               && <div style={{ flex: leaveDays,        background: '#7c3aed', borderRadius: '0 999px 999px 0' }} />}
          </div>
          {[
            { lbl: 'Present', val: summary.present, dot: '#16a34a' },
            { lbl: 'Late',    val: summary.late,    dot: '#b45309' },
            { lbl: 'Absent',  val: summary.absent,  dot: '#dc2626' },
            { lbl: 'Leave',   val: leaveDays,        dot: '#7c3aed' },
            { lbl: 'Pending', val: summary.pending, dot: '#a3a3a3' },
          ].map(({ lbl, val, dot }) => (
            <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid #e6e6e6` }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#525252', fontFamily: F_SANS }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: dot, display: 'inline-block', flexShrink: 0 }} />
                {lbl}
              </span>
              <span style={{ fontFamily: F_MONO, fontSize: 13, fontWeight: 500, color: '#0a0a0a', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
            </div>
          ))}
        </>
      ) : (
        <p style={{ fontSize: 12.5, color: '#a3a3a3' }}>No data for this month.</p>
      )}
    </div>
  );
}
