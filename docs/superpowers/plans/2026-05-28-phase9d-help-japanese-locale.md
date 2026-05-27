# Phase 9D — Help Page + Japanese Locale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/help` page showing the attendance policy and a language toggle that switches the entire app between English and Japanese via an `att_locale` cookie.

**Architecture:** `i18n/request.ts` reads the `att_locale` cookie to pick the locale server-side; a `LocaleToggle` Client Component writes the cookie and calls `router.refresh()` to re-render all Server Components in the new language; the `/help` page is a fully static Server Component with no API calls.

**Tech Stack:** Next.js 15 App Router, next-intl v3, TypeScript

---

## File Map

**Modify:**
- `frontend/i18n/request.ts` — read `att_locale` cookie; fall back to `'en'`
- `frontend/middleware.ts` — add `/help/:path*` to `config.matcher`
- `frontend/app/layout.tsx` — import and render `<LocaleToggle />`
- `frontend/messages/en.json` — add `LocaleToggle` and `HelpPage` key groups
- `frontend/messages/ja.json` — add same groups with real Japanese; replace InsightsPage placeholder English with real Japanese

**Create:**
- `frontend/components/LocaleToggle.tsx` — Client Component; writes `att_locale` cookie + `router.refresh()`
- `frontend/app/help/page.tsx` — Server Component; static policy content via `t()` keys

---

### Task 1: Update i18n and middleware

**Files:**
- Modify: `frontend/i18n/request.ts`
- Modify: `frontend/middleware.ts`

- [ ] **Step 1: Update i18n/request.ts to read att_locale cookie**

Replace the entire contents of `frontend/i18n/request.ts`:

```typescript
import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('att_locale')?.value === 'ja' ? 'ja' : 'en';
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 2: Add /help to middleware matcher**

In `frontend/middleware.ts`, change the last line from:

```typescript
export const config = {
  matcher: ['/insights/:path*'],
};
```

To:

```typescript
export const config = {
  matcher: ['/insights/:path*', '/help/:path*'],
};
```

- [ ] **Step 3: Verify the dev server still starts**

```bash
cd /home/erwindev/Attendance/frontend && npm run dev 2>&1 | head -20
```

Expected: `✓ Ready on http://localhost:3001` (or compilation output with no errors). Stop the server with Ctrl+C after confirming.

- [ ] **Step 4: Commit**

```bash
cd /home/erwindev/Attendance && git add frontend/i18n/request.ts frontend/middleware.ts && git commit -m "$(cat <<'EOF'
feat: read att_locale cookie for locale detection, protect /help route

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Update i18n message files

**Files:**
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/ja.json`

- [ ] **Step 1: Replace frontend/messages/en.json with full key set**

Write this exact content to `frontend/messages/en.json`:

```json
{
  "LocaleToggle": {
    "label": "日本語"
  },
  "InsightsPage": {
    "title": "Insights",
    "welcome": "Welcome, {name}",
    "role": "Role: {role}",
    "comingSoon": "Dashboard coming soon.",
    "dateFrom": "From",
    "dateTo": "To",
    "apply": "Apply",
    "dateError": "End date must be after start date.",
    "attentionTitle": "Needs Attention (this month)",
    "noAttention": "No members need attention this month.",
    "tardyTitle": "Tardy",
    "leaveTitle": "Leave Utilization",
    "disciplineTitle": "Discipline",
    "noTardy": "No tardy records in this date range.",
    "noWarnings": "No active warnings in this date range.",
    "downloadCsv": "↓ CSV",
    "downloadPdf": "↓ PDF",
    "errorLoad": "Failed to load {section} data — try refreshing.",
    "legendMinor": "Minor",
    "legendMajor": "Major",
    "legendAwolHalf": "AWOL Half Day",
    "legendAwolFull": "AWOL Full Day",
    "legendUsed": "Used",
    "legendRemaining": "Remaining",
    "legendActive": "Active Warnings"
  },
  "HelpPage": {
    "title": "Help",
    "welcome": "Welcome, {name}",
    "role": "Role: {role}",
    "tardyTitle": "Tardiness",
    "tardyIntro": "There are four tardiness levels recorded in the system:",
    "tardyMinor": "Minor Tardy — arrived late but within the minor threshold",
    "tardyMajor": "Major Tardy — arrived significantly late",
    "tardyAwolHalf": "AWOL Half Day — absent for half the workday without notice",
    "tardyAwolFull": "AWOL Full Day — absent for the full workday without notice",
    "tardyNote": "Thresholds are set by your administrator and may vary. If you accumulate 2 or more tardies in a calendar month, you will appear in the Needs Attention list.",
    "leaveTitle": "Leave",
    "leaveText": "Leave entitlement accrues at 10 days per year of service (year 1 = 10 days, year 2 = 20 days total earned, etc.). Your balance is total earned days minus days used, plus any manual adjustments made by your administrator. Leave requests require admin/owner approval.",
    "disciplineTitle": "Discipline",
    "disciplineText": "Admins and owners may issue written warnings. You will be notified and can acknowledge the warning. Warnings remain active unless voided by an admin. Active warnings also place you in the Needs Attention list.",
    "appealsTitle": "Appeals",
    "appealsText": "You can file an appeal against a discipline warning, a leave decision, or an attendance record. Appeals require a written reason. Admins and owners review all appeals."
  }
}
```

