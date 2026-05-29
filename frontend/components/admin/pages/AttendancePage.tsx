'use client';
import type { DashboardData } from '../AdminDashboard';
interface Props { dashboard: DashboardData | null; apiUrl: string; }
export default function AttendancePage({ dashboard }: Props) {
  return <div style={{ fontFamily: 'monospace', padding: 24 }}>Attendance — {dashboard?.summary.total ?? 0} members</div>;
}
