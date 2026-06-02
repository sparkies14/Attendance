'use client';

import { useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import { useSidebarCollapse, COLLAPSED_W } from '../hooks/useSidebarCollapse';
import { HomeIcon, CalendarIcon, DoorIcon, TimesheetIcon, SettingIcon, PinIcon } from '../icons/NavIcons';
import DevResetButton from '@/components/dev/DevResetButton'; // DEV ONLY — remove this line and its usage below
import HomePage from './pages/HomePage';
import CalendarPage from './pages/CalendarPage';
import LeavePage from './pages/LeavePage';
import PayrollPage from './pages/PayrollPage';
import AccountPage from './pages/AccountPage';

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  hasPassword: boolean;
  hasGoogle: boolean;
  hasDiscord?: boolean;
}

export interface LeaveBalance {
  email: string;
  name: string;
  hire_year: number;
  grantsEarned: number;
  used: number;
  adjustments: number;
  balance: number;
}

export interface CalendarDay {
  day: number;
  date: string; // M/D/YYYY
  status: string;
  clockIn: string;
  clockOut: string;
  totalHours: string | number;
  isWeekend: boolean;
  lastClockIn: string;
  accumulatedHours: number;
  entryType?: string;     // 'manual' | 'auto'
  dateISO?: string;       // YYYY-MM-DD, used for attendance appeal submission
}

export interface LeaveRecord {
  id: string;
  date: string;
  leaveType: string;
  reason: string;
  status: string;
}

export interface PlanEvent {
  id: number;
  title: string;
  start_time: string;
  end_time: string;
  completed: boolean;
  priority: 'p1' | 'p2' | 'p3';
  tag: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MemberData {
  month: number;
  year: number;
  email: string;
  calendar: CalendarDay[];
  summary: { present: number; late: number; absent: number; pending: number };
  onLunch: boolean;
  onBreak: boolean;
  hadLunch: boolean;
  lunchStart?: string | null;
  lunchEnd?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  leaveHistory: LeaveRecord[];
  planEventsByDate?: Record<string, number>;
  lateManualRequired?: boolean;
  breakBudgetSecs?: number;
  breakUsedSecs?: number;
  lunchBudgetSecs?: number;
  lunchUsedSecs?: number;
  lunchConsumed?: boolean;
}

export interface MemberDashboardProps {
  user: UserProfile;
  leaveBalance: LeaveBalance | null;
  memberData: MemberData | null;
  apiUrl: string;
}

type Page = 'home' | 'calendar' | 'leave' | 'payroll' | 'account';

// Design tokens (light mode — sidebar always dark)
const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626',
  sidebarBg: '#050505', sidebarText: '#a3a3a3', sidebarBorder: '#161616',
  sidebarActive: 'rgba(244,185,66,0.12)', sidebarActiveText: '#f4b942',
};

const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

const NAV: { id: Page; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'home',     label: 'Home',            icon: HomeIcon },
  { id: 'calendar', label: 'Calendar · plan', icon: CalendarIcon },
  { id: 'leave',    label: 'Leave history',   icon: DoorIcon },
  { id: 'payroll',  label: 'Timesheet',       icon: TimesheetIcon },
  { id: 'account',  label: 'Account',         icon: SettingIcon },
];

