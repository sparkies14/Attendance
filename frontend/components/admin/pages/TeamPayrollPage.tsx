'use client';

import { useState } from 'react';
import type { DashboardData } from '../AdminDashboard';
import { C, F_SERIF, F_SANS, F_MONO, tickTrack } from '../../theme';

interface Props {
  dashboard: DashboardData | null;
  apiUrl: string;
}

// ── Month names ─────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Pay period helpers (same logic as member PayrollPage) ───────────────────
function getJST() {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return { year: jst.getFullYear(), month: jst.getMonth() + 1, day: jst.getDate() };
}

function payPeriod(y: number, m: number, d: number) {
  let sm: number, sy: number;
  if (d >= 25) { sm = m; sy = y; }
  else         { sm = m === 1 ? 12 : m - 1; sy = m === 1 ? y - 1 : y; }
  const em = sm === 12 ? 1 : sm + 1;
  const ey = sm === 12 ? sy + 1 : sy;
  return { startYear: sy, startMonth: sm, endYear: ey, endMonth: em };
}

function countWorkDays(sy: number, sm: number, sd: number, ey: number, em: number, ed: number): number {
  let count = 0;
  const d = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// ── Deterministic mock hours (80–162h) ──────────────────────────────────────
function mockHours(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 1000;
  return 80 + (h % 82);
}

// ── Avatar hue from name ─────────────────────────────────────────────────────
const HUE_PALETTE = ['#f4b942', '#a78bfa', '#60a5fa', '#4ade80', '#fb923c', '#f87171', '#22c55e'];
function nameHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 7 + name.charCodeAt(i)) % HUE_PALETTE.length;
  return HUE_PALETTE[h];
}

type PayrollStatus = 'on-track' | 'behind' | 'over' | 'review' | 'flagged';

interface PayrollMember {
  id: string;
  name: string;
  role: string;
  hue: string;
  hours: number;
  target: number;
  late: number;
  leave: number;
  ot: number;
  status: PayrollStatus;
}

// ── Fallback data when dashboard is null ─────────────────────────────────────
const PAYROLL_TEAM_FALLBACK: PayrollMember[] = [
  { id: 'k', name: 'Kenji Tanaka',   role: 'Engineer',   hue: '#f4b942', hours: 142.4, target: 160, late: 1, leave: 0, ot: 4.5, status: 'on-track' },
  { id: 'm', name: 'Marisol Reyes',  role: 'Manager',    hue: '#a78bfa', hours: 152.0, target: 160, late: 0, leave: 0, ot: 0,   status: 'on-track' },
  { id: 'a', name: 'Aki Sato',       role: 'Designer',   hue: '#60a5fa', hours: 138.5, target: 160, late: 0, leave: 1, ot: 0,   status: 'on-track' },
  { id: 'j', name: 'Jorge Diaz',     role: 'Engineer',   hue: '#4ade80', hours: 158.6, target: 160, late: 0, leave: 0, ot: 8.2, status: 'on-track' },
  { id: 'p', name: 'Priya Iyer',     role: 'Product',    hue: '#fb923c', hours: 124.0, target: 160, late: 2, leave: 1, ot: 0,   status: 'behind'   },
  { id: 'h', name: 'Hana Watanabe',  role: 'Marketing',  hue: '#f87171', hours: 88.0,  target: 160, late: 0, leave: 0, ot: 0,   status: 'review'   },
  { id: 'd', name: 'Daniel Kim',     role: 'Engineer',   hue: '#22c55e', hours: 156.0, target: 160, late: 0, leave: 0, ot: 2.0, status: 'on-track' },
  { id: 'y', name: 'Yuki Mori',      role: 'Operations', hue: '#fb923c', hours: 162.5, target: 160, late: 0, leave: 0, ot: 6.8, status: 'over'     },
  { id: 's', name: 'Sofia Cruz',     role: 'Designer',   hue: '#a78bfa', hours: 96.0,  target: 160, late: 0, leave: 0, ot: 0,   status: 'flagged'  },
  { id: 'e', name: 'Ethan Brown',    role: 'Engineer',   hue: '#60a5fa', hours: 148.2, target: 160, late: 0, leave: 0, ot: 1.5, status: 'on-track' },
];

