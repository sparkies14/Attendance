'use client';

import { useState } from 'react';
import type { DashboardData } from '../AdminDashboard';

interface Props {
  dashboard: DashboardData | null;
  apiUrl: string;
}

// ── Color / font constants (same as AdminDashboard) ──────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic color for a name (hue → hex-ish using known palette) */
const PALETTE = [
  '#f4b942', '#a78bfa', '#60a5fa', '#4ade80',
  '#fb923c', '#f87171', '#22c55e', '#e879f9',
];
function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

/** Compute the Mon–Sun of the week containing `date` (JST-based) */
function weekDays(jst: Date): { d: string; n: string; date: Date; isWeekend: boolean; isToday: boolean }[] {
  const dow = jst.getDay(); // 0=Sun … 6=Sat
  const monOffset = dow === 0 ? -6 : 1 - dow;
  const DAYS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(jst);
    d.setDate(jst.getDate() + monOffset + i);
    const isToday =
      d.getFullYear() === jst.getFullYear() &&
      d.getMonth()    === jst.getMonth() &&
      d.getDate()     === jst.getDate();
    result.push({
      d: DAYS[i],
      n: String(d.getDate()),
      date: d,
      isWeekend: i >= 5,
      isToday,
    });
  }
  return result;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function memberFilterStatus(status: string): 'in' | 'late' | 'out' | 'pending' | 'absent' {
  if (status === 'CLOCKED IN')        return 'in';
  if (status === 'CLOCKED IN (LATE)') return 'late';
  if (status === 'CLOCKED OUT')       return 'out';
  if (status === 'PENDING APPROVAL')  return 'pending';
  return 'absent';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub: React.ReactNode;
  icon: string;
  tint: string;
  trend: string;
  trendAlert?: boolean;
}
function StatCard({ label, value, sub, icon, tint, trend, trendAlert }: StatCardProps) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: `${tint}10`, opacity: 0.6 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
        <span style={{ width: 24, height: 24, borderRadius: 6, background: `${tint}15`, color: tint, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      </div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontFamily: F_SERIF, fontSize: 46, lineHeight: 0.9, color: C.text, letterSpacing: '-0.03em' }}>{value}</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11.5, color: C.text3, marginBottom: 4 }}>{sub}</div>
      </div>
      <div style={{ marginTop: 10, fontFamily: F_MONO, fontSize: 10, color: trendAlert ? C.red : C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {trendAlert ? '● ' : ''}{trend}
      </div>
    </div>
  );
}

interface PanelCardProps {
  title: string;
  count: number;
  alert?: boolean;
  children: React.ReactNode;
}
function PanelCard({ title, count, alert, children }: PanelCardProps) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {title} <span style={{ color: alert ? C.red : C.accent, marginLeft: 6 }}>● {count}</span>
        </div>
        <span style={{ fontFamily: F_SANS, fontSize: 11, color: C.text3, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: C.border, textUnderlineOffset: 3 }}>View all</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>{children}</div>
    </div>
  );
}

interface PersonChipProps {
  name: string;
  state: string;
  tint: string;
}
function PersonChip({ name, state, tint }: PersonChipProps) {
  const init = initials(name);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '6px 12px 6px 6px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 999 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: `${tint}22`, color: tint, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{init}</span>
      <span style={{ fontFamily: F_SANS, fontSize: 12, color: C.text, fontWeight: 500 }}>{name}</span>
      <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.02em' }}>{state}</span>
    </div>
  );
}

