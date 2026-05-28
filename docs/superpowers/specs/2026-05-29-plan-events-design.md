# Plan Events Feature — Design Spec

**Date:** 2026-05-29  
**Status:** Approved  
**Project:** Anosupo Attendance System

---

## Overview

Replace the existing per-day todos system with a **Plan Events** system. Members can schedule time-blocked activities on their calendar (e.g. "Meeting with AT — 1:00pm to 3:00pm"), mark them done, and plan their full workday (9am–6pm JST). Admins can view, manage, and assign plan events to members.

This replaces the `todos` table, `/todos` routes, and all frontend todos UI. The feature lives on the "Calendar · plan" tab.

---

## Goals

- Members add time-blocked events to any calendar day: title + start time + end time (all required).
- Events display sorted by `start_time`, showing `09:00 – 10:00 · Title`.
- Members can mark events done (strikethrough) and delete them.
- "Save + add another" button lets members fill a full day plan quickly.
- Purple dot on calendar cells that have plan events.
- Admins view, create, edit, and delete events for any member.
- Admin Team Tasks tab shows time ranges on event pills.

---

## Database

### New table: `plan_events`

```sql
create table plan_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  date        date not null,
  title       text not null,
  start_time  text not null,  -- HH:MM (24-hour, e.g. '13:00')
  end_time    text not null,  -- HH:MM (24-hour, e.g. '15:00')
  completed   boolean not null default false,
  created_by  text,           -- null = self, admin email = assigned by admin
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on plan_events (user_id, date);
```

### Remove: `todos` table

Drop the `todos` table (migration `015_drop_todos.sql`). Migration `014_create_plan_events.sql` creates the new table.

---

## Backend

### New file: `routes/planEvents.js`

Mounted at `/plan-events` in `server.js`. All endpoints require `requireAuth`. Member endpoints scope to `req.user.user_id`. Admin endpoints require `requireRole('owner', 'admin')`.

**Validation rules:**
- `date`: required, `YYYY-MM-DD` format
- `title`: required, non-blank after trim
- `start_time`: required, matches `/^\d{2}:\d{2}$/`
- `end_time`: required, matches `/^\d{2}:\d{2}$/`, must be after `start_time`

**Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/plan-events?date=` | member | Own events for a date, ordered by start_time |
| POST | `/plan-events` | member | Create event for self |
| PATCH | `/plan-events/:id` | member/admin | Update title, start_time, end_time, or completed |
| DELETE | `/plan-events/:id` | member/admin | Delete (ownership check same as todos) |
| GET | `/plan-events/admin?user_id=&date=` | admin | Events for any member on a date |
| POST | `/plan-events/admin` | admin | Assign event to a member (sets created_by = admin email) |
| GET | `/plan-events/admin/week?week_start=` | admin | All members' events for Mon–Sat week |
| GET | `/plan-events/admin/month?user_id=&month=&year=` | admin | Count per date for dot indicators |

### Modify: `routes/memberData.js`

- Add 5th query: fetch plan_events for the month scoped to `userId` (the queried member's UUID, not the caller's).
- Build `planEventsByDate: { 'YYYY-MM-DD': count }` map.
- Replace `todosByDate` with `planEventsByDate` in `res.json(...)`.

### Modify: `server.js`

- Remove: `app.use('/todos', require('./routes/todos'));`
- Add: `app.use('/plan-events', require('./routes/planEvents'));`

### Remove: `routes/todos.js`

Delete the file. Tests for it (`tests/todos.test.js`) are replaced by `tests/planEvents.test.js`.

---

## Frontend — Member (`CalendarPage.tsx`)

### Types (`MemberDashboard.tsx`)

Remove `Todo` interface. Add:
```ts
export interface PlanEvent {
  id: number;
  title: string;
  start_time: string;  // 'HH:MM'
  end_time: string;    // 'HH:MM'
  completed: boolean;
  created_by: string | null;
  created_at: string;
}
```

Replace `todosByDate?: Record<string, number>` with `planEventsByDate?: Record<string, number>` in `MemberData`.

### State (`CalendarPage.tsx`)

Replace todo state:
```ts
const [events,      setEvents]      = useState<PlanEvent[]>([]);
const [eventsBusy,  setEventsBusy]  = useState(false);
const [eventErr,    setEventErr]    = useState<string | null>(null);
const [showAddForm, setShowAddForm] = useState(false);
const [addTitle,    setAddTitle]    = useState('');
const [addStart,    setAddStart]    = useState('09:00');
const [addEnd,      setAddEnd]      = useState('10:00');
const [addBusy,     setAddBusy]     = useState(false);
```

### API functions

Replace `fetchTodos/addTodo/toggleTodo/deleteTodo` with:
- `fetchEvents(isoDate)` → GET `/plan-events?date=`
- `addEvent(isoDate, keepForm)` → POST `/plan-events` with title, start_time, end_time. If `keepForm=true` (Save + add another), clear title only and keep form open.
- `toggleEvent(id, completed)` → PATCH `/plan-events/:id`
- `deleteEvent(id)` → DELETE `/plan-events/:id`

### Day detail panel JSX

Replace "Tasks for this day" section with "Day plan":
- Section header: "Day plan" + "+ Add event" button
- Event list sorted by `start_time` (sort in component after fetch):
  ```
  [done indicator]  09:00 – 10:00
                    Daily standup     [×]
  ```
- Events with `completed=true` show at 0.55 opacity with strikethrough title.
- Add form: title input + FROM `<input type="time">` + TO `<input type="time">` + "Save" button + "Save + add another" button + "Cancel" button.
- Empty state: "No plan events for this day."

### Cell dots

Replace `data?.todosByDate?.[toISO(cell.date)]` with `data?.planEventsByDate?.[toISO(cell.date)]`. Legend entry: "Has tasks" → "Has plans".

---

## Frontend — Admin (`admin.html`)

### Per-member Tasks modal

- Assign form: add FROM and TO time inputs alongside the title input.
- `renderDayTasks` updated: each event shows `HH:MM – HH:MM · Title` with done styling.
- `submitAssignTask` posts `{ user_id, date, title: text, start_time, end_time }` to `/plan-events/admin`.
- API calls updated from `/todos/*` to `/plan-events/*`.

### Team Tasks week view

- `renderWeekGrid` pills updated to show `HH:MM Title` (abbreviated start time + title).
- API call updated from `/todos/admin/week` to `/plan-events/admin/week`.

---

## Out of Scope

- Time validation on the client beyond what `<input type="time">` enforces.
- Overlapping event detection or warnings.
- Recurring events.
- Drag-to-resize visual timeline.
- Notifications or reminders.
