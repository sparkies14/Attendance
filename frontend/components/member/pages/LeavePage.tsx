'use client';

import { useState, useEffect } from 'react';
import type { LeaveBalance, LeaveRecord } from '../MemberDashboard';

interface Props {
  email: string;
  leaveBalance: LeaveBalance | null;
  initialLeaveHistory: LeaveRecord[];
  apiUrl: string;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LEAVE_TYPES  = ['Vacation', 'Sick', 'Personal', 'Other'];

const TYPE_COLOR: Record<string, string> = {
  vacation: '#3b82f6',
  sick:     '#ef4444',
  personal: '#8b5cf6',
  other:    '#f59e0b',
  special:  '#f59e0b',
  emergency:'#ef4444',
};

const STATUS_COLOR: Record<string, string> = {
  Approved: '#16a34a',
  Pending:  '#d97706',
  Rejected: '#dc2626',
};

function typeColor(t: string): string {
  return TYPE_COLOR[t.toLowerCase()] ?? '#6b7280';
}

// Parse M/D/YYYY → Date (UTC)
function parseDate(ds: string): Date {
  const [m, d, y] = ds.split('/').map(Number);
  return new Date(y, m - 1, d);
}

// Format M/D/YYYY → "May 29, 2026"
function fmtDate(ds: string): string {
  try {
    const [m, d, y] = ds.split('/').map(Number);
    return `${['January','February','March','April','May','June','July','August','September','October','November','December'][m-1]} ${d}, ${y}`;
  } catch { return ds; }
}

export default function LeavePage({ email, leaveBalance, initialLeaveHistory, apiUrl }: Props) {
  const [history, setHistory] = useState<LeaveRecord[]>(initialLeaveHistory);
  const [filter,  setFilter]  = useState<string>('all');
  const [loading, setLoading] = useState(false);

  // Leave form
  const [showForm,    setShowForm]    = useState(false);
  const [leaveDate,   setLeaveDate]   = useState('');
  const [leaveType,   setLeaveType]   = useState(LEAVE_TYPES[0]);
  const [leaveReason, setLeaveReason] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formMsg,     setFormMsg]     = useState<string | null>(null);
  const [formErr,     setFormErr]     = useState<string | null>(null);

