# Phase 9B — Next.js Foundation + Auth Bridge + i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a Next.js app in `frontend/` that boots alongside Express, proves authentication works end-to-end via a cookie bridge, and delivers a placeholder `/insights` page.

**Architecture:** Next.js runs as a separate service (`frontend/`) on port 3001 while Express stays on port 3000. Express login routes are modified to also set an `httpOnly` cookie (`att_token`) alongside the existing JSON response. Next.js middleware reads that cookie to protect routes; existing HTML pages are completely unaffected.

**Tech Stack:** Next.js 15, React 19, TypeScript, next-intl v3 (i18n), jose (JWT verify in Edge Runtime), Express 4 (existing)

---

## File Map

**Modify — Express (existing):**
- `server.js` — update CORS to allow `FRONTEND_URL` env var and enable `credentials: true`
- `routes/auth.js` — add `setAuthCookie` helper; modify `POST /login` and `POST /google` to call it; add name to JWT payload; add `POST /set-cookie` route
- `.gitignore` — add `frontend/.next/` and `.env.local`

**Create — Express tests:**
- `tests/authRoutes.test.js` — supertest tests for cookie on login, google, and set-cookie

**Create — Next.js app:**
- `frontend/package.json` — Next.js 15, next-intl, jose
- `frontend/tsconfig.json` — TypeScript config for Next.js
- `frontend/next.config.ts` — next-intl plugin wired up
- `frontend/.env.local.example` — documents required env vars
- `frontend/i18n/request.ts` — next-intl server config (always English for now)
- `frontend/messages/en.json` — English strings for insights page
- `frontend/messages/ja.json` — Japanese placeholder (same as English; filled in Phase 9D)
- `frontend/middleware.ts` — reads `att_token` cookie, verifies JWT, passes user to server components, redirects to login if missing/invalid
- `frontend/app/layout.tsx` — root layout with NextIntlClientProvider
- `frontend/app/page.tsx` — redirects `/` to `/insights`
- `frontend/app/insights/page.tsx` — placeholder page showing name, role, "Dashboard coming soon."

---

## Task 1: Update CORS in server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Update CORS config**

In `server.js`, replace the existing `cors(...)` block with the following. The only changes are: (1) extract allowed origins into a Set so `FRONTEND_URL` env var is supported, and (2) add `credentials: true` so browsers send cookies on cross-origin requests.

Find this block:
```javascript
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.startsWith('http://localhost') || origin === 'https://sparkies14.github.io') {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
}));
```

Replace with:
```javascript
const CORS_ORIGINS = new Set([
  'https://sparkies14.github.io',
  process.env.FRONTEND_URL,
].filter(Boolean));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.startsWith('http://localhost') || CORS_ORIGINS.has(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

```bash
cd /home/erwindev/Attendance
npm test
```

Expected: All 255 tests pass. Any failure here means the CORS change broke something — revert and investigate.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: allow FRONTEND_URL in CORS, enable credentials"
```

---

## Task 2: Express Auth Bridge (TDD)

**Files:**
- Create: `tests/authRoutes.test.js`
- Modify: `routes/auth.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/authRoutes.test.js`:

