'use client';

import { useState } from 'react';
import React from 'react';

// ── Color / font constants ────────────────────────────────────────────────────
const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)', purpleBorder: 'rgba(124,58,237,0.25)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

// ── Mock data ─────────────────────────────────────────────────────────────────
const TEAM_MEMBERS = [
  { id: 'k', name: 'Kenji Tanaka',   hue: '#f4b942', init: 'K' },
  { id: 'm', name: 'Marisol Reyes',  hue: '#a78bfa', init: 'M' },
  { id: 'a', name: 'Aki Sato',       hue: '#60a5fa', init: 'A' },
  { id: 'j', name: 'Jorge Diaz',     hue: '#4ade80', init: 'J' },
  { id: 'p', name: 'Priya Iyer',     hue: '#fb923c', init: 'P' },
  { id: 'h', name: 'Hana Watanabe',  hue: '#f87171', init: 'H' },
];

type EventKind = 'meeting' | 'leave' | 'task' | 'holiday';

interface CalEvent {
  kind: EventKind;
  label: string;
  label2?: string;
  time?: string;
  dur?: string;
  peopleIds?: string[];
  flagged?: boolean;
  today?: boolean;
}

// Events for May 2026. When monthOffset !== 0 we still show these for demo purposes.
const EVENTS_MAY: Record<number, CalEvent[]> = {
  1:  [{ kind: 'holiday', label: 'May Day', label2: '労働者の日' }],
  4:  [{ kind: 'holiday', label: 'Greenery Day' }],
  5:  [{ kind: 'holiday', label: "Children's Day", label2: 'こどもの日' }],
  6:  [{ kind: 'meeting', label: 'All-hands', time: '10:00', dur: '45m' }],
  8:  [{ kind: 'leave',   label: 'Aki — Personal', peopleIds: ['a'] }],
  11: [{ kind: 'meeting', label: 'Sprint planning', time: '14:00', dur: '1h' }, { kind: 'task', label: 'Q2 reviews due' }],
  12: [{ kind: 'task',    label: 'Payroll cutoff prep' }],
  13: [{ kind: 'meeting', label: '1:1 — Kenji', time: '11:00', dur: '30m' }],
  14: [{ kind: 'leave',   label: 'Sofia — Absent (flagged)', peopleIds: ['s'], flagged: true }],
  18: [{ kind: 'meeting', label: 'Design crit', time: '13:00', dur: '1h' }],
  19: [{ kind: 'meeting', label: 'Town hall', time: '15:00', dur: '30m' }],
  20: [{ kind: 'task',    label: 'Mid-month report' }],
  22: [{ kind: 'meeting', label: 'Vendor sync', time: '11:00', dur: '45m' }, { kind: 'leave', label: 'Priya — Personal', peopleIds: ['p'] }],
  26: [{ kind: 'meeting', label: 'Stand-up', time: '09:30', dur: '15m', today: true }, { kind: 'meeting', label: 'Design review', time: '11:30', dur: '30m' }, { kind: 'meeting', label: '1:1 — Kenji', time: '14:00', dur: '1h' }, { kind: 'leave', label: 'Hana — Pending manual', peopleIds: ['h'] }],
  29: [{ kind: 'leave',   label: 'Kenji — Personal', peopleIds: ['k'] }, { kind: 'meeting', label: 'Coffee w/ Ueno-san', time: '15:00', dur: '1h' }],
};

interface KindMeta {
  tint: string;
  bg: string;
  border: string;
  icon: string;
  label: string;
}

const KIND_MAP: Record<EventKind, KindMeta> = {
  meeting: { tint: C.blue,   bg: C.blueSoft,   border: C.blueBorder,           icon: '◷', label: 'Meeting' },
  leave:   { tint: C.purple, bg: C.purpleSoft, border: 'rgba(167,139,250,0.3)', icon: '✦', label: 'Leave'   },
  task:    { tint: C.accent, bg: C.accentSoft, border: C.accentBorder,          icon: '◆', label: 'Task'    },
  holiday: { tint: C.red,    bg: C.redSoft,    border: C.redBorder,             icon: '★', label: 'Holiday' },
};

// ── Upcoming tile ─────────────────────────────────────────────────────────────
interface UpcomingTileProps {
  kind: EventKind;
  label: string;
  sub: string;
  tag: string;
}

