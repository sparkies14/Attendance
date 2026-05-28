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
