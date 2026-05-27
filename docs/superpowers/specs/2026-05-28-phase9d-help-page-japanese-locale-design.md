# Phase 9D — Help Page + Japanese Locale

**Date:** 2026-05-28
**Status:** Approved
**Depends on:** Phase 9C (Insights Dashboard) — complete

---

## Overview

Phase 9D adds two things:
1. A `/help` page showing the attendance policy derived from the existing codebase rules (tardiness levels, leave accrual, discipline, appeals)
2. A language toggle that switches the entire app between English and Japanese by setting an `att_locale` cookie, with real Japanese translations for all i18n keys

---

## Architecture

### Locale detection

`frontend/i18n/request.ts` currently hardcodes `locale = 'en'`. Updated to read the `att_locale` cookie from the incoming Next.js request. If the cookie is absent or its value is not `'ja'`, falls back to `'en'`. No URL changes — locale is entirely cookie-driven.

### Locale toggle

`frontend/components/LocaleToggle.tsx` is a Client Component. It reads the current locale via `useLocale()` from next-intl. On click, it writes `att_locale=<new-locale>; path=/; max-age=31536000; SameSite=Lax` directly to `document.cookie` (not httpOnly — JS must write it), then calls `router.refresh()` to re-run all Server Components with the new locale. No full page reload. No URL change.

The button shows the *target* locale label: when on English it shows `日本語`; when on Japanese it shows `English`. This is driven by i18n keys so the label itself is part of the translation file.

The toggle is rendered in `frontend/app/layout.tsx` with `position: fixed; top: 1rem; right: 1rem` so it floats above all page content.

### Help page

`frontend/app/help/page.tsx` is a Server Component with no API calls — all content is static i18n strings. It reads `x-user-name` and `x-user-role` from request headers (set by middleware) for the welcome line. Protected by the existing JWT middleware (add `/help/:path*` to the middleware matcher).

---

## File Map

**Modify:**
- `frontend/i18n/request.ts` — read `att_locale` cookie; fall back to `'en'`
- `frontend/middleware.ts` — add `/help/:path*` to the `config.matcher`
- `frontend/app/layout.tsx` — add `<LocaleToggle />` component
- `frontend/messages/en.json` — add `HelpPage` and `LocaleToggle` key groups
- `frontend/messages/ja.json` — add `HelpPage` and `LocaleToggle` keys in Japanese; replace all `InsightsPage` placeholder English values with real Japanese

**Create:**
- `frontend/components/LocaleToggle.tsx` — Client Component; cookie write + router.refresh()
- `frontend/app/help/page.tsx` — Server Component; static policy content via t()

---

## Help Page Content

Four sections, all text from i18n keys. No API calls.

### Tardiness

Four levels recorded in the system:
- **Minor Tardy** — arrived late but within the minor threshold
- **Major Tardy** — arrived significantly late
- **AWOL Half Day** — absent for half the workday without notice
- **AWOL Full Day** — absent for the full workday without notice

Thresholds are set by your administrator and may vary. If you accumulate 2 or more tardies in a calendar month, you will appear in the Needs Attention list.

### Leave

Leave entitlement accrues at 10 days per year of service (year 1 = 10 days, year 2 = 20 days total earned, etc.). Your balance is total earned days minus days used, plus any manual adjustments made by your administrator. Leave requests require admin/owner approval.

### Discipline

Admins and owners may issue written warnings. You will be notified and can acknowledge the warning. Warnings remain active unless voided by an admin. Active warnings also place you in the Needs Attention list.

### Appeals

You can file an appeal against a discipline warning, a leave decision, or an attendance record. Appeals require a written reason. Admins and owners review all appeals.

---

## i18n Keys

### New keys — en.json

```json
{
  "LocaleToggle": {
    "label": "日本語"
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

### Full ja.json (all keys — InsightsPage real Japanese + new keys)

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

---

## Components

### LocaleToggle.tsx

```
'use client'
- useLocale() → current locale ('en' or 'ja')
- useTranslations('LocaleToggle') → t('label') = target locale button text
- useRouter() for router.refresh()
- onClick: document.cookie = `att_locale=${next}; path=/; max-age=31536000; SameSite=Lax`
           router.refresh()
- Rendered in layout.tsx with fixed positioning top-right
```

### help/page.tsx

```
async Server Component
- getTranslations('HelpPage')
- headers() → x-user-name, x-user-role
- Returns <main> with 4 <section> elements
- Each section: <h2> title + <p> or <ul> content from t() keys
- Same inline-style approach as insights page (no Tailwind)
- Link back to /insights
```

---

## Middleware Update

Add `/help/:path*` to `config.matcher` in `frontend/middleware.ts`:

```typescript
export const config = {
  matcher: ['/insights/:path*', '/help/:path*'],
};
```

---

## i18n/request.ts Update

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

---

## Testing

- Manual: visit `/help`, verify all 4 sections render in English
- Toggle to Japanese — verify all text switches (InsightsPage and HelpPage)
- Toggle back to English — verify it switches back
- Visit `/help` without being logged in — verify redirect to login
- Verify URL does not change on locale toggle
