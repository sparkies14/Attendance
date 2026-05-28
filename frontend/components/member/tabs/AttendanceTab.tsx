'use client';

import { clientFetch } from '@/lib/clientFetch';

import { useState } from 'react';
import type { MemberData, CalendarDay } from '../MemberDashboard';

interface Props {
  email: string;
  initialData: MemberData | null;
  apiUrl: string;
}

const STATUS_COLOR: Record<string, string> = {
  present: '#16a34a',
  late:    '#d97706',
  absent:  '#dc2626',
  pending: '#9ca3af',
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function toISO(usDate: string): string {
  const [m, d, y] = usDate.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export default function AttendanceTab({ email, initialData, apiUrl }: Props) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const [month, setMonth] = useState(initialData?.month ?? now.getMonth() + 1);
  const [year,  setYear]  = useState(initialData?.year  ?? now.getFullYear());
  const [data,  setData]  = useState<MemberData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);

  const [appealDay,   setAppealDay]   = useState<CalendarDay | null>(null);
  const [appealText,  setAppealText]  = useState('');
  const [appealMsg,   setAppealMsg]   = useState<string | null>(null);
  const [appealErr,   setAppealErr]   = useState<string | null>(null);
  const [appealLoading, setAppealLoading] = useState(false);

  async function navigate(newMonth: number, newYear: number) {
    setAppealDay(null);
    setAppealMsg(null);
    setAppealErr(null);
    setNavError(null);
    setLoading(true);
    try {
      const res = await clientFetch(
        `${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${newMonth}&year=${newYear}`,
        { }
      );
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setMonth(newMonth);
        setYear(newYear);
      } else {
        setNavError('Failed to load attendance data.');
      }
    } finally {
      setLoading(false);
    }
  }

  function prevMonth() {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    navigate(m, y);
  }

  function nextMonth() {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    navigate(m, y);
  }

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!appealDay) return;
    setAppealLoading(true);
    setAppealMsg(null);
    setAppealErr(null);
    try {
      const res = await clientFetch(`${apiUrl}/appeals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: 'attendance', target_id: toISO(appealDay.date), reason: appealText }),
      });
      const d = await res.json();
      if (!res.ok) {
        setAppealErr(d.error ?? 'Appeal failed.');
      } else {
        setAppealMsg('Appeal submitted.');
        setAppealDay(null);
        setAppealText('');
      }
    } catch {
      setAppealErr('Network error. Please try again.');
    } finally {
      setAppealLoading(false);
    }
  }

  const firstDow = new Date(year, month - 1, 1).getDay();
  const offset   = firstDow === 0 ? 6 : firstDow - 1;
  const calendar = data?.calendar ?? [];
  const cells: (CalendarDay | null)[] = [...Array(offset).fill(null), ...calendar];

  const s = data?.summary;

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
  };

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <button onClick={prevMonth} disabled={loading} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>←</button>
        <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: '#111' }}>
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button onClick={nextMonth} disabled={loading} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>→</button>
      </div>

      {navError && (
        <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.75rem' }}>{navError}</p>
      )}

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', padding: '0.25rem 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', padding: '2rem 0' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((cell, i) => {
            if (!cell) return <div key={`pad-${i}`} />;
            const color = cell.isWeekend ? '#e5e7eb' : (STATUS_COLOR[cell.status] ?? '#e5e7eb');
            const canAppeal = !cell.isWeekend && (cell.status === 'absent' || cell.status === 'late' || cell.status === 'pending');
            return (
              <div
                key={cell.day}
                title={cell.isWeekend ? 'Weekend' : `${cell.status} — in: ${cell.clockIn} out: ${cell.clockOut}`}
                style={{ padding: '0.4rem 0.2rem', textAlign: 'center', borderRadius: 6, cursor: canAppeal ? 'pointer' : 'default', backgroundColor: appealDay?.day === cell.day ? '#f0fdf4' : 'transparent', border: appealDay?.day === cell.day ? '1px solid #bbf7d0' : '1px solid transparent' }}
                onClick={() => { if (canAppeal) { setAppealDay(cell); setAppealMsg(null); setAppealErr(null); } }}
              >
                <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: cell.isWeekend ? '#9ca3af' : '#374151' }}>{cell.day}</div>
                {!cell.isWeekend && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, margin: '2px auto 0' }} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary strip */}
      {s && (
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280', flexWrap: 'wrap' }}>
          <span style={{ color: '#16a34a' }}>● Present: {s.present}</span>
          <span style={{ color: '#d97706' }}>● Late: {s.late}</span>
          <span style={{ color: '#dc2626' }}>● Absent: {s.absent}</span>
          <span>● Pending: {s.pending}</span>
        </div>
      )}

      {/* Appeal success message */}
      {appealMsg && (
        <div style={{ marginTop: '1rem', padding: '0.65rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>
          {appealMsg}
        </div>
      )}

      {/* Appeal form */}
      {appealDay && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <p style={labelStyle}>Appeal — {appealDay.date}</p>
          {appealErr && <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626', margin: '0.5rem 0' }}>{appealErr}</p>}
          <form onSubmit={submitAppeal}>
            <textarea
              value={appealText}
              onChange={e => setAppealText(e.target.value)}
              required
              placeholder="Explain why this record should be reviewed…"
              rows={3}
              style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', boxSizing: 'border-box', resize: 'vertical' }}
            />
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={appealLoading} style={{ padding: '0.5rem 1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: appealLoading ? 'not-allowed' : 'pointer' }}>
                {appealLoading ? 'Submitting…' : 'Submit Appeal'}
              </button>
              <button type="button" onClick={() => setAppealDay(null)} style={{ padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
