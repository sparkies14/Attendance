'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';
import { C, F_SERIF, F_SANS, F_MONO } from '../../theme';

interface Props { apiUrl: string; adminRole: string; }

interface DisciplineRecord {
  id: number; user_id: string; reason: string; issued_by: string; issued_at: string;
  voided: boolean; void_reason: string | null; voided_by: string | null; voided_at: string | null;
  acknowledged: boolean; acknowledged_at: string | null;
}
interface DisciplineMember {
  email: string; name: string; totalWarnings: number; activeWarnings: number;
  records: DisciplineRecord[];
}

const MOCK: DisciplineMember[] = [
  { email: 'ana@example.com', name: 'Ana Cruz', totalWarnings: 1, activeWarnings: 1,
    records: [{ id: 1, user_id: '1', reason: 'Repeated tardiness', issued_by: 'admin@example.com', issued_at: '2026-05-15T09:00:00Z', voided: false, void_reason: null, voided_by: null, voided_at: null, acknowledged: false, acknowledged_at: null }] },
  { email: 'ken@example.com', name: 'Ken Tanaka', totalWarnings: 2, activeWarnings: 1,
    records: [
      { id: 2, user_id: '2', reason: 'AWOL without notice', issued_by: 'admin@example.com', issued_at: '2026-04-10T09:00:00Z', voided: false, void_reason: null, voided_by: null, voided_at: null, acknowledged: true, acknowledged_at: '2026-04-11T10:00:00Z' },
      { id: 3, user_id: '2', reason: 'Duplicate entry test', issued_by: 'admin@example.com', issued_at: '2026-03-01T09:00:00Z', voided: true, void_reason: 'Entered in error', voided_by: 'admin@example.com', voided_at: '2026-03-02T09:00:00Z', acknowledged: false, acknowledged_at: null },
    ]},
];

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return iso; }
}

