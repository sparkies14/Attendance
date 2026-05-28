'use client';

import { useState } from 'react';
import TodayTab from './tabs/TodayTab';
import OverviewTab from './tabs/OverviewTab';
import AttendanceTab from './tabs/AttendanceTab';
import LeaveTab from './tabs/LeaveTab';
import DisciplineTab from './tabs/DisciplineTab';
import AppealsTab from './tabs/AppealsTab';
import SettingsTab from './tabs/SettingsTab';

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
  date: string; // M/D/YYYY (US locale from backend)
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

const TABS = ['Today', 'Overview', 'Attendance', 'Leave', 'Discipline', 'Appeals', 'Settings'] as const;
type Tab = typeof TABS[number];

export default function MemberDashboard({ user, leaveBalance, memberData, apiUrl }: MemberDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Today');

  const gridBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23e5e7eb' stroke-width='0.5'/%3E%3C/svg%3E")`;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa', backgroundImage: gridBg }}>
      {/* Brand bar */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, color: '#111' }}>
          Anosupo AI · 出勤管理
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>
          {user.name} · {user.role}
        </span>
      </div>

      <div style={{ maxWidth: 860, margin: '2rem auto', padding: '0 1rem' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.45rem 0.9rem',
                border: '1px solid',
                borderColor: activeTab === tab ? '#111' : '#d1d5db',
                borderRadius: 999,
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                backgroundColor: activeTab === tab ? '#111' : '#fff',
                color: activeTab === tab ? '#fff' : '#6b7280',
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Active tab */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '2rem' }}>
          {activeTab === 'Today'      && <TodayTab      email={user.email} memberData={memberData} apiUrl={apiUrl} />}
          {activeTab === 'Overview'   && <OverviewTab   user={user} leaveBalance={leaveBalance} memberData={memberData} />}
          {activeTab === 'Attendance' && <AttendanceTab email={user.email} initialData={memberData} apiUrl={apiUrl} />}
          {activeTab === 'Leave'      && <LeaveTab      email={user.email} leaveBalance={leaveBalance} initialLeaveHistory={memberData?.leaveHistory ?? []} apiUrl={apiUrl} />}
          {activeTab === 'Discipline' && <DisciplineTab email={user.email} apiUrl={apiUrl} />}
          {activeTab === 'Appeals'    && <AppealsTab    apiUrl={apiUrl} />}
          {activeTab === 'Settings'   && <SettingsTab   user={user} apiUrl={apiUrl} />}
        </div>
      </div>
    </div>
  );
}
