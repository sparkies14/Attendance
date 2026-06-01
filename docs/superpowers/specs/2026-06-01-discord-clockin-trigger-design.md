# Discord Clock-In Trigger Design

**Date:** 2026-06-01  
**Status:** Approved

## Problem

Members clock in manually through the website every morning. The team already uses Discord and naturally types "good morning" in a dedicated channel at the start of their day. Requiring a separate website clock-in after that is redundant friction.

## Goal

Any message posted in the #clock-in Discord channel automatically clocks that member into the attendance system. Clock-out still requires the website. Account linking supports both admin mapping and member self-linking.

---

## Bot Behavior

### Message in #clock-in channel

| Condition | Action |
|-----------|--------|
| Discord ID not linked to any account | DM member: "Your Discord isn't linked yet. Ask your admin or type /link to set it up." |
| Already clocked in today | DM member: "You're already clocked in today." |
| After 9:10 JST | DM member: "You're past 9:10 JST — please use manual entry on the website." |
| All good | Clock in, reply in #clock-in: "✅ Ana clocked in at 08:52 JST" |

The clock-in uses `entry_type: 'auto'`, `status: 'Approved'`, and the late classification rules that already exist in `lib/rules.js`.

### `/link` slash command (anywhere in server)

1. Bot generates a random 6-digit code, stores it in-memory keyed to the Discord user ID with a 5-minute expiry.
2. Bot DMs the member: "Your link code is **482931**. Enter it on your Account page within 5 minutes."
3. Member goes to Account page → enters code → account linked.
4. Bot DMs confirmation: "✅ Your Discord is now linked to your account."

---

## Architecture

### New files

**`lib/discordBot.js`**  
discord.js Gateway client. Opened once on server startup. Handles:
- `messageCreate` events filtered to `CHANNELS.clockIn` channel
- `interactionCreate` events for the `/link` slash command
- In-memory link code store (`Map<discordId, { code, expiresAt }>`)
- Slash command registration on startup via Discord REST API

**`routes/discordLink.js`**  
Two endpoints:
- `POST /discord/link/verify` — `requireAuth`, takes `{ code }` from the Account page, matches against in-memory store, writes `discord_id` to the users table, clears the code.
- `POST /discord/link/generate` — `requireAuth`, triggers the bot to generate and DM a new code to the member's linked Discord (or tells them to use `/link` if not yet linked). Used by the "Get link code" button on the Account page.

**`migrations/018_add_discord_id.sql`**
```sql
ALTER TABLE users ADD COLUMN discord_id TEXT UNIQUE;
```

### Modified files

| File | Change |
|------|--------|
| `lib/discord.js` | Add `clockIn: process.env.DISCORD_CLOCKIN_CHANNEL_ID` to `CHANNELS` |
| `server.js` | Import and initialize `discordBot`, register `/discord` route |
| `frontend/components/admin/pages/MembersPage.tsx` | Discord ID field in member edit panel, saves via `PATCH /users/:id` |
| `frontend/components/member/pages/AccountPage.tsx` | "Link Discord" card: Get code button + code input + confirm button + linked status |

---

## Data Flow

### Message clock-in
```
Member posts in #clock-in
  → discordBot.js messageCreate fires
  → Look up user WHERE discord_id = message.author.id
  → Check JST time, check existing attendance record
  → Insert attendance row (reuses same logic as /webhook/attendance)
  → Reply in #clock-in OR DM error
```

### /link flow
```
Member types /link
  → discordBot.js interactionCreate fires
  → Generate 6-digit code, store { discordId → code, expiresAt: now+5min }
  → DM member the code

Member submits code on Account page
  → POST /discord/link/verify { code }
  → requireAuth confirms who they are (JWT)
  → Match code → discordId in memory store
  → UPDATE users SET discord_id = discordId WHERE id = req.user.user_id
  → Clear code from store
  → 200 OK → frontend shows "Linked to @username"
```

### Admin mapping
```
Admin opens member edit panel in MembersPage
  → Pastes 18-digit Discord user ID
  → PATCH /users/:id { discord_id }
  → Saved directly to users table
```

---

## Discord Setup Requirements (manual, one-time)

1. **Developer Portal → Bot tab** → enable **Message Content Intent** + **Server Members Intent** → Save Changes
2. **Render env var** → `DISCORD_CLOCKIN_CHANNEL_ID` = channel ID of #clock-in (right-click channel → Copy Channel ID)
3. **Supabase SQL Editor** → run `migrations/018_add_discord_id.sql`
4. `/link` slash command registers automatically on first server startup — no manual action needed

Bot permissions already confirmed correct (View Channels, Send Messages, Read Message History, Use Application Commands all granted).

---

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Member posts multiple messages in #clock-in | Second message → DM "already clocked in" |
| Link code expires | `/link` again to get a new one |
| Admin sets a wrong Discord ID | Member can use `/link` to overwrite it |
| Bot is offline when message sent | No clock-in — message is missed. Acceptable; member uses website as fallback. |
| Member has DMs disabled | Bot cannot DM them — error will not be delivered. Their message in #clock-in simply won't clock them in silently. |

---

## File Summary

| File | Action |
|------|--------|
| `lib/discordBot.js` | Create |
| `routes/discordLink.js` | Create |
| `migrations/018_add_discord_id.sql` | Create |
| `lib/discord.js` | Modify — add clockIn channel |
| `server.js` | Modify — init bot + register route |
| `frontend/components/admin/pages/MembersPage.tsx` | Modify — Discord ID field |
| `frontend/components/member/pages/AccountPage.tsx` | Modify — Link Discord card |
