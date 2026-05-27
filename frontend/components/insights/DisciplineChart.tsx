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

interface DisciplineMember {
  name: string;
  active: number;
}

interface Props {
  members: DisciplineMember[];
  emptyMessage: string;
  legendActive: string;
}

export default function DisciplineChart({ members, emptyMessage, legendActive }: Props) {
  const allZero = members.every(m => m.active === 0);
  if (allZero) return <p>{emptyMessage}</p>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={members} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <XAxis dataKey="name" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="active" name={legendActive} fill="#8b5cf6" />
      </BarChart>
    </ResponsiveContainer>
  );
}
