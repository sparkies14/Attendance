# Member Account Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Account" page to the member dashboard with three sections — Profile (read-only), Security (change password + Google link), and Preferences (language toggle).

**Architecture:** Two files change: `MemberDashboard.tsx` gets a new nav item + conditional render; a new `AccountPage.tsx` is the self-contained Client Component. No new backend routes — `POST /auth/change-password` and `POST /auth/link-google` already exist.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, inline styles (Compact Mono design system), `clientFetch` for API calls, Google Identity Services (already loaded via `NEXT_PUBLIC_GOOGLE_CLIENT_ID`).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/components/member/MemberDashboard.tsx` | Modify | Add `'account'` to `Page` type, add nav item, import + render `AccountPage` |
| `frontend/components/member/pages/AccountPage.tsx` | Create | Full Account page: Profile card, Security card, Preferences card |

---

### Task 1: Wire AccountPage into MemberDashboard

**Files:**
- Modify: `frontend/components/member/MemberDashboard.tsx`

- [ ] **Step 1: Add `'account'` to the `Page` union type**

In `MemberDashboard.tsx` line 85, change:
```ts
type Page = 'home' | 'calendar' | 'leave' | 'payroll';
```
to:
```ts
type Page = 'home' | 'calendar' | 'leave' | 'payroll' | 'account';
```

- [ ] **Step 2: Add the nav item to the NAV array**

In `MemberDashboard.tsx`, the `NAV` array is at line 103. Add the account entry at the end:
```ts
const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'home',     label: 'Home',            icon: '◉' },
  { id: 'calendar', label: 'Calendar · plan',  icon: '▦' },
  { id: 'leave',    label: 'Leave history',    icon: '⌇' },
  { id: 'payroll',  label: 'Timesheet',        icon: '¥' },
  { id: 'account',  label: 'Account',          icon: '○' },
];
```

- [ ] **Step 3: Import AccountPage and add the conditional render**

At the top of `MemberDashboard.tsx`, add the import alongside the other page imports:
```ts
import AccountPage from './pages/AccountPage';
```

In the page content section (around line 257–260), add the AccountPage render after the PayrollPage line:
```tsx
{page === 'home'     && <HomePage     user={user} memberData={memberData} leaveBalance={leaveBalance} apiUrl={apiUrl} />}
{page === 'calendar' && <CalendarPage email={user.email} initialData={memberData} apiUrl={apiUrl} />}
{page === 'leave'    && <LeavePage    email={user.email} leaveBalance={leaveBalance} initialLeaveHistory={memberData?.leaveHistory ?? []} apiUrl={apiUrl} />}
{page === 'payroll'  && <PayrollPage  email={user.email} initialData={memberData} apiUrl={apiUrl} />}
{page === 'account'  && <AccountPage  user={user} apiUrl={apiUrl} hireYear={leaveBalance?.hire_year} />}
```

- [ ] **Step 4: Create a temporary stub so TypeScript can resolve the import**

Create `frontend/components/member/pages/AccountPage.tsx` with the bare minimum:
```tsx
'use client';
import type { UserProfile } from '../MemberDashboard';

interface Props {
  user: UserProfile;
  apiUrl: string;
  hireYear?: number;
}

