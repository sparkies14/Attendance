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

interface TardyMember {
  id: string; name: string; email: string; country: string;
  counts: { minor: number; major: number; awolHalf: number; awolFull: number };
  exceeded: boolean; reasons: string[];
}
interface Thresholds {
  threshold_minor_tardy: number; threshold_major_tardy: number;
  threshold_awol_half: number; threshold_awol_full: number;
}

const MOCK_MEMBERS: TardyMember[] = [
  { id: '1', name: 'Ana Cruz',     email: 'ana@example.com',   country: 'PH', counts: { minor: 4, major: 2, awolHalf: 0, awolFull: 0 }, exceeded: true,  reasons: ['Minor tardy exceeds threshold (4 > 3)'] },
  { id: '2', name: 'Ken Tanaka',   email: 'ken@example.com',   country: 'JP', counts: { minor: 1, major: 0, awolHalf: 0, awolFull: 0 }, exceeded: false, reasons: [] },
  { id: '3', name: 'Maria Santos', email: 'maria@example.com', country: 'PH', counts: { minor: 0, major: 0, awolHalf: 0, awolFull: 0 }, exceeded: false, reasons: [] },
];
const MOCK_THRESHOLDS: Thresholds = { threshold_minor_tardy: 3, threshold_major_tardy: 2, threshold_awol_half: 1, threshold_awol_full: 1 };
const FLAG: Record<string, string> = { PH: '🇵🇭', JP: '🇯🇵' };

export default function TardyPage({ apiUrl }: Props) {
  const [members,    setMembers]    = useState<TardyMember[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [busy,       setBusy]       = useState(false);
  const [awolBusy,   setAwolBusy]   = useState(false);
  const [awolMsg,    setAwolMsg]    = useState<string | null>(null);
  const [awolErr,    setAwolErr]    = useState<string | null>(null);

  useEffect(() => {
    setBusy(true);
    clientFetch(`${apiUrl}/admin/tardy-report`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setMembers(d.members ?? []); setThresholds(d.thresholds ?? null); }
        else   { setMembers(MOCK_MEMBERS); setThresholds(MOCK_THRESHOLDS); }
      })
      .catch(() => { setMembers(MOCK_MEMBERS); setThresholds(MOCK_THRESHOLDS); })
      .finally(() => setBusy(false));
  }, [apiUrl]);

  async function runAwolCheck() {
    setAwolBusy(true); setAwolMsg(null); setAwolErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/admin/run-awol-check`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) { setAwolMsg(data.message ?? `Done — ${data.affected ?? 0} rows affected.`); setTimeout(() => setAwolMsg(null), 4_000); }
      else        { setAwolErr(data.error ?? 'AWOL check failed.'); }
    } catch { setAwolErr('Network error.'); }
    finally { setAwolBusy(false); }
  }

  void F_SERIF;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Tardy &amp; AWOL.</div>
          <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>30-day window · {members.length} members</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {awolMsg && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.green }}>{awolMsg}</span>}
          {awolErr && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.red }}>{awolErr}</span>}
          <button onClick={runAwolCheck} disabled={awolBusy}
            style={{ padding: '8px 16px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 9, fontFamily: F_SANS, fontSize: 13, fontWeight: 500, cursor: awolBusy ? 'not-allowed' : 'pointer', opacity: awolBusy ? 0.6 : 1 }}>
            {awolBusy ? 'Running…' : 'Run AWOL Check'}
          </button>
        </div>
      </div>

      {thresholds && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([['Minor tardy', thresholds.threshold_minor_tardy, C.accent], ['Major tardy', thresholds.threshold_major_tardy, C.red], ['AWOL ½ day', thresholds.threshold_awol_half, C.red], ['AWOL full', thresholds.threshold_awol_full, C.red]] as [string, number, string][]).map(([lbl, v, tint]) => (
            <span key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: `${tint}12`, border: `1px solid ${tint}33`, fontFamily: F_MONO, fontSize: 10.5, color: tint }}>{lbl}: {v}</span>
          ))}
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {busy && <div style={{ padding: 24, fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}
        {!busy && members.length === 0 && <div style={{ padding: 40, textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>No active members.</div>}
        {!busy && members.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                {['Member', 'Country', 'Minor', 'Major', 'AWOL ½', 'AWOL Full', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? `1px solid ${C.border}` : 'none', background: m.exceeded ? C.redSoft : 'transparent' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.name}</div>
                    <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 2 }}>{m.email}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 14 }}>{FLAG[m.country] ?? m.country}</td>
                  {[m.counts.minor, m.counts.major, m.counts.awolHalf, m.counts.awolFull].map((n, ci) => (
                    <td key={ci} style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 13, color: n > 0 ? C.accent : C.text3, fontVariantNumeric: 'tabular-nums' }}>{n}</td>
                  ))}
                  <td style={{ padding: '12px 16px' }}>
                    {m.exceeded
                      ? <span title={m.reasons.join(' · ')} style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 999, background: C.redSoft, border: `1px solid ${C.redBorder}`, fontFamily: F_MONO, fontSize: 10, color: C.red, cursor: 'help' }}>Over threshold</span>
                      : <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3 }}>OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
