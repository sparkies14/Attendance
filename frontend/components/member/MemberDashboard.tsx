'use client';

import { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import CalendarPage from './pages/CalendarPage';
import LeavePage from './pages/LeavePage';
import PayrollPage from './pages/PayrollPage';

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  hasPassword: boolean;
  hasGoogle: boolean;
}

export interface LeaveBalance {
  email: string;
  name: string;
  hire_year: number;
  total: number;
  used: number;
  remaining: number;
}

export interface CalendarDay {
  day: number;
  date: string; // M/D/YYYY
  status: string;
  clockIn: string;
  clockOut: string;
  totalHours: string | number;
  isWeekend: boolean;
}

export interface LeaveRecord {
  id: string;
  date: string;
  leaveType: string;
  reason: string;
  status: string;
}

export interface MemberData {
  month: number;
  year: number;
  email: string;
  calendar: CalendarDay[];
  summary: { present: number; late: number; absent: number; pending: number };
  onLunch: boolean;
  onBreak: boolean;
  leaveHistory: LeaveRecord[];
}

export interface MemberDashboardProps {
  user: UserProfile;
  leaveBalance: LeaveBalance | null;
  memberData: MemberData | null;
  apiUrl: string;
}

type Page = 'home' | 'calendar' | 'leave' | 'payroll';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'home',     label: 'Home',          icon: '●' },
  { id: 'calendar', label: 'Calendar',      icon: '▦' },
  { id: 'leave',    label: 'Leave history', icon: '≡' },
  { id: 'payroll',  label: 'Payroll',       icon: '¥' },
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

  useEffect(() => {
    function tick() {
      const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      setClock(
        `${String(jst.getHours()).padStart(2,'0')}:${String(jst.getMinutes()).padStart(2,'0')}:${String(jst.getSeconds()).padStart(2,'0')}`
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  async function signOut() {
    try { await fetch('/api/logout', { method: 'POST' }); } catch {}
    window.location.replace('/login');
  }

  const jst    = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const hour   = jst.getHours();
  const hi     = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const week   = isoWeek(jst);
  const first  = (user.name || user.email).split(' ')[0];
  const inits  = user.name
    ? user.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : user.email[0].toUpperCase();

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: 190, minWidth: 190, backgroundColor: '#111', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0, overflowY: 'auto' }}>

        {/* Logo */}
        <div style={{ padding: '1.5rem 1.25rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ width: 34, height: 34, backgroundColor: '#fff', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#111', fontSize: '0.88rem', fontWeight: 900, letterSpacing: '-0.05em' }}>A·</span>
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.2 }}>Anosupo AI</div>
              <div style={{ color: '#4b5563', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Attendance</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '0 0.75rem', flex: 1 }}>
          <div style={{ color: '#4b5563', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '0 0.5rem 0.65rem' }}>Menu</div>
          {NAV.map(({ id, label, icon }) => {
            const on = page === id;
            return (
              <button
                key={id}
                onClick={() => setPage(id)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', width: '100%', padding: '0.6rem 0.75rem', marginBottom: '0.1rem', backgroundColor: on ? '#1f2937' : 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ color: on ? '#fff' : '#4b5563', fontSize: '0.7rem', width: 14, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                <span style={{ color: on ? '#f9fafb' : '#6b7280', fontSize: '0.82rem', fontWeight: on ? 600 : 400 }}>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* User / sign out */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #1f2937' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>{inits}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#e5e7eb', fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || user.email}</div>
              <div style={{ color: '#4b5563', fontSize: '0.62rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            </div>
          </div>
          <button onClick={signOut} style={{ color: '#6b7280', fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Sign out</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflowY: 'auto' }}>

        {/* Header */}
        <header style={{ padding: '1.75rem 2rem 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: '#fff', borderBottom: '1px solid #f3f4f6', paddingBottom: '1.25rem' }}>
          <div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 700, color: '#111', margin: 0, lineHeight: 1.15 }}>
              {hi}, <em style={{ fontStyle: 'italic' }}>{first}.</em>
            </h1>
            <p style={{ color: '#9ca3af', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0.35rem 0 0' }}>
              {DAYS_LONG[jst.getDay()].toUpperCase()}, {MONTHS_LONG[jst.getMonth()].toUpperCase()} {jst.getDate()} · WEEK {week}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, marginTop: '0.1rem' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#6b7280', fontSize: '0.72rem', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.35rem 0.65rem', cursor: 'pointer' }}
            >
              ↻ Refresh
            </button>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '1.35rem', fontWeight: 700, color: '#111', lineHeight: 1, letterSpacing: '-0.01em' }}>{clock}</div>
              <div style={{ fontSize: '0.58rem', color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.15rem' }}>JST · Tokyo</div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div style={{ flex: 1, padding: '1.75rem 2rem 2.5rem' }}>
          {page === 'home'     && <HomePage     user={user} memberData={memberData} leaveBalance={leaveBalance} apiUrl={apiUrl} />}
          {page === 'calendar' && <CalendarPage email={user.email} initialData={memberData} apiUrl={apiUrl} />}
          {page === 'leave'    && <LeavePage    email={user.email} leaveBalance={leaveBalance} initialLeaveHistory={memberData?.leaveHistory ?? []} apiUrl={apiUrl} />}
          {page === 'payroll'  && <PayrollPage  email={user.email} initialData={memberData} apiUrl={apiUrl} />}
        </div>
      </main>
    </div>
  );
}
