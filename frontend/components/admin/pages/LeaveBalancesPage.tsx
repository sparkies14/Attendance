'use client';
import React from 'react';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';
import { C, F_SANS, F_MONO, F_SERIF, tickTrack } from '../../theme';

interface Props { apiUrl: string; adminRole: string; }

interface BalanceMember {
  email: string; name: string; hire_year: number;
  grantsEarned: number; used: number; adjustments: number; balance: number;
}

const MOCK: BalanceMember[] = [
  { email: 'ana@example.com',   name: 'Ana Cruz',     hire_year: 2023, grantsEarned: 15, used: 5,  adjustments: 0,  balance: 10 },
  { email: 'ken@example.com',   name: 'Ken Tanaka',   hire_year: 2022, grantsEarned: 15, used: 12, adjustments: 2,  balance: 5  },
  { email: 'maria@example.com', name: 'Maria Santos', hire_year: 2024, grantsEarned: 10, used: 0,  adjustments: 0,  balance: 10 },
];

export default function LeaveBalancesPage({ apiUrl, adminRole }: Props) {
  const [members,        setMembers]        = useState<BalanceMember[]>([]);
  const [busy,           setBusy]           = useState(false);
  const [adjustingEmail, setAdjustingEmail] = useState<string | null>(null);
  const [adjAmount,      setAdjAmount]      = useState('');
  const [adjNote,        setAdjNote]        = useState('');
  const [adjBusy,        setAdjBusy]        = useState(false);
  const [adjErr,         setAdjErr]         = useState<string | null>(null);

  void adminRole;
  const inp: React.CSSProperties = { padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box' };

  function load() {
    setBusy(true);
    clientFetch(`${apiUrl}/leave-balance/all`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setMembers(d?.members ?? MOCK))
      .catch(() => setMembers(MOCK))
      .finally(() => setBusy(false));
  }
  useEffect(() => { load(); }, [apiUrl]);

  async function submitAdjust(email: string, e: React.FormEvent) {
    e.preventDefault();
    const amt = parseInt(adjAmount);
    if (!Number.isInteger(amt) || amt === 0) { setAdjErr('Amount must be a non-zero integer.'); return; }
    if (!adjNote.trim()) { setAdjErr('Note is required.'); return; }
    setAdjBusy(true); setAdjErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/leave-balance/adjust`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, amount: amt, note: adjNote }) });
      const data = await res.json();
      if (res.ok) { setAdjustingEmail(null); setAdjAmount(''); setAdjNote(''); load(); }
      else        { setAdjErr(data.error ?? 'Adjust failed.'); }
    } catch { setAdjErr('Network error.'); }
    finally { setAdjBusy(false); }
  }

  const totals = members.reduce((acc, m) => ({
    grantsEarned: acc.grantsEarned + m.grantsEarned,
    used: acc.used + m.used,
    adjustments: acc.adjustments + m.adjustments,
    balance: acc.balance + m.balance,
  }), { grantsEarned: 0, used: 0, adjustments: 0, balance: 0 });

  const maxGrants = Math.max(...members.map(m => m.grantsEarned), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div>
        <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Leave balances.</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>{members.length} members · current year</div>
      </div>

      {busy && <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}

      {!busy && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                {['Member', 'Hire year', 'Grants earned', 'Used', 'Adjustments', 'Balance', 'Fill', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const isAdj = adjustingEmail === m.email;
                const usedPct  = m.grantsEarned > 0 ? Math.min(100, Math.round((m.used / m.grantsEarned) * 100)) : 0;
                const fillColor = m.balance <= 0 ? C.red : m.balance <= 3 ? C.accent : C.green;
                return (
                  <React.Fragment key={m.email}>
                    <tr style={{ borderBottom: isAdj ? 'none' : i < members.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.name}</div>
                        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 1 }}>{m.email}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: C.text2 }}>{m.hire_year}</td>
                      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{m.grantsEarned}</td>
                      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: C.text2, fontVariantNumeric: 'tabular-nums' }}>{m.used}</td>
                      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: m.adjustments > 0 ? C.green : m.adjustments < 0 ? C.red : C.text3, fontVariantNumeric: 'tabular-nums' }}>
                        {m.adjustments > 0 ? `+${m.adjustments}` : m.adjustments}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 13, fontWeight: 600, color: fillColor, fontVariantNumeric: 'tabular-nums' }}>{m.balance}</td>
                      {/* Fill-bar track with tickTrack */}
                      <td style={{ padding: '12px 16px', minWidth: 100 }}>
                        <div style={{ ...tickTrack, height: 8, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                          <div style={{
                            position: 'relative', zIndex: 1,
                            width: `${usedPct}%`, height: '100%',
                            background: fillColor,
                            borderRadius: 4,
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                        <div style={{ fontFamily: F_MONO, fontSize: 9, color: C.text3, marginTop: 3, zIndex: 2, position: 'relative' }}>{usedPct}% used</div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button onClick={() => { setAdjustingEmail(isAdj ? null : m.email); setAdjAmount(''); setAdjNote(''); setAdjErr(null); }}
                          style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: F_MONO, fontSize: 10.5, color: C.text2, cursor: 'pointer' }}>
                          {isAdj ? 'Cancel' : 'Adjust'}
                        </button>
                      </td>
                    </tr>
                    {isAdj && (
                      <tr style={{ borderBottom: i < members.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <td colSpan={8} style={{ padding: '12px 16px', background: C.surface2 }}>
                          {adjErr && <div style={{ marginBottom: 8, fontFamily: F_MONO, fontSize: 11, color: C.red }}>{adjErr}</div>}
                          <form onSubmit={e => submitAdjust(m.email, e)} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div>
                              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Amount (±)</label>
                              <input type="number" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} required placeholder="+2 or -1" style={{ ...inp, width: 100 }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 200 }}>
                              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Note</label>
                              <input type="text" value={adjNote} onChange={e => setAdjNote(e.target.value)} required placeholder="Reason for adjustment…" style={{ ...inp, width: '100%' }} />
                            </div>
                            <button type="submit" disabled={adjBusy}
                              style={{ padding: '7px 14px', background: C.btnBg, color: C.btnText, border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: adjBusy ? 'not-allowed' : 'pointer', opacity: adjBusy ? 0.6 : 1 }}>
                              {adjBusy ? '…' : 'Submit'}
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {/* Totals row */}
              {members.length > 0 && (
                <tr style={{ borderTop: `1.5px solid ${C.borderStrong}`, background: C.surface2 }}>
                  <td style={{ padding: '10px 16px', fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' }} colSpan={2}>Totals</td>
                  <td style={{ padding: '10px 16px', fontFamily: F_MONO, fontSize: 12.5, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{totals.grantsEarned}</td>
                  <td style={{ padding: '10px 16px', fontFamily: F_MONO, fontSize: 12.5, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{totals.used}</td>
                  <td style={{ padding: '10px 16px', fontFamily: F_MONO, fontSize: 12.5, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{totals.adjustments > 0 ? `+${totals.adjustments}` : totals.adjustments}</td>
                  <td style={{ padding: '10px 16px', fontFamily: F_MONO, fontSize: 12.5, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{totals.balance}</td>
                  <td />
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