- [ ] **Step 2: Replace frontend/messages/ja.json with full Japanese key set**

Write this exact content to `frontend/messages/ja.json`:

```json
{
  "LocaleToggle": {
    "label": "English"
  },
  "InsightsPage": {
    "title": "インサイト",
    "welcome": "ようこそ、{name}",
    "role": "役割: {role}",
    "comingSoon": "ダッシュボードは近日公開予定です。",
    "dateFrom": "開始日",
    "dateTo": "終了日",
    "apply": "適用",
    "dateError": "終了日は開始日より後にしてください。",
    "attentionTitle": "今月の要注意メンバー",
    "noAttention": "今月、注意が必要なメンバーはいません。",
    "tardyTitle": "遅刻",
    "leaveTitle": "有給休暇",
    "disciplineTitle": "懲戒",
    "noTardy": "この期間に遅刻記録はありません。",
    "noWarnings": "この期間にアクティブな警告はありません。",
    "downloadCsv": "↓ CSV",
    "downloadPdf": "↓ PDF",
    "errorLoad": "{section}データの読み込みに失敗しました。ページを更新してください。",
    "legendMinor": "軽度遅刻",
    "legendMajor": "重度遅刻",
    "legendAwolHalf": "半日欠勤",
    "legendAwolFull": "全日欠勤",
    "legendUsed": "使用済み",
    "legendRemaining": "残り",
    "legendActive": "アクティブな警告"
  },
  "HelpPage": {
    "title": "ヘルプ",
    "welcome": "ようこそ、{name}",
    "role": "役割: {role}",
    "tardyTitle": "遅刻について",
    "tardyIntro": "システムには4つの遅刻レベルが記録されています：",
    "tardyMinor": "軽度遅刻 — 軽度の基準内での遅刻",
    "tardyMajor": "重度遅刻 — 大幅な遅刻",
    "tardyAwolHalf": "半日欠勤 — 事前連絡なしの半日不在",
    "tardyAwolFull": "全日欠勤 — 事前連絡なしの全日不在",
    "tardyNote": "基準値は管理者が設定します。当月に2回以上の遅刻が記録されると、要注意リストに表示されます。",
    "leaveTitle": "有給休暇について",
    "leaveText": "有給休暇は勤続年数に応じて年間10日ずつ付与されます（1年目：10日、2年目：20日、以降同様）。残日数は付与日数から使用日数を引き、管理者による手動調整を加えた数です。有給申請には管理者またはオーナーの承認が必要です。",
    "disciplineTitle": "懲戒について",
    "disciplineText": "管理者またはオーナーは書面による警告を発行できます。警告は通知され、確認することができます。警告は管理者が無効化しない限りアクティブのままです。アクティブな警告がある場合も要注意リストに表示されます。",
    "appealsTitle": "異議申し立て",
    "appealsText": "懲戒警告、有給決定、または出勤記録に対して異議申し立てができます。申し立てには理由の記載が必要です。管理者またはオーナーがすべての申し立てを審査します。"
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/erwindev/Attendance && git add frontend/messages/en.json frontend/messages/ja.json && git commit -m "$(cat <<'EOF'
feat: add LocaleToggle and HelpPage i18n keys, add real Japanese translations

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: LocaleToggle component

**Files:**
- Create: `frontend/components/LocaleToggle.tsx`

- [ ] **Step 1: Create LocaleToggle.tsx**

Create `frontend/components/LocaleToggle.tsx`:

```typescript
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export default function LocaleToggle() {
  const locale = useLocale();
  const t = useTranslations('LocaleToggle');
  const router = useRouter();

  function handleToggle() {
    const next = locale === 'en' ? 'ja' : 'en';
    document.cookie = `att_locale=${next}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <button
      onClick={handleToggle}
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        fontSize: '0.8rem',
        padding: '0.25rem 0.75rem',
        background: '#f3f4f6',
        border: '1px solid #d1d5db',
        borderRadius: '4px',
        cursor: 'pointer',
        zIndex: 1000,
      }}
    >
      {t('label')}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/erwindev/Attendance && git add frontend/components/LocaleToggle.tsx && git commit -m "$(cat <<'EOF'
feat: add LocaleToggle client component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add LocaleToggle to layout

**Files:**
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Update layout.tsx to include LocaleToggle**

Replace the entire contents of `frontend/app/layout.tsx`:

```typescript
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import LocaleToggle from '@/components/LocaleToggle';

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
          <LocaleToggle />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/erwindev/Attendance && git add frontend/app/layout.tsx && git commit -m "$(cat <<'EOF'
feat: add LocaleToggle to root layout

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Help page

**Files:**
- Create: `frontend/app/help/page.tsx`

- [ ] **Step 1: Create the help page**

Create `frontend/app/help/page.tsx`:

```typescript
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';

export default async function HelpPage() {
  const t = await getTranslations('HelpPage');
  const h = await headers();
  const name = h.get('x-user-name') || h.get('x-user-email') || 'Unknown';
  const role = h.get('x-user-role') || 'Unknown';

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>{t('title')}</h1>
      <p>
        {t('welcome', { name })} &mdash; {t('role', { role })}
      </p>
      <p>
        <Link href="/insights">← Insights</Link>
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2>{t('tardyTitle')}</h2>
        <p>{t('tardyIntro')}</p>
        <ul>
          <li>{t('tardyMinor')}</li>
          <li>{t('tardyMajor')}</li>
          <li>{t('tardyAwolHalf')}</li>
          <li>{t('tardyAwolFull')}</li>
        </ul>
        <p>{t('tardyNote')}</p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>{t('leaveTitle')}</h2>
        <p>{t('leaveText')}</p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>{t('disciplineTitle')}</h2>
        <p>{t('disciplineText')}</p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>{t('appealsTitle')}</h2>
        <p>{t('appealsText')}</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/erwindev/Attendance && git add frontend/app/help/page.tsx && git commit -m "$(cat <<'EOF'
feat: add Help page with static policy content

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: E2E verification

**Files:** None (verification only)

- [ ] **Step 1: Start both servers**

Terminal 1:
```bash
node server.js
```
Expected: `Attendance server running on http://localhost:3000`

Terminal 2:
```bash
cd frontend && npm run dev
```
Expected: `✓ Ready on http://localhost:3001`

- [ ] **Step 2: Verify the Help page in English**

Visit `http://localhost:3001/help` (must be logged in — `att_token` cookie required).

Expected checklist:
- [ ] Page title "Help" is visible
- [ ] Welcome line shows the logged-in user's name and role
- [ ] "← Insights" link is visible
- [ ] "Tardiness" section with 4 bullet points
- [ ] "Leave" section with the accrual description
- [ ] "Discipline" section
- [ ] "Appeals" section
- [ ] "日本語" button is visible top-right

- [ ] **Step 3: Verify locale toggle on /help**

Click "日本語".

Expected:
- [ ] Page re-renders in Japanese without a full page reload (URL stays `/help`)
- [ ] Page title changes to "ヘルプ"
- [ ] All section headings and text switch to Japanese
- [ ] Button now shows "English"

- [ ] **Step 4: Verify locale persists across navigation**

While on Japanese, click "← インサイト" (back to insights).

Expected:
- [ ] Insights page renders in Japanese ("インサイト", "遅刻", "有給休暇", etc.)
- [ ] Toggle button shows "English"

- [ ] **Step 5: Toggle back to English**

Click "English".

Expected:
- [ ] Insights page switches back to English
- [ ] Button shows "日本語"

- [ ] **Step 6: Verify /help is protected**

Open a private/incognito window and visit `http://localhost:3001/help` without logging in.

Expected: Redirects to `http://localhost:3000/index.html` (login page).

- [ ] **Step 7: Run Express test suite one final time**

```bash
cd /home/erwindev/Attendance && npm test 2>&1 | tail -10
```

Expected: All 264 tests pass.
