import { headers, cookies } from 'next/headers';
import AdminDashboard from '@/components/admin/AdminDashboard';
import type { DashboardData } from '@/components/admin/AdminDashboard';

async function safeFetch<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

export default async function AdminPage() {
  const h = await headers();
  const cookieStore = await cookies();
  const token = cookieStore.get('att_token')?.value ?? '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  const name = h.get('x-user-name') ?? '';
  const role = h.get('x-user-role') ?? '';
  const email = h.get('x-user-email') ?? '';

  const dashboard = await safeFetch<DashboardData>(`${apiUrl}/webhook/dashboard`, token);

  return (
    <AdminDashboard
      adminName={name}
      adminRole={role}
      adminEmail={email}
      dashboard={dashboard}
      apiUrl={apiUrl}
      token={token}
    />
  );
}
