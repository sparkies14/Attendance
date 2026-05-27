# Phase 10A — Login Page (Next.js)

**Date:** 2026-05-28
**Status:** Approved
**Depends on:** Phase 9D (Help + Japanese locale) — complete

---

## Overview

Phase 10A migrates the login page from Express-served HTML into the Next.js frontend. Visual direction: **Compact Mono** (Design F) — a single centered card on a light background with a sign-in / create-account toggle, email+password as the primary method, and Google OAuth as secondary.

---

## Visual Design

Based on the Mydesign `login-compact.jsx` reference (visual direction only — the implementation is built against the current backend).

Key characteristics:
- Light background (`#fafafa`) with a subtle fine grid
- Single card (`width: 440px`) centered vertically and horizontally
- Brand mark + serif welcome headline
- Segmented toggle: **Sign in** | **Create account**
- Mono uppercase field labels, rounded inputs
- Primary button: full-width black pill
- "or" divider, then Google ghost button
- Top brand bar (Anosupo AI · 出勤管理, JST time, live indicator)
- Bottom copyright strip

---

## Architecture

### File Map

**Create:**
- `frontend/app/login/page.tsx` — Client Component; full login page with both modes
- `frontend/app/member/page.tsx` — placeholder Server Component; shows "Member dashboard coming soon" with a link back to `/insights` for non-member roles

**No other files need modification** — middleware already excludes login, layout already provides `LocaleToggle`, and `NEXT_PUBLIC_API_URL` is already configured in the environment.

### Login Page (`frontend/app/login/page.tsx`)

Client Component (`'use client'`).

**State:**
- `mode: 'signin' | 'signup'` — controls which tab/fields are visible
- `name: string` — signup only
- `email: string`
- `password: string`
- `error: string | null` — inline error message
- `successMessage: string | null` — shown after successful registration
- `loading: boolean`

**Sign-in flow:**
1. `POST ${NEXT_PUBLIC_API_URL}/auth/login` with `{ email, password }`
2. On success: read `user.role` from JSON response; redirect to `/insights` if role is `admin` or `owner`, else redirect to `/member`
3. On error: display `data.error` as inline error message
4. Special cases: backend returns `403` with `"awaiting approval"` or `"deactivated"` messages — display them as-is

**Create account flow:**
1. `POST ${NEXT_PUBLIC_API_URL}/auth/register` with `{ name, email, password }`
2. On success: clear the form, show `successMessage` = "Account created. An admin will approve your access." (do NOT redirect — account is Pending)
3. On error: display `data.error` as inline error message

**Google OAuth flow (sign-in mode only):**
1. Load Google Identity Services script from `https://accounts.google.com/gsi/client`
2. On Google button click: call `google.accounts.id.initialize({ client_id: NEXT_PUBLIC_GOOGLE_CLIENT_ID, callback })` then `google.accounts.id.prompt()`
3. Callback receives `{ credential }` — a signed JWT ID token from Google
4. `POST ${NEXT_PUBLIC_API_URL}/auth/google` with `{ credential }`
5. On success: redirect by role same as sign-in flow
6. On error: display `data.error` as inline error message

Google Client ID is read from `process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

**Google button visibility:** Shown in both sign-in and sign-up modes. In sign-up mode the label changes to "Sign up with Google" but actually calls the same `/auth/google` endpoint — if an account doesn't exist yet, the backend returns `403 "No account found. Please register first."` which is displayed as the error, guiding the user to register with email/password first.

**Redirect guard:** If the user already has an `att_token` cookie and visits `/login`, do not redirect server-side (the cookie is httpOnly, invisible to JS). The page renders normally; after a successful login it redirects.

**Environment variable:** `NEXT_PUBLIC_API_URL` defaults to `http://localhost:3000` if not set.

### Member Placeholder (`frontend/app/member/page.tsx`)

Async Server Component. No auth check required for Phase 10A (middleware does not protect `/member`). Renders:
- Heading: "Member Dashboard"
- Subtext: "Coming soon — Phase 10B will build this page."
- Link back to `/insights`

This page exists solely so that member-role users land somewhere after login, rather than a 404.

---

## Middleware

No changes needed. The existing `config.matcher` in `frontend/middleware.ts` only runs on `/insights/:path*` and `/help/:path*`. The login page and member placeholder are public — no JWT check.

---

## Error Messages

All error text comes directly from the backend response `data.error`. No custom front-end copy.

Status code handling:
- `400` — validation error (invalid email, short password, etc.)
- `401` — invalid credentials
- `403` — account Pending or Inactive
- `409` — email already exists (sign-up)
- `500` — "Database error." (pass through)

---

## Google Identity Services Integration

The GSI script is loaded lazily (appended to `<head>` on mount via `useEffect`). The `NEXT_PUBLIC_GOOGLE_CLIENT_ID` env var must be set in `.env.local`. If it is not set, the Google button renders but clicking it shows an error message: "Google sign-in is not configured."

---

## i18n

No translation keys. All strings are hardcoded English in the component. The locale toggle from `layout.tsx` appears on the login page but has no visible effect on login-page text.

---

## Testing

- Visit `/login` → sign-in form renders with email + password + Google button
- Toggle to "Create account" → name field appears, Google button label changes
- Submit sign-in with valid credentials → redirected to `/insights` (admin/owner) or `/member` (member)
- Submit sign-in with wrong password → inline error "Invalid credentials."
- Submit sign-in for Pending account → inline error "Your account is awaiting approval."
- Submit create-account → success message shown, no redirect
- Google sign-in → redirected correctly
- Visit `/member` as member after login → placeholder page renders
- Visit `/login` when already logged in → page renders normally (no server-side redirect)
