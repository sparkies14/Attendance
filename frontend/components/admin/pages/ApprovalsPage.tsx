'use client';

import { useState, useEffect } from 'react';
import type { DashboardData } from '../AdminDashboard';
import { clientFetch } from '@/lib/clientFetch';

interface Props {
  dashboard: DashboardData | null;
  apiUrl: string;
  token: string;
  onRefresh?: () => Promise<void>;
  filterKind?: string;
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
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)', purpleBorder: 'rgba(124,58,237,0.25)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Data model ────────────────────────────────────────────────────────────────
interface RequestItem {
  id: string;
  dbId: number;
  type: 'attendance' | 'leave';
  kind: 'manual' | 'leave';
  name: string;
  role: string;
  hue: string;
  date: string;
  time: string;
  entry: string;
  reason: string;
  submitted: string;
  urgency: 'today';
}

function buildRequests(dashboard: DashboardData | null): RequestItem[] {
  if (!dashboard) return [];
  const manual = (dashboard.pendingApprovals ?? []).map(a => ({
    id: `att-${a.id}`,
    dbId: a.id,
    kind: 'manual' as const,
    type: 'attendance' as const,
    name: a.name,
    role: a.role ?? '',
    hue: nameColor(a.name),
    date: a.date,
    time: a.clock_in || '—',
    entry: 'Manual clock-in',
    reason: a.reason || 'Manual entry — awaiting approval',
    submitted: 'Today',
    urgency: 'today' as const,
  }));
  const leave = (dashboard.pendingLeave ?? []).map(l => ({
    id: `leave-${l.id}`,
    dbId: l.id,
    kind: 'leave' as const,
    type: 'leave' as const,
    name: l.name,
    role: '',
    hue: nameColor(l.name),
    date: l.date,
    time: '—',
    entry: l.leave_type ?? 'Leave',
    reason: l.reason || 'Leave request',
    submitted: 'Today',
    urgency: 'today' as const,
  }));
  return [...manual, ...leave];
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
      <div style={{ marginTop: 10, fontFamily: F_MONO, fontSize: 10, color: trendAlert ? C.accent : C.text3, letterSpacing: '0.06em' }}>
        {trendAlert ? '⚠ ' : ''}{trend}
      </div>
    </div>
  );
}

interface KVProps { k: string; v: string; accent?: boolean; }
function KV({ k, v, accent }: KVProps) {
  return (
    <div>
      <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontFamily: F_SANS, fontSize: 14.5, color: accent ? C.accent : C.text, fontWeight: 500, marginTop: 4, letterSpacing: '-0.01em' }}>{v}</div>
    </div>
  );
}

interface SignalRowProps { tint: string; k: string; v: string; ok?: boolean; }
function SignalRow({ tint, k, v, ok }: SignalRowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: tint, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: C.text2 }}>{k}</span>
      </div>
      <span style={{ fontFamily: F_MONO, fontSize: 11, color: ok ? C.green : C.text, letterSpacing: '0.02em' }}>{v}</span>
    </div>
  );
}

