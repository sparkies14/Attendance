'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface LeaveMember {
  name: string;
  used: number;
  remaining: number;
}

interface Props {
  members: LeaveMember[];
  legendUsed: string;
  legendRemaining: string;
}

export default function LeaveChart({ members, legendUsed, legendRemaining }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={members} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <XAxis dataKey="name" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="used" name={legendUsed} fill="#3b82f6" />
        <Bar dataKey="remaining" name={legendRemaining} fill="#22c55e" />
      </BarChart>
    </ResponsiveContainer>
  );
}