function UpcomingTile({ kind, label, sub, tag }: UpcomingTileProps) {
  const k = KIND_MAP[kind];
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', position: 'relative', overflow: 'hidden' } as React.CSSProperties}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: k.tint }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10, color: k.tint, letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>
          {k.icon} {k.label}
        </div>
        <span style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.04em', padding: '2px 7px', borderRadius: 4, background: C.surface2, border: `1px solid ${C.border}` }}>{tag}</span>
      </div>
      <div style={{ marginTop: 10, fontFamily: F_SERIF, fontSize: 18, color: C.text, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.04em', marginTop: 5 }}>{sub}</div>
    </div>
  );
}

// ── Team day box ──────────────────────────────────────────────────────────────
interface TeamDayBoxProps {
  day: number;
  events: CalEvent[];
  isToday: boolean;
  isSelected: boolean;
  isWeekend: boolean;
  onClick: () => void;
}

function TeamDayBox({ day, events, isToday, isSelected, isWeekend, onClick }: TeamDayBoxProps) {
  const visible = events.slice(0, 3);
  const extra = Math.max(events.length - 3, 0);

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        borderRadius: 9,
        background: isToday ? C.accentSoft : (isWeekend ? C.surface2 : C.surface),
        border: `1px ${isWeekend ? 'dashed' : 'solid'} ${isSelected ? C.accent : (isToday ? C.accentBorder : C.border)}`,
        outline: isSelected ? `2px solid ${C.accent}` : 'none',
        outlineOffset: isSelected ? 1 : 0,
        padding: '6px 7px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        overflow: 'hidden',
      } as React.CSSProperties}
    >
      {/* Day number row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: F_SANS, fontSize: 12.5, fontWeight: isToday ? 600 : 500, color: isWeekend ? C.text3 : C.text, lineHeight: 1 }}>
          {day}
          {isToday && (
            <span style={{ fontFamily: F_MONO, fontSize: 8.5, color: C.accent, letterSpacing: '0.1em', padding: '1px 4px', borderRadius: 999, background: 'rgba(244,185,66,0.18)', marginLeft: 5 }}>
              NOW
            </span>
          )}
        </span>
        {/* Avatar dots for leave */}
        {events.some((e) => e.peopleIds) && (
          <span style={{ display: 'inline-flex' }}>
            {events
              .filter((e) => e.peopleIds)
              .flatMap((e) => e.peopleIds ?? [])
              .slice(0, 2)
              .map((pid, i) => {
                const p = TEAM_MEMBERS.find((m) => m.id === pid) ?? { hue: C.text3, init: '?' };
                return (
                  <span
                    key={i}
                    style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: p.hue, color: C.surface,
                      fontSize: 8, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: `1.5px solid ${isToday ? C.accentSoft : C.surface}`,
                      marginLeft: i > 0 ? -5 : 0,
                    } as React.CSSProperties}
                  >
                    {p.init}
                  </span>
                );
              })}
          </span>
        )}
      </div>

      {/* Event bars */}
      {visible.map((e, i) => {
        const k = KIND_MAP[e.kind];
        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '2px 6px',
              background: k.bg,
              border: e.flagged ? `1px dashed ${C.red}` : `1px solid ${k.border}`,
              borderLeft: `3px solid ${k.tint}`,
              borderRadius: 4,
              minWidth: 0,
            } as React.CSSProperties}
          >
            {e.time && <span style={{ fontFamily: F_MONO, fontSize: 9, color: k.tint, letterSpacing: '0.02em', flexShrink: 0 }}>{e.time}</span>}
            <span style={{ fontFamily: F_SANS, fontSize: 10.5, color: C.text, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
              {e.label}
            </span>
          </div>
        );
      })}
      {extra > 0 && (
        <div style={{ fontFamily: F_MONO, fontSize: 9.5, color: C.text3, letterSpacing: '0.04em', padding: '1px 6px' }}>
          +{extra} more
        </div>
      )}
    </div>
  );
}

// ── Day sidebar ───────────────────────────────────────────────────────────────
interface DaySidebarProps {
  selectedDay: number;
  displayDate: Date; // first day of the displayed month
  events: CalEvent[];
}