export default function DisciplinePage({ apiUrl }: Props) {
  const [members,     setMembers]     = useState<DisciplineMember[]>([]);
  const [busy,        setBusy]        = useState(false);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [issueEmail,  setIssueEmail]  = useState('');
  const [issueReason, setIssueReason] = useState('');
  const [issueBusy,   setIssueBusy]   = useState(false);
  const [issueErr,    setIssueErr]    = useState<string | null>(null);
  const [voidingId,   setVoidingId]   = useState<number | null>(null);
  const [voidReason,  setVoidReason]  = useState('');
  const [voidErr,     setVoidErr]     = useState<string | null>(null);
  const [ackBusy,     setAckBusy]     = useState<number | null>(null);

  const inp: React.CSSProperties = { padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box' };

  function load() {
    setBusy(true);
    clientFetch(`${apiUrl}/discipline/all`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setMembers(d?.members ?? MOCK))
      .catch(() => setMembers(MOCK))
      .finally(() => setBusy(false));
  }
  useEffect(() => { load(); }, [apiUrl]);

  function toggleExpand(email: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(email) ? s.delete(email) : s.add(email); return s; });
  }

  async function issueWarning(e: React.FormEvent) {
    e.preventDefault();
    setIssueBusy(true); setIssueErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/discipline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: issueEmail, reason: issueReason }) });
      const data = await res.json();
      if (res.ok) { setIssueEmail(''); setIssueReason(''); load(); }
      else        { setIssueErr(data.error ?? 'Failed.'); }
    } catch { setIssueErr('Network error.'); }
    finally { setIssueBusy(false); }
  }

  async function voidWarning(id: number) {
    if (!voidReason.trim()) { setVoidErr('Void reason is required.'); return; }
    setVoidErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/discipline/${id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: voidReason }) });
      const data = await res.json();
      if (res.ok) { setVoidingId(null); setVoidReason(''); load(); }
      else        { setVoidErr(data.error ?? 'Void failed.'); }
    } catch { setVoidErr('Network error.'); }
  }

  async function acknowledge(id: number) {
    setAckBusy(id);
    try {
      const res = await clientFetch(`${apiUrl}/discipline/${id}/acknowledge`, { method: 'POST' });
      if (res.ok) load();
    } catch { /* silent */ }
    finally { setAckBusy(null); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Discipline.</div>

      {/* Issue warning */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Issue warning</div>
        {issueErr && <div style={{ marginBottom: 10, fontFamily: F_MONO, fontSize: 11, color: C.red }}>{issueErr}</div>}
        <form onSubmit={issueWarning} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Member email</label>
            <input type="email" value={issueEmail} onChange={e => setIssueEmail(e.target.value)} required placeholder="member@example.com" style={{ ...inp, width: 240 }} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Reason</label>
            <input type="text" value={issueReason} onChange={e => setIssueReason(e.target.value)} required placeholder="Brief reason…" style={{ ...inp, width: '100%' }} />
          </div>
          <button type="submit" disabled={issueBusy}
            style={{ padding: '7px 16px', background: C.btnBg, color: C.btnText, border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: issueBusy ? 'not-allowed' : 'pointer', opacity: issueBusy ? 0.6 : 1 }}>
            {issueBusy ? '…' : 'Issue warning'}
          </button>
        </form>
      </div>

      {/* Member accordion */}
      {busy && <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}
      {!busy && members.filter(m => m.totalWarnings > 0).length === 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px', textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>No discipline records.</div>
      )}
      {!busy && members.filter(m => m.totalWarnings > 0).map(m => {
        const isOpen = expanded.has(m.email);
        return (
          <div key={m.email} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <button onClick={() => toggleExpand(m.email)} style={{ width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{m.name}</div>
                <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 2 }}>{m.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {m.activeWarnings > 0 && (
                  <span style={{ padding: '2px 9px', borderRadius: 999, background: C.redSoft, border: `1px solid ${C.redBorder}`, fontFamily: F_MONO, fontSize: 10, color: C.red }}>{m.activeWarnings} active</span>
                )}
                <span style={{ padding: '2px 9px', borderRadius: 999, background: C.surface2, border: `1px solid ${C.border}`, fontFamily: F_MONO, fontSize: 10, color: C.text3 }}>{m.totalWarnings} total</span>
                <span style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {m.records.map((r, ri) => {
                  const isVoided = r.voided;
                  const isAcked  = r.acknowledged;
                  const status = isVoided ? 'Voided' : isAcked ? 'Acknowledged' : 'Active';
                  const statusBg     = isVoided ? C.surface2   : isAcked ? C.greenSoft  : C.redSoft;
                  const statusBorder = isVoided ? C.border      : isAcked ? C.greenBorder : C.redBorder;
                  const statusColor  = isVoided ? C.text3       : isAcked ? C.green       : C.red;
                  return (
                    <div key={r.id} style={{ padding: '14px 20px', borderBottom: ri < m.records.length - 1 ? `1px solid ${C.border}` : 'none', background: r.voided ? C.surface2 : 'transparent' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: r.voided ? C.text3 : C.text, fontStyle: r.voided ? 'italic' : 'normal' }}>{r.reason}</div>
                          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 4 }}>
                            Issued by {r.issued_by} · {fmtDate(r.issued_at)}
                          </div>
                          {r.voided && r.void_reason && (
                            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 2 }}>Voided: {r.void_reason}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ padding: '2px 9px', borderRadius: 999, fontFamily: F_MONO, fontSize: 10, color: statusColor, background: statusBg, border: `1px solid ${statusBorder}` }}>{status}</span>
                          {!r.voided && !r.acknowledged && (
                            <button onClick={() => acknowledge(r.id)} disabled={ackBusy === r.id}
                              style={{ padding: '3px 10px', borderRadius: 6, background: 'transparent', border: `1px solid ${C.greenBorder}`, fontFamily: F_MONO, fontSize: 10.5, color: C.green, cursor: ackBusy === r.id ? 'not-allowed' : 'pointer' }}>
                              {ackBusy === r.id ? '…' : 'Acknowledge'}
                            </button>
                          )}
                          {!r.voided && (
                            <button onClick={() => { setVoidingId(voidingId === r.id ? null : r.id); setVoidReason(''); setVoidErr(null); }}
                              style={{ padding: '3px 10px', borderRadius: 6, background: 'transparent', border: `1px solid ${C.border}`, fontFamily: F_MONO, fontSize: 10.5, color: C.text3, cursor: 'pointer' }}>
                              {voidingId === r.id ? 'Cancel' : 'Void'}
                            </button>
                          )}
                        </div>
                      </div>
                      {voidingId === r.id && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                          {voidErr && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.red }}>{voidErr}</span>}
                          <input type="text" value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Void reason (required)…"
                            style={{ flex: 1, padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, color: C.text, background: C.bg }} />
                          <button onClick={() => voidWarning(r.id)}
                            style={{ padding: '6px 14px', background: C.btnBg, color: C.btnText, border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                            Confirm void
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