// ── Queue Row ─────────────────────────────────────────────────────────────────
interface QueueRowProps {
  r: RequestItem;
  isSelected: boolean;
  onSelect: () => void;
}
function QueueRow({ r, isSelected, onSelect }: QueueRowProps) {
  const init = initials(r.name);
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: isSelected ? C.surface2 : 'transparent',
        borderLeft: isSelected ? `2px solid ${C.accent}` : '2px solid transparent',
        cursor: 'pointer',
      }}
    >
      {/* Checkbox */}
      <span style={{ width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${C.borderStrong}`, background: C.surface, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
      {/* Avatar */}
      <span style={{ width: 30, height: 30, borderRadius: '50%', background: `${r.hue}22`, color: r.hue, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {init}
      </span>
      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
          <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.04em', marginLeft: 8 }}>{r.submitted}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 4, background: `${C.blue}15`, border: `1px solid ${C.blue}33`, color: C.blue, fontFamily: F_MONO, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <span style={{ fontSize: 9 }}>⏱</span> {r.kind}
          </span>
          <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text2, letterSpacing: '0.02em' }}>{r.entry}</span>
        </div>
      </div>
    </div>
  );
}

// ── Queue Group ───────────────────────────────────────────────────────────────
interface QueueGroupProps {
  label: string;
  items: RequestItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}
function QueueGroup({ label, items, selectedId, onSelect }: QueueGroupProps) {
  if (!items.length) return null;
  return (
    <div>
      <div style={{ padding: '10px 16px 6px', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.14em', textTransform: 'uppercase', background: C.bg, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0 }}>
        {label}
      </div>
      {items.map((r) => (
        <QueueRow
          key={r.id}
          r={r}
          isSelected={selectedId === r.id}
          onSelect={() => onSelect(r.id)}
        />
      ))}
    </div>
  );
}

// ── Detail Card ───────────────────────────────────────────────────────────────
interface DetailCardProps {
  r: RequestItem;
  allItems: RequestItem[];
  selectedIdx: number;
  onNav: (idx: number) => void;
  note: string;
  onNoteChange: (v: string) => void;
  actionLoading: boolean;
  actionMsg: string | null;
  actionErr: string | null;
  onAction: (action: 'approve' | 'reject') => void;
}
function DetailCard({ r, allItems, selectedIdx, onNav, note, onNoteChange, actionLoading, actionMsg, actionErr, onAction }: DetailCardProps) {
  const init = initials(r.name);
  const firstName = r.name.split(' ')[0];
  const reasonWordCount = r.reason.split(/\s+/).length;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>

      {/* Detail header */}
      <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${r.hue}22`, color: r.hue, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {init}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: F_SERIF, fontSize: 24, color: C.text, letterSpacing: '-0.018em', lineHeight: 1 }}>{r.name}</div>
            <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>· {r.role}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, background: C.blueSoft, border: `1px solid ${C.blueBorder}`, color: C.blue, fontFamily: F_MONO, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              ⏱ manual · clock-in
            </span>
            <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Submitted {r.submitted}
            </span>
          </div>
        </div>
        {/* Navigation arrows */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => onNav(Math.max(0, selectedIdx - 1))}
            disabled={selectedIdx === 0}
            style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: selectedIdx === 0 ? C.text3 : C.text2, cursor: selectedIdx === 0 ? 'default' : 'pointer', fontSize: 14 }}
          >↑</button>
          <button
            onClick={() => onNav(Math.min(allItems.length - 1, selectedIdx + 1))}
            disabled={selectedIdx === allItems.length - 1}
            style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: selectedIdx === allItems.length - 1 ? C.text3 : C.text2, cursor: selectedIdx === allItems.length - 1 ? 'default' : 'pointer', fontSize: 14 }}
          >↓</button>
        </div>
      </div>

      {/* Request body — 4-col KV */}
      <div style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, borderBottom: `1px solid ${C.border}` }}>
        <KV k="Date" v={r.date} />
        <KV k="Stamped time" v={r.time} accent />
        <KV k="Entry type" v={r.entry} />
        <KV k="Coverage" v="—" />
      </div>

      {/* Reason */}
      <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Member's reason</div>
        <div style={{ fontFamily: F_SERIF, fontSize: 18, color: C.text, letterSpacing: '-0.015em', lineHeight: 1.4, fontStyle: 'italic' }}>
          "{r.reason}"
        </div>
      </div>

      {/* Context grid */}
      <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, borderBottom: `1px solid ${C.border}` }}>

        {/* Recent pattern */}
        <div>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
            {firstName}&apos;s recent pattern
          </div>

          {/* 14-day strip */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
            {(['on','on','on','on','wkend','wkend','on','on','on','on','on','wkend','wkend','on'] as const).map((s, i) => {
              const tint = s === 'on' ? C.green : C.border;
              return (
                <div
                  key={i}
                  style={{ flex: 1, height: 22, borderRadius: 3, background: s === 'wkend' ? 'transparent' : tint, border: s === 'wkend' ? `1px dashed ${C.border}` : 'none', opacity: s === 'wkend' ? 0.4 : 1 }}
                  title={`Day ${i + 1}`}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <span>2 weeks ago</span>
            <span>Today</span>
          </div>

          {/* Stats row */}
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { lbl: 'On time', v: '10', tint: C.green },
              { lbl: 'Late',    v: '0',  tint: C.text2 },
              { lbl: 'Absent',  v: '0',  tint: C.text2 },
              { lbl: 'Hours',   v: '—',  tint: C.text },
            ].map((s, i) => (
              <div key={i} style={{ padding: '8px 10px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.lbl}</div>
                <div style={{ fontFamily: F_SERIF, fontSize: 22, color: s.tint, letterSpacing: '-0.02em', lineHeight: 1, marginTop: 4 }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Signals */}
        <div>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
            Signals
          </div>
          <SignalRow tint={C.green}  k="Clock-in window"   v="Pending review"     ok />
          <SignalRow tint={C.accent} k="Manual frequency"  v="This month"         />
          <SignalRow tint={C.text2}  k="Reason length"     v={`${reasonWordCount} words`} />

          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: C.accentSoft, border: `1px solid ${C.accentBorder}`, fontSize: 11.5, color: C.accent, lineHeight: 1.5 }}>
            <span style={{ fontFamily: F_MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>⚠ Action required</span><br />
            <span style={{ color: C.text2 }}>Manual clock-in awaiting your review and approval.</span>
          </div>
        </div>
      </div>

      {/* Decision bar */}
      <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10, background: C.surface2 }}>
        {actionMsg && (
          <div style={{ padding: '8px 12px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 8, fontSize: 12.5, color: C.green }}>{actionMsg}</div>
        )}
        {actionErr && (
          <div style={{ padding: '8px 12px', background: C.redSoft, border: `1px solid ${C.redBorder}`, borderRadius: 8, fontSize: 12.5, color: C.red }}>{actionErr}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            placeholder="Add a note (optional) · seen by member"
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            style={{ flex: 1, padding: '10px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, fontFamily: F_SANS, fontSize: 12.5, color: C.text, outline: 'none' }}
          />
          <button
            onClick={() => onAction('reject')}
            disabled={actionLoading}
            style={{ padding: '10px 16px', background: C.surface, color: C.red, border: `1px solid ${C.redBorder}`, borderRadius: 9, fontFamily: F_SANS, fontSize: 13, fontWeight: 500, cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: actionLoading ? 0.6 : 1 }}
          >
            ✕ Reject
          </button>
          <button
            onClick={() => onAction('approve')}
            disabled={actionLoading}
            style={{ padding: '10px 20px', background: C.green, color: '#0a0a0a', border: 'none', borderRadius: 9, fontFamily: F_SANS, fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, opacity: actionLoading ? 0.6 : 1 }}
          >
            {actionLoading ? '…' : '✓ Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Leave empty state ─────────────────────────────────────────────────────────
function LeaveEmptyState() {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: C.text3 }}>✦</div>
      <div style={{ fontFamily: F_SERIF, fontSize: 22, color: C.text, letterSpacing: '-0.015em' }}>No pending leave requests</div>
      <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em', maxWidth: 300 }}>
        Leave request data is not available in the current dashboard view.
      </div>
    </div>
  );
}

// ── Empty queue state ─────────────────────────────────────────────────────────
function QueueEmptyState() {
  return (
    <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 22, color: C.text3 }}>✓</div>
      <div style={{ fontFamily: F_SERIF, fontSize: 18, color: C.text }}>Queue is clear</div>
      <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>No pending approvals match the current filter.</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ApprovalsPage({ dashboard, apiUrl, onRefresh, filterKind }: Props) {
  const allRequests = buildRequests(dashboard);
  const manualCount = allRequests.filter(r => r.kind === 'manual').length;
  const leaveCount  = allRequests.filter(r => r.kind === 'leave').length;

  const [selectedId, setSelectedId] = useState<string | null>(() => allRequests[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<'all' | 'manual' | 'leave'>(
    filterKind === 'leave' ? 'leave' : 'all'
  );
  const [search, setSearch] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const activeRequests = allRequests.filter(r => !dismissed.has(r.id));

  // Auto-select first item when data loads
  useEffect(() => {
    setSelectedId(prev => {
      if (!prev && activeRequests.length > 0) return activeRequests[0].id;
      // keep selection if the item still exists, otherwise select first
      if (prev && !activeRequests.find(r => r.id === prev) && activeRequests.length > 0) return activeRequests[0].id;
      return prev;
    });
  }, [activeRequests]);

  // Filter by tab
  const tabFiltered: RequestItem[] =
    activeTab === 'all'    ? activeRequests :
    activeTab === 'manual' ? activeRequests.filter(r => r.kind === 'manual') :
                             activeRequests.filter(r => r.kind === 'leave');

  // Filter by search
  const searchLower = search.toLowerCase();
  const visible = search
    ? tabFiltered.filter((r) =>
        r.name.toLowerCase().includes(searchLower) ||
        r.reason.toLowerCase().includes(searchLower) ||
        r.date.toLowerCase().includes(searchLower) ||
        r.role.toLowerCase().includes(searchLower)
      )
    : tabFiltered;

  // Group by urgency
  const dueToday  = visible.filter((r) => r.urgency === 'today');

  // Selected item — selectedIdx is derived from current visible array each render,
  // so indices automatically update when search/filter changes
  const selectedItem = visible.find((r) => r.id === selectedId) ?? visible[0] ?? null;
  const selectedIdx = selectedItem ? visible.indexOf(selectedItem) : 0;

  function handleNav(idx: number) {
    const item = visible[idx];
    if (item) setSelectedId(item.id);
  }

  async function doAction(action: 'approve' | 'reject') {
    if (!selectedItem) return;
    setActionLoading(true); setActionMsg(null); setActionErr(null);
    try {
      const res = await clientFetch(
        `${apiUrl}/webhook/approve?action=${action}&row=${selectedItem.dbId}&type=${selectedItem.type}`,
        {}
      );
      const data = await res.json();
      if (!res.ok) {
        setActionErr(data.error ?? 'Action failed.');
      } else {
        const nextItem = activeRequests.find(r => r.id !== selectedItem.id);
        setDismissed(prev => new Set([...prev, selectedItem.id]));
        setNote('');
        setActionMsg(`${selectedItem.name} — ${action === 'approve' ? 'Approved ✓' : 'Rejected ✕'}`);
        setTimeout(() => setActionMsg(null), 4000);
        setSelectedId(nextItem?.id ?? null);
        // Refresh dashboard data so the item won't reappear when switching tabs
        await onRefresh?.();
      }
    } catch {
      setActionErr('Network error. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  const isLeaveTab = activeTab === 'leave';
  const leaveItems = activeRequests.filter(r => r.kind === 'leave');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1320, margin: '0 auto', fontFamily: F_SANS }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>
            Approvals <span style={{ fontStyle: 'italic', color: C.text2 }}>queue.</span>
          </div>
          <div style={{ fontFamily: F_MONO, fontSize: 11.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
            {`${allRequests.length} pending · ${manualCount} manual clock-in${manualCount !== 1 ? 's' : ''} · ${leaveCount} leave request${leaveCount !== 1 ? 's' : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, fontFamily: F_MONO, fontSize: 11, color: C.text2, letterSpacing: '0.04em' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} />
            Avg response · 3h 42m
          </span>
          <button style={{ padding: '7px 14px 7px 12px', background: C.surface, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 9, fontFamily: F_SANS, fontSize: 12.5, cursor: 'pointer' }}>
            ⌘ Approve all matching
          </button>
        </div>
      </div>

      {/* ── Stat row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard
          label="Awaiting you"
          value={String(allRequests.length)}
          sub={<>{allRequests.length} due today</>}
          icon="⏳"
          tint={C.accent}
          trend={allRequests.length > 0 ? 'Oldest · today' : 'Nothing pending'}
          trendAlert={allRequests.length > 0}
        />
        <StatCard label="Approved · this week" value="—" sub={<>no data</>}       icon="✓" tint={C.green}  trend="—" />
        <StatCard label="Rejected · this week" value="—" sub={<>no data</>}       icon="✕" tint={C.red}    trend="—" />
        <StatCard label="Avg decision time"    value="—" sub={<>no data</>}       icon="◷" tint={C.blue}   trend="—" />
      </div>

      {/* ── Master/detail ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ─── LEFT · Queue ─── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* Queue header */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {([
                { id: 'all'    as const, label: 'All',    count: activeRequests.length },
                { id: 'manual' as const, label: 'Manual', count: manualCount },
                { id: 'leave'  as const, label: 'Leave',  count: leaveCount },
              ]).map((t) => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px', borderRadius: 7,
                      background: active ? C.text : 'transparent',
                      color: active ? C.surface : C.text2,
                      border: `1px solid ${active ? C.text : C.border}`,
                      fontFamily: F_SANS, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    {t.label}
                    <span style={{ fontFamily: F_MONO, fontSize: 10, opacity: 0.85 }}>{t.count}</span>
                  </button>
                );
              })}
              <div style={{ flex: 1 }} />
              <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, background: C.surface2, color: C.text2, border: `1px solid ${C.border}`, fontFamily: F_MONO, fontSize: 11, letterSpacing: '0.04em', cursor: 'pointer' }}>
                ⇅ Oldest first
              </button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, reason, date…"
                style={{ width: '100%', padding: '8px 12px 8px 32px', background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: F_SANS, fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Queue groups */}
          <div style={{ flex: 1 }}>
            {isLeaveTab ? (
              leaveItems.length === 0 ? (
                <div style={{ padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, color: C.text3 }}>✦</div>
                  <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>No pending leave requests</div>
                </div>
              ) : (
                <QueueGroup label="Due today" items={visible} selectedId={selectedId} onSelect={setSelectedId} />
              )
            ) : visible.length === 0 ? (
              <QueueEmptyState />
            ) : (
              <QueueGroup label="Due today" items={dueToday} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </div>

          {/* Bulk bar */}
          <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: C.surface2, display: 'flex', alignItems: 'center', gap: 8, fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em' }}>
            <span style={{ width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${C.borderStrong}`, background: C.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
            <span style={{ color: C.text2 }}>Select all matching</span>
            <span style={{ flex: 1 }} />
            <button style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text2, fontFamily: F_SANS, fontSize: 11, cursor: 'pointer' }}>
              Bulk approve →
            </button>
          </div>
        </div>

        {/* ─── RIGHT · Detail ─── */}
        {isLeaveTab && leaveItems.length === 0 ? (
          <LeaveEmptyState />
        ) : selectedItem ? (
          <DetailCard
            r={selectedItem}
            allItems={visible}
            selectedIdx={selectedIdx}
            onNav={handleNav}
            note={note}
            onNoteChange={setNote}
            actionLoading={actionLoading}
            actionMsg={actionMsg}
            actionErr={actionErr}
            onAction={doAction}
          />
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <div style={{ fontFamily: F_SERIF, fontSize: 22, color: C.text }}>Select a request</div>
            <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>Click an item in the queue to review it here.</div>
          </div>
        )}
      </div>
    </div>
  );
}
