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

interface TardyMember {
  name: string;
  minor: number;
  major: number;
  awolHalf: number;
  awolFull: number;
}

interface Props {
  members: TardyMember[];
  emptyMessage: string;
  legendMinor: string;
  legendMajor: string;
  legendAwolHalf: string;
  legendAwolFull: string;
}

export default function TardyChart({
  members,
  emptyMessage,
  legendMinor,
  legendMajor,
  legendAwolHalf,
  legendAwolFull,
}: Props) {
  const allZero = members.every(
    m => m.minor + m.major + m.awolHalf + m.awolFull === 0
  );
  if (allZero) return <p>{emptyMessage}</p>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={members} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <XAxis dataKey="name" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="minor" name={legendMinor} stackId="tardy" fill="#facc15" />
        <Bar dataKey="major" name={legendMajor} stackId="tardy" fill="#f97316" />
        <Bar dataKey="awolHalf" name={legendAwolHalf} stackId="tardy" fill="#ef4444" />
        <Bar dataKey="awolFull" name={legendAwolFull} stackId="tardy" fill="#991b1b" />
      </BarChart>
    </ResponsiveContainer>
  );
}
