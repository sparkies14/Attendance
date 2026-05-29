import { headers, cookies } from 'next/headers';
import MemberDashboard from '@/components/member/MemberDashboard';
import type { UserProfile, LeaveBalance, MemberData } from '@/components/member/MemberDashboard';

async function safeFetch<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Dev-only mock data ────────────────────────────────────────────────────────
function buildMockData(month: number, year: number): { user: UserProfile; leaveBalance: LeaveBalance; memberData: MemberData } {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const todayDay = today.getDate();

  // Days that are late (1-indexed weekday numbers within the month)
  const LATE_DAYS = new Set([3, 8, 14, 19, 23]);

  const calendar = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dow = new Date(year, month - 1, day).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isFuture = day > todayDay;
    const dateStr = `${month}/${day}/${year}`;

    if (isWeekend || isFuture) {
      return { day, date: dateStr, status: 'weekend', clockIn: '-', clockOut: '-', totalHours: '-', isWeekend, lastClockIn: '-', accumulatedHours: 0 };
    }
    if (day === todayDay) {
      return { day, date: dateStr, status: 'present', clockIn: '08:52', clockOut: '-', totalHours: '-', isWeekend: false, lastClockIn: '08:52', accumulatedHours: 0 };
    }
    if (LATE_DAYS.has(day)) {
      const mins = 10 + (day % 5) * 4; // vary lateness: 10–26 min late
      const inH = 9, inM = mins;
      const clockIn = `${String(inH).padStart(2,'0')}:${String(inM).padStart(2,'0')}`;
      return { day, date: dateStr, status: 'late', clockIn, clockOut: '18:10', totalHours: +(8.5 - mins / 60).toFixed(2), isWeekend: false, lastClockIn: clockIn, accumulatedHours: 0 };
    }
    // Everyone else: on time, slight variation in hours
    const extraMins = (day * 7) % 25;
    const totalHours = +(9 + extraMins / 60).toFixed(2);
    return { day, date: dateStr, status: 'present', clockIn: '08:45', clockOut: '17:52', totalHours, isWeekend: false, lastClockIn: '08:45', accumulatedHours: 0 };
  });

  const present = calendar.filter(d => !d.isWeekend && d.status === 'present').length;
  const late    = calendar.filter(d => d.status === 'late').length;
  const absent  = 0;
  const pending = 0;

  return {
    user: {
      id: 99,
      email: 'jocel@anosupo.ai',
      name: 'Jocel Reyes',
      role: 'member',
      status: 'active',
      hasPassword: true,
      hasGoogle: false,
    },
    leaveBalance: {
      email: 'jocel@anosupo.ai',
      name: 'Jocel Reyes',
      hire_year: 2023,
      grantsEarned: 15,
      used: 2,
      adjustments: 0,
      balance: 13,
    },
    memberData: {
      month,
      year,
      email: 'jocel@anosupo.ai',
      calendar,
      summary: { present, late, absent, pending },
      onLunch: false,
      onBreak: false,
      hadLunch: true,
      leaveHistory: [
        // Past — Approved
        { id: 'h1', date: '3/20/2026', leaveType: 'Vacation',  reason: 'Spring break with family',        status: 'Approved' },
        { id: 'h2', date: '4/15/2026', leaveType: 'Sick',      reason: 'Cold and fever',                  status: 'Approved' },
        // Past — Rejected
        { id: 'h3', date: '4/1/2026',  leaveType: 'Personal',  reason: 'Running personal errands',        status: 'Rejected' },
        // Past — Pending (4 entries → show in Pending section)
        { id: 'p1', date: '5/5/2026',  leaveType: 'Sick',      reason: 'Migraine, unable to work',        status: 'Pending' },
        { id: 'p2', date: '5/10/2026', leaveType: 'Vacation',  reason: 'Out-of-town wedding',             status: 'Pending' },
        { id: 'p3', date: '5/15/2026', leaveType: 'Personal',  reason: 'Government document renewal',     status: 'Pending' },
        { id: 'p4', date: '5/22/2026', leaveType: 'Sick',      reason: 'Dental procedure follow-up',      status: 'Pending' },
        // Future — Approved (5 entries → show in Upcoming section)
        { id: 'u1', date: '6/5/2026',  leaveType: 'Vacation',  reason: 'Boracay trip with friends',       status: 'Approved' },
        { id: 'u2', date: '6/18/2026', leaveType: 'Personal',  reason: 'Graduation ceremony attendance',  status: 'Approved' },
        { id: 'u3', date: '7/4/2026',  leaveType: 'Sick',      reason: 'Scheduled medical check-up',      status: 'Approved' },
        { id: 'u4', date: '7/25/2026', leaveType: 'Vacation',  reason: 'Annual leave — Osaka trip',       status: 'Approved' },
        { id: 'u5', date: '8/12/2026', leaveType: 'Personal',  reason: 'Family reunion in Cebu',          status: 'Approved' },
      ],
    },
  };
}
// ─────────────────────────────────────────────────────────────────────────────

export default async function MemberPage() {
  const h = await headers();
  const email = h.get('x-user-email') ?? '';

  const cookieStore = await cookies();
  const token = cookieStore.get('att_token')?.value ?? '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [user, leaveBalance, memberData] = await Promise.all([
    safeFetch<UserProfile>(`${apiUrl}/auth/me`, token),
    safeFetch<LeaveBalance>(`${apiUrl}/leave-balance?email=${encodeURIComponent(email)}`, token),
    safeFetch<MemberData>(`${apiUrl}/webhook/member-data?email=${encodeURIComponent(email)}&month=${month}&year=${year}`, token),
  ]);

  // In development: fall back to mock data so the UI is always visible
  if (!user && process.env.NODE_ENV === 'development') {
    const mock = buildMockData(month, year);
    return (
      <MemberDashboard
        user={mock.user}
        leaveBalance={mock.leaveBalance}
        memberData={mock.memberData}
        apiUrl={apiUrl}
      />
    );
  }

  if (!user) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'monospace', textAlign: 'center' }}>
        <p>Unable to load your profile. Please try refreshing.</p>
      </main>
    );
  }

  return (
    <MemberDashboard
      user={user}
      leaveBalance={leaveBalance}
      memberData={memberData}
      apiUrl={apiUrl}
    />
  );
}
