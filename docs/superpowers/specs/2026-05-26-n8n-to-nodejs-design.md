# Anosupo Attendance — n8n to Node.js Migration Design

**Date:** 2026-05-26  
**Status:** Approved  
**Scope:** Replace 5 n8n workflows with a local Express.js server; revise business logic to match Attendance Policy v2.0 (effective June 1, 2026)

---

## 1. Overview

Replace `http://localhost:5678` (n8n) with an Express.js server at `http://localhost:3000`. The server exposes the same 5 webhook paths the HTML files already call. The HTML files need only two-line changes each (the URL constants). The server talks directly to the existing Supabase project via `@supabase/supabase-js`.

---

## 2. Folder Structure

```
Attendance/
├── server.js               ← entry point, registers routes, starts server
├── routes/
│   ├── checkRole.js        ← POST /webhook/check-role
│   ├── attendance.js       ← POST /webhook/attendance
│   ├── memberData.js       ← GET  /webhook/member-data
│   ├── dashboard.js        ← GET  /webhook/dashboard
│   └── approve.js          ← GET  /webhook/approve
├── lib/
│   ├── supabase.js         ← Supabase client singleton
│   └── discord.js          ← Discord message helper (send to channel)
├── package.json
├── .env                    ← SUPABASE_URL, SUPABASE_ANON_KEY, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
├── .env.example
└── .gitignore              ← must include .env
```

---

## 3. Dependencies

```json
{
  "express": "^4",
  "cors": "^2",
  "@supabase/supabase-js": "^2",
  "dotenv": "^16"
}
```

Node.js built-in `fetch` (Node 18+) is used for Discord API calls — no extra HTTP library needed.

---

## 4. Supabase Tables (existing schema — no changes)

| Table | Key columns |
|---|---|
| `managers` | `id`, `email`, `name` |
| `members` | `id`, `email`, `name`, `role`, `status` (Active/Inactive) |
| `attendance` | `id`, `email`, `name`, `date`, `clock_in`, `clock_out`, `total_hours`, `entry_type`, `status` (Pending/Approved/Rejected), `late_status`, `reason`, `fingerprint`, `role` |
| `leave_log` | `id`, `email`, `name`, `date`, `leave_type`, `reason`, `status` |
| `lunch_log` | `id`, `name`, `date`, `lunch_out`, `lunch_in`, `duration_mins` |
| `break_log` | `id`, `name`, `date`, `break_out`, `break_in`, `duration_mins` |

---

## 5. CORS

Allowed origins: `https://sparkies14.github.io` and any `http://localhost:*` origin. All 5 routes use the same cors() middleware.

---

## 6. Endpoint Designs

### 6.1 `POST /webhook/check-role`

**Input body:** `{ email, name }`

**Logic:**
1. Query `managers` where `email = req.body.email`
2. If row found → respond `{ role: 'goldlist' }`
3. Else query `members` where `email = req.body.email`
4. If row found → respond `{ role: 'whitelist' }`
5. Else → respond `{ role: 'denied' }`

---

### 6.2 `POST /webhook/attendance`

**Input body:** `{ name, email, action, entry_type, local_time, date, timezone, jst_time, jst_hour, jst_minute, fingerprint, reason, leave_type }`

**Step 1 — Member verification:**
Query `members` where `email = body.email`. If not found → `{ error: 'Your name is not registered. Please contact your manager.' }` (400).  
Use `members.name` as the official name; use `members.role`.

**Step 2 — Late status classification (Policy §5, only for `clock-in`):**

```
jstHour = body.jst_hour, jstMinute = body.jst_minute

if action === 'clock-in':
  totalMinutesLate = (jstHour - 9) * 60 + jstMinute - 0
  if jstHour < 9 || (jstHour === 9 && jstMinute <= 10):
    late_status = 'ON TIME'
  else if jstHour === 9 && jstMinute <= 30:
    late_status = 'MINOR TARDY'        // 09:11–09:30
  else if jstHour < 11 || (jstHour === 11 && jstMinute === 0):
    late_status = 'MAJOR TARDY'        // 09:31–11:00
  else:
    late_status = 'AWOL HALF DAY'      // after 11:00
else:
  late_status = ''
```

**Step 3 — Entry type routing:**

**If `entry_type === 'manual'` and `action` is not `leave`:**
- Set `status = 'Pending'`
- Insert row to `attendance` with all fields
- Send Discord message to `#approvals` channel
- Respond: `{ success: true, message: 'Manual entry submitted! Waiting for manager approval.' }`

**If `entry_type === 'auto'` (or action is lunch/break/leave):**

Branch on `action`:

- **`clock-in`:**
  - Check for duplicate: query `attendance` where `email=email AND date=date`
  - If found → `{ error: 'You already clocked in today. Use Clock Out instead.' }`
  - Else insert to `attendance` with `status = 'Approved'`
  - Send Discord to `#clock-logs`
  - Respond success

- **`clock-out`:**
  - Lookup today's `attendance` row (email + date)
  - Compute `total_hours` = `(clock_out_minutes - clock_in_minutes) / 60 - 1` (subtract 1h unpaid lunch, per Policy §3)
  - Minimum 0h — don't go negative
  - Update row: `clock_out`, `total_hours`, `status = 'Approved'`
  - Send Discord to `#clock-logs`
  - Respond success

- **`leave`:**
  - Insert to `leave_log`: `{ email, name, date, leave_type, reason, status: 'Pending' }`
  - Respond: `{ success: true, message: '🏖️ Leave request submitted! Manager will review shortly.' }`

- **`lunch-out`:**
  - Insert to `lunch_log`: `{ name, date, lunch_out: time, lunch_in: '', duration_mins: 0 }`
  - Respond success