export default function AccountPage({ user }: Props) {
  return <div style={{ padding: 24, fontFamily: 'monospace', color: '#0a0a0a' }}>Account — {user.name}</div>;
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 6: Commit**

```bash
cd /home/erwindev/Attendance
git add frontend/components/member/MemberDashboard.tsx frontend/components/member/pages/AccountPage.tsx
git commit -m "feat: wire Account nav item into MemberDashboard"
```

---

### Task 2: Build AccountPage — full implementation

**Files:**
- Modify: `frontend/components/member/pages/AccountPage.tsx` (replace stub with full component)

- [ ] **Step 1: Write the complete AccountPage component**

Replace the contents of `frontend/components/member/pages/AccountPage.tsx` entirely with:

```tsx
'use client';

import { clientFetch } from '@/lib/clientFetch';
import { useState, useEffect } from 'react';
import type { UserProfile } from '../MemberDashboard';

interface Props {
  user: UserProfile;
  apiUrl: string;
  hireYear?: number;
}

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
};

const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

function Chip({ label, bg, color, border }: { label: string; bg: string; color: string; border: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, background: bg, border: `1px solid ${border}`, fontFamily: F_MONO, fontSize: 10.5, color, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }}>
      {label}
    </span>
  );
}

export default function AccountPage({ user, apiUrl, hireYear }: Props) {
  // Password form
  const [curPw,      setCurPw]      = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [conPw,      setConPw]      = useState('');
  const [pwLoading,  setPwLoading]  = useState(false);
  const [pwMsg,      setPwMsg]      = useState<string | null>(null);
  const [pwErr,      setPwErr]      = useState<string | null>(null);

  // Google
  const [hasGoogle,  setHasGoogle]  = useState(user.hasGoogle);
  const [gLoading,   setGLoading]   = useState(false);
  const [gMsg,       setGMsg]       = useState<string | null>(null);
  const [gErr,       setGErr]       = useState<string | null>(null);

  // Locale
  const [locale,     setLocale]     = useState('en');

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)att_locale=([^;]+)/);
    setLocale(match ? match[1] : 'en');
  }, []);

  const inits = user.name
    ? user.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : user.email[0].toUpperCase();

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8,
    fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box', fontFamily: F_SANS,
  };

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(null);
    if (newPw.length < 8) { setPwErr('New password must be at least 8 characters.'); return; }
    if (newPw !== conPw)   { setPwErr('Passwords do not match.'); return; }
    setPwLoading(true); setPwMsg(null);
    try {
      const res  = await clientFetch(`${apiUrl}/auth/change-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: curPw, new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) { setPwErr(data.error ?? 'Failed to update password.'); }
      else {
        setCurPw(''); setNewPw(''); setConPw('');
        setPwMsg('Password updated successfully.');
        setTimeout(() => setPwMsg(null), 4000);
      }
    } catch { setPwErr('Network error. Please try again.'); }
    finally  { setPwLoading(false); }
  }

  function linkGoogle() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !(window as { google?: unknown }).google) {
      setGErr('Google sign-in is not available on this device.');
      return;
    }
    setGLoading(true); setGMsg(null); setGErr(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    g.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: { credential: string }) => {
        try {
          const res  = await clientFetch(`${apiUrl}/auth/link-google`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
          });
          const data = await res.json();
          if (!res.ok) { setGErr(data.error ?? 'Failed to link Google account.'); }
          else {
            setHasGoogle(true);
            setGMsg('Google account linked successfully.');
            setTimeout(() => setGMsg(null), 4000);
          }
        } catch { setGErr('Network error.'); }
        finally  { setGLoading(false); }
      },
    });
    g.accounts.id.prompt((notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        setGErr('Google prompt was dismissed. Please try again.');
        setGLoading(false);
      }
    });
  }

  function toggleLocale(l: string) {
    document.cookie = `att_locale=${l};path=/;max-age=${60 * 60 * 24 * 365}`;
    setLocale(l);
    window.location.reload();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>

      {/* Page heading */}
      <div>
        <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Account.</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>Profile · Security · Preferences</div>
      </div>

      {/* ── Profile card ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 28px' }}>
        <div style={{ fontFamily: F_SERIF, fontSize: 20, color: C.text, letterSpacing: '-0.015em', marginBottom: 3 }}>Profile</div>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 22 }}>Identity</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {/* Avatar */}
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #f4b942, #b45309)', color: '#0a0a0a', fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: F_SANS, letterSpacing: '-0.02em' }}>
            {inits}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F_SERIF, fontSize: 28, color: C.text, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 4 }}>{user.name || user.email}</div>
            <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Chip label={user.role.charAt(0).toUpperCase() + user.role.slice(1)} bg={C.surface2} color={C.text2}  border={C.border} />
              <Chip
                label={user.status}
                bg={user.status === 'Active' ? C.greenSoft : C.accentSoft}
                color={user.status === 'Active' ? C.green   : C.accent}
                border={user.status === 'Active' ? C.greenBorder : C.accentBorder}
              />
              {hireYear && <Chip label={`Hired ${hireYear}`} bg={C.surface2} color={C.text3} border={C.border} />}
            </div>
          </div>
        </div>
      </div>

      {/* ── Security card ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 28px' }}>
        <div style={{ fontFamily: F_SERIF, fontSize: 20, color: C.text, letterSpacing: '-0.015em', marginBottom: 3 }}>Security</div>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 22 }}>Password · Google account</div>

        {/* Google-only account note */}
        {!user.hasPassword && (
          <div style={{ marginBottom: 22, padding: '10px 14px', background: C.surface2, borderRadius: 10, fontFamily: F_MONO, fontSize: 11.5, color: C.text3, letterSpacing: '0.02em' }}>
            Your account uses Google sign-in only.
          </div>
        )}

        {/* Change password */}
        {user.hasPassword && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Change password</div>
            {pwMsg && <div style={{ marginBottom: 10, padding: '8px 12px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 8, fontSize: 12.5, color: C.green }}>{pwMsg}</div>}
            {pwErr && <div style={{ marginBottom: 10, padding: '8px 12px', background: C.redSoft,   border: `1px solid ${C.redBorder}`,   borderRadius: 8, fontSize: 12.5, color: C.red   }}>{pwErr}</div>}
            <form onSubmit={changePassword} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Current</label>
                <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} required style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>New</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Confirm</label>
                <input type="password" value={conPw} onChange={e => setConPw(e.target.value)} required style={inp} />
              </div>
              <button type="submit" disabled={pwLoading}
                style={{ padding: '8px 16px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, fontWeight: 500, cursor: pwLoading ? 'not-allowed' : 'pointer', opacity: pwLoading ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
                {pwLoading ? '…' : 'Update'}
              </button>
            </form>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: C.border, margin: '4px 0 22px' }} />

        {/* Google account */}
        <div>
          <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Google account</div>
          {gMsg && <div style={{ marginBottom: 10, padding: '8px 12px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 8, fontSize: 12.5, color: C.green }}>{gMsg}</div>}
          {gErr && <div style={{ marginBottom: 10, padding: '8px 12px', background: C.redSoft,   border: `1px solid ${C.redBorder}`,   borderRadius: 8, fontSize: 12.5, color: C.red   }}>{gErr}</div>}
          {hasGoogle ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 999, fontSize: 13, color: C.green, fontFamily: F_SANS, fontWeight: 500 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
              Google connected
            </div>
          ) : (
            <button onClick={linkGoogle} disabled={gLoading}
              style={{ padding: '8px 16px', background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: F_SANS, fontWeight: 500, cursor: gLoading ? 'not-allowed' : 'pointer', opacity: gLoading ? 0.6 : 1 }}>
              {gLoading ? 'Connecting…' : 'Connect Google account'}
            </button>
          )}
        </div>
      </div>

      {/* ── Preferences card ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 28px' }}>
        <div style={{ fontFamily: F_SERIF, fontSize: 20, color: C.text, letterSpacing: '-0.015em', marginBottom: 3 }}>Preferences</div>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 22 }}>Language</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Display language</span>
          <div style={{ display: 'inline-flex', background: C.surface2, borderRadius: 999, padding: 3, border: `1px solid ${C.border}` }}>
            {(['en', 'ja'] as const).map((l) => (
              <button key={l} onClick={() => toggleLocale(l)}
                style={{ padding: '5px 18px', background: locale === l ? C.text : 'transparent', color: locale === l ? '#fafafa' : C.text3, border: 'none', borderRadius: 999, fontSize: 12, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}>
                {l === 'en' ? 'English' : '日本語'}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 3: Run backend tests to confirm no regressions**

```bash
cd /home/erwindev/Attendance && npx jest --no-coverage
```

Expected: `Tests: 307 passed, 307 total`

- [ ] **Step 4: Commit**

```bash
cd /home/erwindev/Attendance
git add frontend/components/member/pages/AccountPage.tsx
git commit -m "feat: add Account page — profile, security, preferences"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Verification

After push, open `https://attendance-zeta-tawny.vercel.app` (Vercel auto-deploys from main):

1. Log in as a member → click **Account** in the sidebar
2. Profile card shows your name, email, role badge, status badge, hire year
3. Security card shows the password form (if `hasPassword`) and Google section
4. Preferences card shows EN/日本語 toggle — clicking a different language reloads the page in that locale
5. Change password: fill in the form with a wrong current password → should get "Current password is incorrect." error
6. Change password: fill in correct current password + mismatched new passwords → client-side error "Passwords do not match."
