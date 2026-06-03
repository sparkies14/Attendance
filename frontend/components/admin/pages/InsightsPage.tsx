'use client';

import { useState, useEffect, useContext } from 'react';
import { C, F_SERIF, F_SANS, F_MONO } from '../../theme';
import { ThemeModeContext } from '../../useThemeMode';
import { clientFetch } from '@/lib/clientFetch';

// ── Dev mock data (same shape as real API responses) ───────────────────────
const MOCK_TARDY = {
  from: '', to: '',
  members: [
    { name: 'Sofia Cruz',    email: 'sofia@anosupo.ai',    country: 'PH', minor: 2, major: 2, awolHalf: 1, awolFull: 1, total: 6 },
    { name: 'Priya Iyer',    email: 'priya@anosupo.ai',    country: 'PH', minor: 3, major: 1, awolHalf: 1, awolFull: 0, total: 5 },
    { name: 'Hana Watanabe', email: 'hana@anosupo.ai',     country: 'JP', minor: 1, major: 2, awolHalf: 0, awolFull: 1, total: 4 },
    { name: 'Kenji Tanaka',  email: 'kenji@anosupo.ai',    country: 'JP', minor: 2, major: 1, awolHalf: 0, awolFull: 0, total: 3 },
    { name: 'Aki Sato',      email: 'aki@anosupo.ai',      country: 'JP', minor: 1, major: 0, awolHalf: 0, awolFull: 0, total: 1 },
    { name: 'Jorge Diaz',    email: 'jorge@anosupo.ai',    country: 'PH', minor: 0, major: 1, awolHalf: 0, awolFull: 0, total: 1 },
    { name: 'Yuki Mori',     email: 'yuki@anosupo.ai',     country: 'JP', minor: 1, major: 0, awolHalf: 0, awolFull: 0, total: 1 },
    { name: 'Marisol Reyes', email: 'marisol@anosupo.ai',  country: 'PH', minor: 0, major: 0, awolHalf: 0, awolFull: 0, total: 0 },
    { name: 'Jorge Brown',   email: 'ethan@anosupo.ai',    country: 'PH', minor: 0, major: 0, awolHalf: 0, awolFull: 0, total: 0 },
    { name: 'Daniel Kim',    email: 'daniel@anosupo.ai',   country: 'JP', minor: 0, major: 0, awolHalf: 0, awolFull: 0, total: 0 },
  ],
  byCountry: [
    { country: 'JP', minor: 5, major: 3, awolHalf: 0, awolFull: 2, total: 10 },
    { country: 'PH', minor: 5, major: 4, awolHalf: 2, awolFull: 1, total: 12 },
  ],
};
const MOCK_LEAVE = {
  from: '', to: '',
  members: [
    { name: 'Priya Iyer',    email: 'priya@anosupo.ai',    entitled: 15, used: 8, remaining: 7,  usedInRange: 1 },
    { name: 'Jorge Diaz',    email: 'jorge@anosupo.ai',    entitled: 12, used: 6, remaining: 6,  usedInRange: 2 },
    { name: 'Marisol Reyes', email: 'marisol@anosupo.ai',  entitled: 15, used: 5, remaining: 10, usedInRange: 0 },
    { name: 'Sofia Cruz',    email: 'sofia@anosupo.ai',    entitled: 15, used: 4, remaining: 11, usedInRange: 1 },
    { name: 'Kenji Tanaka',  email: 'kenji@anosupo.ai',    entitled: 15, used: 3, remaining: 12, usedInRange: 1 },
    { name: 'Aki Sato',      email: 'aki@anosupo.ai',      entitled: 15, used: 2, remaining: 13, usedInRange: 1 },
    { name: 'Hana Watanabe', email: 'hana@anosupo.ai',     entitled: 15, used: 1, remaining: 14, usedInRange: 0 },
    { name: 'Daniel Kim',    email: 'daniel@anosupo.ai',   entitled: 15, used: 1, remaining: 14, usedInRange: 0 },
    { name: 'Yuki Mori',     email: 'yuki@anosupo.ai',     entitled: 15, used: 0, remaining: 15, usedInRange: 0 },
    { name: 'Ethan Brown',   email: 'ethan@anosupo.ai',    entitled: 15, used: 0, remaining: 15, usedInRange: 0 },
  ],
};
const MOCK_DISC = {
  from: '', to: '',
  members: [
    { name: 'Sofia Cruz',    email: 'sofia@anosupo.ai',    total: 2, active: 1, voided: 1, issuedInRange: 1 },
    { name: 'Priya Iyer',    email: 'priya@anosupo.ai',    total: 1, active: 1, voided: 0, issuedInRange: 0 },
    { name: 'Hana Watanabe', email: 'hana@anosupo.ai',     total: 1, active: 1, voided: 0, issuedInRange: 1 },
  ],
};
const MOCK_ATTENTION = {
  members: [
    { name: 'Sofia Cruz',    email: 'sofia@anosupo.ai',    reasons: ['2+ tardies this month', 'Active warning'] },
    { name: 'Priya Iyer',    email: 'priya@anosupo.ai',    reasons: ['2+ tardies this month', 'Active warning'] },
    { name: 'Hana Watanabe', email: 'hana@anosupo.ai',     reasons: ['Active warning'] },
  ],
};

