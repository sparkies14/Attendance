'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Props { apiUrl: string; adminRole: string; }

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

interface AuditItem { id: number; occurred_at: string; actor_email: string; action: string; details: Record<string, unknown> | null; }

const MOCK: AuditItem[] = [
  { id: 5, occurred_at: '2026-06-01T09:00:00Z', actor_email: 'admin@example.com', action: 'ATTENDANCE_APPROVED', details: { target_id: 42 } },
  { id: 4, occurred_at: '2026-05-31T16:30:00Z', actor_email: 'owner@example.com',  action: 'POLICY_UPDATED',      details: { key: 'threshold_minor_tardy', new_value: 3 } },
  { id: 3, occurred_at: '2026-05-30T11:00:00Z', actor_email: 'admin@example.com', action: 'LEAVE_APPROVED',       details: { target_id: 7 } },
  { id: 2, occurred_at: '2026-05-29T08:45:00Z', actor_email: 'owner@example.com',  action: 'MEMBER_PROMOTED',     details: { target_email: 'ana@example.com' } },
  { id: 1, occurred_at: '2026-05-28T14:00:00Z', actor_email: 'admin@example.com', action: 'ATTENDANCE_REJECTED',  details: { target_id: 39 } },
];

function fmtDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return iso; }
}

export default function AuditLogPage({ apiUrl, adminRole }: Props) {
  const [items,       setItems]       = useState<AuditItem[]>([]);
  const [busy,        setBusy]        = useState(false);
  const [page,        setPage]        = useState(1);
  const [total,       setTotal]       = useState(0);
  const PAGE_SIZE = 50;
  const [filterActor,  setFilterActor]  = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');
  const [expanded,     setExpanded]     = useState<Set<number>>(new Set());
  const [purgeBefore,  setPurgeBefore]  = useState('');
  const [purgeBusy,    setPurgeBusy]    = useState(false);
  const [purgeMsg,     setPurgeMsg]     = useState<string | null>(null);
  const [purgeErr,     setPurgeErr]     = useState<string | null>(null);

  const isOwner = adminRole === 'owner';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inp: React.CSSProperties = { padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_MONO, fontSize: 11.5, color: C.text, background: C.bg, boxSizing: 'border-box' };

  function buildUrl(p: number) {
    const params = new URLSearchParams({ page: String(p) });
    if (filterActor)  params.set('actor',  filterActor);
    if (filterAction) params.set('action', filterAction);
    if (filterFrom)   params.set('from',   filterFrom);
    if (filterTo)     params.set('to',     filterTo);
    return `${apiUrl}/audit?${params}`;
  }

  function load(p = 1) {
    setBusy(true);
    clientFetch(buildUrl(p))
      .then(r => r.ok ? r.json() : null)
      .then(d => { setItems(d?.items ?? MOCK); setTotal(d?.total ?? MOCK.length); })
      .catch(() => { setItems(MOCK); setTotal(MOCK.length); })
      .finally(() => setBusy(false));
  }
  useEffect(() => { load(page); }, [page, apiUrl]);

  function applyFilters(e: React.FormEvent) { e.preventDefault(); setPage(1); load(1); }

  function toggleExpand(id: number) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function purge(e: React.FormEvent) {
    e.preventDefault();
    setPurgeBusy(true); setPurgeMsg(null); setPurgeErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/audit?before=${encodeURIComponent(purgeBefore)}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) { setPurgeMsg(`Purged ${data.rows_deleted ?? 0} rows before ${purgeBefore}.`); setPurgeBefore(''); load(1); }
      else        { setPurgeErr(data.error ?? 'Purge failed.'); }
    } catch { setPurgeErr('Network error.'); }
    finally { setPurgeBusy(false); }
  }

  void F_SERIF;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200 }}>
      <div>
        <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Audit log.</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>{total} entries · 50 per page</div>
      </div>

      {/* Filter bar */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 20px' }}>
        <form onSubmit={applyFilters} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Actor email</label>
            <input value={filterActor} onChange={e => setFilterActor(e.target.value)} placeholder="email…" style={{ ...inp, width: 180 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Action</label>
            <input value={filterAction} onChange={e => setFilterAction(e.target.value)} placeholder="ATTENDANCE_APPROVED…" style={{ ...inp, width: 200 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>From</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>To</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={inp} />
          </div>
          <button type="submit" style={{ padding: '7px 16px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Apply</button>
          <button type="button" onClick={() => { setFilterActor(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); setPage(1); setTimeout(() => load(1), 0); }}
            style={{ padding: '7px 14px', background: 'transparent', color: C.text3, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, cursor: 'pointer' }}>Clear</button>
        </form>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {busy && <div style={{ padding: 24, fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}
        {!busy && items.length === 0 && <div style={{ padding: 40, textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>No log entries match the filter.</div>}
        {!busy && items.length > 0 && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                  {['Time', 'Actor', 'Action', 'Details'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const isExpanded = expanded.has(item.id);
                  return (
                    <tr key={item.id} onClick={() => item.details && toggleExpand(item.id)}
                      style={{ borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none', cursor: item.details ? 'pointer' : 'default' }}>
                      <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 11.5, color: C.text3, whiteSpace: 'nowrap' }}>{fmtDateTime(item.occurred_at)}</td>
                      <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 11.5, color: C.text2 }}>{item.actor_email}</td>
                      <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 11.5, color: C.text }}>{item.action}</td>
                      <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>
                        {item.details && (
                          isExpanded
                            ? <pre style={{ margin: 0, fontSize: 10.5, background: C.surface2, padding: '6px 10px', borderRadius: 6, overflowX: 'auto' }}>{JSON.stringify(item.details, null, 2)}</pre>
                            : <span>{JSON.stringify(item.details).slice(0, 60)}{JSON.stringify(item.details).length > 60 ? '…' : ''}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Pagination */}
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, background: C.surface2, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: F_SANS, fontSize: 12, color: C.text2, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>← Prev</button>
              <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: F_SANS, fontSize: 12, color: C.text2, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>Next →</button>
            </div>
          </>
        )}
      </div>

      {/* Purge section — owner only */}
      {isOwner && (
        <div style={{ background: C.surface, border: `1px solid ${C.redBorder}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.red, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Purge old logs</div>
          {purgeMsg && <div style={{ marginBottom: 8, fontFamily: F_MONO, fontSize: 11, color: C.green }}>{purgeMsg}</div>}
          {purgeErr && <div style={{ marginBottom: 8, fontFamily: F_MONO, fontSize: 11, color: C.red }}>{purgeErr}</div>}
          <form onSubmit={purge} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Delete entries before</label>
              <input type="date" value={purgeBefore} onChange={e => setPurgeBefore(e.target.value)} required style={inp} />
            </div>
            <button type="submit" disabled={purgeBusy}
              style={{ padding: '7px 16px', background: C.red, color: '#fafafa', border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: purgeBusy ? 'not-allowed' : 'pointer', opacity: purgeBusy ? 0.6 : 1 }}>
              {purgeBusy ? 'Purging…' : 'Purge'}
            </button>
          </form>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 8 }}>Must be at least 24 hours in the past. Irreversible.</div>
        </div>
      )}
    </div>
  );
}