const DAYS_LONG   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default function MemberDashboard({ user, leaveBalance, memberData, apiUrl }: MemberDashboardProps) {
  const [page, setPage] = useState<Page>('home');
  const [clock, setClock] = useState('');
  const [localClock, setLocalClock] = useState('');

  useEffect(() => {
    function tick() {
      const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      setClock(
        `${String(jst.getHours()).padStart(2,'0')}:${String(jst.getMinutes()).padStart(2,'0')}:${String(jst.getSeconds()).padStart(2,'0')}`
      );
      const local = new Date();
      setLocalClock(
        `${String(local.getHours()).padStart(2,'0')}:${String(local.getMinutes()).padStart(2,'0')}:${String(local.getSeconds()).padStart(2,'0')}`
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  async function signOut() {
    try { await fetch('/api/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('att_token');
    window.location.replace('/login');
  }

  const jst   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const hour  = jst.getHours();
  const hi    = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const week  = isoWeek(jst);
  const first = (user.name || user.email).split(' ')[0];
  const inits = user.name
    ? user.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : user.email[0].toUpperCase();

  const dateStr = `${DAYS_LONG[jst.getDay()]}, ${MONTHS_LONG[jst.getMonth()]} ${jst.getDate()} · Week ${week}`;

  const { expanded, locked, toggleLock, hoverProps, EXPANDED_W } = useSidebarCollapse(220);

  return (<>
    <div style={{ display: 'flex', height: '100vh', fontFamily: F_SANS, overflow: 'hidden', background: C.bg, color: C.text }}>

      {/* ── Sidebar (always dark) ── */}
      <aside {...hoverProps} style={{ width: locked ? EXPANDED_W : COLLAPSED_W, flexShrink: 0, height: '100vh', position: 'relative', transition: 'width .18s ease' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: expanded ? EXPANDED_W : COLLAPSED_W, background: C.sidebarBg, borderRight: `1px solid ${C.sidebarBorder}`, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', transition: 'width .18s ease', zIndex: 50 }}>

        {/* Brand */}
        <div style={{ padding: '20px 22px 22px', borderBottom: `1px solid ${C.sidebarBorder}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, #f4b942, #b45309)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#0a0a0a', fontSize: 13, fontWeight: 900, fontFamily: F_SANS, letterSpacing: '-0.04em' }}>A</span>
          </div>
          {expanded && (
            <div>
              <div style={{ fontFamily: F_SANS, fontSize: 13.5, fontWeight: 500, color: '#fafafa', letterSpacing: '-0.01em', lineHeight: 1.1 }}>Anosupo AI</div>
              <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.sidebarText, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>Attendance</div>
            </div>
          )}
          {expanded && (
            <button onClick={toggleLock} aria-label={locked ? 'Unlock sidebar' : 'Lock sidebar open'} title={locked ? 'Unlock sidebar' : 'Lock sidebar open'}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: locked ? '#f4b942' : C.sidebarText, display: 'flex', alignItems: 'center', padding: 4 }}>
              <PinIcon size={15} />
            </button>
          )}
        </div>

        {/* Nav */}
        <div style={{ padding: '14px 10px', flex: 1 }}>
          {expanded && (<div style={{ fontFamily: F_MONO, fontSize: 9.5, color: '#525252', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '4px 12px 8px' }}>Menu</div>)}
          {NAV.map(({ id, label, icon: Icon }) => {
            const on = page === id;
            return (
              <button
                key={id}
                onClick={() => setPage(id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: expanded ? 'flex-start' : 'center', gap: 10, width: '100%',
                  padding: '9px 12px', marginBottom: 2, borderRadius: 8,
                  background: on ? C.sidebarActive : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: on ? C.sidebarActiveText : C.sidebarText,
                  fontSize: 13, fontFamily: F_SANS, fontWeight: on ? 500 : 400,
                }}
              >
                <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={18} /></span>
                <span style={{ opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity .12s' }}>{label}</span>
              </button>
            );
          })}
        </div>

        {/* User row */}
        {expanded && (
        <div style={{ padding: '14px 14px 16px', borderTop: `1px solid ${C.sidebarBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #f4b942, #b45309)', color: '#0a0a0a', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {inits}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: '#fafafa', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name || user.email}</div>
              <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.sidebarText, letterSpacing: '0.04em', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            </div>
          </div>
          <button
            onClick={signOut}
            style={{ width: '100%', background: 'transparent', color: C.sidebarText, border: `1px solid ${C.sidebarBorder}`, borderRadius: 8, padding: '7px', fontSize: 11.5, fontFamily: F_SANS, cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
        )}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Topbar */}
        <div style={{ borderBottom: `1px solid ${C.border}`, padding: '18px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surface, flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: F_SERIF, fontSize: 22, lineHeight: 1, letterSpacing: '-0.02em', color: C.text }}>
              {hi}, <span style={{ fontStyle: 'italic' }}>{first}.</span>
            </div>
            <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 6 }}>
              {dateStr.toUpperCase()}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={() => window.location.reload()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, color: C.text2, fontFamily: F_SANS, fontSize: 11.5, cursor: 'pointer' }}
            >
              <span>↻</span> Refresh
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: F_MONO, fontSize: 22, color: C.text, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{localClock || '--:--:--'}</div>
                <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.08em', marginTop: 3 }}>LOCAL</div>
              </div>
              <div style={{ width: 1, height: 32, background: C.border }} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: F_MONO, fontSize: 22, color: C.text, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{clock}</div>
                <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.08em', marginTop: 3 }}>JST · TOKYO</div>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 28px', background: C.bg }}>
          {page === 'home'     && <HomePage     user={user} memberData={memberData} leaveBalance={leaveBalance} apiUrl={apiUrl} />}
          {page === 'calendar' && <CalendarPage email={user.email} initialData={memberData} apiUrl={apiUrl} />}
          {page === 'leave'    && <LeavePage    email={user.email} leaveBalance={leaveBalance} initialLeaveHistory={memberData?.leaveHistory ?? []} apiUrl={apiUrl} />}
          {page === 'payroll'  && <PayrollPage  email={user.email} initialData={memberData} apiUrl={apiUrl} />}
          {page === 'account'  && <AccountPage  user={user} apiUrl={apiUrl} hireYear={leaveBalance?.hire_year} />}
        </div>
      </div>
    </div>
    {/* DEV ONLY — remove this line and the import above to disable */}
    <DevResetButton apiUrl={apiUrl} defaultEmail={user.email} onReset={() => window.location.reload()} />
  </>);
}