function DaySidebar({ selectedDay, displayDate, events }: DaySidebarProps) {
  const date = new Date(displayDate.getFullYear(), displayDate.getMonth(), selectedDay);
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayName = DAYS[date.getDay()];
  const monthName = MONTHS[date.getMonth()];

  // Week number (ISO-ish)
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);

  const meetingCount = events.filter((e) => e.kind === 'meeting').length;
  const leaveCount   = events.filter((e) => e.kind === 'leave').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Focused day card */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', position: 'relative' } as React.CSSProperties}>
        <div style={{ position: 'absolute', top: 0, left: 20, right: 20, height: 2, background: C.accent }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.accent, letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Today</div>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Wk {weekNum}</div>
        </div>
        <div style={{ fontFamily: F_SERIF, fontSize: 30, color: C.text, letterSpacing: '-0.025em', lineHeight: 1 }}>
          {monthName} {selectedDay},{' '}
          <span style={{ fontStyle: 'italic', color: C.text2 }}>{dayName}</span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' as const }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: C.greenSoft, border: `1px solid ${C.greenBorder}`, color: C.green, fontSize: 11, fontFamily: F_SANS }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, display: 'inline-block' }} /> 9 / 14 in
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: C.surface2, border: `1px solid ${C.border}`, color: C.text2, fontFamily: F_MONO, fontSize: 10.5, letterSpacing: '0.04em' }}>
            ◷ {meetingCount} meeting{meetingCount !== 1 ? 's' : ''} · ✦ {leaveCount} leave
          </span>
        </div>
      </div>

      {/* Day agenda */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Day agenda</div>
          <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3 }}>{events.length} items</span>
        </div>

        <div style={{ position: 'relative', paddingLeft: 50 }}>
          <div style={{ position: 'absolute', left: 42, top: 6, bottom: 6, width: 1, background: C.border }} />
          {events.length === 0 && (
            <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, textAlign: 'center', padding: '12px 0' }}>No events</div>
          )}
          {events.map((e, i) => {
            const k = KIND_MAP[e.kind];
            return (
              <div
                key={i}
                style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: i < events.length - 1 ? 12 : 0 } as React.CSSProperties}
              >
                <div style={{ position: 'absolute', left: -50, top: 2, fontFamily: F_MONO, fontSize: 10.5, color: C.text3, fontVariantNumeric: 'tabular-nums', width: 40, textAlign: 'right' as const }}>
                  {e.time ?? '—'}
                </div>
                <span style={{ position: 'absolute', left: -10, top: 6, width: 8, height: 8, borderRadius: '50%', background: k.tint, border: `2px solid ${C.surface}`, boxShadow: `0 0 0 1px ${C.border}` } as React.CSSProperties} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13, color: C.text, fontWeight: 500, lineHeight: 1.2 }}>{e.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontFamily: F_MONO, fontSize: 9.5, color: k.tint, letterSpacing: '0.06em', textTransform: 'uppercase' as const, padding: '1px 6px', borderRadius: 4, background: k.bg, border: `1px solid ${k.border}` }}>
                      {k.icon} {k.label}
                    </span>
                    {e.dur && <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3 }}>{e.dur}</span>}
                    {e.peopleIds && (
                      <span style={{ display: 'inline-flex' }}>
                        {e.peopleIds.slice(0, 3).map((pid, j) => {
                          const p = TEAM_MEMBERS.find((m) => m.id === pid) ?? { hue: C.text3, init: '?' };
                          return (
                            <span
                              key={j}
                              style={{
                                width: 16, height: 16, borderRadius: '50%',
                                background: `${p.hue}22`, color: p.hue,
                                fontSize: 8.5, fontWeight: 600,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                marginLeft: j > 0 ? -4 : 0,
                                border: `1.5px solid ${C.surface}`,
                              } as React.CSSProperties}
                            >
                              {p.init}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button style={{ width: '100%', marginTop: 14, padding: '9px', background: C.surface2, color: C.text2, border: `1px dashed ${C.border}`, borderRadius: 9, fontFamily: F_SANS, fontSize: 12, cursor: 'pointer' }}>
          + Add to this day
        </button>
      </div>

      {/* Who's out */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 18px' }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 12 }}>
          Who&apos;s out this month
        </div>
        {([
          { name: 'Kenji T.', hue: '#f4b942', when: 'May 29 · Personal', tint: C.purple, status: 'Pending'  },
          { name: 'Aki S.',   hue: '#60a5fa', when: 'May 8 · Personal',  tint: C.purple, status: 'Approved' },
          { name: 'Priya I.', hue: '#fb923c', when: 'May 22 · Vacation', tint: C.purple, status: 'Approved' },
          { name: 'Sofia C.', hue: '#a78bfa', when: 'May 14 · Absent',   tint: C.red,    status: 'Flagged'  },
        ] as { name: string; hue: string; when: string; tint: string; status: string }[]).map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < 3 ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: `${p.hue}22`, color: p.hue, fontSize: 10.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {p.name[0]}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: C.text, fontWeight: 500, lineHeight: 1.15 }}>{p.name}</div>
              <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, marginTop: 1, letterSpacing: '0.02em' }}>{p.when}</div>
            </div>
            <span style={{ fontFamily: F_MONO, fontSize: 9.5, color: p.tint, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
              {p.status}
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CalendarPage() {
  // JST "today"
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const todayDay = now.getDate();
  // The mock events are keyed for May 2026 day 26 as "today", so we pick that
  // as the initial selected day when we're in that month; otherwise pick today.
  const [selectedDay, setSelectedDay] = useState<number>(26);
  const [monthOffset, setMonthOffset] = useState(0);

  // Compute the displayed month's first day
  const displayDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const displayYear = displayDate.getFullYear();
  const displayMonth = displayDate.getMonth(); // 0-indexed

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = MONTH_NAMES[displayMonth];

  // Day-of-week of the 1st (0=Sun…6=Sat)
  const firstDow = displayDate.getDay();
  // Days in this month
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();

  // Which day is "today" in the displayed month?
  const isCurrentMonth =
    now.getFullYear() === displayYear && now.getMonth() === displayMonth;
  // For demo: events are anchored to May 2026. We always show them regardless of month.
  const events = EVENTS_MAY;

  // The "real" today day in displayed month (only valid if isCurrentMonth)
  const realTodayDay = isCurrentMonth ? todayDay : -1;

  // For the demo the "today" badge goes on day 26 in the mock month (May 2026).
  // When not on May 2026 we use realTodayDay if current month, else none.
  const todayBadgeDay =
    displayYear === 2026 && displayMonth === 4
      ? 26
      : isCurrentMonth
      ? realTodayDay
      : -1;

  function goToToday() {
    setMonthOffset(0);
    setSelectedDay(todayBadgeDay > 0 ? todayBadgeDay : now.getDate());
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1320, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' as const }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>
            Team <span style={{ fontStyle: 'italic', color: C.text2 }}>calendar.</span>
          </div>
          <div style={{ fontFamily: F_MONO, fontSize: 11.5, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginTop: 8 }}>
            Meetings · leave · tasks · holidays · all employees
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={{ padding: '7px 14px', background: C.surface, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 9, fontFamily: F_SANS, fontSize: 12.5, cursor: 'pointer' }}>
            ↓ Export ICS
          </button>
          <button style={{ padding: '7px 14px 7px 12px', background: C.btnBg, color: C.btnText, border: 'none', borderRadius: 9, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add event
          </button>
        </div>
      </div>

      {/* Upcoming summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <UpcomingTile kind="meeting" label="Stand-up"          sub="Today · 09:30 · 8 attending"     tag="In 18m"       />
        <UpcomingTile kind="holiday" label="Constitution Day"  sub="Wed, Apr 29, 2026 (next)"         tag="Public holiday" />
        <UpcomingTile kind="leave"   label="Kenji — Personal"  sub="Fri, May 29 · 1 day"              tag="Pending"      />
        <UpcomingTile kind="task"    label="Pay period close"  sub="Mon, Jun 24 · auto-cutoff"        tag="In 28d"       />
      </div>

      {/* Controls row */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
        {/* Employee avatar select */}
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 5px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer' }}>
          <span style={{ display: 'inline-flex' }}>
            {TEAM_MEMBERS.slice(0, 4).map((m, i) => (
              <span
                key={m.id}
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: `${m.hue}22`, color: m.hue,
                  fontSize: 10, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${C.bg}`,
                  marginLeft: i === 0 ? 0 : -7,
                } as React.CSSProperties}
              >
                {m.init}
              </span>
            ))}
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.surface2, color: C.text2, fontFamily: F_MONO, fontSize: 9, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${C.bg}`, marginLeft: -7 } as React.CSSProperties}>
              +10
            </span>
          </span>
          <span style={{ fontFamily: F_SANS, fontSize: 12.5, color: C.text, fontWeight: 500 }}>All members</span>
          <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3 }}>▾</span>
        </button>

        {/* View tabs */}
        <div style={{ display: 'flex', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: 3 }}>
          {(['Month', 'Week', 'List'] as const).map((v) => (
            <button
              key={v}
              style={{
                padding: '5px 12px', borderRadius: 6, border: 'none',
                background: v === 'Month' ? C.text : 'transparent',
                color: v === 'Month' ? C.surface : C.text3,
                fontFamily: F_SANS, fontSize: 12, fontWeight: v === 'Month' ? 500 : 400,
                cursor: 'pointer',
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setMonthOffset((o) => o - 1)}
            style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.text2, cursor: 'pointer', fontSize: 13 }}
          >
            ‹
          </button>
          <span style={{ fontFamily: F_SERIF, fontSize: 18, color: C.text, letterSpacing: '-0.015em', minWidth: 110, textAlign: 'center' as const }}>
            {monthName} <span style={{ fontStyle: 'italic', color: C.text2 }}>{displayYear}</span>
          </span>
          <button
            onClick={() => setMonthOffset((o) => o + 1)}
            style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.text2, cursor: 'pointer', fontSize: 13 }}
          >
            ›
          </button>
          <span
            onClick={goToToday}
            style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.08em', textTransform: 'uppercase' as const, padding: '3px 9px', borderRadius: 999, border: `1px solid ${C.border}`, cursor: 'pointer' }}
          >
            Today
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Type filter pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
          {([
            { id: 'all',     label: 'All',      count: 14, active: true,  tint: C.text   },
            { id: 'meeting', label: 'Meetings', count: 7,  active: false, tint: C.blue   },
            { id: 'leave',   label: 'Leave',    count: 4,  active: false, tint: C.purple },
            { id: 'task',    label: 'Tasks',    count: 3,  active: false, tint: C.accent },
            { id: 'holiday', label: 'Holidays', count: 3,  active: false, tint: C.red    },
          ] as { id: string; label: string; count: number; active: boolean; tint: string }[]).map((f) => (
            <button
              key={f.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 11px', borderRadius: 999,
                background: f.active ? C.text : 'transparent',
                color: f.active ? C.surface : C.text2,
                border: `1px solid ${f.active ? C.text : C.border}`,
                fontFamily: F_SANS, fontSize: 11.5, fontWeight: f.active ? 500 : 400,
                cursor: 'pointer',
              }}
            >
              {!f.active && <span style={{ width: 6, height: 6, borderRadius: 2, background: f.tint, display: 'inline-block' }} />}
              {f.label}
              <span style={{ fontFamily: F_MONO, fontSize: 10, opacity: 0.85 }}>{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main: month grid + right rail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>

        {/* Month grid */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 16px 14px' }}>
          {/* Weekday header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
              <div
                key={d}
                style={{
                  fontFamily: F_MONO, fontSize: 10,
                  color: i === 0 || i === 6 ? C.text3 : C.text2,
                  letterSpacing: '0.14em', textTransform: 'uppercase' as const,
                  textAlign: 'center' as const, padding: '6px 0',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '108px', gap: 6 }}>
            {/* Leading empty cells */}
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`pre${i}`} style={{ borderRadius: 9, background: C.bg, border: `1px dashed ${C.border}`, opacity: 0.35 }} />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dow = (firstDow + i) % 7;
              const isWeekend = dow === 0 || dow === 6;
              const isToday = day === todayBadgeDay;
              const isSelected = day === selectedDay;
              return (
                <TeamDayBox
                  key={day}
                  day={day}
                  events={events[day] ?? []}
                  isToday={isToday}
                  isSelected={isSelected}
                  isWeekend={isWeekend}
                  onClick={() => setSelectedDay(day)}
                />
              );
            })}
          </div>
        </div>

        {/* Right rail */}
        <DaySidebar
          selectedDay={selectedDay}
          displayDate={displayDate}
          events={events[selectedDay] ?? []}
        />
      </div>

    </div>
  );
}
