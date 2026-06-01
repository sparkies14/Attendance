'use client';

import { clientFetch } from '@/lib/clientFetch';

import { useState, useEffect } from 'react';
import type { LeaveBalance, LeaveRecord } from '../MemberDashboard';

interface Props {
  email: string;
  leaveBalance: LeaveBalance | null;
  initialLeaveHistory: LeaveRecord[];
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

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const LEAVE_TYPES = ['Vacation', 'Sick', 'Personal', 'Other'];

const TYPE_COLOR: Record<string, string> = {
  vacation:  '#2563eb',
  sick:      '#dc2626',
  personal:  '#7c3aed',
  other:     '#b45309',
  special:   '#b45309',
  emergency: '#dc2626',
};

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string }> = {
  Approved: { bg: C.greenSoft,  border: C.greenBorder,  text: C.green  },
  Pending:  { bg: C.accentSoft, border: C.accentBorder, text: C.accent },
  Rejected: { bg: C.redSoft,    border: C.redBorder,    text: C.red    },
};

function typeColor(t: string): string {
  return TYPE_COLOR[t.toLowerCase()] ?? C.text3;
}

function parseDate(ds: string): Date {
  const [m, d, y] = ds.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(ds: string): string {
  try {
    const [m, d, y] = ds.split('/').map(Number);
    return `${MONTHS_LONG[m-1]} ${d}, ${y}`;
  } catch { return ds; }
}

function fmtShort(ds: string): string {
  try {
    const [m, d] = ds.split('/').map(Number);
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} ${d}`;
  } catch { return ds; }
}

export default function LeavePage({ email, leaveBalance, initialLeaveHistory, apiUrl }: Props) {
  const [history, setHistory] = useState<LeaveRecord[]>(initialLeaveHistory);
  const [filter,  setFilter]  = useState<string>('all');
  const [loading, setLoading] = useState(false);

  const [leaveDate,   setLeaveDate]   = useState('');
  const [leaveType,   setLeaveType]   = useState(LEAVE_TYPES[0]);
  const [leaveReason, setLeaveReason] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formMsg,     setFormMsg]     = useState<string | null>(null);
  const [formErr,     setFormErr]     = useState<string | null>(null);
  const [showForm,    setShowForm]    = useState(false);

  // Leave appeal state — keyed by leave record id
  const [appealingId,  setAppealingId]  = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [appealLoading,setAppealLoading]= useState(false);
  const [appealDone,   setAppealDone]   = useState<Set<string>>(new Set());
  const [appealMsg,    setAppealMsg]    = useState<string | null>(null);
  const [appealErr,    setAppealErr]    = useState<string | null>(null);

  async function submitLeaveAppeal(leaveId: string, e: React.FormEvent) {
    e.preventDefault();
    setAppealLoading(true); setAppealMsg(null); setAppealErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/appeals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: 'leave', target_id: leaveId, reason: appealReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAppealErr(res.status === 409 ? 'Appeal already submitted.' : (data.error ?? 'Request failed.'));
      } else {
        setAppealMsg('Appeal submitted — admin will review.');
        setAppealDone(prev => new Set([...prev, leaveId]));
        setAppealingId(null);
        setAppealReason('');
        setTimeout(() => setAppealMsg(null), 4_000);
      }
    } catch { setAppealErr('Network error.'); }
    finally  { setAppealLoading(false); }
  }

  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function cancelLeave(leaveId: string) {
    setCancellingId(leaveId);
    try {
      const res  = await clientFetch(`${apiUrl}/webhook/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-leave', leave_id: leaveId }),
      });
      const data = await res.json();
      if (res.ok) {
        setHistory(prev => prev.filter(r => r.id !== leaveId));
      } else {
        alert(data.error ?? 'Could not cancel.');
      }
    } catch { alert('Network error.'); }
    finally  { setCancellingId(null); }
  }

  function fetchLeaveHistory() {
    const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const month = jst.getMonth() + 1;
    const year  = jst.getFullYear();
    return clientFetch(`${apiUrl}/webhook/member-data?email=${encodeURIComponent(email)}&month=${month}&year=${year}`, {})
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.leaveHistory) setHistory(d.leaveHistory); })
      .catch(() => {});
  }

  useEffect(() => {
    setLoading(true);
    fetchLeaveHistory().finally(() => setLoading(false));
  }, [email, apiUrl]);

  // Poll every 15 s so admin approve/reject is reflected without manual refresh
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) fetchLeaveHistory(); }, 15_000);
    return () => clearInterval(id);
  }, [email, apiUrl]);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true); setFormMsg(null); setFormErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/webhook/attendance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'leave', date: leaveDate, leave_type: leaveType, reason: leaveReason }) });
      const data = await res.json();
      if (!res.ok) { setFormErr(data.error ?? 'Request failed.'); }
      else {
        setFormMsg('Leave request submitted.');
        setLeaveDate(''); setLeaveReason(''); setShowForm(false);
        const jst2 = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        const r = await clientFetch(`${apiUrl}/webhook/member-data?email=${encodeURIComponent(email)}&month=${jst2.getMonth() + 1}&year=${jst2.getFullYear()}`, {});
        if (r.ok) { const d = await r.json(); if (d?.leaveHistory) setHistory(d.leaveHistory); }
      }
    } catch { setFormErr('Network error.'); }
    finally  { setFormLoading(false); }
  }

  const today     = new Date();
  const thisYear  = today.getFullYear();
  const yearStart = new Date(thisYear, 0, 1);
  const yearEnd   = new Date(thisYear, 11, 31);
  const yearMs    = yearEnd.getTime() - yearStart.getTime();

  const upcoming  = history.filter(r => { try { return parseDate(r.date) > today && r.status !== 'Rejected'; } catch { return false; } });
  const pending   = history.filter(r => r.status === 'Pending');
  const yearRecs  = history.filter(r => { try { return parseDate(r.date).getFullYear() === thisYear; } catch { return false; } });
  const filtered  = filter === 'all' ? history : history.filter(r => r.status === filter);

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8,
    fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box', fontFamily: F_SANS,
  };

  return (
    <div>
      {/* Heading */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Time off.</div>
          <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
            Balance · Year view · History · {thisYear}
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ padding: '8px 16px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 9, fontSize: 13, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer' }}
        >
          + Request leave
        </button>
      </div>

      {/* Leave request form */}
      {showForm && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px', marginBottom: 16, marginTop: 16 }}>
          <div style={{ fontFamily: F_SERIF, fontSize: 18, color: C.text, letterSpacing: '-0.01em', marginBottom: 14 }}>New leave request</div>
          {formMsg && <div style={{ marginBottom: 10, padding: '8px 10px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 8, fontSize: 12.5, color: C.green }}>{formMsg}</div>}
          {formErr && <div style={{ marginBottom: 10, padding: '8px 10px', background: C.redSoft,   border: `1px solid ${C.redBorder}`,   borderRadius: 8, fontSize: 12.5, color: C.red }}>{formErr}</div>}
          <form onSubmit={submitLeave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Type</label>
              <select value={leaveType} onChange={e => setLeaveType(e.target.value)} style={inp}>
                {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Date</label>
              <input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} required style={inp} />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Reason</label>
              <input type="text" value={leaveReason} onChange={e => setLeaveReason(e.target.value)} required placeholder="Brief reason…" style={inp} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={formLoading} style={{ padding: '8px 14px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, fontWeight: 500, cursor: formLoading ? 'not-allowed' : 'pointer' }}>
                {formLoading ? '…' : 'Submit'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormErr(null); }} style={{ padding: '8px 14px', background: C.surface, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Balance hero */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '24px 28px' }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Leave balance · {thisYear}</div>
            {leaveBalance ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: F_SERIF, fontSize: 64, color: C.text, letterSpacing: '-0.04em', lineHeight: 0.85 }}>{leaveBalance.used}</span>
                  <span style={{ fontFamily: F_SERIF, fontSize: 32, color: C.text3, letterSpacing: '-0.025em' }}>/ {leaveBalance.grantsEarned}</span>
                </div>
                <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.green, letterSpacing: '0.04em', marginBottom: 16 }}>
                  {Math.max(0, leaveBalance.balance)} days available · {pending.length} planned
                </div>
                {/* Stacked color bar */}
                <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', gap: 1 }}>
                  {leaveBalance.used > 0 && (
                    <div style={{ flex: leaveBalance.used, background: C.accent, borderRadius: '999px 0 0 999px' }} />
                  )}
                  {leaveBalance.balance > 0 && (
                    <div style={{ flex: leaveBalance.balance, background: C.border, borderRadius: '0 999px 999px 0' }} />
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: F_MONO, fontSize: 10, color: C.text3, marginTop: 6 }}>
                  <span>Used: {leaveBalance.used}d</span>
                  <span>Remaining: {leaveBalance.balance}d</span>
                  <span>Total: {leaveBalance.grantsEarned}d</span>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13, color: C.text3 }}>No balance data available.</p>
            )}
          </div>
        </div>

        {/* Year strip — horizontal timeline */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
            Year at a glance · {thisYear}
          </div>
          <div style={{ position: 'relative', height: 48, background: C.surface2, borderRadius: 8, overflow: 'hidden' }}>
            {/* Month dividers */}
            {Array.from({ length: 11 }, (_, i) => {
              const pct = ((i + 1) / 12) * 100;
              return <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct}%`, width: 1, background: C.border, opacity: 0.6 }} />;
            })}
            {/* Leave bars */}
            {yearRecs.map((r, i) => {
              try {
                const d = parseDate(r.date);
                const pct = ((d.getTime() - yearStart.getTime()) / yearMs) * 100;
                const tint = STATUS_CONFIG[r.status]?.text ?? C.accent;
                return (
                  <div key={i} title={`${fmtShort(r.date)} · ${r.leaveType} · ${r.status}`} style={{ position: 'absolute', top: 8, bottom: 8, left: `${Math.max(0, Math.min(99, pct))}%`, width: 6, background: tint, borderRadius: 3, opacity: 0.85 }} />
                );
              } catch { return null; }
            })}
            {/* Today cursor */}
            {(() => {
              const todayPct = ((today.getTime() - yearStart.getTime()) / yearMs) * 100;
              return todayPct >= 0 && todayPct <= 100 ? (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${todayPct}%`, width: 1.5, background: C.accent }}>
                  <span style={{ position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)', fontFamily: F_MONO, fontSize: 7.5, color: C.accent, whiteSpace: 'nowrap', background: C.surface, padding: '1px 3px', borderRadius: 2 }}>Today</span>
                </div>
              ) : null;
            })()}
          </div>
          {/* Month labels */}
          <div style={{ display: 'flex', marginTop: 4 }}>
            {['J','F','M','A','M','J','J','A','S','O','N','D'].map((m, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: F_MONO, fontSize: 9, color: C.text3, letterSpacing: '0.06em' }}>{m}</div>
            ))}
          </div>
        </div>

        {/* Upcoming + Pending */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* Upcoming */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ fontFamily: F_SERIF, fontSize: 18, color: C.text, letterSpacing: '-0.01em', marginBottom: 3 }}>Upcoming</div>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>{upcoming.length} planned</div>
            {upcoming.length === 0 ? (
              <p style={{ fontSize: 12.5, color: C.text3 }}>No upcoming leaves.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcoming.slice(0, 4).map(r => {
                  const sc = STATUS_CONFIG[r.status] ?? { bg: C.surface2, border: C.border, text: C.text3 };
                  return (
                    <div key={r.id} style={{ padding: '10px 12px', background: C.surface2, borderRadius: 10, borderLeft: `3px solid ${typeColor(r.leaveType)}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                          <div style={{ fontFamily: F_MONO, fontSize: 10, color: typeColor(r.leaveType), letterSpacing: '0.08em', textTransform: 'uppercase' }}>{r.leaveType}</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginTop: 2 }}>{r.reason || 'No reason'}</div>
                          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 2 }}>{fmtDate(r.date)}</div>
                        </div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999, background: sc.bg, border: `1px solid ${sc.border}`, fontFamily: F_MONO, fontSize: 10, color: sc.text, letterSpacing: '0.06em', height: 'fit-content', whiteSpace: 'nowrap' }}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending action */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ fontFamily: F_SERIF, fontSize: 18, color: C.text, letterSpacing: '-0.01em', marginBottom: 3 }}>Pending action</div>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>{pending.length} awaiting approval</div>
            {pending.length === 0 ? (
              <p style={{ fontSize: 12.5, color: C.text3 }}>Nothing awaiting approval.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pending.map(r => (
                  <div key={r.id} style={{ padding: '12px 14px', background: C.accentSoft, border: `1px solid ${C.accentBorder}`, borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Pending review</span>
                      <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3 }}>{fmtShort(r.date)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{r.leaveType}</div>
                        {r.reason && <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{r.reason}</div>}
                      </div>
                      <button
                        onClick={() => cancelLeave(r.id)}
                        disabled={cancellingId === r.id}
                        style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${C.redBorder}`, borderRadius: 6, fontFamily: F_MONO, fontSize: 10, color: C.red, cursor: cancellingId === r.id ? 'not-allowed' : 'pointer', opacity: cancellingId === r.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
                      >
                        {cancellingId === r.id ? '…' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Leave history timeline */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: F_SERIF, fontSize: 18, color: C.text, letterSpacing: '-0.01em' }}>Leave history</div>
              <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 3 }}>All records</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['all','All'], ['Approved','Approved'], ['Pending','Pending'], ['Rejected','Rejected']].map(([val, lbl]) => (
                <button key={val} onClick={() => setFilter(val)}
                  style={{ padding: '5px 12px', background: filter === val ? C.text : 'transparent', color: filter === val ? '#fafafa' : C.text3, border: `1px solid ${filter === val ? C.text : C.border}`, borderRadius: 999, fontSize: 11.5, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer' }}>
                  {lbl}
                  <span style={{ marginLeft: 5, opacity: 0.6, fontFamily: F_MONO, fontSize: 10 }}>
                    {val === 'all' ? history.length : history.filter(r => r.status === val).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {loading && <p style={{ fontSize: 12.5, color: C.text3 }}>Loading…</p>}

          {!loading && filtered.length === 0 ? (
            <p style={{ fontSize: 12.5, color: C.text3 }}>No records{filter !== 'all' ? ` with status "${filter}"` : ''} found.</p>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 32 }}>
              {/* Timeline vertical line */}
              <div style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 1, background: C.border }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filtered.map((r, i) => {
                  const sc   = STATUS_CONFIG[r.status] ?? { bg: C.surface2, border: C.border, text: C.text3 };
                  const dot  = sc.text;
                  return (
                    <div key={r.id} style={{ position: 'relative', display: 'flex', gap: 12, paddingBottom: i < filtered.length - 1 ? 14 : 0 }}>
                      {/* Dot on line */}
                      <div style={{ position: 'absolute', left: -26, top: 14, width: 10, height: 10, borderRadius: '50%', background: dot, border: `2px solid ${C.surface}`, zIndex: 1 }} />
                      {/* Date in gutter */}
                      <div style={{ position: 'absolute', left: -116, top: 12, width: 80, textAlign: 'right', fontFamily: F_MONO, fontSize: 9.5, color: C.text3, lineHeight: 1.3 }}>
                        {fmtShort(r.date)}
                      </div>
                      {/* Card */}
                      <div style={{ flex: 1 }}>
                        <div style={{ padding: '10px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: appealingId === r.id ? '10px 10px 0 0' : 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: typeColor(r.leaveType), display: 'inline-block', flexShrink: 0 }} />
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{r.leaveType}</span>
                              {r.reason && <span style={{ fontSize: 12, color: C.text3, marginLeft: 8 }}>— {r.reason}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999, background: sc.bg, border: `1px solid ${sc.border}`, fontFamily: F_MONO, fontSize: 10, color: sc.text, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                              {r.status}
                            </span>
                            {r.status === 'Rejected' && !appealDone.has(r.id) && (
                              <button
                                onClick={() => { setAppealingId(appealingId === r.id ? null : r.id); setAppealErr(null); setAppealReason(''); }}
                                style={{ padding: '2px 9px', borderRadius: 999, background: 'transparent', border: `1px solid ${C.border}`, fontFamily: F_MONO, fontSize: 10, color: C.text3, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >
                                {appealingId === r.id ? 'Cancel' : 'Appeal'}
                              </button>
                            )}
                            {appealDone.has(r.id) && (
                              <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.green }}>Appealed ✓</span>
                            )}
                            {r.status === 'Pending' && (
                              <button
                                onClick={() => cancelLeave(r.id)}
                                disabled={cancellingId === r.id}
                                style={{ padding: '2px 9px', borderRadius: 999, background: 'transparent', border: `1px solid ${C.redBorder}`, fontFamily: F_MONO, fontSize: 10, color: C.red, cursor: cancellingId === r.id ? 'not-allowed' : 'pointer', opacity: cancellingId === r.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
                              >
                                {cancellingId === r.id ? '…' : 'Cancel'}
                              </button>
                            )}
                          </div>
                        </div>
                        {appealingId === r.id && (
                          <div style={{ padding: '12px 14px', background: C.surface2, border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                            {appealMsg && <div style={{ marginBottom: 8, fontSize: 12, color: C.green }}>{appealMsg}</div>}
                            {appealErr && <div style={{ marginBottom: 8, fontSize: 12, color: C.red }}>{appealErr}</div>}
                            <form onSubmit={e => submitLeaveAppeal(r.id, e)} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Appeal reason</label>
                                <input
                                  value={appealReason}
                                  onChange={e => setAppealReason(e.target.value)}
                                  required
                                  placeholder="Why should this be reconsidered?"
                                  style={{ width: '100%', padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12.5, color: C.text, background: C.bg, fontFamily: F_SANS, boxSizing: 'border-box' as const }}
                                />
                              </div>
                              <button type="submit" disabled={appealLoading} style={{ padding: '7px 14px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 7, fontSize: 12.5, fontFamily: F_SANS, fontWeight: 500, cursor: appealLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                                {appealLoading ? '…' : 'Submit'}
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
