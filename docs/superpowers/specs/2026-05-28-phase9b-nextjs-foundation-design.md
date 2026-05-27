# Phase 9B — Next.js Foundation + Auth Bridge + i18n Scaffold

**Date:** 2026-05-28  
**Status:** Approved  
**Depends on:** Phase 9A (Backend Reporting APIs) — complete

---

## Overview

Phase 9B introduces a Next.js app alongside the existing Express backend. It does not replace Express — both run as independent services. The goal is to establish the foundation that Phase 9C (Insights dashboard) and Phase 9D (Help page + Japanese locale) will build on.

Deliverables:
- Next.js app scaffolded at `/frontend`
- Auth bridge so logged-in Express users are also authenticated in Next.js without re-logging in
- i18n scaffolded with English and Japanese locale files (Japanese translations deferred to Phase 9D)
- One placeholder page at `/insights` that proves the full stack works end to end

---

## Architecture

### Two independent services

```
/Attendance/              ← Express backend (unchanged)
  server.js
  routes/
  lib/
  ...

/Attendance/frontend/     ← NEW Next.js app
  app/
    layout.tsx
    page.tsx              ← redirects to /insights
    insights/
      page.tsx            ← placeholder page
  components/
  messages/
    en.json               ← English strings
    ja.json               ← Japanese strings (empty keys, English fallbacks)
  middleware.ts           ← auth guard
  next.config.ts
  package.json
```

- **Local dev:** Express on port 3000, Next.js on port 3001
- **Production (Railway):** Two separate Railway services — `attendance-api` (Express) and `attendance-ui` (Next.js) — both connected to the same Supabase database via environment variables

### Why separate services

Zero risk to the existing Express app. If Next.js breaks, Express and all existing pages keep working. A reverse proxy can unify them under one domain later once migration is complete.

---

## Auth Bridge

### Problem

Express login returns a JWT in the JSON response body. The existing HTML pages store it in `localStorage`. Next.js cannot read `localStorage` on the server, so it cannot protect routes or render authenticated content server-side without a cookie.

### Solution

**Minimal Express changes — existing behavior is preserved:**

1. **Modify two login routes** (`POST /login` and `POST /auth/google`) to also set an `httpOnly` cookie named `att_token` alongside the existing JSON response. Old HTML pages are unaffected — they still receive the JWT in the response body and store it in `localStorage` as before.

2. **Add one new route** `POST /auth/set-cookie` — accepts a valid JWT in the request body, verifies it, and sets the `att_token` cookie. This handles users who are **already logged in** (JWT in `localStorage`) when they first visit a Next.js page, allowing the cookie to be set without requiring a new login.

3. **Next.js `middleware.ts`** reads the `att_token` cookie on every request to protected routes (`/insights`, and future Next.js pages). If the cookie is missing or invalid → redirect to the Express login page. If valid → decode the payload and pass `user_id`, `email`, and `role` to the page via request headers.

### Cookie settings

| Setting | Value | Reason |
|---|---|---|
| `httpOnly` | true | Prevents JS from reading the cookie — XSS protection |
| `sameSite` | `lax` | Allows cookie to be sent on top-level navigation |
| `secure` | true in production | HTTPS only in Railway, off in local dev |
| `maxAge` | 24 hours | Matches existing JWT TTL |
| `path` | `/` | Available across all routes |

### CORS

Express must allow requests from the Next.js Railway URL (set via `FRONTEND_URL` environment variable). Local dev allows `http://localhost:3001`.

---

## i18n

- **Library:** `next-intl`
- **Default locale:** English (`en`)
- **Secondary locale:** Japanese (`ja`) — scaffolded now, translations filled in Phase 9D
- **URL structure:** `/insights` (English), `/ja/insights` (Japanese)
- Japanese routes are not linked from anywhere until Phase 9D

`messages/en.json` contains all string keys used by the placeholder page. `messages/ja.json` has the same keys with English values as fallbacks — no broken UI when Japanese is requested before Phase 9D.

---

## Placeholder Insights Page

Route: `GET /insights` (Next.js, protected)

Displays:
- Page title: "Insights"
- Logged-in user's name and role (decoded from cookie)
- Message: "Dashboard coming soon."

This page proves:
- Next.js boots and serves pages correctly
- Auth cookie is read and validated by middleware
- User identity flows from Express JWT → Next.js server component
- i18n loads without errors
- CORS between Next.js and Express is configured correctly

The page has no charts, no data fetching from the reporting APIs, and no navigation links from the existing HTML pages. Those come in Phase 9C.

---

## What Phase 9B Does NOT Include

- Charts or real data (Phase 9C)
- Japanese translations filled in (Phase 9D)
- Navigation links from existing HTML pages to `/insights`
- Railway deployment setup (done after local version works)
- Any changes to existing Express routes beyond the two login modifications and one new route
- Deduction engine (Phase 6, blocked on policy finalization)

---

## Environment Variables

### Express (additions)

| Variable | Purpose |
|---|---|
| `FRONTEND_URL` | Next.js origin for CORS (e.g. `http://localhost:3001` in dev) |

### Next.js (new)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Express base URL (e.g. `http://localhost:3000` in dev) |
| `JWT_SECRET` | Same secret as Express — used by middleware to verify cookie |

---

## Testing

- Existing Jest suite (255 tests) must continue to pass — no Express behavior changes for old routes
- New Express routes (`POST /auth/set-cookie`, modified login routes) get Jest + supertest tests
- Next.js: manual end-to-end verification (visit `/insights` logged in → see placeholder; visit without cookie → redirected to login)