- **`lunch-in`:**
  - Lookup `lunch_log` by `name + date`
  - Compute `duration_mins` = `lunch_in_time - lunch_out_time` in minutes
  - Update row: `lunch_in`, `duration_mins`
  - Respond success

- **`break-out`:**
  - Insert to `break_log`: `{ name, date, break_out: time, break_in: '', duration_mins: 0 }`
  - Respond success

- **`break-in`:**
  - Lookup `break_log` by `name + date`
  - Compute `duration_mins`
  - Update row: `break_in`, `duration_mins`
  - Respond success

---

### 6.3 `GET /webhook/member-data?email=&name=&month=&year=`

**Logic:**
1. Fetch all `attendance` rows where `email = query.email`
2. Fetch all `leave_log` rows where `email = query.email`
3. Fetch today's `lunch_log` row where `name = official_name AND date = today` (for `onLunch`)
4. Fetch today's `break_log` row where `name = official_name AND date = today` (for `onBreak`)
5. Filter attendance by `month` / `year`
6. Build `calendar` array: one entry per day in the month. For each day:
   - Find attendance record for that date
   - Set `{ day, date (en-US locale), status, clockIn, clockOut, totalHours, isWeekend }`
   - Status: weekend → `'weekend'`; no record → `'absent'`; status=Pending → `'pending'`; has clockOut → `'clocked-out'`; late_status = 'ON TIME' → `'present'`; else → `'late'`
7. Compute `summary`: `{ present, late, absent, pending }` over weekdays only
8. `onLunch`: `lunch_log` row exists and `lunch_in` is empty/null
9. `onBreak`: `break_log` row exists and `break_in` is empty/null
10. Build `leaveHistory` from leave_log

**Response shape:**
```json
{
  "month": 5, "year": 2026, "email": "...",
  "calendar": [ { "day": 1, "date": "5/1/2026", "status": "absent", "clockIn": "-", "clockOut": "-", "totalHours": "-", "isWeekend": false } ],
  "summary": { "present": 10, "late": 2, "absent": 3, "pending": 1 },
  "onLunch": false,
  "onBreak": false,
  "leaveHistory": [ { "date": "...", "leaveType": "...", "reason": "...", "status": "Pending" } ]
}
```

---

### 6.4 `GET /webhook/dashboard`

**Logic:**
1. Fetch all `attendance` rows where `date = today` (fixes n8n bug — was fetching all rows)
2. Fetch all `members` where `status = 'Active'`
3. Fetch `attendance` rows where `status = 'Pending'` (manual approval queue)
4. Fetch `leave_log` rows where `status = 'Pending'`
5. For each active member, find their today-only attendance record
6. Determine display status: `NOT CLOCKED IN`, `CLOCKED IN`, `CLOCKED IN (LATE)`, `CLOCKED OUT`, `PENDING APPROVAL`
7. Build summary counts, members array, pendingApprovals, pendingLeave

**Response shape:** Same as existing n8n response (HTML depends on this structure).

---

### 6.5 `GET /webhook/approve?action=&row=&type=`

**Logic:**
1. Parse `id = parseInt(query.row)`, `action`, `type`
2. Validate: id must be > 0, action must be `approve` or `reject`
3. `new_status = action === 'approve' ? 'Approved' : 'Rejected'`
4. If `type === 'leave'` → update `leave_log` where `id = id`, set `status = new_status`
5. Else → update `attendance` where `id = id`, set `status = new_status`
6. Send Discord notification to `#approvals`
7. Respond: `{ success: true, message: 'Status updated successfully!' }`

---

## 7. Discord Notifications

`lib/discord.js` exports `sendMessage(channelId, content)` using `fetch` to Discord's REST API with the bot token. Channel IDs from n8n:
- `#clock-logs`: `1505900376719884319`
- `#approvals`: `1505900412937699408`

Discord is non-blocking — a Discord failure should not fail the attendance API response.

---

## 8. Policy Revisions Applied (v2.0, effective June 1, 2026)

| Change | Where | Rule |
|---|---|---|
| 3-tier late classification | `attendance.js` | ON TIME / MINOR TARDY / MAJOR TARDY / AWOL HALF DAY (Policy §5) |
| Net hours on clock-out | `attendance.js` | subtract 1h lunch from total_hours (Policy §3 — 1h unpaid lunch) |
| Add `onLunch` / `onBreak` to member-data | `memberData.js` | Bug fix enabling correct button state after page refresh |
| Add "Family Care" leave type | `member.html` | Policy §8 — "caring for an immediate family member" |
| Filter dashboard by today | `dashboard.js` | Bug fix — was showing stale records from prior days |

---

## 9. HTML File Changes

In **each** of `index.html`, `member.html`, `dashboard.html`:
- Change `http://localhost:5678` → `http://localhost:3000`
- Remove/update the "Check n8n is running" error message to say "Check the server is running"

In `member.html`:
- Add `<option value="Family Care">Family Care</option>` to the leave-type select

---

## 10. Environment Variables (`.env`)

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_GUILD_ID=1505900322273493042
PORT=3000
```

---

## 11. Running the Server

```bash
npm install
cp .env.example .env    # fill in your credentials
node server.js          # or: npm start
```

The HTML files are still opened via Live Server / GitHub Pages — the Express server is API-only.

---

## 12. Out of Scope (Policy features computed at month-end by operations)

- Rolling 30-day tardy counting for progressive discipline tracking
- Salary deduction calculation engine
- Public holiday calendar per country
- Automatic end-of-day AWOL detection (cron job)
- Paid leave accrual/balance tracking
