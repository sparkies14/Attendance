# Member Account Page — Design Spec
**Date:** 2026-05-29  
**Status:** Approved

---

## Overview

Add an **Account** page to the member dashboard. It is a new sidebar nav item rendered as a standard full-width page, matching the existing Compact Mono design system used across Home, Leave, and Timesheet pages.

Three sections: Profile (read-only identity), Security (password + Google), Preferences (language).

No new backend routes needed — `POST /auth/change-password` and `POST /auth/link-google` already exist.

---

## Navigation

- Add `{ id: 'account', label: 'Account', icon: '○' }` to the `NAV` array in `MemberDashboard.tsx`
- Add `'account'` to the `Page` union type
- Render `<AccountPage user={user} apiUrl={apiUrl} hireYear={leaveBalance?.hire_year} />` when `page === 'account'`

---

## Component

**File:** `frontend/components/member/pages/AccountPage.tsx`  
**Type:** Client Component (`'use client'`)  
**Props:** `{ user: UserProfile; apiUrl: string; hireYear?: number }`

---

## Section 1 — Profile card

Read-only. Displays:
- **Avatar** — large initials circle (same gradient as sidebar: `linear-gradient(135deg, #f4b942, #b45309)`, dark text). Initials: `user.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()` — same logic as the sidebar avatar already uses.
- **Name** — serif 28px
- **Email** — mono 12px, muted
- **Role badge** — e.g. "Member" in a neutral chip
- **Status badge** — "Active" in green chip, "Pending" in accent chip
- **Hire year** — derived from `user` if available; show "—" if not. Note: `hire_year` is in `LeaveBalance`, not `UserProfile`. Pass `leaveBalance` as an optional prop, or fetch it inline from `GET /auth/me` response (which doesn't include it). **Decision: add `hireYear?: number` as an optional prop to AccountPage, passed from MemberDashboard which already has `leaveBalance`.**

No edit controls. Admin manages name/email/role.

---

## Section 2 — Security card

### Change password sub-section

Shown only when `user.hasPassword === true`.

Form fields (inline row on wide screens, stacked on narrow):
- Current password (type="password")
- New password (type="password")
- Confirm new password (type="password")

Submit button: "Update password"

**Validation (client-side):**
- All fields required
- New password must be ≥ 8 characters
- New and confirm must match

**API call:** `POST /auth/change-password` with body `{ current_password, new_password }`

**Backend route already exists** at `routes/auth.js` line 261. It verifies current password, hashes and stores the new one.

On success: clear all three fields, show green success message.  
On error: show red error from API response.

### Google account sub-section

Divider between password and Google sections.

- If `user.hasGoogle === true`: show a green "Google connected" badge. No action needed.
- If `user.hasGoogle === false`: show a "Connect Google" button that triggers the Google Identity Services (GSI) prompt. On credential received: call `POST /auth/link-google` with `{ credential }`. On success: update local `hasGoogle` state to `true`, show success message.

**Note:** GSI is already set up in the login page (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`). Use the same `window.google.accounts.id.prompt()` pattern.

If `user.hasPassword === false` AND `user.hasGoogle === false` — impossible state, skip.  
If `user.hasPassword === false` — show only the Google section (no password form). In this case, show a note: "Your account uses Google sign-in only."

---

## Section 3 — Preferences card

### Language

Two-button pill toggle: **EN** / **日本語**

Current locale is read from `document.cookie` for `att_locale` (value `'en'` or `'ja'`). Default is `'en'` if cookie absent.

On toggle: set `att_locale` cookie (path `/`, max-age 1 year) and reload the page (`window.location.reload()`) so Next.js picks up the new locale.

This matches the existing `LocaleToggle` component behavior in the root layout. **Do not import LocaleToggle** — reimplement inline to avoid coupling. The logic is trivial (one cookie write + reload).

---

## Error & loading states

- Each section manages its own `loading`, `msg`, `err` state (separate per-section, not shared)
- Success messages auto-clear after 4 seconds (`setTimeout(() => setMsg(null), 4000)`)
- Error messages persist until the next action

---

## Styling

Follow the exact Compact Mono design system used in `HomePage.tsx` and `LeavePage.tsx`:
- Font families: `F_SERIF`, `F_SANS`, `F_MONO` (same constants)
- Color palette: `C` object (same structure)
- Card style: `background: C.surface, border: 1px solid C.border, borderRadius: 14, padding: 20px 22px`
- Section header: F_SERIF 20px for card titles, F_MONO 10.5px uppercase for subtitles
- Input style: consistent with existing forms (8px 10px padding, border C.border, borderRadius 8)
- Max width: none (full width, same as other pages)

---

## Mock data (dev mode)

No mock data needed — AccountPage reads from `user` prop (already available from MemberDashboard) and `leaveBalance` prop. Both are populated in `buildMockData` in `page.tsx`.

Add `hireYear: mock.leaveBalance?.hire_year` when passing props.

---

## Files changed

| File | Change |
|---|---|
| `frontend/components/member/pages/AccountPage.tsx` | New file |
| `frontend/components/member/MemberDashboard.tsx` | Add nav item, Page type, render AccountPage |

No backend changes. No migration needed.

---

## Out of scope

- Editing name or email (admin-controlled)
- Profile photo upload
- Notification preferences (no notification system)
- Two-factor authentication
- Account deletion