```javascript
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');
const { hashPassword, signToken } = require('../lib/auth');

jest.mock('../lib/supabase', () => ({ from: jest.fn() }));
jest.mock('../lib/audit', () => ({
  log: jest.fn().mockResolvedValue(undefined),
  ACTIONS: {
    LOGIN: 'login', LOGIN_FAILED: 'login_failed',
    LOGIN_GOOGLE: 'login_google', LOGIN_GOOGLE_FAILED: 'login_google_failed',
    REGISTER: 'register',
  },
}));

const supabase = require('../lib/supabase');
const router   = require('../routes/auth');

function c(data, error = null) {
  const result = { data, error };
  const ch = {
    then:        (resolve) => resolve(result),
    select:      jest.fn(() => ch),
    eq:          jest.fn(() => ch),
    update:      jest.fn(() => ch),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single:      jest.fn(() => Promise.resolve(result)),
    insert:      jest.fn(() => ch),
  };
  return ch;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  return app;
}

let PASSWORD_HASH;
beforeAll(async () => { PASSWORD_HASH = await hashPassword('pass1234'); });
beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(); });

/* ─── POST /auth/login ─── */
describe('POST /auth/login — cookie', () => {
  test('sets httpOnly att_token cookie on successful login', async () => {
    const user = {
      id: 'u1', email: 'a@b.com', name: 'Alice',
      role: 'member', status: 'Active', password_hash: PASSWORD_HASH,
    };
    supabase.from
      .mockReturnValueOnce(c(user))   // select user by email
      .mockReturnValueOnce(c(null));  // update last_login_at

    const res = await request(makeApp())
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'pass1234' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/att_token=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);
    expect(cookies[0]).toMatch(/SameSite=Lax/i);
  });

  test('does not set cookie on failed login', async () => {
    supabase.from.mockReturnValueOnce(c(null)); // user not found

    const res = await request(makeApp())
      .post('/auth/login')
      .send({ email: 'x@b.com', password: 'pass1234' });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

/* ─── POST /auth/google ─── */
describe('POST /auth/google — cookie', () => {
  test('sets att_token cookie on successful Google login', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sub: 'gsub-1', email: 'a@b.com', name: 'Alice' }),
    });
    const user = {
      id: 'u1', email: 'a@b.com', name: 'Alice',
      role: 'member', status: 'Active', google_sub: 'gsub-1',
    };
    supabase.from
      .mockReturnValueOnce(c(user))   // select by google_sub
      .mockReturnValueOnce(c(null));  // update last_login_at

    const res = await request(makeApp())
      .post('/auth/google')
      .send({ credential: 'fake-google-token' });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/att_token=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);
  });
});

/* ─── POST /auth/set-cookie ─── */
describe('POST /auth/set-cookie', () => {
  test('sets att_token cookie with a valid JWT', async () => {
    const token = signToken({ user_id: 'u1', email: 'a@b.com', role: 'member', name: 'Alice' });

    const res = await request(makeApp())
      .post('/auth/set-cookie')
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/att_token=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);
  });

  test('returns 401 with an invalid JWT', async () => {
    const res = await request(makeApp())
      .post('/auth/set-cookie')
      .send({ token: 'not-a-valid-jwt' });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('returns 401 when token is missing', async () => {
    const res = await request(makeApp())
      .post('/auth/set-cookie')
      .send({});

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern=authRoutes
```

Expected: 6 tests fail. Failures like `cannot read properties of undefined` or `expected 200 received 404` confirm the implementation is missing. If they pass here, something is wrong — stop and investigate.

- [ ] **Step 3: Add setAuthCookie helper and name to JWT in routes/auth.js**

First, update the import at line 3 of `routes/auth.js` to include `verifyToken`:

```javascript
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../lib/auth');
```

Then, directly after the `issueLoginResponse` function (around line 21), add the helper:

```javascript
function setAuthCookie(res, token) {
  res.cookie('att_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
}
```