interface Props {
  apiUrl: string;
}

// ── Tardy category definitions ──────────────────────────────────────────────
const TARDY_CATS = [
  { key: 'minor'    as const, label: 'Minor',     short: '9:11–9:30',   color: C.accent },
  { key: 'major'    as const, label: 'Major',     short: '9:31–11:00',  color: C.orange },
  { key: 'awolHalf' as const, label: 'AWOL ½',    short: 'after 11:00', color: C.purple },
  { key: 'awolFull' as const, label: 'AWOL full', short: 'no clock-in', color: C.red    },
];

// ── API response types ──────────────────────────────────────────────────────
interface TardyMember   { name: string; email: string; country: string; minor: number; major: number; awolHalf: number; awolFull: number; total: number; }
interface TardyCountry  { country: string; minor: number; major: number; awolHalf: number; awolFull: number; total: number; }
interface TardyData     { from: string; to: string; members: TardyMember[]; byCountry: TardyCountry[]; }
interface LeaveMember   { name: string; email: string; entitled: number; used: number; remaining: number; usedInRange: number; }
interface LeaveData     { from: string; to: string; members: LeaveMember[]; }
interface DiscMember    { name: string; email: string; total: number; active: number; voided: number; issuedInRange: number; }
interface DiscData      { from: string; to: string; members: DiscMember[]; }
interface AttentionMember { name: string; email: string; reasons: string[]; }
interface AttentionData   { members: AttentionMember[]; }

// ── Date helpers ────────────────────────────────────────────────────────────
function todayISO(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function monthStart(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
function daysAgo(n: number): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function quarterStart(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const q = Math.floor(d.getMonth() / 3);
  return `${d.getFullYear()}-${String(q*3+1).padStart(2,'0')}-01`;
}

// ── Initials helper ─────────────────────────────────────────────────────────
function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Skeleton component ──────────────────────────────────────────────────────
function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 20, borderRadius: 6, background: C.surface2, opacity: 0.7, width: `${70 + (i * 7) % 30}%` }} />
      ))}
    </div>
  );
}

// ── Error / empty components ────────────────────────────────────────────────
function CardError({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div style={{ padding: '24px 18px', textAlign: 'center' }}>
      <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.red }}>{msg}</div>
      <button onClick={onRetry} style={{ marginTop: 8, padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.text2, fontFamily: F_SANS, fontSize: 11, cursor: 'pointer' }}>Retry</button>
    </div>
  );
}
function CardEmpty({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '24px 18px', textAlign: 'center', fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>{msg}</div>
  );
}