interface DayCellProps {
  status: string;
  clockIn: string;
  clockOut: string;
  totalHours: number | string;
  isToday: boolean;
}
function DayCell({ status, clockIn, clockOut, totalHours, isToday }: DayCellProps) {
  if (!isToday) {
    return <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3 }}>—</span>;
  }

  type CellConfig = { bg: string; fg: string; icon: string; label: string; live?: boolean };
  let cfg: CellConfig;

  if (status === 'CLOCKED IN') {
    cfg = { bg: C.accentSoft, fg: C.accent, icon: '⏱', label: totalHours ? `${totalHours}` : 'Active', live: true };
  } else if (status === 'CLOCKED IN (LATE)') {
    cfg = { bg: C.accentSoft, fg: C.accent, icon: '⚠', label: totalHours ? `${totalHours}` : 'Late' };
  } else if (status === 'CLOCKED OUT') {
    const hrs = clockOut && clockIn ? totalHours : '—';
    cfg = { bg: C.greenSoft, fg: C.green, icon: '✓', label: `${hrs}` };
  } else if (status === 'PENDING APPROVAL') {
    cfg = { bg: C.purpleSoft, fg: C.purple, icon: '◌', label: 'Pending' };
  } else {
    // NOT CLOCKED IN / absent
    cfg = { bg: C.redSoft, fg: C.red, icon: '●', label: 'Absent' };
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, background: cfg.bg, color: cfg.fg, fontFamily: F_MONO, fontSize: 11, fontWeight: 500, letterSpacing: '-0.005em' }}>
      <span style={{ fontSize: 10 }}>{cfg.icon}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cfg.label}</span>
      {cfg.live && <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.fg, marginLeft: 2 }} />}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AttendancePage({ dashboard }: Props) {
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<'all' | 'in' | 'late' | 'out' | 'pending' | 'absent'>('all');

  // ── JST date ──
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const DAYS_LONG = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dateStr = `${DAYS_LONG[jst.getDay()]}, ${MONTHS_SHORT[jst.getMonth()]} ${jst.getDate()}`;
  const week = weekDays(jst);
  const weekStart = week[0].date;
  const weekEnd   = week[6].date;
  const weekLabel = `${MONTHS_SHORT[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS_SHORT[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;

  // ── Derived counts ──
  const members = dashboard?.members ?? [];
  const summary = dashboard?.summary ?? { clockedIn: 0, clockedOut: 0, notIn: 0, pending: 0, total: 0 };

  const presentCount = summary.clockedIn + summary.clockedOut;
  const lateCount    = members.filter(m => m.lateStatus !== '' && m.lateStatus !== 'ON TIME').length;
  const absentCount  = summary.notIn;
  const total        = summary.total;

  // Filter counts for pills
  const countIn      = members.filter(m => memberFilterStatus(m.status) === 'in').length;
  const countLate    = members.filter(m => memberFilterStatus(m.status) === 'late').length;
  const countOut     = members.filter(m => memberFilterStatus(m.status) === 'out').length;
  const countPending = members.filter(m => memberFilterStatus(m.status) === 'pending').length;
  const countAbsent  = members.filter(m => memberFilterStatus(m.status) === 'absent').length;

  // Panel: "Not clocked in yet"
  const notInMembers = members.filter(m =>
    m.status === 'NOT CLOCKED IN' || m.status === 'PENDING APPROVAL'
  );

  // Panel: "On lunch / on break" — CLOCKED IN members as approximation (no break API)
  const clockedInMembers = members.filter(m => m.status === 'CLOCKED IN' || m.status === 'CLOCKED IN (LATE)');

  // ── Filtered table members ──
  const filtered = members.filter(m => {
    const nameMatch = m.name.toLowerCase().includes(search.toLowerCase());
    if (!nameMatch) return false;
    if (filter === 'all') return true;
    return memberFilterStatus(m.status) === filter;
  });

  // ── Download CSV ──
  function downloadCSV() {
    const rows = [
      ['Name','Email','Role','Status','Clock In','Clock Out','Total Hours','Late Status'],
      ...members.map(m => [m.name, m.email, m.role, m.status, m.clockIn, m.clockOut, String(m.totalHours), m.lateStatus]),
    ];
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `attendance-${dashboard?.date ?? 'today'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const FILTER_PILLS: { id: typeof filter; label: string; count: number }[] = [
    { id: 'all',     label: 'All',         count: total },
    { id: 'in',      label: 'Present',     count: countIn },
    { id: 'late',    label: 'Late',        count: countLate },
    { id: 'out',     label: 'Clocked out', count: countOut },
    { id: 'pending', label: 'Pending',     count: countPending },
    { id: 'absent',  label: 'Absent',      count: countAbsent },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1280, margin: '0 auto' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' as const }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>
            Employee attendance.
          </div>
          <div style={{ fontFamily: F_MONO, fontSize: 11.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginTop: 8 }}>
            {total} members · {dateStr} · JST
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, fontFamily: F_MONO, fontSize: 11, color: C.text2, letterSpacing: '0.04em' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} />
            Auto-refresh · 30s
          </span>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '7px 14px', background: C.surface, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 9, fontFamily: F_SANS, fontSize: 12.5, cursor: 'pointer' }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={downloadCSV}
            style={{ padding: '7px 14px', background: C.btnBg, color: C.btnText, border: 'none', borderRadius: 9, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}
          >
            ↓ Download CSV
          </button>
        </div>
      </div>

      {/* ── Stat row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard
          label="Present today"
          value={String(presentCount)}
          sub={<>of {total} · <b style={{ color: C.text2 }}>{total - presentCount}</b> remaining</>}
          icon="●"
          tint={C.green}
          trend={`${presentCount} clocked in`}
        />
        <StatCard
          label="Late entry"
          value={String(lateCount)}
          sub={<>others <b style={{ color: C.text2 }}>on time</b></>}
          icon="⚠"
          tint={C.accent}
          trend={lateCount === 0 ? 'No late entries' : `${lateCount} late today`}
        />
        <StatCard
          label="On leave"
          value="—"
          sub={<>no leave data</>}
          icon="✦"
          tint={C.purple}
          trend="N/A"
        />
        <StatCard
          label="Absent"
          value={String(absentCount)}
          sub={<>not clocked in</>}
          icon="●"
          tint={C.red}
          trend={absentCount > 0 ? 'Action needed' : 'All accounted for'}
          trendAlert={absentCount > 0}
        />
      </div>

      {/* ── Active panels ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <PanelCard title="Clocked in / active" count={clockedInMembers.length}>
          {clockedInMembers.length === 0 ? (
            <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>No active members</span>
          ) : (
            clockedInMembers.slice(0, 6).map((m) => (
              <PersonChip
                key={m.email}
                name={m.name}
                state={m.clockIn ? `In at ${m.clockIn}` : 'Active'}
                tint={nameColor(m.name)}
              />
            ))
          )}
        </PanelCard>
        <PanelCard title="Not clocked in yet" count={notInMembers.length} alert>
          {notInMembers.length === 0 ? (
            <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>All members clocked in</span>
          ) : (
            notInMembers.slice(0, 6).map((m) => (
              <PersonChip
                key={m.email}
                name={m.name}
                state={m.status === 'PENDING APPROVAL' ? 'Pending approval' : 'No check-in'}
                tint={m.status === 'PENDING APPROVAL' ? C.purple : C.red}
              />
            ))
          )}
        </PanelCard>
      </div>

      {/* ── Controls row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ position: 'relative', width: 240 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>⌕</span>
          <input
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '7px 12px 7px 30px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: F_SANS, fontSize: 12.5, outline: 'none', boxSizing: 'border-box' as const }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
          {FILTER_PILLS.map((f) => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 11px', borderRadius: 999,
                  background: isActive ? C.accentSoft : 'transparent',
                  color: isActive ? C.accent : C.text2,
                  border: `1px solid ${isActive ? C.accentBorder : C.border}`,
                  fontFamily: F_SANS, fontSize: 11.5, fontWeight: isActive ? 500 : 400, cursor: 'pointer',
                }}
              >
                {f.label}
                <span style={{ fontFamily: F_MONO, fontSize: 10, color: isActive ? C.accent : C.text3, opacity: 0.85 }}>{f.count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>
          Showing {filtered.length} of {total} members
        </span>
      </div>

      {/* ── Week nav ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: F_SERIF, fontSize: 18, color: C.text, letterSpacing: '-0.015em' }}>{weekLabel}</span>
        <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.08em', textTransform: 'uppercase' as const, padding: '3px 9px', borderRadius: 999, border: `1px solid ${C.border}` }}>This week</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Live data</span>
      </div>

      {/* ── Attendance table ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F_SANS }}>
          <thead>
            <tr style={{ background: C.surface2 }}>
              <th style={{ textAlign: 'left', padding: '11px 18px', fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>
                Employee
              </th>
              {week.map((d, i) => (
                <th key={i} style={{ textAlign: 'center', padding: '11px 8px', fontFamily: F_MONO, fontSize: 10.5, color: d.isWeekend ? C.text3 : C.text2, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontWeight: 600, borderBottom: `1px solid ${C.border}`, opacity: d.isWeekend ? 0.45 : 1 }}>
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span>{d.d}</span>
                    <span style={{ fontSize: 13, color: d.isToday ? C.accent : C.text, letterSpacing: 0, fontFamily: F_SANS, fontWeight: 400 }}>
                      {d.n}
                      {d.isToday && <span style={{ display: 'block', width: 18, height: 2, background: C.accent, margin: '3px auto 0', borderRadius: 2 }} />}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '24px', textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>
                  No members match your filter.
                </td>
              </tr>
            ) : (
              filtered.map((m, i) => {
                const isLast = i === filtered.length - 1;
                const hue    = nameColor(m.name);
                const init   = initials(m.name);
                return (
                  <tr key={m.email}>
                    <td style={{ padding: '11px 18px', borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <span style={{ width: 32, height: 32, borderRadius: '50%', background: `${hue}22`, color: hue, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{init}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.15 }}>{m.name}</div>
                          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 1, letterSpacing: '0.02em' }}>
                            {m.role}{m.clockIn ? ` · in at ${m.clockIn}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    {week.map((d, j) => (
                      <td key={j} style={{ padding: '8px', textAlign: 'center', borderBottom: isLast ? 'none' : `1px solid ${C.border}`, background: d.isWeekend ? `repeating-linear-gradient(-45deg, transparent 0 4px, ${C.surface2} 4px 5px)` : 'transparent' }}>
                        {d.isWeekend ? (
                          <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, opacity: 0.4 }}>—</span>
                        ) : (
                          <DayCell
                            status={m.status}
                            clockIn={m.clockIn}
                            clockOut={m.clockOut}
                            totalHours={m.totalHours}
                            isToday={d.isToday}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em', textAlign: 'right', paddingTop: 4 }}>
        Source: n8n · dashboard webhook · auto-sync every 30 seconds
      </div>
    </div>
  );
}
