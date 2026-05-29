'use client';
import type { DashboardData } from '../AdminDashboard';
interface Props { dashboard: DashboardData | null; apiUrl: string; filterKind?: string; }
export default function ApprovalsPage({ dashboard }: Props) {
  return <div style={{ fontFamily: 'monospace', padding: 24 }}>Approvals — {dashboard?.members.filter(m => m.status === 'PENDING APPROVAL').length ?? 0} pending</div>;
}