// ── KPI Tile ────────────────────────────────────────────────────────────────
function KpiTile({ label, big, sub, tint, alert, noBorder }: {
  label: string; big: string; sub: string; tint: string;
  alert?: boolean; noBorder?: boolean;
}) {
  return (
    <div style={{ padding: '20px 20px', borderRight: noBorder ? 'none' : `1px solid ${C.border}`, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {alert && <div style={{ position: 'absolute', top: 16, right: 16, width: 7, height: 7, borderRadius: '50%', background: C.red, boxShadow: `0 0 0 3px ${C.redSoft}` }} />}
      <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>{label}</div>
      <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 42, lineHeight: 0.9, color: tint, letterSpacing: '-0.03em', marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>{big}</div>
      <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.03em', marginTop: 8 }}>{sub}</div>
    </div>
  );
}

// ── Section Card ────────────────────────────────────────────────────────────
function SectionCard({ title, sub, report, range, onDownload, hasPaddingTop, children }: {
  title: string; sub: string; report: 'tardy' | 'leave' | 'discipline';
  range: { from: string; to: string };
  onDownload: (path: string, filename: string) => void;
  hasPaddingTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '15px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 21, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>{title}</div>
          <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginTop: 5 }}>{sub}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['CSV', 'PDF'] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => onDownload(`/reports/export/${report}.${fmt.toLowerCase()}?from=${range.from}&to=${range.to}`, `${report}-${range.from}-${range.to}.${fmt.toLowerCase()}`)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.text2, fontFamily: F_MONO, fontSize: 10.5, letterSpacing: '0.04em', cursor: 'pointer' }}
            >
              ↓ {fmt}
            </button>
          ))}
        </div>
      </div>
      <div style={{ paddingTop: hasPaddingTop ? 14 : 0 }}>{children}</div>
    </div>
  );
}

// ── Tardy stacked bar row ────────────────────────────────────────────────────
function TardyRow({ m, max, isLast }: { m: TardyMember; max: number; isLast: boolean }) {
  const barW = max > 0 ? (m.total / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
      <div style={{ width: 158, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: C.surface2, color: C.text3, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(m.name)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: C.text, lineHeight: 1.15, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
          <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, marginTop: 1, letterSpacing: '0.04em' }}>{m.country}</div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 16, background: C.surface2, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ display: 'flex', height: '100%', width: `${barW}%`, minWidth: 4, borderRadius: 4, overflow: 'hidden' }}>
            {TARDY_CATS.map((cat) => (
              m[cat.key] > 0 ? (
                <div
                  key={cat.key}
                  style={{ width: `${(m[cat.key] / m.total) * 100}%`, background: cat.color }}
                  title={`${cat.label}: ${m[cat.key]}`}
                />
              ) : null
            ))}
          </div>
        </div>
        <span style={{ fontFamily: F_MONO, fontSize: 13, color: C.text, fontVariantNumeric: 'tabular-nums', width: 18, textAlign: 'right' as const }}>{m.total}</span>
      </div>
    </div>
  );
}

// ── By-country stacked row ──────────────────────────────────────────────────
function CountryRow({ co, max }: { co: TardyCountry; max: number }) {
  const barW = max > 0 ? (co.total / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 88, fontFamily: F_MONO, fontSize: 12, color: C.text2, fontWeight: 500, flexShrink: 0 }}>
        {co.country}
      </span>
      <div style={{ flex: 1, height: 14, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ display: 'flex', height: '100%', width: `${barW}%`, minWidth: 4 }}>
          {TARDY_CATS.map((cat) => (
            co[cat.key] > 0 ? (
              <div key={cat.key} style={{ width: `${(co[cat.key] / co.total) * 100}%`, background: cat.color }} />
            ) : null
          ))}
        </div>
      </div>
      <span style={{ fontFamily: F_MONO, fontSize: 12, color: C.text, fontVariantNumeric: 'tabular-nums', width: 18, textAlign: 'right' as const }}>{co.total}</span>
    </div>
  );
}

