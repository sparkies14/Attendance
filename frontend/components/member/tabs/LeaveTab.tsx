'use client';

import { useState } from 'react';
import type { LeaveBalance, LeaveRecord } from '../MemberDashboard';

interface Props {
  email: string;
  leaveBalance: LeaveBalance | null;
  initialLeaveHistory: LeaveRecord[];
  apiUrl: string;
}

const STATUS_COLOR: Record<string, string> = {
  Approved: '#16a34a',
  Pending:  '#d97706',
  Rejected: '#dc2626',
};

const LEAVE_TYPES = ['Vacation', 'Sick', 'Emergency', 'Other'];

export default function LeaveTab({ email, leaveBalance, initialLeaveHistory, apiUrl }: Props) {
  const [showForm, setShowForm]     = useState(false);
  const [date, setDate]             = useState('');
  const [leaveType, setLeaveType]   = useState(LEAVE_TYPES[0]);
  const [reason, setReason]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [message, setMessage]       = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [history, setHistory]       = useState<LeaveRecord[]>(initialLeaveHistory);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'leave', date, leave_type: leaveType, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Request failed.');
      } else {
        setMessage(data.message ?? 'Leave request submitted.');
        setDate('');
        setReason('');
        setShowForm(false);
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        const refreshRes = await fetch(
          `${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${now.getMonth()+1}&year=${now.getFullYear()}`,
          { credentials: 'include' }
        );
        if (refreshRes.ok) {
          const d = await refreshRes.json();
          setHistory(d.leaveHistory);
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '0.75rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.55rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#111',
    boxSizing: 'border-box',
  };

  return (
    <div>
      {/* Leave balance */}
      {leaveBalance && (
        <div style={{ marginBottom: '1.75rem' }}>
          <p style={labelStyle}>Leave Balance</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Total',     val: leaveBalance.total,                         color: '#374151' },
              { label: 'Used',      val: leaveBalance.used,                          color: '#d97706' },
              { label: 'Remaining', val: Math.max(0, leaveBalance.remaining),        color: '#16a34a' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, minWidth: 80, padding: '0.75rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 700, color }}>{val}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginTop: '0.2rem' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success/error messages */}
      {message && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>
          {message}
        </div>
      )}

      {/* Request form toggle */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{ marginBottom: '1.5rem', padding: '0.55rem 1.1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}
        >
          Request Leave
        </button>
      )}

      {/* Request form */}
      {showForm && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <p style={labelStyle}>New Leave Request</p>
          {error && <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.75rem' }}>{error}</p>}
          <form onSubmit={submitLeave}>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, display: 'block', marginBottom: '0.3rem' }}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inputStyle} />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, display: 'block', marginBottom: '0.3rem' }}>Leave Type</label>
              <select value={leaveType} onChange={e => setLeaveType(e.target.value)} style={inputStyle}>
                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, display: 'block', marginBottom: '0.3rem' }}>Reason</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={loading} style={{ padding: '0.5rem 1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Submitting…' : 'Submit'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setError(null); }} style={{ padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Leave history */}
      <div>
        <p style={labelStyle}>Leave History</p>
        {history.length === 0 ? (
          <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>No records.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {history.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.875rem', border: '1px solid #e5e7eb', borderRadius: 8, flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#111' }}>{r.date}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.75rem' }}>{r.leaveType}</span>
                  {r.reason && <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#9ca3af', marginLeft: '0.5rem' }}>— {r.reason}</span>}
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: STATUS_COLOR[r.status] ?? '#6b7280' }}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