  // Fetch full leave history on mount
  useEffect(() => {
    setLoading(true);
    fetch(`${apiUrl}/leaves?email=${encodeURIComponent(email)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.leaves || d?.leaveHistory || Array.isArray(d)) setHistory(d?.leaves ?? d?.leaveHistory ?? d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email, apiUrl]);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true); setFormMsg(null); setFormErr(null);
    try {
      const res  = await fetch(`${apiUrl}/attendance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'leave', date: leaveDate, leave_type: leaveType, reason: leaveReason }) });
      const data = await res.json();
      if (!res.ok) { setFormErr(data.error ?? 'Request failed.'); }
      else {
        setFormMsg('Leave request submitted.');
        setLeaveDate(''); setLeaveReason(''); setShowForm(false);
        // Refresh
        const r = await fetch(`${apiUrl}/leaves?email=${encodeURIComponent(email)}`, { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          setHistory(d?.leaves ?? d?.leaveHistory ?? d ?? history);
        }
      }
    } catch { setFormErr('Network error.'); }
    finally  { setFormLoading(false); }
  }

  const today     = new Date();
  const thisYear  = today.getFullYear();

  // Classify records
  const upcoming  = history.filter(r => { try { return parseDate(r.date) > today && r.status !== 'Rejected'; } catch { return false; } });
  const pending   = history.filter(r => r.status === 'Pending');
  const yearRecs  = history.filter(r => { try { return parseDate(r.date).getFullYear() === thisYear; } catch { return false; } });

  // Per-type counts from history
  const typeCounts = LEAVE_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = yearRecs.filter(r => r.leaveType?.toLowerCase() === t.toLowerCase() && r.status === 'Approved').length;
    return acc;
  }, {});

  // Year at a glance: leaves by month
  const monthBars = MONTHS_SHORT.map((lbl, i) => {
    const count = yearRecs.filter(r => { try { return parseDate(r.date).getMonth() === i; } catch { return false; } }).length;
    return { lbl, count };
  });
  const maxMonth = Math.max(1, ...monthBars.map(b => b.count));

  // Filtered history for table
  const filtered = filter === 'all' ? history : history.filter(r => r.status === filter);

  const label: React.CSSProperties = { fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.1em' };
  const card: React.CSSProperties  = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.25rem' };
  const inp: React.CSSProperties   = { width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: '0.82rem', color: '#111', backgroundColor: '#fff', boxSizing: 'border-box' as const };

  return (
    <div>
      {/* Page heading */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#111', margin: 0, lineHeight: 1.1 }}>Time off.</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ padding: '0.5rem 1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
          >
            + Request leave
          </button>
        </div>
      </div>
      <p style={{ ...label, marginBottom: '1.5rem' }}>Balance · Year view · History · {thisYear}</p>

      {/* Leave request form */}
      {showForm && (
        <div style={{ ...card, marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111', marginBottom: '0.75rem' }}>New leave request</div>
          {formMsg && <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.7rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: '0.78rem', color: '#16a34a' }}>{formMsg}</div>}
          {formErr && <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.7rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: '0.78rem', color: '#dc2626' }}>{formErr}</div>}
          <form onSubmit={submitLeave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: '0.75rem', alignItems: 'flex-end' }}>
            <div>
              <label style={{ ...label, display: 'block', marginBottom: '0.3rem' }}>Type</label>
              <select value={leaveType} onChange={e => setLeaveType(e.target.value)} style={inp}>
                {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ ...label, display: 'block', marginBottom: '0.3rem' }}>Date</label>
              <input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} required style={inp} />
            </div>
            <div>
              <label style={{ ...label, display: 'block', marginBottom: '0.3rem' }}>Reason</label>
              <input type="text" value={leaveReason} onChange={e => setLeaveReason(e.target.value)} required placeholder="Brief reason…" style={inp} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: 1 }}>
              <button type="submit" disabled={formLoading} style={{ padding: '0.48rem 0.9rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600, cursor: formLoading ? 'not-allowed' : 'pointer' }}>
                {formLoading ? '…' : 'Submit'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormErr(null); }} style={{ padding: '0.48rem 0.9rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Balance + type breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>

        {/* Balance card */}
        <div style={card}>
          <div style={{ ...label, marginBottom: '0.5rem' }}>Used this year</div>
          {leaveBalance ? (
            <>
              <div style={{ fontSize: '2.8rem', fontWeight: 800, color: '#111', lineHeight: 1, marginBottom: '0.15rem' }}>
                {leaveBalance.used}<span style={{ fontSize: '1.2rem', fontWeight: 400, color: '#9ca3af' }}> /{leaveBalance.total}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#22c55e', fontWeight: 600, marginBottom: '0.75rem' }}>
                {Math.max(0, leaveBalance.remaining)} days available
              </div>
              <div style={{ height: 5, backgroundColor: '#f3f4f6', borderRadius: 999, marginBottom: '0.5rem' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (leaveBalance.used / (leaveBalance.total || 1)) * 100)}%`, backgroundColor: '#111', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#9ca3af', fontWeight: 600 }}>
                <span>JAN</span><span>DEC</span>
              </div>
            </>
          ) : (
            <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No balance data.</p>
          )}
        </div>

        {/* Type breakdown */}
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {LEAVE_TYPES.map(t => {
              const used = typeCounts[t] ?? 0;
              const col  = typeColor(t);
              return (
                <div key={t}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: col, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ ...label, color: col }}>{t.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111', lineHeight: 1, marginBottom: '0.2rem' }}>
                    {used}<span style={{ fontSize: '0.9rem', fontWeight: 400, color: '#9ca3af' }}> days</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af', lineHeight: 1.4 }}>used this year</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Year at a glance */}
      <div style={{ ...card, marginBottom: '1.25rem' }}>
        <div style={{ ...label, marginBottom: '0.75rem' }}>Year at a glance · {thisYear}</div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-end', height: 60 }}>
          {monthBars.map(({ lbl, count }) => (
            <div key={lbl} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', height: '100%' }}>
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', backgroundColor: count > 0 ? '#8b5cf6' : '#f3f4f6', borderRadius: 4, height: `${count > 0 ? Math.max(15, (count / maxMonth) * 100) : 8}%`, opacity: count === 0 ? 0.4 : 1 }} />
              </div>
              <div style={{ fontSize: '0.58rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming + Pending */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>

        {/* Upcoming */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111' }}>Upcoming</div>
          </div>
          <div style={{ ...label, marginBottom: '0.85rem' }}>{upcoming.length} planned</div>
          {upcoming.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No upcoming leaves.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {upcoming.slice(0, 4).map(r => (
                <div key={r.id} style={{ padding: '0.7rem 0.85rem', backgroundColor: '#f9fafb', borderRadius: 10, borderLeft: `3px solid ${typeColor(r.leaveType)}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: typeColor(r.leaveType), textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.leaveType}</span>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111', marginTop: '0.1rem' }}>{r.reason || 'No reason given'}</div>
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.1rem' }}>{fmtDate(r.date)}</div>
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: STATUS_COLOR[r.status] ?? '#9ca3af', textTransform: 'uppercase', flexShrink: 0 }}>{r.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending action */}
        <div style={card}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111', marginBottom: '0.25rem' }}>Pending action</div>
          <div style={{ ...label, marginBottom: '0.85rem' }}>{pending.length} awaiting approval</div>
          {pending.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Nothing awaiting approval.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {pending.map(r => (
                <div key={r.id} style={{ padding: '0.75rem', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>Pending</span>
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{fmtDate(r.date)}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111' }}>{r.leaveType} · {r.reason || 'No reason'}</div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.25rem' }}>Waiting for approval.</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leave history table */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111' }}>Leave history</div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[['all','All'], ['Approved','Approved'], ['Pending','Pending'], ['Rejected','Rejected']].map(([val, lbl]) => (
              <button key={val} onClick={() => setFilter(val)}
                style={{ padding: '0.3rem 0.7rem', backgroundColor: filter === val ? '#111' : '#f3f4f6', color: filter === val ? '#fff' : '#6b7280', border: 'none', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                {lbl}
                {val !== 'all' && <span style={{ marginLeft: '0.3rem', opacity: 0.7 }}>{history.filter(r => r.status === val).length}</span>}
                {val === 'all' && <span style={{ marginLeft: '0.3rem', opacity: 0.7 }}>{history.length}</span>}
              </button>
            ))}
          </div>
        </div>

        {loading && <p style={{ fontSize: '0.82rem', color: '#9ca3af', padding: '0.5rem 0' }}>Loading…</p>}

        {!loading && filtered.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No records{filter !== 'all' ? ` with status "${filter}"` : ''} found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {filtered.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0.85rem', border: '1px solid #f3f4f6', borderRadius: 10, flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: typeColor(r.leaveType), display: 'inline-block', flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111' }}>{r.leaveType}</span>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '0.5rem' }}>{fmtDate(r.date)}</span>
                    {r.reason && <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: '0.5rem' }}>— {r.reason}</span>}
                  </div>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: STATUS_COLOR[r.status] ?? '#6b7280' }}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
