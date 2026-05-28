'use client';

import { useState, useEffect } from 'react';

interface Appeal {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  resolution_note: string | null;
  created_at: string;
}

interface Props {
  apiUrl: string;
}

const STATUS_COLOR: Record<string, string> = {
  Pending:  '#d97706',
  Approved: '#16a34a',
  Rejected: '#dc2626',
};

const APPEAL_TYPES = ['attendance', 'leave', 'discipline'];

export default function AppealsTab({ apiUrl }: Props) {
  const [appeals,  setAppeals]  = useState<Appeal[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  const [showForm,    setShowForm]    = useState(false);
  const [formType,    setFormType]    = useState(APPEAL_TYPES[0]);
  const [formTarget,  setFormTarget]  = useState('');
  const [formReason,  setFormReason]  = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formMsg,     setFormMsg]     = useState<string | null>(null);
  const [formErr,     setFormErr]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/appeals`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Server error'); return r.json(); })
      .then(d => { setAppeals(d.appeals ?? []); setLoading(false); })
      .catch(() => { setFetchErr('Failed to load appeals.'); setLoading(false); });
  }, [apiUrl]);

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormMsg(null);
    setFormErr(null);
    try {
      const res = await fetch(`${apiUrl}/appeals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target_type: formType, target_id: formTarget, reason: formReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormErr(data.error ?? 'Appeal failed.');
      } else {
        setFormMsg('Appeal submitted.');
        setFormTarget('');
        setFormReason('');
        setShowForm(false);
        try {
          const refreshRes = await fetch(`${apiUrl}/appeals`, { credentials: 'include' });
          if (refreshRes.ok) {
            const d = await refreshRes.json();
            setAppeals(d.appeals ?? []);
          }
        } catch {
          // refresh failure is non-critical; submit already succeeded
        }
      }
    } catch {
      setFormErr('Network error. Please try again.');
    } finally {
      setFormLoading(false);
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

  if (loading) return <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>Loading…</p>;
  if (fetchErr) return <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626' }}>{fetchErr}</p>;

  return (
    <div>
      {formMsg && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>
          {formMsg}
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => { setShowForm(true); setFormMsg(null); }}
          style={{ marginBottom: '1.5rem', padding: '0.55rem 1.1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}
        >
          New Appeal
        </button>
      )}

      {showForm && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <p style={labelStyle}>New Appeal</p>
          {formErr && <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.75rem' }}>{formErr}</p>}
          <form onSubmit={submitAppeal}>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, display: 'block', marginBottom: '0.3rem' }}>Type</label>
              <select value={formType} onChange={e => setFormType(e.target.value)} style={inputStyle}>
                {APPEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, display: 'block', marginBottom: '0.3rem' }}>
                {formType === 'attendance' ? 'Date (YYYY-MM-DD)' : 'Record ID (UUID)'}
              </label>
              <input
                type={formType === 'attendance' ? 'date' : 'text'}
                value={formTarget}
                onChange={e => setFormTarget(e.target.value)}
                required
                placeholder={formType === 'attendance' ? 'YYYY-MM-DD' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ ...labelStyle, display: 'block', marginBottom: '0.3rem' }}>Reason</label>
              <textarea value={formReason} onChange={e => setFormReason(e.target.value)} required rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={formLoading} style={{ padding: '0.5rem 1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: formLoading ? 'not-allowed' : 'pointer' }}>
                {formLoading ? 'Submitting…' : 'Submit'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormErr(null); }} style={{ padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <p style={labelStyle}>My Appeals</p>
      {appeals.length === 0 ? (
        <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>No appeals submitted.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {appeals.map(a => (
            <div key={a.id} style={{ padding: '0.875rem', border: '1px solid #e5e7eb', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#374151' }}>
                  {a.target_type} — {a.target_id}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: STATUS_COLOR[a.status] ?? '#6b7280' }}>
                  {a.status}
                </span>
              </div>
              <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#374151', margin: '0 0 0.3rem' }}>{a.reason}</p>
              {a.resolution_note && (
                <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                  Resolution: {a.resolution_note}
                </p>
              )}
              <p style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.3rem' }}>
                {new Date(a.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
