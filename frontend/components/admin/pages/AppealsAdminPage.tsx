'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';
import { C, F_SERIF, F_SANS, F_MONO } from '../../theme';

interface Props { apiUrl: string; adminRole: string; onPendingCount?: (n: number) => void; }

interface Appeal {
  id: number; user_id: string; target_type: string; target_id: string;
  reason: string; status: string; resolution_note: string | null;
  resolved_by: string | null; resolved_at: string | null; created_at: string;
  email: string | null; name: string | null;
}

const MOCK: Appeal[] = [
  { id: 1, user_id: '1', target_type: 'attendance', target_id: '2026-06-01', reason: 'I was physically present but the system did not record it.', status: 'Pending', resolution_note: null, resolved_by: null, resolved_at: null, created_at: '2026-06-01T08:30:00Z', email: 'ana@example.com', name: 'Ana Cruz' },
  { id: 2, user_id: '2', target_type: 'leave',      target_id: '5',          reason: 'I had a documented medical emergency.', status: 'Pending', resolution_note: null, resolved_by: null, resolved_at: null, created_at: '2026-05-28T10:00:00Z', email: 'ken@example.com', name: 'Ken Tanaka' },
  { id: 3, user_id: '3', target_type: 'attendance', target_id: '2026-05-20', reason: 'Connectivity issue at the time.', status: 'Approved', resolution_note: 'Verified with manager.', resolved_by: 'admin@example.com', resolved_at: '2026-05-21T09:00:00Z', created_at: '2026-05-20T11:00:00Z', email: 'maria@example.com', name: 'Maria Santos' },
  { id: 4, user_id: '1', target_type: 'discipline', target_id: '1',          reason: 'The warning was issued unfairly.', status: 'Rejected', resolution_note: 'Records confirm the infraction.', resolved_by: 'admin@example.com', resolved_at: '2026-05-15T14:00:00Z', created_at: '2026-05-14T09:00:00Z', email: 'ana@example.com', name: 'Ana Cruz' },
];

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return iso; }
}

const TYPE_COLOR: Record<string, { text: string; soft: string; border: string }> = {
  attendance: { text: C.blue,   soft: C.blueSoft,   border: C.blueBorder },
  leave:      { text: C.purple, soft: C.purpleSoft,  border: C.purpleBorder },
  discipline: { text: C.red,    soft: C.redSoft,     border: C.redBorder },
};
const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string }> = {
  Pending:  { bg: C.accentSoft,  border: C.accentBorder, text: C.accent },
  Approved: { bg: C.greenSoft,   border: C.greenBorder,  text: C.green },
  Rejected: { bg: C.redSoft,     border: C.redBorder,    text: C.red },
};

export default function AppealsAdminPage({ apiUrl, onPendingCount }: Props) {
  const [appeals,     setAppeals]     = useState<Appeal[]>([]);
  const [busy,        setBusy]        = useState(false);
  const [tab,         setTab]         = useState<'Pending'|'Approved'|'Rejected'>('Pending');
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [outcome,     setOutcome]     = useState<'Approved'|'Rejected'>('Approved');
  const [note,        setNote]        = useState('');
  const [resolveErr,  setResolveErr]  = useState<string | null>(null);
  const [resolveBusy, setResolveBusy] = useState(false);

  function load() {
    setBusy(true);
    clientFetch(`${apiUrl}/appeals/all`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list: Appeal[] = d?.appeals ?? MOCK;
        setAppeals(list);
        onPendingCount?.(list.filter(a => a.status === 'Pending').length);
      })
      .catch(() => { setAppeals(MOCK); onPendingCount?.(MOCK.filter(a => a.status === 'Pending').length); })
      .finally(() => setBusy(false));
  }
  useEffect(() => { load(); }, [apiUrl]);

  async function resolve(id: number) {
    if (!note.trim()) { setResolveErr('Note is required.'); return; }
    setResolveBusy(true); setResolveErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/appeals/${id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome, note }) });
      const data = await res.json();
      if (res.ok) { setResolvingId(null); setNote(''); load(); }
      else        { setResolveErr(data.error ?? 'Resolve failed.'); }
    } catch { setResolveErr('Network error.'); }
    finally { setResolveBusy(false); }
  }

  const visible = appeals.filter(a => a.status === tab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Appeals.</div>
          <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
            {appeals.filter(a => a.status === 'Pending').length} pending
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['Pending', 'Approved', 'Rejected'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '5px 14px', borderRadius: 7, background: tab === t ? C.btnBg : 'transparent', color: tab === t ? C.btnText : C.text3, border: `1px solid ${tab === t ? C.btnBg : C.border}`, fontFamily: F_SANS, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              {t} <span style={{ fontFamily: F_MONO, fontSize: 10, opacity: 0.7 }}>{appeals.filter(a => a.status === t).length}</span>
            </button>
          ))}
        </div>
      </div>

      {busy && <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}
      {!busy && visible.length === 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px', textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>No {tab.toLowerCase()} appeals.</div>
      )}

      {!busy && visible.map(a => {
        const sc = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.Pending;
        const tc = TYPE_COLOR[a.target_type] ?? { text: C.text2, soft: C.surface2, border: C.border };
        const isResolving = resolvingId === a.id;
        return (
          <div key={a.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{a.name ?? a.email}</span>
                  <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3 }}>{a.email}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 999, background: tc.soft, border: `1px solid ${tc.border}`, fontFamily: F_MONO, fontSize: 10, color: tc.text, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{a.target_type}</span>
                  <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3 }}>#{a.target_id}</span>
                  <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3 }}>{fmtDate(a.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: C.text2, fontStyle: 'italic' }}>&ldquo;{a.reason}&rdquo;</div>
                {a.resolution_note && (
                  <div style={{ marginTop: 8, fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>Note: {a.resolution_note}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ padding: '2px 9px', borderRadius: 999, background: sc.bg, border: `1px solid ${sc.border}`, fontFamily: F_MONO, fontSize: 10, color: sc.text }}>{a.status}</span>
                {a.status === 'Pending' && (
                  <button onClick={() => { setResolvingId(isResolving ? null : a.id); setResolveErr(null); setNote(''); setOutcome('Approved'); }}
                    style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12, color: C.text2, cursor: 'pointer' }}>
                    {isResolving ? 'Cancel' : 'Resolve'}
                  </button>
                )}
              </div>
            </div>
            {isResolving && (
              <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, background: C.surface2 }}>
                {resolveErr && <div style={{ marginBottom: 8, fontFamily: F_MONO, fontSize: 11, color: C.red }}>{resolveErr}</div>}
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Outcome</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['Approved', 'Rejected'] as const).map(o => (
                        <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: F_SANS, fontSize: 12.5, color: outcome === o ? C.text : C.text3 }}>
                          <input type="radio" checked={outcome === o} onChange={() => setOutcome(o)} style={{ accentColor: o === 'Approved' ? C.green : C.red }} />
                          {o}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Note (required)</label>
                    <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Resolution note…"
                      style={{ width: '100%', padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box' as const }} />
                  </div>
                  <button onClick={() => resolve(a.id)} disabled={resolveBusy}
                    style={{ padding: '7px 16px', background: outcome === 'Approved' ? C.green : C.red, color: C.onAccent, border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 600, cursor: resolveBusy ? 'not-allowed' : 'pointer', opacity: resolveBusy ? 0.6 : 1 }}>
                    {resolveBusy ? '…' : `Confirm ${outcome}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