Also update `issueLoginResponse` to include `name` in the JWT payload (needed so the Next.js insights page can display the user's name without a separate API call):

```javascript
function issueLoginResponse(user) {
  const token = signToken({ user_id: user.id, email: user.email, role: user.role, name: user.name });
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}
```

- [ ] **Step 4: Modify POST /login to set the cookie**

In `routes/auth.js`, find the final `return res.json(issueLoginResponse(user));` inside `router.post('/login', ...)` (the one after `await supabase.from('users').update({ last_login_at`). Replace it with:

```javascript
  const loginData = issueLoginResponse(user);
  setAuthCookie(res, loginData.token);
  return res.json(loginData);
```

- [ ] **Step 5: Modify POST /google to set the cookie**

In `routes/auth.js`, find the final `return res.json(issueLoginResponse(user));` inside `router.post('/google', ...)`. Replace it with:

```javascript
  const loginData = issueLoginResponse(user);
  setAuthCookie(res, loginData.token);
  return res.json(loginData);
```

- [ ] **Step 6: Add POST /set-cookie route**

In `routes/auth.js`, add this new route in the `// ── Public ──` section, after the `router.post('/register', ...)` block and before `router.post('/login', ...)`:

```javascript
router.post('/set-cookie', (req, res) => {
  const { token } = req.body || {};
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token.' });
  setAuthCookie(res, token);
  return res.json({ success: true });
});
```

- [ ] **Step 7: Run the new tests to confirm they pass**

```bash
npm test -- --testPathPattern=authRoutes
```

Expected: All 6 tests pass.

- [ ] **Step 8: Run the full test suite**

```bash
npm test
```

Expected: All 261 tests pass (255 existing + 6 new). Any regression in the existing 255 means a change to auth.js broke something — check the diff carefully.

- [ ] **Step 9: Commit**

```bash
git add routes/auth.js tests/authRoutes.test.js
git commit -m "feat: auth bridge — set att_token cookie on login, add POST /auth/set-cookie"
```

---

## Task 3: Scaffold Next.js Project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/.env.local.example`
- Modify: `.gitignore`

- [ ] **Step 1: Update root .gitignore**

Add these lines to `/home/erwindev/Attendance/.gitignore`:

```
frontend/.next/
frontend/node_modules/
.env.local
```

- [ ] **Step 2: Create frontend/package.json**

Create `/home/erwindev/Attendance/frontend/package.json`:

```json
{
  "name": "attendance-ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001"
  },
  "dependencies": {
    "jose": "^5.9.0",
    "next": "^15.0.0",
    "next-intl": "^3.22.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 3: Create frontend/tsconfig.json**

Create `/home/erwindev/Attendance/frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create frontend/.env.local.example**

Create `/home/erwindev/Attendance/frontend/.env.local.example`:

```
# Copy this file to .env.local and fill in the values.
# .env.local is gitignored and must never be committed.

# The Express API base URL (no trailing slash)
NEXT_PUBLIC_API_URL=http://localhost:3000

# Must match the JWT_SECRET in the Express .env file exactly
JWT_SECRET=your-jwt-secret-here
```

- [ ] **Step 5: Copy .env.local.example to .env.local and fill in values**

```bash
cp /home/erwindev/Attendance/frontend/.env.local.example /home/erwindev/Attendance/frontend/.env.local
```

Then open `frontend/.env.local` and set `JWT_SECRET` to the same value as in the Express `.env` file.

- [ ] **Step 6: Install dependencies**

```bash
cd /home/erwindev/Attendance/frontend && npm install
```

Expected: `node_modules/` created, no errors. npm may show audit warnings — ignore them for now.

- [ ] **Step 7: Commit scaffold files**

```bash
cd /home/erwindev/Attendance
git add .gitignore frontend/package.json frontend/tsconfig.json frontend/.env.local.example frontend/package-lock.json
git commit -m "feat: scaffold Next.js frontend app"
```

---

## Task 4: Set Up next-intl

**Files:**
- Create: `frontend/next.config.ts`
- Create: `frontend/i18n/request.ts`
- Create: `frontend/messages/en.json`
- Create: `frontend/messages/ja.json`

- [ ] **Step 1: Create frontend/next.config.ts**

Create `/home/erwindev/Attendance/frontend/next.config.ts`:

```typescript
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```

- [ ] **Step 2: Create frontend/i18n/request.ts**

Create `/home/erwindev/Attendance/frontend/i18n/request.ts`:

```typescript
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  const locale = 'en';
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 3: Create frontend/messages/en.json**

Create `/home/erwindev/Attendance/frontend/messages/en.json`:

```json
{
  "InsightsPage": {
    "title": "Insights",
    "welcome": "Welcome, {name}",
    "role": "Role: {role}",
    "comingSoon": "Dashboard coming soon."
  }
}
```

- [ ] **Step 4: Create frontend/messages/ja.json**

Create `/home/erwindev/Attendance/frontend/messages/ja.json`:

```json
{
  "InsightsPage": {
    "title": "Insights",
    "welcome": "Welcome, {name}",
    "role": "Role: {role}",
    "comingSoon": "Dashboard coming soon."
  }
}
```

(Japanese values are identical to English for now — Phase 9D fills them in.)

- [ ] **Step 5: Commit**

```bash
cd /home/erwindev/Attendance
git add frontend/next.config.ts frontend/i18n/request.ts frontend/messages/
git commit -m "feat: wire next-intl with English and Japanese locale scaffolds"
```

---

## Task 5: Auth Middleware

**Files:**
- Create: `frontend/middleware.ts`

- [ ] **Step 1: Create frontend/middleware.ts**

Create `/home/erwindev/Attendance/frontend/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED_PATHS = ['/insights'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PATHS.some(p => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get('att_token')?.value;
  if (!token) return redirectToLogin(req);

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    // Forward user identity to server components via request headers.
    // Server components read these with: const h = await headers(); h.get('x-user-name')
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-id',    String(payload.user_id ?? ''));
    requestHeaders.set('x-user-email', String(payload.email ?? ''));
    requestHeaders.set('x-user-role',  String(payload.role ?? ''));
    requestHeaders.set('x-user-name',  String(payload.name ?? ''));

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return redirectToLogin(req);
  }
}

function redirectToLogin(req: NextRequest) {
  return NextResponse.redirect(
    new URL(process.env.NEXT_PUBLIC_API_URL + '/index.html')
  );
}

export const config = {
  matcher: ['/insights/:path*'],
};
```

- [ ] **Step 2: Commit**

```bash
cd /home/erwindev/Attendance
git add frontend/middleware.ts
git commit -m "feat: Next.js auth middleware — protect /insights with att_token cookie"
```

---

## Task 6: Root Layout and Redirect

**Files:**
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/page.tsx`

- [ ] **Step 1: Create frontend/app/layout.tsx**

Create `/home/erwindev/Attendance/frontend/app/layout.tsx`:

```typescript
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create frontend/app/page.tsx**

Create `/home/erwindev/Attendance/frontend/app/page.tsx`:

```typescript
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/insights');
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/erwindev/Attendance
git add frontend/app/layout.tsx frontend/app/page.tsx
git commit -m "feat: root layout with next-intl provider, redirect / to /insights"
```

---

## Task 7: Placeholder Insights Page

**Files:**
- Create: `frontend/app/insights/page.tsx`

- [ ] **Step 1: Create frontend/app/insights/page.tsx**

Create `/home/erwindev/Attendance/frontend/app/insights/page.tsx`:

```typescript
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

export default async function InsightsPage() {
  const t = await getTranslations('InsightsPage');
  const h = await headers();
  const name = h.get('x-user-name') || h.get('x-user-email') || 'Unknown';
  const role = h.get('x-user-role') || 'Unknown';

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>{t('title')}</h1>
      <hr />
      <p>{t('welcome', { name })}</p>
      <p>{t('role', { role })}</p>
      <p>{t('comingSoon')}</p>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/erwindev/Attendance
git add frontend/app/insights/page.tsx
git commit -m "feat: placeholder insights page with user name, role, and coming soon message"
```

---

## Task 8: End-to-End Verification

- [ ] **Step 1: Start Express**

In one terminal:
```bash
cd /home/erwindev/Attendance
node server.js
```

Expected: `Server listening on port 3000` (or similar).

- [ ] **Step 2: Start Next.js**

In a second terminal:
```bash
cd /home/erwindev/Attendance/frontend
npm run dev
```

Expected: Next.js starts on port 3001. You will see output like `▲ Next.js 15.x.x` and `Local: http://localhost:3001`. There may be a TypeScript build on first run — wait for it to complete.

- [ ] **Step 3: Test redirect without cookie**

Open a browser (or use curl) and visit `http://localhost:3001/insights`.

Expected: You are redirected to `http://localhost:3000/index.html` (the Express login page). This confirms the middleware is blocking unauthenticated requests.

- [ ] **Step 4: Log in via the Express login page**

Visit `http://localhost:3000/index.html` and log in with a valid account.

After login, the Express `/auth/login` route now sets the `att_token` cookie. Verify this by opening browser DevTools → Application → Cookies → `localhost:3000`. You should see `att_token` with `HttpOnly` checked.

- [ ] **Step 5: Visit /insights with cookie**

Now visit `http://localhost:3001/insights`.

Expected: The placeholder page loads and shows:
```
Insights
───────────────────────
Welcome, [your name]
Role: [your role]
Dashboard coming soon.
```

If the name shows as "Unknown", the `x-user-name` header is not reaching the server component. Check that:
1. `middleware.ts` is setting `requestHeaders.set('x-user-name', ...)` and returning `NextResponse.next({ request: { headers: requestHeaders } })`
2. The JWT was issued after the `name` field was added to `issueLoginResponse` (log out and log back in to get a fresh token)

- [ ] **Step 6: Verify i18n loads without errors**

Check the Next.js terminal — there should be no errors about missing translation keys or locale configuration.

- [ ] **Step 7: Final commit**

```bash
cd /home/erwindev/Attendance
git add .
git commit -m "feat: Phase 9B complete — Next.js foundation, auth bridge, i18n scaffold, insights placeholder"
```