function buildPayrollFromDashboard(members: DashboardData['members']): PayrollMember[] {
  return members.map((m, i) => {
    const hours = mockHours(m.name);
    const target = 160;
    const ot = hours > 160 ? +(hours - 160).toFixed(1) : 0;
    const isLate = m.lateStatus !== 'ON TIME' && m.lateStatus !== '';
    const late = isLate ? 1 : 0;

    let status: PayrollStatus;
    if (hours >= 155)      status = hours > 160 ? 'over' : 'on-track';
    else if (hours >= 120) status = 'on-track';
    else if (hours >= 100) status = 'behind';
    else if (hours >= 85)  status = 'review';
    else                   status = 'flagged';

    return {
      id: String(i),
      name: m.name,
      role: m.role || 'Member',
      hue: nameHue(m.name),
      hours: +hours.toFixed(1),
      target,
      late,
      leave: 0,
      ot,
      status,
    };
  });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryTile({
  label, big, small, tint, alert, noBorder,
}: {
  label: string; big: string; small: string; tint: string;
  alert?: boolean; noBorder?: boolean;
}) {
  return (
    <div style={{
      padding: '22px 22px',
      borderRight: noBorder ? 'none' : `1px solid ${C.border}`,
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      {alert && (
        <div style={{
          position: 'absolute', top: 16, right: 18,
          width: 7, height: 7, borderRadius: '50%',
          background: C.red, boxShadow: `0 0 0 3px ${C.redSoft}`,
        }} />
      )}
      <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 46, lineHeight: 0.9, color: tint, letterSpacing: '-0.03em', marginTop: 10 }}>{big}</div>
      <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em', marginTop: 8 }}>{small}</div>
    </div>
  );
}

function FootStat({ label, v, sub, tint }: { label: string; v: string; sub: string; tint: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 26, color: tint, letterSpacing: '-0.022em', lineHeight: 1, marginTop: 8 }}>{v}</div>
      <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function Th({ w, sort, children }: { w: string; sort?: boolean; children: React.ReactNode }) {
  return (
    <th style={{
      width: w, textAlign: 'left', padding: '11px 16px',
      fontFamily: F_MONO, fontSize: 10.5, color: C.text3,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      fontWeight: 600, borderBottom: `1px solid ${C.border}`,
    }}>
      {children}
      {sort && <span style={{ marginLeft: 5, color: C.text3 }}>↓</span>}
    </th>
  );
}

function PayrollRow({ m, isLast }: { m: PayrollMember; isLast: boolean }) {
  const init = m.name.split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const pct  = (m.hours / m.target) * 100;

  const statusMap: Record<PayrollStatus, { bg: string; border: string; fg: string; label: string }> = {
    'on-track': { bg: C.greenSoft,  border: C.greenBorder,  fg: C.green,  label: 'On track'       },
    'behind':   { bg: C.accentSoft, border: C.accentBorder, fg: C.accent, label: 'Behind'          },
    'over':     { bg: C.greenSoft,  border: C.greenBorder,  fg: C.green,  label: `Over · +${m.ot.toFixed(1)}h` },
    'review':   { bg: C.redSoft,    border: C.redBorder,    fg: C.red,    label: '⚠ Needs review'  },
    'flagged':  { bg: C.redSoft,    border: C.redBorder,    fg: C.red,    label: '⚠ Flagged'       },
  };
  const s = statusMap[m.status];

  const fillColor =
    m.status === 'over' ? C.green :
    (m.status === 'behind' || m.status === 'review' || m.status === 'flagged') ? C.accent :
    C.green;

  return (
    <tr style={{ borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
      {/* Employee */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{
            width: 32, height: 32, borderRadius: '50%',
            background: `${m.hue}22`, color: m.hue,
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{init}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.15 }}>{m.name}</div>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 1, letterSpacing: '0.02em' }}>{m.role}</div>
          </div>
        </div>
      </td>

      {/* Pace bar */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ position: 'relative', height: 14, borderRadius: 4, overflow: 'visible', ...tickTrack }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%',
            width: `${Math.min(pct, 100)}%`, background: fillColor, borderRadius: 4,
            zIndex: 1,
          }} />
          {pct > 100 && (
            <div style={{
              position: 'absolute', top: 0, left: '100%',
              height: '100%', width: `${pct - 100}%`,
              background: C.green, opacity: 0.5, borderRadius: 4,
              zIndex: 1,
            }} />
          )}
          <div style={{
            position: 'absolute', top: -2, bottom: -2,
            left: '100%', width: 1,
            background: C.text2, transform: 'translateX(-0.5px)',
            zIndex: 2,
          }} />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontFamily: F_MONO, fontSize: 9.5, color: C.text3,
          letterSpacing: '0.04em', marginTop: 4,
        }}>
          <span>{Math.round(pct)}%</span>
          <span>{m.hours > m.target ? `+${(m.hours - m.target).toFixed(1)}h over` : `${(m.target - m.hours).toFixed(1)}h to go`}</span>
        </div>
      </td>

      {/* Logged */}
      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 13, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
        {m.hours.toFixed(1)}h
        <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, marginTop: 1 }}>of {m.target}h</div>
      </td>

      {/* Overtime */}
      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: m.ot > 0 ? C.accent : C.text3, fontVariantNumeric: 'tabular-nums' }}>
        {m.ot > 0 ? `+${m.ot.toFixed(1)}h` : '—'}
      </td>

      {/* Late */}
      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: m.late > 0 ? C.red : C.text3, fontVariantNumeric: 'tabular-nums' }}>
        {m.late > 0 ? <span><span style={{ color: C.red }}>●</span> {m.late}</span> : '—'}
      </td>

      {/* Leave */}
      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: m.leave > 0 ? C.purple : C.text3, fontVariantNumeric: 'tabular-nums' }}>
        {m.leave > 0 ? `${m.leave}d` : '—'}
      </td>

      {/* Manual */}
      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: C.text3, fontVariantNumeric: 'tabular-nums' }}>
        —
      </td>

      {/* Status */}
      <td style={{ padding: '12px 16px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 999,
          background: s.bg, border: `1px solid ${s.border}`, color: s.fg,
          fontFamily: F_SANS, fontSize: 11, fontWeight: 500,
        }}>
          {s.label}
        </span>
      </td>
    </tr>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TeamPayrollPage({ dashboard }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'on-track' | 'behind' | 'over' | 'review'>('all');

  // Pay period
  const jst = getJST();
  const pp  = payPeriod(jst.year, jst.month, jst.day);
  const startLabel = `${MONTHS_SHORT[pp.startMonth - 1]} 25`;
  const endLabel   = `${MONTHS_SHORT[pp.endMonth - 1]} 24`;
  const dayOfPeriod = countWorkDays(pp.startYear, pp.startMonth, 25, jst.year, jst.month, jst.day);
  const totalWDs    = countWorkDays(pp.startYear, pp.startMonth, 25, pp.endYear, pp.endMonth, 24);

  // Build payroll data
  const team: PayrollMember[] = dashboard
    ? buildPayrollFromDashboard(dashboard.members)
    : PAYROLL_TEAM_FALLBACK;

  // Aggregates
  const totalHours  = team.reduce((s, m) => s + m.hours, 0);
  const totalTarget = Math.max(1, team.length * 160);
  const totalOT     = team.reduce((s, m) => s + m.ot, 0);
  const reviewCount = team.filter((m) => m.status === 'review' || m.status === 'flagged').length;
  const totalLate   = team.reduce((s, m) => s + m.late, 0);
  const totalLeave  = team.reduce((s, m) => s + m.leave, 0);
  const avgHours    = team.length > 0 ? totalHours / team.length : 0;

  // Counts per filter
  const filterCounts = {
    all:       team.length,
    'on-track': team.filter((m) => m.status === 'on-track').length,
    behind:    team.filter((m) => m.status === 'behind').length,
    over:      team.filter((m) => m.status === 'over').length,
    review:    team.filter((m) => m.status === 'review' || m.status === 'flagged').length,
  };

  // Filtered rows
  const filtered = team.filter((m) => {
    const matchSearch = search === '' ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.role.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all'       ? true :
      filter === 'review'    ? (m.status === 'review' || m.status === 'flagged') :
      m.status === filter;
    return matchSearch && matchFilter;
  });

  // Estimate finalize: Jun 25 (day after period end)
  const finDay = `${MONTHS_SHORT[pp.endMonth - 1]} 25`;

  const FILTER_PILLS: { id: typeof filter; label: string; tint: string }[] = [
    { id: 'all',       label: 'All',          tint: C.text  },
    { id: 'on-track',  label: 'On track',     tint: C.green },
    { id: 'behind',    label: 'Behind',       tint: C.accent },
    { id: 'over',      label: 'Over target',  tint: C.green },
    { id: 'review',    label: 'Needs review', tint: C.red   },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1340, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-end', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>
            Payroll <span style={{ fontStyle: 'italic', color: C.text2 }}>summary.</span>
          </div>
          <div style={{ fontFamily: F_MONO, fontSize: 11.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
            Hours · {team.length} members · pay period {startLabel} → {endLabel}, {pp.endYear}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Period selector */}
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', borderRadius: 9,
            border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer',
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 6,
              background: C.accentSoft, color: C.accent,
              fontFamily: F_MONO, fontSize: 10, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              letterSpacing: '0.06em',
            }}>
              {String(pp.startMonth).padStart(2, '0')}
            </span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: F_SANS, fontSize: 12.5, color: C.text, fontWeight: 500, lineHeight: 1.1 }}>
                {startLabel} → {endLabel}
              </div>
              <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, marginTop: 1, letterSpacing: '0.04em' }}>
                open · day {dayOfPeriod} of {totalWDs}
              </div>
            </div>
            <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, marginLeft: 4 }}>▾</span>
          </button>

          <button style={{
            padding: '7px 14px', background: C.surface, color: C.text2,
            border: `1px solid ${C.border}`, borderRadius: 9,
            fontFamily: F_SANS, fontSize: 12.5, cursor: 'pointer',
          }}>
            ↓ Export CSV
          </button>

          <button style={{
            padding: '7px 14px', background: C.btnBg, color: C.btnText,
            border: 'none', borderRadius: 9,
            fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
          }}>
            Finalize period →
          </button>
        </div>
      </div>

      {/* ── Hero band ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', alignItems: 'stretch' }}>

          {/* Left: big total hours */}
          <div style={{ padding: '22px 26px', borderRight: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Team hours · this period
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 10 }}>
              <div style={{
                fontFamily: F_SERIF, fontWeight: 600, fontSize: 64, lineHeight: 0.85,
                color: C.text, letterSpacing: '-0.035em', fontVariantNumeric: 'tabular-nums',
              }}>
                {Math.round(totalHours)}<span style={{ fontSize: 38, color: C.text2 }}>h</span>
              </div>
              <div style={{ marginBottom: 5 }}>
                <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 20, color: C.text3, letterSpacing: '-0.015em', lineHeight: 1 }}>
                  / {totalTarget}h
                </div>
                <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>
                  {team.length} members · 160h each
                </div>
              </div>
            </div>

            {/* Gradient progress bar — tickTrack applied to track container */}
            <div style={{ marginTop: 14, height: 4, borderRadius: 999, overflow: 'hidden', ...tickTrack }}>
              <div style={{
                width: `${Math.min((totalHours / totalTarget) * 100, 100)}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${C.accent}, ${C.green})`,
                position: 'relative', zIndex: 1,
              }} />
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontFamily: F_MONO, fontSize: 9.5, color: C.text3,
              letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 6,
            }}>
              <span>Period start</span>
              <span style={{ color: C.accent }}>{Math.round((totalHours / totalTarget) * 100)}% · Today</span>
              <span>Cutoff {endLabel}</span>
            </div>
          </div>

          {/* Stat tiles */}
          <SummaryTile
            label="Overtime · total"
            big={`${totalOT.toFixed(1)}h`}
            small={`across ${team.filter((m) => m.ot > 0).length} members`}
            tint={C.accent}
          />
          <SummaryTile
            label="Manual entries"
            big="—"
            small="no data yet"
            tint={C.blue}
          />
          <SummaryTile
            label="Needs review"
            big={String(reviewCount)}
            small="anomalies + flagged"
            tint={C.red}
            alert
            noBorder
          />
        </div>
      </div>

      {/* ── Filter / search bar ── */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', width: 240 }}>
          <span style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            fontFamily: F_MONO, fontSize: 12, color: C.text3,
          }}>⌕</span>
          <input
            placeholder="Search member or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '7px 12px 7px 30px',
              background: C.bg, color: C.text,
              border: `1px solid ${C.border}`, borderRadius: 8,
              fontFamily: F_SANS, fontSize: 12.5, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {FILTER_PILLS.map((fp) => {
            const active = filter === fp.id;
            const count  = filterCounts[fp.id];
            return (
              <button
                key={fp.id}
                onClick={() => setFilter(fp.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 11px', borderRadius: 999,
                  background: active ? C.accentSoft : 'transparent',
                  color: active ? C.accent : C.text2,
                  border: `1px solid ${active ? C.accentBorder : C.border}`,
                  fontFamily: F_SANS, fontSize: 11.5,
                  fontWeight: active ? 500 : 400, cursor: 'pointer',
                }}
              >
                {!active && <span style={{ width: 6, height: 6, borderRadius: 2, background: fp.tint }} />}
                {fp.label}
                <span style={{ fontFamily: F_MONO, fontSize: 10, color: active ? C.accent : C.text3, opacity: 0.85 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em' }}>
          Sorted by · hours logged ↓
        </span>
      </div>

      {/* ── Payroll table ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F_SANS }}>
          <thead>
            <tr style={{ background: C.surface2 }}>
              <Th w="22%" sort>Employee</Th>
              <Th w="20%">Hours pace · this period</Th>
              <Th w="11%" sort>Logged</Th>
              <Th w="9%">Overtime</Th>
              <Th w="8%">Late</Th>
              <Th w="8%">Leave</Th>
              <Th w="10%">Manual</Th>
              <Th w="12%">Status</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '24px 16px', fontFamily: F_MONO, fontSize: 12, color: C.text3, textAlign: 'center' }}>
                  No members match your filter.
                </td>
              </tr>
            ) : (
              filtered.map((m, i) => (
                <PayrollRow key={m.id} m={m} isLast={i === filtered.length - 1} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer summary band ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <FootStat
          label="Average hours / member"
          v={`${avgHours.toFixed(1)}h`}
          sub={`vs 160h target · ${Math.round((avgHours / 160) * 100)}%`}
          tint={C.text}
        />
        <FootStat
          label="Late punches"
          v={String(totalLate)}
          sub={`across ${team.filter((m) => m.late > 0).length} members`}
          tint={C.accent}
        />
        <FootStat
          label="Days on leave"
          v={totalLeave > 0 ? `${totalLeave} / ${team.length * totalWDs}` : '0'}
          sub="planned coverage ok"
          tint={C.purple}
        />
        <FootStat
          label="Estimated finalize"
          v={finDay}
          sub="08:00 · auto-cut"
          tint={C.green}
        />
      </div>

      <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em', textAlign: 'right' }}>
        Source: attendance webhook · JST · lunch excluded
      </div>
    </div>
  );
}
