import type { CSSProperties } from 'react';
import type { UserProfile, LeaveBalance, MemberData } from '../MemberDashboard';

interface Props {
  user: UserProfile;
  leaveBalance: LeaveBalance | null;
  memberData: MemberData | null;
}

export default function OverviewTab({ user, leaveBalance, memberData }: Props) {
  const s = memberData?.summary;

  const statBox = (label: string, value: number, color: string) => (
    <div style={{ flex: 1, padding: '1rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, textAlign: 'center' }}>
      <div style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginTop: '0.25rem' }}>{label}</div>
    </div>
  );

  const labelStyle: CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '0.75rem',
  };

  return (
    <div>
      <div style={{ marginBottom: '0.5rem', fontFamily: 'Georgia, serif', fontSize: '1.1rem', color: '#111' }}>
        {user.name || user.email}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', marginBottom: '1.75rem' }}>
        {user.email}
      </div>

      <div style={{ marginBottom: '1.75rem' }}>
        <p style={labelStyle}>This Month</p>
        {s ? (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {statBox('Present', s.present, '#16a34a')}
            {statBox('Late',    s.late,    '#d97706')}
            {statBox('Absent',  s.absent,  '#dc2626')}
            {statBox('Pending', s.pending, '#6b7280')}
          </div>
        ) : (
          <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>No data available.</p>
        )}
      </div>

      <div>
        <p style={labelStyle}>Leave Balance</p>
        {leaveBalance ? (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {statBox('Total',     leaveBalance.grantsEarned,          '#374151')}
            {statBox('Used',      leaveBalance.used,                  '#d97706')}
            {statBox('Remaining', Math.max(0, leaveBalance.balance),  '#16a34a')}
          </div>
        ) : (
          <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>No data available.</p>
        )}
      </div>
    </div>
  );
}
