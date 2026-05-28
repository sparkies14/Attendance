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

  const calendar = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dow = new Date(year, month - 1, day).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isFuture = day > todayDay;
    const dateStr = `${month}/${day}/${year}`;

    if (isWeekend || isFuture) {
      return { day, date: dateStr, status: 'weekend', clockIn: '-', clockOut: '-', totalHours: '-', isWeekend };
    }
    if (day === todayDay) {
      return { day, date: dateStr, status: 'present', clockIn: '08:55', clockOut: '-', totalHours: '-', isWeekend: false };
    }
    // sprinkle some statuses
    const roll = day % 7;
    if (roll === 3) return { day, date: dateStr, status: 'late', clockIn: '09:32', clockOut: '18:05', totalHours: 8.38, isWeekend: false };
    if (roll === 6) return { day, date: dateStr, status: 'absent', clockIn: '-', clockOut: '-', totalHours: 0, isWeekend: false };
    if (roll === 1 && day < todayDay - 5) return { day, date: dateStr, status: 'leave', clockIn: '-', clockOut: '-', totalHours: 0, isWeekend: false };
    return { day, date: dateStr, status: 'present', clockIn: '08:45', clockOut: '17:45', totalHours: 9.0, isWeekend: false };
  });

  const present = calendar.filter(d => !d.isWeekend && d.status === 'present').length;
  const late    = calendar.filter(d => d.status === 'late').length;
  const absent  = calendar.filter(d => d.status === 'absent').length;
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
      total: 15,
      used: 4,
      remaining: 11,
    },
    memberData: {
      month,
      year,
      email: 'jocel@anosupo.ai',
      calendar,
      summary: { present, late, absent, pending },
      onLunch: false,
      onBreak: false,
      leaveHistory: [
        { id: '1', date: `${month}/3/${year}`, leaveType: 'Vacation', reason: 'Family trip', status: 'Approved' },
        { id: '2', date: `${month}/10/${year}`, leaveType: 'Sick', reason: 'Fever', status: 'Approved' },
        { id: '3', date: `${month}/20/${year}`, leaveType: 'Personal', reason: 'Errands', status: 'Pending' },
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
    safeFetch<MemberData>(`${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${month}&year=${year}`, token),
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
