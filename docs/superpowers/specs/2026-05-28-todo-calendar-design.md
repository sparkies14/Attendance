# Todo Calendar Feature — Design Spec

**Date:** 2026-05-28  
**Status:** Approved  
**Project:** Anosupo Attendance System

---

## Overview

Add a per-day task/todo list to the member calendar, similar to Google Calendar. Members can plan their work and personal tasks for each day. Admins get full visibility and management over all members' tasks via a per-member Tasks tab and a team-wide weekly calendar view.

---

## Goals

- Members can add, check off, and delete tasks attached to specific calendar days.
- Admins can view, edit, delete, and assign tasks to any member for any day.
- Admins get a team-week overview showing all members' tasks at a glance.
- Tasks are visible within the existing calendar UI — no separate page needed for members.

---

## Architecture

### Database

New table: `todos`

```sql
CREATE TABLE todos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,           -- the calendar day this task belongs to
  text        TEXT NOT NULL,
  completed   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES users(id), -- null = self-created, set = assigned by admin
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON todos (user_id, date);
```

Migration file: `013_create_todos.sql`

### Backend (Express.js)

New route file: `routes/todos.js`

Endpoints:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/todos?date=YYYY-MM-DD` | member | Get own todos for a date |
| POST | `/todos` | member | Create a todo for self |
| PATCH | `/todos/:id` | member/admin | Update text or completed status |
| DELETE | `/todos/:id` | member/admin | Delete a todo |
| GET | `/admin/todos?user_id=X&date=YYYY-MM-DD` | admin | Get todos for a specific member+date |
| POST | `/admin/todos` | admin | Assign a todo to a member |
| GET | `/admin/todos/week?week_start=YYYY-MM-DD` | admin | Get all members' todos for a week |

Authorization rules:
- Members can only read/write their own todos.
- Admins can read/write todos for any user.
- `created_by` is set to the admin's user ID when an admin creates a todo for a member.

### Frontend — Member (`CalendarPage.tsx`)

**Calendar cell change:** Add a small purple dot indicator (`position: absolute; bottom: 5px; right: 6px`) on cells that have at least one todo. The existing `/webhook/member-data` response is extended to include a `todosByDate` map (`{ "2026-05-28": 3 }`) so the grid knows which days to dot.

**Day detail panel change:** Below the existing 2×2 attendance grid, add a horizontal divider and a "Tasks for this day" section. When a day is selected, todos for that date are fetched from `GET /todos?date=YYYY-MM-DD`. The section contains:
- Section header ("Tasks for this day") + "+ Add task" button (right-aligned)
- List of todo items: checkbox (toggle complete), text, delete button
- Inline add form (appears when "+ Add task" is clicked): text input + Save + Cancel

New state in `CalendarPage.tsx`:
- `todos: Todo[]` — loaded todos for the selected day
- `todosBusy: boolean` — loading state
- `showAddForm: boolean` — controls visibility of the add input
- `addText: string` — controlled input value
- `todosByDate: Record<string, number>` — dot indicators from API

Fetching: on day select, fetch todos for that date. On add/delete/toggle, update local state optimistically and sync to API.

**Legend:** Add a "Has tasks" entry (purple dot) to the existing status legend.

### Frontend — Admin (`admin.html`)

**New "Team Tasks" nav tab** in the admin panel header.

**Team Tasks page (week view):**
- Week grid: rows = members, columns = Mon–Sat
- Each cell shows the member's todos for that day as pills (purple background, strikethrough if done)
- Today's column is highlighted
- Clicking a cell opens a day-detail modal with full task management (edit/delete/assign)
- Week navigation (← Prev / Next →)
- Data loaded from `GET /admin/todos/week?week_start=YYYY-MM-DD`

**Per-member Tasks tab:**
- Inside the existing member detail modal/page, add a "Tasks" sub-tab alongside Overview, Attendance, Leave
- Shows a mini month calendar with purple dots on days that have tasks
- Clicking a day shows that day's tasks on the right with Edit, Delete buttons per task
- "+ Assign task" button to add a new task for the member on the selected day

---

## Data Flow

### Member views a day's todos

1. Member clicks a calendar day → `CalendarPage` fires `GET /todos?date=YYYY-MM-DD` with session cookie.
2. Backend verifies session, queries `todos WHERE user_id = ? AND date = ?`.
3. Returns `Todo[]` array; component renders in the day detail panel.

### Member adds a todo

1. Member types text, clicks Save → `POST /todos` `{ date, text }`.
2. Backend inserts row with `user_id` from session, `created_by = null`.
3. Returns created todo; component appends to list and clears input.

### Admin assigns a todo to a member

1. Admin clicks "+ Assign task" in the member Tasks tab, enters text → `POST /admin/todos` `{ user_id, date, text }`.
2. Backend verifies admin role, inserts row with `created_by = adminId`.
3. Todo appears in the member's calendar immediately.

### Admin loads team week view

1. Admin opens Team Tasks tab → `GET /admin/todos/week?week_start=YYYY-MM-DD`.
2. Backend queries todos for all active members for the 6-day window (Mon–Sat).
3. Returns `{ members: [...], todosByMemberDate: { "userId_YYYY-MM-DD": Todo[] } }`.
4. Grid renders member rows × day columns.

---

## Error Handling

- Fetch failures on day select: show a small error message inside the todos section ("Couldn't load tasks").
- Add/delete failures: show inline error, keep the form open so the user can retry.
- Admin week fetch failure: show an error banner above the grid with a retry button.
- 403 on member trying to access another member's todos: backend returns 403; frontend never attempts this (member endpoints are always self).

---

## Testing

- Unit tests for `routes/todos.js`: CRUD operations, auth enforcement (member can't access others' todos, non-admin can't use admin routes), date filtering.
- Integration test: admin assigns todo → member fetches it on their calendar.
- Frontend: manual test of the golden path (add, check off, delete) in the member calendar; admin week view loads and updates correctly.

---

## Out of Scope

- Todo due-time (time-of-day) — just a date, no hour/minute.
- Notifications or reminders for todos.
- Recurring todos.
- Reordering todos within a day.
- Member seeing other members' todos.
