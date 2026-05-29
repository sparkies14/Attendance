'use client';
import type { UserProfile } from '../MemberDashboard';

interface Props {
  user: UserProfile;
  apiUrl: string;
  hireYear?: number;
}

export default function AccountPage({ user }: Props) {
  return <div style={{ padding: 24, fontFamily: 'monospace', color: '#0a0a0a' }}>Account — {user.name}</div>;
}
