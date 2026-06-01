'use client';

import { useState, useEffect } from 'react';
import DevResetButton from '@/components/dev/DevResetButton'; // DEV ONLY — remove this line and its usage below
import AttendancePage from './pages/AttendancePage';
import ApprovalsPage from './pages/ApprovalsPage';
import CalendarPage from './pages/CalendarPage';
import TeamPayrollPage from './pages/TeamPayrollPage';
import InsightsPage from './pages/InsightsPage';
import MembersPage from './pages/MembersPage';

export interface PendingAttendance {
  id: number;
  email: string;
  name: string;
  date: string;
  clock_in: string;
  clock_out: string;
  entry_type: string;
  reason: string;
  role: string;
  late_status: string;
}

export interface PendingLeave {
  id: number;
  email: string;
  name: string;
  date: string;
  leave_type: string;
  reason: string;
  status: string;
}

export interface DashboardData {
  date: string;
  summary: {
    clockedIn: number;
    clockedOut: number;
    notIn: number;
    pending: number;
    total: number;
  };
  members: {
    name: string;
    email: string;
    role: string;
    status: string;
    clockIn: string;
    clockOut: string;
    totalHours: number | string;
    lateStatus: string;
  }[];
  pendingApprovals: PendingAttendance[];
  pendingLeave: PendingLeave[];
}

interface Props {
  adminName: string;
  adminRole: string;
  adminEmail: string;
  dashboard: DashboardData | null;
  apiUrl: string;
  token: string;
}

type Page = 'attendance' | 'approvals' | 'leave' | 'calendar' | 'payroll' | 'insights' | 'members';

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
  sidebarBg: '#050505', sidebarBorder: '#161616',
  sidebarText: '#737373', sidebarActive: 'rgba(244,185,66,0.12)', sidebarActiveText: '#f4b942',
};

const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

const NAV_GROUPS = [
  { label: 'Overview',   items: [
    { id: 'attendance' as Page, label: 'Attendance', icon: '◉', badge: null },
    { id: 'insights'   as Page, label: 'Reports',    icon: '▤', badge: null },
  ]},
  { label: 'Management', items: [
    { id: 'approvals' as Page, label: 'Approvals',      icon: '✓', badge: 'pending' as const },
    { id: 'leave' as Page,     label: 'Leave requests', icon: '⌇', badge: 'leave' as const },
  ]},
  { label: 'Company',    items: [
    { id: 'calendar' as Page, label: 'Calendar', icon: '▦', badge: null },
    { id: 'payroll' as Page,  label: 'Payroll',  icon: '¥', badge: null },
    { id: 'members' as Page,  label: 'Members',  icon: '⊞', badge: null },
  ]},
];

