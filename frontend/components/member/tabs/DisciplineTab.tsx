'use client';

import { clientFetch } from '@/lib/clientFetch';

import { useState, useEffect } from 'react';

interface DisciplineRecord {
  id: string;
  reason: string;
  issued_by: string;
  issued_at: string;
  voided: boolean;
  void_reason: string | null;
}

interface Props {
  email: string;
  apiUrl: string;
}

export default function DisciplineTab({ email, apiUrl }: Props) {
  const [records, setRecords]       = useState<DisciplineRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error,   setError]         = useState<string | null>(null);
  const [appealId, setAppealId]     = useState<string | null>(null);
  const [appealText, setAppealText] = useState('');
  const [appealMsg,  setAppealMsg]  = useState<Record<string, string>>({});
  const [appealErr,  setAppealErr]  = useState<Record<string, string>>({});
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealed, setAppealed]     = useState<Set<string>>(new Set());

  useEffect(() => {
    clientFetch(`${apiUrl}/discipline?email=${encodeURIComponent(email)}`, { })
      .then(r => { if (!r.ok) throw new Error('Server error'); return r.json(); })
      .then(d => { setRecords(d.records ?? []); setLoading(false); })
      .catch(() => { setError('Failed to load records.'); setLoading(false); });
  }, [apiUrl, email]);

  async function submitAppeal(e: React.FormEvent, recordId: string) {
    e.preventDefault();
    setAppealLoading(true);
    setAppealErr(prev => { const n = {...prev}; delete n[recordId]; return n; });
    try {
      const res = await clientFetch(`${apiUrl}/appeals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: 'discipline', target_id: recordId, reason: appealText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAppealErr(prev => ({ ...prev, [recordId]: data.error ?? 'Appeal failed.' }));
      } else {
        setAppealMsg(prev => ({ ...prev, [recordId]: 'Appeal submitted.' }));
        setAppealed(prev => new Set(prev).add(recordId));
        setAppealId(null);
        setAppealText('');
      }
    } catch {
      setAppealErr(prev => ({ ...prev, [recordId]: 'Network error. Please try again.' }));
    } finally {
      setAppealLoading(false);
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

  if (loading) return <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>Loading…</p>;
  if (error)   return <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626' }}>{error}</p>;

  return (
    <div>
      <p style={labelStyle}>Discipline Records</p>
      {records.length === 0 ? (
        <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>No records.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {records.map(r => (
            <div key={r.id} style={{ padding: '0.875rem', border: '1px solid #e5e7eb', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#111', flex: 1 }}>{r.reason}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: r.voided ? '#9ca3af' : '#dc2626', whiteSpace: 'nowrap' }}>
                  {r.voided ? 'Voided' : 'Active'}
                </span>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                Issued by {r.issued_by} on {new Date(r.issued_at).toLocaleDateString()}
              </div>
              {r.voided && r.void_reason && (
                <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Void reason: {r.void_reason}
                </div>
              )}
              {appealMsg[r.id] && (
                <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#16a34a', marginBottom: '0.5rem' }}>{appealMsg[r.id]}</p>
              )}
              {!r.voided && !appealed.has(r.id) && appealId !== r.id && (
                <button onClick={() => { setAppealId(r.id); setAppealErr(prev => { const n = {...prev}; delete n[r.id]; return n; }); }} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
                  Appeal
                </button>
              )}
              {appealId === r.id && (
                <form onSubmit={e => submitAppeal(e, r.id)} style={{ marginTop: '0.5rem' }}>
                  {appealErr[r.id] && <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#dc2626', marginBottom: '0.4rem' }}>{appealErr[r.id]}</p>}
                  <textarea
                    value={appealText}
                    onChange={e => setAppealText(e.target.value)}
                    required
                    placeholder="Explain your appeal…"
                    rows={2}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.75rem', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                  <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" disabled={appealLoading} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', cursor: appealLoading ? 'not-allowed' : 'pointer' }}>
                      {appealLoading ? 'Submitting…' : 'Submit'}
                    </button>
                    <button type="button" onClick={() => { setAppealId(null); setAppealErr(prev => { const n = {...prev}; delete n[r.id]; return n; }); setAppealText(''); }} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