// ── Leave table header cell ─────────────────────────────────────────────────
function ThIns({ w, right, children }: { w: string; right?: boolean; children: React.ReactNode }) {
  return (
    <th style={{ width: w, textAlign: right ? 'right' : 'left', padding: '10px 16px', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>{children}</th>
  );
}

// ── Leave row ───────────────────────────────────────────────────────────────
function LeaveRow({ m, isLast }: { m: LeaveMember; isLast: boolean }) {
  const pct = m.entitled > 0 ? (m.used / m.entitled) * 100 : 0;
  const high = pct >= 60;
  return (
    <tr style={{ borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
      <td style={{ padding: '11px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: C.surface2, color: C.text3, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(m.name)}</span>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: C.text }}>{m.name}</div>
        </div>
      </td>
      <td style={{ padding: '11px 16px' }}>
        <div style={{ height: 12, background: C.surface2, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: high ? C.accent : C.green, borderRadius: 4 }} />
        </div>
        <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, marginTop: 3, letterSpacing: '0.03em' }}>{m.used} / {m.entitled} days · {Math.round(pct)}%</div>
      </td>
      <td style={{ padding: '11px 16px', textAlign: 'right' as const, fontFamily: F_MONO, fontSize: 12.5, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{m.used}d</td>
      <td style={{ padding: '11px 16px', textAlign: 'right' as const, fontFamily: F_MONO, fontSize: 12.5, color: C.text2, fontVariantNumeric: 'tabular-nums' }}>{m.remaining}d</td>
      <td style={{ padding: '11px 16px', textAlign: 'right' as const, fontFamily: F_MONO, fontSize: 12.5, color: m.usedInRange > 0 ? C.purple : C.text3, fontVariantNumeric: 'tabular-nums' }}>{m.usedInRange > 0 ? `${m.usedInRange}d` : '—'}</td>
    </tr>
  );
}

// ── Discipline mini stat ────────────────────────────────────────────────────
function MiniStat({ label, v, tint, noBorder }: { label: string; v: number; tint: string; noBorder?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '13px 16px', borderRight: noBorder ? 'none' : `1px solid ${C.border}` }}>
      <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>{label}</div>
      <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 28, color: tint, letterSpacing: '-0.02em', lineHeight: 1, marginTop: 6 }}>{v}</div>
    </div>
  );
}

// ── Range Picker ────────────────────────────────────────────────────────────
function RangePicker({
  preset, range, onPreset, onRangeChange,
}: {
  preset: 'month' | '30d' | 'quarter' | 'custom';
  range: { from: string; to: string };
  onPreset: (p: 'month' | '30d' | 'quarter') => void;
  onRangeChange: (key: 'from' | 'to', val: string) => void;
}) {
  const pills: { id: 'month' | '30d' | 'quarter'; label: string }[] = [
    { id: 'month',   label: 'Month'   },
    { id: '30d',     label: '30d'     },
    { id: 'quarter', label: 'Quarter' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {pills.map((p) => {
          const active = preset !== 'custom' && preset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onPreset(p.id)}
              style={{
                padding: '6px 11px', borderRadius: 999,
                border: `1px solid ${active ? C.accentBorder : C.border}`,
                background: active ? C.accentSoft : C.surface,
                color: active ? C.accent : C.text2,
                fontFamily: F_SANS, fontSize: 11.5,
                fontWeight: active ? 500 : 400, cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <span style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>⌕</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <span style={{ fontFamily: F_MONO, fontSize: 9, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>from</span>
        <input
          type="date"
          value={range.from}
          onChange={e => onRangeChange('from', e.target.value)}
          style={{ fontFamily: F_MONO, fontSize: 12, color: C.text, fontVariantNumeric: 'tabular-nums', border: 'none', outline: 'none', background: 'transparent', cursor: 'pointer' }}
        />
      </div>
      <span style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>→</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <span style={{ fontFamily: F_MONO, fontSize: 9, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>to</span>
        <input
          type="date"
          value={range.to}
          onChange={e => onRangeChange('to', e.target.value)}
          style={{ fontFamily: F_MONO, fontSize: 12, color: C.text, fontVariantNumeric: 'tabular-nums', border: 'none', outline: 'none', background: 'transparent', cursor: 'pointer' }}
        />
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function InsightsPage({ apiUrl }: Props) {
  const mode = useContext(ThemeModeContext);
  // CHART palette: hex literals required — CSS vars don't resolve in Recharts SVG attributes
  const CHART = mode === 'dark'
    ? { grid: 'rgba(255,255,255,.08)', axis: '#9b9ba3',
        series: ['#54e6ff','#5fd98a','#f2b85c','#a99bff','#ff6b6b'],
        tipBg: '#131418', tipText: '#edecf0', tipBorder: 'rgba(255,255,255,.14)' }
    : { grid: 'rgba(40,28,8,.10)', axis: '#5f574a',
        series: ['#0aa2c0','#157f3b','#b8791a','#6d4bd6','#c63d1f'],
        tipBg: '#fffdf7', tipText: '#211a12', tipBorder: 'rgba(40,28,8,.16)' };

  type Preset = 'month' | '30d' | 'quarter' | 'custom';
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange]   = useState({ from: monthStart(), to: todayISO() });

  const [tardy,     setTardy]     = useState<{ data: TardyData | null;     loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [leave,     setLeave]     = useState<{ data: LeaveData | null;     loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [disc,      setDisc]      = useState<{ data: DiscData | null;      loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [attention, setAttention] = useState<{ data: AttentionData | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });

  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────
  async function fetchAll(isCancelled?: () => boolean) {
    const cancelled = isCancelled ?? (() => false);
    setTardy(s     => ({ ...s, loading: true, error: null }));
    setLeave(s     => ({ ...s, loading: true, error: null }));
    setDisc(s      => ({ ...s, loading: true, error: null }));
    setAttention(s => ({ ...s, loading: true, error: null }));

    const [t, l, d, a] = await Promise.all([
      clientFetch(`${apiUrl}/reports/tardy?from=${range.from}&to=${range.to}`, {}).then(r => r.ok ? r.json() : null).catch(() => null),
      clientFetch(`${apiUrl}/reports/leave?from=${range.from}&to=${range.to}`, {}).then(r => r.ok ? r.json() : null).catch(() => null),
      clientFetch(`${apiUrl}/reports/discipline?from=${range.from}&to=${range.to}`, {}).then(r => r.ok ? r.json() : null).catch(() => null),
      clientFetch(`${apiUrl}/reports/attention`, {}).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    if (cancelled()) return;
    // Use mock in dev when: all fetches failed (no backend) OR data came back but has no members
    // This ensures the UI is always populated locally regardless of DB state
    const isDev = process.env.NODE_ENV === 'development';
    const noMembers = (t?.members?.length ?? 0) === 0 && (l?.members?.length ?? 0) === 0;
    const useMock = isDev && (!t || noMembers);
    setTardy(    { data: useMock ? { ...MOCK_TARDY, from: range.from, to: range.to } : t, loading: false, error: (!useMock && !t) ? 'Failed to load' : null });
    setLeave(    { data: useMock ? { ...MOCK_LEAVE, from: range.from, to: range.to } : l, loading: false, error: (!useMock && !l) ? 'Failed to load' : null });
    setDisc(     { data: useMock ? { ...MOCK_DISC,  from: range.from, to: range.to } : d, loading: false, error: (!useMock && !d) ? 'Failed to load' : null });
    setAttention({ data: useMock ? MOCK_ATTENTION : a, loading: false, error: (!useMock && !a) ? 'Failed to load' : null });
  }

  useEffect(() => {
    let cancelled = false;
    fetchAll(() => cancelled);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  // ── File download helper ───────────────────────────────────────────────
  async function downloadFile(path: string, filename: string) {
    try {
      const res = await clientFetch(`${apiUrl}${path}`, {});
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch { /* silent */ }
  }

  // ── Preset handler ─────────────────────────────────────────────────────
  function applyPreset(p: 'month' | '30d' | 'quarter') {
    setPreset(p);
    const today = todayISO();
    if (p === 'month')   setRange({ from: monthStart(),   to: today });
    if (p === '30d')     setRange({ from: daysAgo(30),    to: today });
    if (p === 'quarter') setRange({ from: quarterStart(), to: today });
  }

  // ── Derived KPIs ───────────────────────────────────────────────────────
  const tardyMembers  = tardy.data?.members ?? [];
  const byCountry     = tardy.data?.byCountry ?? [];
  const leaveMembers  = leave.data?.members ?? [];
  const discMembers   = disc.data?.members ?? [];
  const attMembers    = attention.data?.members ?? [];

  const tardyTotal    = tardyMembers.reduce((s, m) => s + m.total, 0);
  const awolHalfSum   = tardyMembers.reduce((s, m) => s + m.awolHalf, 0);
  const awolFullSum   = tardyMembers.reduce((s, m) => s + m.awolFull, 0);
  const awolDays      = awolHalfSum * 0.5 + awolFullSum;
  const leaveInRange  = leaveMembers.reduce((s, m) => s + m.usedInRange, 0);
  const activeWarn    = discMembers.reduce((s, m) => s + m.active, 0);
  // Use leaveMembers.length as best proxy for total team size
  // (leave API returns all active members, unlike tardy which only has those with tardies)
  const headcount     = Math.max(leaveMembers.length || tardyMembers.length, 1);

  // Working days approximation: count Mon–Fri in range
  const expectedClockins = (() => {
    let count = 0;
    const d = new Date(range.from + 'T12:00:00+09:00');
    const end = new Date(range.to + 'T12:00:00+09:00');
    while (d <= end) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) count++; d.setDate(d.getDate()+1); }
    return count * headcount;
  })();

  const onTimeRate = expectedClockins > 0
    ? ((Math.max(0, expectedClockins - tardyTotal) / expectedClockins) * 100).toFixed(1)
    : '—';

  // Sorted by total desc
  const sortedTardyMembers = [...tardyMembers].sort((a, b) => b.total - a.total);
  const maxTardyTotal = sortedTardyMembers[0]?.total ?? 1;
  const maxCountryTotal = byCountry.length > 0 ? Math.max(...byCountry.map(c => c.total)) : 1;

  const voidedTotal      = discMembers.reduce((s, m) => s + m.voided, 0);
  const inRangeTotal     = discMembers.reduce((s, m) => s + m.issuedInRange, 0);

  // Export menu items
  const EXPORT_ITEMS = [
    { label: 'Tardy CSV',       path: `/reports/export/tardy.csv?from=${range.from}&to=${range.to}`,       file: `tardy-${range.from}-${range.to}.csv`       },
    { label: 'Tardy PDF',       path: `/reports/export/tardy.pdf?from=${range.from}&to=${range.to}`,       file: `tardy-${range.from}-${range.to}.pdf`       },
    { label: 'Leave CSV',       path: `/reports/export/leave.csv?from=${range.from}&to=${range.to}`,       file: `leave-${range.from}-${range.to}.csv`       },
    { label: 'Leave PDF',       path: `/reports/export/leave.pdf?from=${range.from}&to=${range.to}`,       file: `leave-${range.from}-${range.to}.pdf`       },
    { label: 'Discipline CSV',  path: `/reports/export/discipline.csv?from=${range.from}&to=${range.to}`,  file: `discipline-${range.from}-${range.to}.csv`  },
    { label: 'Discipline PDF',  path: `/reports/export/discipline.pdf?from=${range.from}&to=${range.to}`,  file: `discipline-${range.from}-${range.to}.pdf`  },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1340, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>
            Reports &amp; <span style={{ fontStyle: 'italic', color: C.text2 }}>insights.</span>
          </div>
          <div style={{ fontFamily: F_MONO, fontSize: 11.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
            Tardiness · leave · discipline · {tardyMembers.length > 0 ? tardyMembers.length : leaveMembers.length > 0 ? leaveMembers.length : '—'} members · JST
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <RangePicker
            preset={preset}
            range={range}
            onPreset={applyPreset}
            onRangeChange={(key, val) => { setPreset('custom'); setRange(r => ({ ...r, [key]: val })); }}
          />
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setExportMenuOpen(v => !v)}
              style={{ padding: '8px 14px', background: C.btnBg, color: C.btnText, border: 'none', borderRadius: 9, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}
            >
              ↓ Export all
            </button>
            {exportMenuOpen && (
              <div
                style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', zIndex: 50, minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
              >
                {EXPORT_ITEMS.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => { downloadFile(item.path, item.file); setExportMenuOpen(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'transparent', border: 'none', fontFamily: F_MONO, fontSize: 11, color: C.text2, cursor: 'pointer', letterSpacing: '0.02em' }}
                  >
                    ↓ {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI band ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', alignItems: 'stretch' }}>

          {/* Hero tile: Tardy events */}
          <div style={{ padding: '20px 24px', borderRight: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Tardy events · in range</div>
            {tardy.loading ? (
              <Skeleton rows={3} />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                  <div style={{ fontFamily: F_SERIF, fontSize: 60, lineHeight: 0.85, color: C.text, letterSpacing: '-0.035em', fontVariantNumeric: 'tabular-nums' }}>{tardyTotal}</div>
                  <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, marginBottom: 6 }}>events</div>
                </div>
                {/* Stacked split bar */}
                <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', marginTop: 14, background: C.surface2 }}>
                  {tardyTotal > 0 ? TARDY_CATS.map((cat) => {
                    const v = tardyMembers.reduce((s, m) => s + m[cat.key], 0);
                    return v > 0 ? <div key={cat.key} style={{ width: `${(v / tardyTotal) * 100}%`, background: cat.color }} /> : null;
                  }) : <div style={{ width: '100%', background: C.surface2 }} />}
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
                  {TARDY_CATS.map((cat) => {
                    const v = tardyMembers.reduce((s, m) => s + m[cat.key], 0);
                    return (
                      <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: cat.color }} />
                        <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text2 }}>{cat.label}</span>
                        <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3 }}>{v}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* On-time rate */}
          <KpiTile
            label="On-time rate"
            big={tardy.loading ? '…' : `${onTimeRate}%`}
            sub={tardy.loading ? '' : `${expectedClockins - tardyTotal} of ${expectedClockins} clock-ins`}
            tint={C.green}
          />

          {/* AWOL days */}
          <KpiTile
            label="AWOL days"
            big={tardy.loading ? '…' : awolDays.toFixed(1)}
            sub="½ + full · in range"
            tint={C.red}
          />

          {/* Leave used */}
          <KpiTile
            label="Leave used"
            big={leave.loading ? '…' : `${leaveInRange}d`}
            sub="approved · in range"
            tint={C.purple}
          />

          {/* Active warnings */}
          <KpiTile
            label="Active warnings"
            big={disc.loading ? '…' : String(activeWarn)}
            sub={`${attMembers.length} need attention`}
            tint={C.accent}
            alert
            noBorder
          />
        </div>
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.62fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* LEFT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Tardiness by member */}
          <SectionCard
            title="Tardiness"
            sub="by member · sorted by total"
            report="tardy"
            range={range}
            onDownload={downloadFile}
            hasPaddingTop
          >
            {tardy.loading ? (
              <Skeleton rows={5} />
            ) : tardy.error ? (
              <CardError msg={tardy.error} onRetry={fetchAll} />
            ) : sortedTardyMembers.length === 0 ? (
              <CardEmpty msg="No tardy events in this range." />
            ) : (
              <>
                {/* Category legend */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '0 18px 12px' }}>
                  {TARDY_CATS.map((cat) => (
                    <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: cat.color }} />
                      <span style={{ fontFamily: F_SANS, fontSize: 11.5, color: C.text2, fontWeight: 500 }}>{cat.label}</span>
                      <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.02em' }}>{cat.short}</span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {sortedTardyMembers.map((m, i) => (
                    <TardyRow
                      key={m.email}
                      m={m}
                      max={maxTardyTotal}
                      isLast={i === sortedTardyMembers.length - 1}
                    />
                  ))}
                </div>
                {/* By-country footer */}
                {byCountry.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.border}`, background: C.surface2, padding: '14px 18px' }}>
                    <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 12 }}>By country</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {byCountry.map((co) => (
                        <CountryRow key={co.country} co={co} max={maxCountryTotal} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* Leave utilization */}
          <SectionCard
            title="Leave utilization"
            sub="entitled · used · remaining"
            report="leave"
            range={range}
            onDownload={downloadFile}
          >
            {leave.loading ? (
              <Skeleton rows={5} />
            ) : leave.error ? (
              <CardError msg={leave.error} onRetry={fetchAll} />
            ) : leaveMembers.length === 0 ? (
              <CardEmpty msg="No leave data in this range." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F_SANS }}>
                <thead>
                  <tr style={{ background: C.surface2 }}>
                    <ThIns w="30%">Employee</ThIns>
                    <ThIns w="34%">Utilization</ThIns>
                    <ThIns w="12%" right>Used</ThIns>
                    <ThIns w="12%" right>Left</ThIns>
                    <ThIns w="12%" right>In range</ThIns>
                  </tr>
                </thead>
                <tbody>
                  {leaveMembers.map((m, i) => (
                    <LeaveRow key={m.email} m={m} isLast={i === leaveMembers.length - 1} />
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

        {/* RIGHT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Needs attention */}
          <div style={{ background: C.surface, border: `1px solid ${C.redBorder}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '15px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, boxShadow: `0 0 0 3px ${C.redSoft}`, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F_SERIF, fontSize: 19, color: C.text, letterSpacing: '-0.015em', lineHeight: 1 }}>Needs attention</div>
                <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginTop: 4 }}>2+ tardies or active warning</div>
              </div>
              <span style={{ fontFamily: F_MONO, fontSize: 13, color: C.red, fontVariantNumeric: 'tabular-nums' }}>{attMembers.length}</span>
            </div>
            {attention.loading ? (
              <Skeleton rows={2} />
            ) : attention.error ? (
              <CardError msg={attention.error} onRetry={fetchAll} />
            ) : attMembers.length === 0 ? (
              <CardEmpty msg="No members flagged." />
            ) : (
              attMembers.map((m, i) => (
                <div key={m.email} style={{ padding: '13px 18px', borderBottom: i === attMembers.length - 1 ? 'none' : `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: C.redSoft, color: C.red, fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(m.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.2 }}>{m.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {m.reasons.map((r) => (
                        <span key={r} style={{ fontFamily: F_SANS, fontSize: 10.5, color: C.red, background: C.redSoft, border: `1px solid ${C.redBorder}`, borderRadius: 999, padding: '2px 8px' }}>{r}</span>
                      ))}
                    </div>
                  </div>
                  <button style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text2, borderRadius: 7, padding: '4px 9px', fontFamily: F_SANS, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>View</button>
                </div>
              ))
            )}
          </div>

          {/* Discipline */}
          <SectionCard
            title="Discipline"
            sub="warnings issued"
            report="discipline"
            range={range}
            onDownload={downloadFile}
          >
            {disc.loading ? (
              <Skeleton rows={3} />
            ) : disc.error ? (
              <CardError msg={disc.error} onRetry={fetchAll} />
            ) : discMembers.length === 0 ? (
              <CardEmpty msg="No discipline records in this range." />
            ) : (
              <>
                <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}` }}>
                  <MiniStat label="Active"   v={activeWarn} tint={C.red}    />
                  <MiniStat label="Voided"   v={voidedTotal}     tint={C.text3}  />
                  <MiniStat label="In range" v={inRangeTotal}    tint={C.accent} noBorder />
                </div>
                {discMembers.map((m, i) => (
                  <div key={m.email} style={{ padding: '12px 18px', borderBottom: i === discMembers.length - 1 ? 'none' : `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: C.surface2, color: C.text2, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(m.name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: C.text, lineHeight: 1.2 }}>{m.name}</div>
                      <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, marginTop: 2 }}>{m.total} total · {m.voided} voided</div>
                    </div>
                    {m.active > 0 && (
                      <span style={{ fontFamily: F_SANS, fontSize: 10.5, fontWeight: 500, color: C.red, background: C.redSoft, border: `1px solid ${C.redBorder}`, borderRadius: 999, padding: '3px 9px' }}>{m.active} active</span>
                    )}
                  </div>
                ))}
              </>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em', textAlign: 'right' as const }}>
        Source: /reports · {range.from} → {range.to} · JST · admin auth
      </div>
    </div>
  );
}