export default function AdminDashboard({ adminName, adminRole, adminEmail, dashboard, apiUrl, token }: Props) {
  const [page, setPage] = useState<Page>('attendance');
  const [jstClock, setJstClock] = useState('');
  const [localClock, setLocalClock] = useState('');
  const [dashData, setDashData] = useState<DashboardData | null>(dashboard);

  async function refreshDashboard() {
    try {
      const res = await fetch(`${apiUrl}/webhook/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) setDashData(await res.json());
    } catch { /* silent — stale data is better than crash */ }
  }

  useEffect(() => {
    function tick() {
      const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      setJstClock(`${String(jst.getHours()).padStart(2,'0')}:${String(jst.getMinutes()).padStart(2,'0')}:${String(jst.getSeconds()).padStart(2,'0')}`);
      const loc = new Date();
      setLocalClock(`${String(loc.getHours()).padStart(2,'0')}:${String(loc.getMinutes()).padStart(2,'0')}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  async function signOut() {
    try { await fetch('/api/logout', { method: 'POST' }); } catch {}
    window.location.replace('/login');
  }

  const inits = adminName
    ? adminName.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()
    : 'A';

  const pendingCount = (dashData?.pendingApprovals?.length ?? 0) + (dashData?.pendingLeave?.length ?? 0);

  // JST date
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateStr = `${DAYS[jst.getDay()]}, ${MONTHS[jst.getMonth()]} ${jst.getDate()}`;

  // Suppress unused variable warnings for style constants
  void F_SERIF;

  return (<>
    <div style={{ display: 'flex', height: '100vh', fontFamily: F_SANS, background: C.bg, color: C.text, overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: 232, flexShrink: 0, background: C.sidebarBg, borderRight: `1px solid ${C.sidebarBorder}`, display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* Brand */}
        <div style={{ padding: '20px 22px 18px', borderBottom: `1px solid ${C.sidebarBorder}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, #f4b942, #b45309)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#0a0a0a', fontSize: 13, fontWeight: 900, fontFamily: F_SANS, letterSpacing: '-0.04em' }}>A</span>
          </div>
          <div>
            <div style={{ fontFamily: F_SANS, fontSize: 13.5, fontWeight: 500, color: '#fafafa', letterSpacing: '-0.01em', lineHeight: 1.1 }}>Anosupo AI</div>
            <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.sidebarText, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
              {adminRole.charAt(0).toUpperCase() + adminRole.slice(1)} · Dashboard
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: '10px', flex: 1, overflow: 'auto' }}>
          {NAV_GROUPS.map((g, gi) => (
            <div key={gi} style={{ marginTop: gi === 0 ? 6 : 14 }}>
              <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: '#525252', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '4px 12px 8px' }}>{g.label}</div>
              {g.items.map((it) => {
                const isActive = page === it.id;
                const badge = it.badge === 'pending' ? pendingCount : null;
                return (
                  <button key={it.id} onClick={() => setPage(it.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', borderRadius: 8, marginBottom: 1, background: isActive ? C.sidebarActive : 'transparent', border: 'none', cursor: 'pointer', color: isActive ? C.sidebarActiveText : C.sidebarText, fontSize: 13, fontFamily: F_SANS, fontWeight: isActive ? 500 : 400, textAlign: 'left' }}>
                    <span style={{ width: 16, textAlign: 'center', fontFamily: F_MONO, fontSize: 12.5 }}>{it.icon}</span>
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {badge != null && badge > 0 && (
                      <span style={{ background: C.accent, color: '#0a0a0a', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 999, lineHeight: 1.4 }}>{badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Dual clocks */}
        <div style={{ margin: '0 10px 10px', padding: '12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.sidebarBorder}`, borderRadius: 9 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: F_MONO, fontSize: 9, color: C.sidebarText, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Japan</div>
              <div style={{ fontFamily: F_MONO, fontSize: 16, color: '#fafafa', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 2 }}>{jstClock || '--:--:--'}</div>
              <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.sidebarText, marginTop: 1 }}>{dateStr}</div>
            </div>
            <div style={{ width: 1, background: C.sidebarBorder, alignSelf: 'stretch' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: F_MONO, fontSize: 9, color: C.sidebarText, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Local</div>
              <div style={{ fontFamily: F_MONO, fontSize: 13, color: C.sidebarText, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', marginTop: 4 }}>{localClock || '--:--'}</div>
              <div style={{ fontFamily: F_MONO, fontSize: 10, color: '#525252', marginTop: 1 }}>Browser time</div>
            </div>
          </div>
        </div>

        {/* User row */}
        <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.sidebarBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #f4b942, #b45309)', color: '#0a0a0a', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{inits}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: '#fafafa', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{adminName || adminEmail}</div>
              <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.sidebarText, letterSpacing: '0.04em', marginTop: 1 }}>{adminRole.charAt(0).toUpperCase() + adminRole.slice(1)}</div>
            </div>
            <button onClick={signOut} style={{ background: 'transparent', color: C.sidebarText, border: 'none', cursor: 'pointer', fontSize: 14, padding: 6, borderRadius: 6 }}>↩</button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <div style={{ borderBottom: `1px solid ${C.border}`, padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 14, background: C.surface, flexShrink: 0 }}>
          <div style={{ position: 'relative', flex: '0 1 380px' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>⌕</span>
            <input placeholder="Search members, dates, leave types…" style={{ width: '100%', padding: '8px 12px 8px 32px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 999, fontFamily: F_SANS, fontSize: 12.5, color: C.text, outline: 'none', boxSizing: 'border-box' as const }} />
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: F_MONO, fontSize: 10, color: C.text3, padding: '1px 6px', border: `1px solid ${C.border}`, borderRadius: 4 }}>⌘K</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, color: C.text2, cursor: 'pointer', position: 'relative', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ⚲
              {pendingCount > 0 && <span style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, background: C.accent, borderRadius: '50%', border: `2px solid ${C.surface}` }} />}
            </button>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 5px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #f4b942, #b45309)', color: '#0a0a0a', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inits}</span>
              <span style={{ fontFamily: F_SANS, fontSize: 12.5, color: C.text }}>{adminName.split(' ')[0] || 'Admin'}</span>
            </button>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 28px', background: C.bg }}>
          {page === 'attendance' && <AttendancePage dashboard={dashData} apiUrl={apiUrl} />}
          {page === 'approvals'  && <ApprovalsPage  dashboard={dashData} apiUrl={apiUrl} token={token} onRefresh={refreshDashboard} />}
          {page === 'leave'      && <ApprovalsPage  dashboard={dashData} apiUrl={apiUrl} token={token} onRefresh={refreshDashboard} filterKind="leave" />}
          {page === 'calendar'   && <CalendarPage />}
          {page === 'payroll'    && <TeamPayrollPage dashboard={dashData} apiUrl={apiUrl} />}
          {page === 'insights'   && <InsightsPage apiUrl={apiUrl} />}
          {page === 'members'   && <MembersPage apiUrl={apiUrl} adminRole={adminRole} />}
        </div>
      </div>
    </div>
    {/* DEV ONLY — remove this line and the import above to disable */}
    <DevResetButton apiUrl={apiUrl} onReset={() => window.location.reload()} />
  </>);
}
