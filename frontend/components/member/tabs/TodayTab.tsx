'use client';

import { clientFetch } from '@/lib/clientFetch';

import { useState } from 'react';
import type { MemberData, CalendarDay } from '../MemberDashboard';

interface Props {
  email: string;
  memberData: MemberData | null;
  apiUrl: string;
}

function getJST() {
  const now = new Date();
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return {
    date: `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`,
    time: `${String(jst.getHours()).padStart(2, '0')}:${String(jst.getMinutes()).padStart(2, '0')}`,
    hour: jst.getHours(),
    minute: jst.getMinutes(),
  };
}

function findToday(calendar: CalendarDay[]): CalendarDay | null {
  const jst = getJST();
  const todayDay = parseInt(jst.date.split('-')[2]);
  return calendar.find(d => d.day === todayDay && !d.isWeekend) ?? null;
}

export default function TodayTab({ email, memberData, apiUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onLunch, setOnLunch] = useState(memberData?.onLunch ?? false);
  const [onBreak, setOnBreak] = useState(memberData?.onBreak ?? false);
  const [todayRecord, setTodayRecord] = useState<CalendarDay | null>(
    memberData ? findToday(memberData.calendar) : null
  );

  async function doAction(body: Record<string, unknown>) {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await clientFetch(`${apiUrl}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Action failed.');
      } else {
        setMessage(data.message ?? 'Done.');
        const jst = getJST();
        const refreshRes = await clientFetch(
          `${apiUrl}/member-data?email=${encodeURIComponent(email)}&month=${parseInt(jst.date.split('-')[1])}&year=${parseInt(jst.date.split('-')[0])}`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setTodayRecord(findToday(refreshData.calendar));
          setOnLunch(refreshData.onLunch);
          setOnBreak(refreshData.onBreak);
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function clockIn() {
    const { date, time, hour, minute } = getJST();
    doAction({ action: 'clock-in', entry_type: 'web', local_time: time, date, jst_hour: hour, jst_minute: minute });
  }

  function clockOut() {
    const { date, time } = getJST();
    doAction({ action: 'clock-out', local_time: time, date });
  }

  function lunchOut() {
    const { date, time } = getJST();
    doAction({ action: 'lunch-out', local_time: time, date });
  }

  function lunchIn() {
    const { date, time } = getJST();
    doAction({ action: 'lunch-in', local_time: time, date });
  }

  function breakOut() {
    const { date, time } = getJST();
    doAction({ action: 'break-out', local_time: time, date });
  }

  function breakIn() {
    const { date, time } = getJST();
    doAction({ action: 'break-in', local_time: time, date });
  }

  const notClockedIn = !todayRecord || todayRecord.clockIn === '-';
  const clockedInNotOut = todayRecord && todayRecord.clockIn !== '-' && todayRecord.clockOut === '-';
  const clockedOut = todayRecord && todayRecord.clockIn !== '-' && todayRecord.clockOut !== '-';

  const { date: todayDateStr } = getJST();

  const btnStyle = (color = '#111'): React.CSSProperties => ({
    padding: '0.65rem 1.25rem',
    backgroundColor: color,
    color: '#fff',
    border: 'none',
    borderRadius: 999,
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
    marginRight: '0.5rem',
    marginBottom: '0.5rem',
  });

  const ghostBtnStyle = (): React.CSSProperties => ({
    ...btnStyle(),
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d1d5db',
  });

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '0.25rem',
  };

  return (
    <div>
      <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        {todayDateStr} JST
      </p>

      {message && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem 0.875rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem 0.875rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {notClockedIn && (
        <div>
          <p style={labelStyle}>Attendance</p>
          <button onClick={clockIn} disabled={loading} style={btnStyle()}>Clock In</button>
        </div>
      )}

      {clockedInNotOut && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={labelStyle}>Attendance</p>
            <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#374151', marginBottom: '0.5rem' }}>
              Clocked in at {todayRecord!.clockIn}
            </p>
            <button onClick={clockOut} disabled={loading} style={btnStyle()}>Clock Out</button>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <p style={labelStyle}>Lunch</p>
            {onLunch
              ? <button onClick={lunchIn}  disabled={loading} style={ghostBtnStyle()}>Lunch In</button>
              : <button onClick={lunchOut} disabled={loading} style={ghostBtnStyle()}>Lunch Out</button>
            }
          </div>

          <div>
            <p style={labelStyle}>Break</p>
            {onBreak
              ? <button onClick={breakIn}  disabled={loading} style={ghostBtnStyle()}>Break In</button>
              : <button onClick={breakOut} disabled={loading} style={ghostBtnStyle()}>Break Out</button>
            }
          </div>
        </div>
      )}

      {clockedOut && (
        <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#374151' }}>
          <p style={labelStyle}>Today&apos;s Summary</p>
          <p>Clock In: {todayRecord!.clockIn}</p>
          <p>Clock Out: {todayRecord!.clockOut}</p>
          <p>Total Hours: {todayRecord!.totalHours}</p>
        </div>
      )}

      {!memberData && notClockedIn && (
        <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
          No attendance record for today yet.
        </p>
      )}
    </div>
  );
}
