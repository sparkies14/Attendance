'use client';
import type { DashboardData } from '../AdminDashboard';
interface Props { dashboard: DashboardData | null; apiUrl: string; }
export default function TeamPayrollPage({ dashboard }: Props) {
  return <div style={{ fontFamily: 'monospace', padding: 24 }}>Team Payroll — {dashboard?.summary.total ?? 0} members</div>;
}
