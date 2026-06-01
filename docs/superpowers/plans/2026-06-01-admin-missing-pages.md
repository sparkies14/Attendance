# Admin Missing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 7 missing admin pages (Tardy, Holidays, Policy, Discipline, Appeals, Audit Log, Leave Balances) and wire them into a reorganised 4-group sidebar nav.

**Architecture:** Each page is a self-contained `'use client'` React component in `frontend/components/admin/pages/`. Pages 1-7 are created first (each independently compilable), then Task 8 updates `AdminDashboard.tsx` to import and route all 7. All API calls use `clientFetch` from `@/lib/clientFetch`. Inline styles use the shared `C`/`F_SANS`/`F_MONO`/`F_SERIF` palette. Dev mock data fallback on every page.

**Tech Stack:** Next.js 14, React, TypeScript strict, inline styles, `clientFetch` wrapper, no new backend routes.

---

## API URL Reference

| Page | Endpoints |
|------|-----------|
| Tardy | `GET /admin/tardy-report`, `POST /admin/run-awol-check` |
| Holidays | `GET /admin/holidays`, `POST /admin/holidays` (owner), `DELETE /admin/holidays/:id` (owner) |
| Policy | `GET /admin/policy-config`, `PATCH /admin/policy-config` (owner) |
| Discipline | `GET /discipline/all`, `POST /discipline`, `POST /discipline/:id/void`, `POST /discipline/:id/acknowledge` |
| Appeals | `GET /appeals/all`, `POST /appeals/:id/resolve` |
| Audit | `GET /audit?page=&actor=&action=&from=&to=`, `DELETE /audit?before=` (owner) |
| Leave Balances | `GET /leave-balance/all`, `POST /leave-balance/adjust` |

---

## Shared style constants (copy into every new page)

```ts
const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";
```

---

## Task 1: TardyPage

**Files:**
- Create: `frontend/components/admin/pages/TardyPage.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Props { apiUrl: string; adminRole: string; }

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

interface TardyMember {
  id: string; name: string; email: string; country: string;
  counts: { minor: number; major: number; awolHalf: number; awolFull: number };
  exceeded: boolean; reasons: string[];
}
interface Thresholds {
  threshold_minor_tardy: number; threshold_major_tardy: number;
  threshold_awol_half: number; threshold_awol_full: number;
}

const MOCK_MEMBERS: TardyMember[] = [
  { id: '1', name: 'Ana Cruz',     email: 'ana@example.com',   country: 'PH', counts: { minor: 4, major: 2, awolHalf: 0, awolFull: 0 }, exceeded: true,  reasons: ['Minor tardy exceeds threshold (4 > 3)'] },
  { id: '2', name: 'Ken Tanaka',   email: 'ken@example.com',   country: 'JP', counts: { minor: 1, major: 0, awolHalf: 0, awolFull: 0 }, exceeded: false, reasons: [] },
  { id: '3', name: 'Maria Santos', email: 'maria@example.com', country: 'PH', counts: { minor: 0, major: 0, awolHalf: 0, awolFull: 0 }, exceeded: false, reasons: [] },
];
const MOCK_THRESHOLDS: Thresholds = { threshold_minor_tardy: 3, threshold_major_tardy: 2, threshold_awol_half: 1, threshold_awol_full: 1 };
const FLAG: Record<string, string> = { PH: '🇵🇭', JP: '🇯🇵' };

export default function TardyPage({ apiUrl }: Props) {
  const [members,    setMembers]    = useState<TardyMember[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [busy,       setBusy]       = useState(false);
  const [awolBusy,   setAwolBusy]   = useState(false);
  const [awolMsg,    setAwolMsg]    = useState<string | null>(null);
  const [awolErr,    setAwolErr]    = useState<string | null>(null);

  useEffect(() => {
    setBusy(true);
    clientFetch(`${apiUrl}/admin/tardy-report`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setMembers(d.members ?? []); setThresholds(d.thresholds ?? null); }
        else   { setMembers(MOCK_MEMBERS); setThresholds(MOCK_THRESHOLDS); }
      })
      .catch(() => { setMembers(MOCK_MEMBERS); setThresholds(MOCK_THRESHOLDS); })
      .finally(() => setBusy(false));
  }, [apiUrl]);

  async function runAwolCheck() {
    setAwolBusy(true); setAwolMsg(null); setAwolErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/admin/run-awol-check`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) { setAwolMsg(data.message ?? `Done — ${data.affected ?? 0} rows affected.`); setTimeout(() => setAwolMsg(null), 4_000); }
      else        { setAwolErr(data.error ?? 'AWOL check failed.'); }
    } catch { setAwolErr('Network error.'); }
    finally { setAwolBusy(false); }
  }

  void F_SERIF;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Tardy &amp; AWOL.</div>
          <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>30-day window · {members.length} members</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {awolMsg && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.green }}>{awolMsg}</span>}
          {awolErr && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.red }}>{awolErr}</span>}
          <button onClick={runAwolCheck} disabled={awolBusy}
            style={{ padding: '8px 16px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 9, fontFamily: F_SANS, fontSize: 13, fontWeight: 500, cursor: awolBusy ? 'not-allowed' : 'pointer', opacity: awolBusy ? 0.6 : 1 }}>
            {awolBusy ? 'Running…' : 'Run AWOL Check'}
          </button>
        </div>
      </div>

      {thresholds && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([['Minor tardy', thresholds.threshold_minor_tardy, C.accent], ['Major tardy', thresholds.threshold_major_tardy, C.red], ['AWOL ½ day', thresholds.threshold_awol_half, C.red], ['AWOL full', thresholds.threshold_awol_full, C.red]] as [string, number, string][]).map(([lbl, v, tint]) => (
            <span key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: `${tint}12`, border: `1px solid ${tint}33`, fontFamily: F_MONO, fontSize: 10.5, color: tint }}>{lbl}: {v}</span>
          ))}
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {busy && <div style={{ padding: 24, fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}
        {!busy && members.length === 0 && <div style={{ padding: 40, textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>No active members.</div>}
        {!busy && members.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                {['Member', 'Country', 'Minor', 'Major', 'AWOL ½', 'AWOL Full', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? `1px solid ${C.border}` : 'none', background: m.exceeded ? C.redSoft : 'transparent' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.name}</div>
                    <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 2 }}>{m.email}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 14 }}>{FLAG[m.country] ?? m.country}</td>
                  {[m.counts.minor, m.counts.major, m.counts.awolHalf, m.counts.awolFull].map((n, ci) => (
                    <td key={ci} style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 13, color: n > 0 ? C.accent : C.text3, fontVariantNumeric: 'tabular-nums' }}>{n}</td>
                  ))}
                  <td style={{ padding: '12px 16px' }}>
                    {m.exceeded
                      ? <span title={m.reasons.join(' · ')} style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 999, background: C.redSoft, border: `1px solid ${C.redBorder}`, fontFamily: F_MONO, fontSize: 10, color: C.red, cursor: 'help' }}>Over threshold</span>
                      : <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3 }}>OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/pages/TardyPage.tsx
git commit -m "feat: add TardyPage admin component"
```

---

## Task 2: HolidaysPage

**Files:**
- Create: `frontend/components/admin/pages/HolidaysPage.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Props { apiUrl: string; adminRole: string; }

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

interface Holiday { id: number; date: string; name: string; country: string; }

const MOCK: Holiday[] = [
  { id: 1, date: '2026-01-01', name: 'New Year\'s Day',  country: 'PH' },
  { id: 2, date: '2026-01-01', name: 'Shōgatsu',         country: 'JP' },
  { id: 3, date: '2026-06-12', name: 'Independence Day', country: 'PH' },
];
const COUNTRIES = ['PH', 'JP'];
const FLAG: Record<string, string> = { PH: '🇵🇭', JP: '🇯🇵' };

export default function HolidaysPage({ apiUrl, adminRole }: Props) {
  const [holidays,  setHolidays]  = useState<Holiday[]>([]);
  const [filter,    setFilter]    = useState<string>('All');
  const [busy,      setBusy]      = useState(false);
  const [addDate,   setAddDate]   = useState('');
  const [addName,   setAddName]   = useState('');
  const [addCountry,setAddCountry]= useState('PH');
  const [addBusy,   setAddBusy]   = useState(false);
  const [addErr,    setAddErr]    = useState<string | null>(null);
  const [deletingId,setDeletingId]= useState<number | null>(null);

  const isOwner = adminRole === 'owner';
  const inp: React.CSSProperties = { padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box' };

  useEffect(() => {
    setBusy(true);
    clientFetch(`${apiUrl}/admin/holidays`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setHolidays(d?.holidays ?? MOCK); })
      .catch(() => setHolidays(MOCK))
      .finally(() => setBusy(false));
  }, [apiUrl]);

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    setAddBusy(true); setAddErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/admin/holidays`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: addDate, name: addName, country: addCountry }) });
      const data = await res.json();
      if (res.ok) { setHolidays(prev => [...prev, data.holiday].sort((a, b) => a.date.localeCompare(b.date))); setAddDate(''); setAddName(''); }
      else        { setAddErr(data.error ?? 'Failed to add holiday.'); }
    } catch { setAddErr('Network error.'); }
    finally { setAddBusy(false); }
  }

  async function deleteHoliday(id: number) {
    setDeletingId(id);
    try {
      const res = await clientFetch(`${apiUrl}/admin/holidays/${id}`, { method: 'DELETE' });
      if (res.ok) setHolidays(prev => prev.filter(h => h.id !== id));
    } catch { /* silent */ }
    finally { setDeletingId(null); }
  }

  const visible = filter === 'All' ? holidays : holidays.filter(h => h.country === filter);

  void F_SERIF;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <div>
        <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Holidays.</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>{holidays.length} total · PH &amp; JP</div>
      </div>

      {/* Country tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {['All', ...COUNTRIES].map(c => (
          <button key={c} onClick={() => setFilter(c)}
            style={{ padding: '5px 14px', borderRadius: 7, background: filter === c ? C.text : 'transparent', color: filter === c ? '#fafafa' : C.text3, border: `1px solid ${filter === c ? C.text : C.border}`, fontFamily: F_SANS, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {c === 'All' ? 'All' : `${FLAG[c]} ${c}`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {busy && <div style={{ padding: 24, fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}
        {!busy && visible.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>No holidays for {filter}.</div>}
        {!busy && visible.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                {['Date', 'Name', 'Country', ...(isOwner ? [''] : [])].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((h, i) => (
                <tr key={h.id} style={{ borderBottom: i < visible.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 12.5, color: C.text2 }}>{h.date}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: C.text, fontWeight: 500 }}>{h.name}</td>
                  <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 13 }}>{FLAG[h.country] ?? h.country} {h.country}</td>
                  {isOwner && (
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      <button onClick={() => deleteHoliday(h.id)} disabled={deletingId === h.id}
                        style={{ padding: '3px 10px', borderRadius: 6, background: 'transparent', border: `1px solid ${C.redBorder}`, fontFamily: F_MONO, fontSize: 10.5, color: C.red, cursor: deletingId === h.id ? 'not-allowed' : 'pointer', opacity: deletingId === h.id ? 0.5 : 1 }}>
                        {deletingId === h.id ? '…' : 'Delete'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add form — owner only */}
        {isOwner && (
          <div style={{ padding: '16px', borderTop: `1px solid ${C.border}`, background: C.surface2 }}>
            {addErr && <div style={{ marginBottom: 8, fontFamily: F_MONO, fontSize: 11, color: C.red }}>{addErr}</div>}
            <form onSubmit={addHoliday} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Date</label>
                <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} required style={inp} />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Name</label>
                <input type="text" value={addName} onChange={e => setAddName(e.target.value)} required placeholder="Holiday name" style={{ ...inp, width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Country</label>
                <select value={addCountry} onChange={e => setAddCountry(e.target.value)} style={inp}>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button type="submit" disabled={addBusy}
                style={{ padding: '7px 16px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: addBusy ? 'not-allowed' : 'pointer', opacity: addBusy ? 0.6 : 1 }}>
                {addBusy ? '…' : '+ Add'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/pages/HolidaysPage.tsx
git commit -m "feat: add HolidaysPage admin component"
```

---

## Task 3: PolicyPage

**Files:**
- Create: `frontend/components/admin/pages/PolicyPage.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Props { apiUrl: string; adminRole: string; }

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

interface Config {
  threshold_minor_tardy: number; threshold_major_tardy: number;
  threshold_awol_half: number; threshold_awol_full: number;
}
const MOCK_CONFIG: Config = { threshold_minor_tardy: 3, threshold_major_tardy: 2, threshold_awol_half: 1, threshold_awol_full: 1 };
const FIELDS: { key: keyof Config; label: string; description: string }[] = [
  { key: 'threshold_minor_tardy', label: 'Minor tardy threshold',  description: 'Days before a minor tardy warning is triggered' },
  { key: 'threshold_major_tardy', label: 'Major tardy threshold',  description: 'Days before a major tardy warning is triggered' },
  { key: 'threshold_awol_half',   label: 'AWOL half-day threshold',description: 'Days before an AWOL half-day warning is triggered' },
  { key: 'threshold_awol_full',   label: 'AWOL full-day threshold',description: 'Days before an AWOL full-day warning is triggered' },
];

export default function PolicyPage({ apiUrl, adminRole }: Props) {
  const [config,  setConfig]  = useState<Config | null>(null);
  const [draft,   setDraft]   = useState<Config | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const isOwner = adminRole === 'owner';

  useEffect(() => {
    setBusy(true);
    clientFetch(`${apiUrl}/admin/policy-config`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { const c = d?.config ?? MOCK_CONFIG; setConfig(c); setDraft({ ...c }); })
      .catch(() => { setConfig(MOCK_CONFIG); setDraft({ ...MOCK_CONFIG }); })
      .finally(() => setBusy(false));
  }, [apiUrl]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !config) return;
    const changes: Partial<Config> = {};
    (Object.keys(draft) as (keyof Config)[]).forEach(k => { if (draft[k] !== config[k]) changes[k] = draft[k]; });
    if (Object.keys(changes).length === 0) { setSaveMsg('No changes to save.'); setTimeout(() => setSaveMsg(null), 3_000); return; }
    setSaving(true); setSaveMsg(null); setSaveErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/admin/policy-config`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      const data = await res.json();
      if (res.ok) { setConfig(data.config); setDraft({ ...data.config }); setSaveMsg('Saved.'); setTimeout(() => setSaveMsg(null), 3_000); }
      else        { setSaveErr(data.error ?? 'Save failed.'); }
    } catch { setSaveErr('Network error.'); }
    finally { setSaving(false); }
  }

  void F_SERIF;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div>
        <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Policy config.</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
          Tardy &amp; AWOL thresholds · {isOwner ? 'Editable' : 'Read-only'}
        </div>
      </div>

      {busy && <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}

      {!busy && draft && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 26px' }}>
          <form onSubmit={save}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {FIELDS.map(({ key, label, description }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: C.text, marginBottom: 3 }}>{label}</label>
                  <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, marginBottom: 8 }}>{description}</div>
                  <input
                    type="number" min={1} required
                    value={draft[key]}
                    onChange={e => setDraft(prev => prev ? { ...prev, [key]: parseInt(e.target.value) || 1 } : prev)}
                    disabled={!isOwner}
                    style={{ padding: '8px 12px', border: `1px solid ${isOwner ? C.border : C.border}`, borderRadius: 8, fontFamily: F_MONO, fontSize: 14, color: C.text, background: isOwner ? C.bg : C.surface2, width: 120, boxSizing: 'border-box' as const }}
                  />
                </div>
              ))}
            </div>

            {isOwner && (
              <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="submit" disabled={saving}
                  style={{ padding: '9px 22px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 9, fontFamily: F_SANS, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saveMsg && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.green }}>{saveMsg}</span>}
                {saveErr && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.red }}>{saveErr}</span>}
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/pages/PolicyPage.tsx
git commit -m "feat: add PolicyPage admin component"
```

---

## Task 4: DisciplinePage

**Files:**
- Create: `frontend/components/admin/pages/DisciplinePage.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Props { apiUrl: string; adminRole: string; }

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

interface DisciplineRecord {
  id: number; user_id: string; reason: string; issued_by: string; issued_at: string;
  voided: boolean; void_reason: string | null; voided_by: string | null; voided_at: string | null;
  acknowledged: boolean; acknowledged_at: string | null;
}
interface DisciplineMember {
  email: string; name: string; totalWarnings: number; activeWarnings: number;
  records: DisciplineRecord[];
}

const MOCK: DisciplineMember[] = [
  { email: 'ana@example.com', name: 'Ana Cruz', totalWarnings: 1, activeWarnings: 1,
    records: [{ id: 1, user_id: '1', reason: 'Repeated tardiness', issued_by: 'admin@example.com', issued_at: '2026-05-15T09:00:00Z', voided: false, void_reason: null, voided_by: null, voided_at: null, acknowledged: false, acknowledged_at: null }] },
  { email: 'ken@example.com', name: 'Ken Tanaka', totalWarnings: 2, activeWarnings: 1,
    records: [
      { id: 2, user_id: '2', reason: 'AWOL without notice', issued_by: 'admin@example.com', issued_at: '2026-04-10T09:00:00Z', voided: false, void_reason: null, voided_by: null, voided_at: null, acknowledged: true, acknowledged_at: '2026-04-11T10:00:00Z' },
      { id: 3, user_id: '2', reason: 'Duplicate entry test', issued_by: 'admin@example.com', issued_at: '2026-03-01T09:00:00Z', voided: true, void_reason: 'Entered in error', voided_by: 'admin@example.com', voided_at: '2026-03-02T09:00:00Z', acknowledged: false, acknowledged_at: null },
    ]},
];

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return iso; }
}

export default function DisciplinePage({ apiUrl, adminRole }: Props) {
  const [members,     setMembers]     = useState<DisciplineMember[]>([]);
  const [busy,        setBusy]        = useState(false);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [issueEmail,  setIssueEmail]  = useState('');
  const [issueReason, setIssueReason] = useState('');
  const [issueBusy,   setIssueBusy]   = useState(false);
  const [issueErr,    setIssueErr]    = useState<string | null>(null);
  const [voidingId,   setVoidingId]   = useState<number | null>(null);
  const [voidReason,  setVoidReason]  = useState('');
  const [voidErr,     setVoidErr]     = useState<string | null>(null);
  const [ackBusy,     setAckBusy]     = useState<number | null>(null);

  const inp: React.CSSProperties = { padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box' };

  function load() {
    setBusy(true);
    clientFetch(`${apiUrl}/discipline/all`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setMembers(d?.members ?? MOCK))
      .catch(() => setMembers(MOCK))
      .finally(() => setBusy(false));
  }
  useEffect(() => { load(); }, [apiUrl]);

  function toggleExpand(email: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(email) ? s.delete(email) : s.add(email); return s; });
  }

  async function issueWarning(e: React.FormEvent) {
    e.preventDefault();
    setIssueBusy(true); setIssueErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/discipline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: issueEmail, reason: issueReason }) });
      const data = await res.json();
      if (res.ok) { setIssueEmail(''); setIssueReason(''); load(); }
      else        { setIssueErr(data.error ?? 'Failed.'); }
    } catch { setIssueErr('Network error.'); }
    finally { setIssueBusy(false); }
  }

  async function voidWarning(id: number) {
    if (!voidReason.trim()) { setVoidErr('Void reason is required.'); return; }
    setVoidErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/discipline/${id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: voidReason }) });
      const data = await res.json();
      if (res.ok) { setVoidingId(null); setVoidReason(''); load(); }
      else        { setVoidErr(data.error ?? 'Void failed.'); }
    } catch { setVoidErr('Network error.'); }
  }

  async function acknowledge(id: number) {
    setAckBusy(id);
    try {
      const res = await clientFetch(`${apiUrl}/discipline/${id}/acknowledge`, { method: 'POST' });
      if (res.ok) load();
    } catch { /* silent */ }
    finally { setAckBusy(null); }
  }

  void F_SERIF;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Discipline.</div>

      {/* Issue warning */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Issue warning</div>
        {issueErr && <div style={{ marginBottom: 10, fontFamily: F_MONO, fontSize: 11, color: C.red }}>{issueErr}</div>}
        <form onSubmit={issueWarning} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Member email</label>
            <input type="email" value={issueEmail} onChange={e => setIssueEmail(e.target.value)} required placeholder="member@example.com" style={{ ...inp, width: 240 }} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Reason</label>
            <input type="text" value={issueReason} onChange={e => setIssueReason(e.target.value)} required placeholder="Brief reason…" style={{ ...inp, width: '100%' }} />
          </div>
          <button type="submit" disabled={issueBusy}
            style={{ padding: '7px 16px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: issueBusy ? 'not-allowed' : 'pointer', opacity: issueBusy ? 0.6 : 1 }}>
            {issueBusy ? '…' : 'Issue warning'}
          </button>
        </form>
      </div>

      {/* Member accordion */}
      {busy && <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}
      {!busy && members.filter(m => m.totalWarnings > 0).length === 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px', textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>No discipline records.</div>
      )}
      {!busy && members.filter(m => m.totalWarnings > 0).map(m => {
        const isOpen = expanded.has(m.email);
        return (
          <div key={m.email} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {/* Accordion header */}
            <button onClick={() => toggleExpand(m.email)} style={{ width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{m.name}</div>
                <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 2 }}>{m.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {m.activeWarnings > 0 && (
                  <span style={{ padding: '2px 9px', borderRadius: 999, background: C.redSoft, border: `1px solid ${C.redBorder}`, fontFamily: F_MONO, fontSize: 10, color: C.red }}>{m.activeWarnings} active</span>
                )}
                <span style={{ padding: '2px 9px', borderRadius: 999, background: C.surface2, border: `1px solid ${C.border}`, fontFamily: F_MONO, fontSize: 10, color: C.text3 }}>{m.totalWarnings} total</span>
                <span style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Expanded records */}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {m.records.map((r, ri) => {
                  const status = r.voided ? 'Voided' : r.acknowledged ? 'Acknowledged' : 'Active';
                  const statusColor = r.voided ? C.text3 : r.acknowledged ? C.green : C.red;
                  return (
                    <div key={r.id} style={{ padding: '14px 20px', borderBottom: ri < m.records.length - 1 ? `1px solid ${C.border}` : 'none', background: r.voided ? C.surface2 : 'transparent' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: r.voided ? C.text3 : C.text, fontStyle: r.voided ? 'italic' : 'normal' }}>{r.reason}</div>
                          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 4 }}>
                            Issued by {r.issued_by} · {fmtDate(r.issued_at)}
                          </div>
                          {r.voided && r.void_reason && (
                            <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 2 }}>Voided: {r.void_reason}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ padding: '2px 9px', borderRadius: 999, fontFamily: F_MONO, fontSize: 10, color: statusColor, background: `${statusColor}12`, border: `1px solid ${statusColor}33` }}>{status}</span>
                          {!r.voided && !r.acknowledged && (
                            <button onClick={() => acknowledge(r.id)} disabled={ackBusy === r.id}
                              style={{ padding: '3px 10px', borderRadius: 6, background: 'transparent', border: `1px solid ${C.greenBorder}`, fontFamily: F_MONO, fontSize: 10.5, color: C.green, cursor: ackBusy === r.id ? 'not-allowed' : 'pointer' }}>
                              {ackBusy === r.id ? '…' : 'Acknowledge'}
                            </button>
                          )}
                          {!r.voided && (
                            <button onClick={() => { setVoidingId(voidingId === r.id ? null : r.id); setVoidReason(''); setVoidErr(null); }}
                              style={{ padding: '3px 10px', borderRadius: 6, background: 'transparent', border: `1px solid ${C.border}`, fontFamily: F_MONO, fontSize: 10.5, color: C.text3, cursor: 'pointer' }}>
                              {voidingId === r.id ? 'Cancel' : 'Void'}
                            </button>
                          )}
                        </div>
                      </div>
                      {voidingId === r.id && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                          {voidErr && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.red }}>{voidErr}</span>}
                          <input type="text" value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Void reason (required)…"
                            style={{ flex: 1, padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, color: C.text, background: C.bg }} />
                          <button onClick={() => voidWarning(r.id)}
                            style={{ padding: '6px 14px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                            Confirm void
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/pages/DisciplinePage.tsx
git commit -m "feat: add DisciplinePage admin component"
```

---

## Task 5: AppealsAdminPage

**Files:**
- Create: `frontend/components/admin/pages/AppealsAdminPage.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Props { apiUrl: string; adminRole: string; onPendingCount?: (n: number) => void; }

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

interface Appeal {
  id: number; user_id: string; target_type: string; target_id: string;
  reason: string; status: string; resolution_note: string | null;
  resolved_by: string | null; resolved_at: string | null; created_at: string;
  email: string | null; name: string | null;
}

const MOCK: Appeal[] = [
  { id: 1, user_id: '1', target_type: 'attendance', target_id: '2026-06-01', reason: 'I was physically present but the system did not record it.', status: 'Pending', resolution_note: null, resolved_by: null, resolved_at: null, created_at: '2026-06-01T08:30:00Z', email: 'ana@example.com', name: 'Ana Cruz' },
  { id: 2, user_id: '2', target_type: 'leave',      target_id: '5',          reason: 'I had a documented medical emergency.', status: 'Pending', resolution_note: null, resolved_by: null, resolved_at: null, created_at: '2026-05-28T10:00:00Z', email: 'ken@example.com', name: 'Ken Tanaka' },
  { id: 3, user_id: '3', target_type: 'attendance', target_id: '2026-05-20', reason: 'Connectivity issue at the time.', status: 'Approved', resolution_note: 'Verified with manager.', resolved_by: 'admin@example.com', resolved_at: '2026-05-21T09:00:00Z', created_at: '2026-05-20T11:00:00Z', email: 'maria@example.com', name: 'Maria Santos' },
  { id: 4, user_id: '1', target_type: 'discipline', target_id: '1',          reason: 'The warning was issued unfairly.', status: 'Rejected', resolution_note: 'Records confirm the infraction.', resolved_by: 'admin@example.com', resolved_at: '2026-05-15T14:00:00Z', created_at: '2026-05-14T09:00:00Z', email: 'ana@example.com', name: 'Ana Cruz' },
];

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return iso; }
}

const TYPE_COLOR: Record<string, string> = { attendance: '#2563eb', leave: '#7c3aed', discipline: '#dc2626' };
const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string }> = {
  Pending:  { bg: 'rgba(180,83,9,0.08)',  border: 'rgba(180,83,9,0.25)',  text: '#b45309' },
  Approved: { bg: 'rgba(22,163,74,0.08)', border: 'rgba(22,163,74,0.25)', text: '#16a34a' },
  Rejected: { bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.22)', text: '#dc2626' },
};

export default function AppealsAdminPage({ apiUrl, onPendingCount }: Props) {
  const [appeals,    setAppeals]    = useState<Appeal[]>([]);
  const [busy,       setBusy]       = useState(false);
  const [tab,        setTab]        = useState<'Pending'|'Approved'|'Rejected'>('Pending');
  const [resolvingId,setResolvingId]= useState<number | null>(null);
  const [outcome,    setOutcome]    = useState<'Approved'|'Rejected'>('Approved');
  const [note,       setNote]       = useState('');
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [resolveBusy,setResolveBusy]= useState(false);

  function load() {
    setBusy(true);
    clientFetch(`${apiUrl}/appeals/all`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list: Appeal[] = d?.appeals ?? MOCK;
        setAppeals(list);
        onPendingCount?.(list.filter(a => a.status === 'Pending').length);
      })
      .catch(() => { setAppeals(MOCK); onPendingCount?.(MOCK.filter(a => a.status === 'Pending').length); })
      .finally(() => setBusy(false));
  }
  useEffect(() => { load(); }, [apiUrl]);

  async function resolve(id: number) {
    if (!note.trim()) { setResolveErr('Note is required.'); return; }
    setResolveBusy(true); setResolveErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/appeals/${id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome, note }) });
      const data = await res.json();
      if (res.ok) { setResolvingId(null); setNote(''); load(); }
      else        { setResolveErr(data.error ?? 'Resolve failed.'); }
    } catch { setResolveErr('Network error.'); }
    finally { setResolveBusy(false); }
  }

  const visible = appeals.filter(a => a.status === tab);

  void F_SERIF;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Appeals.</div>
          <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
            {appeals.filter(a => a.status === 'Pending').length} pending
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['Pending', 'Approved', 'Rejected'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '5px 14px', borderRadius: 7, background: tab === t ? C.text : 'transparent', color: tab === t ? '#fafafa' : C.text3, border: `1px solid ${tab === t ? C.text : C.border}`, fontFamily: F_SANS, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              {t} <span style={{ fontFamily: F_MONO, fontSize: 10, opacity: 0.7 }}>{appeals.filter(a => a.status === t).length}</span>
            </button>
          ))}
        </div>
      </div>

      {busy && <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}
      {!busy && visible.length === 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px', textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>No {tab.toLowerCase()} appeals.</div>
      )}

      {!busy && visible.map(a => {
        const sc = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.Pending;
        const tc = TYPE_COLOR[a.target_type] ?? C.text2;
        const isResolving = resolvingId === a.id;
        return (
          <div key={a.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{a.name ?? a.email}</span>
                  <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3 }}>{a.email}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 999, background: `${tc}12`, border: `1px solid ${tc}33`, fontFamily: F_MONO, fontSize: 10, color: tc, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{a.target_type}</span>
                  <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3 }}>#{a.target_id}</span>
                  <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3 }}>{fmtDate(a.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: C.text2, fontStyle: 'italic' }}>&ldquo;{a.reason}&rdquo;</div>
                {a.resolution_note && (
                  <div style={{ marginTop: 8, fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>Note: {a.resolution_note}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ padding: '2px 9px', borderRadius: 999, background: sc.bg, border: `1px solid ${sc.border}`, fontFamily: F_MONO, fontSize: 10, color: sc.text }}>{a.status}</span>
                {a.status === 'Pending' && (
                  <button onClick={() => { setResolvingId(isResolving ? null : a.id); setResolveErr(null); setNote(''); setOutcome('Approved'); }}
                    style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12, color: C.text2, cursor: 'pointer' }}>
                    {isResolving ? 'Cancel' : 'Resolve'}
                  </button>
                )}
              </div>
            </div>
            {isResolving && (
              <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, background: C.surface2 }}>
                {resolveErr && <div style={{ marginBottom: 8, fontFamily: F_MONO, fontSize: 11, color: C.red }}>{resolveErr}</div>}
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Outcome</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['Approved', 'Rejected'] as const).map(o => (
                        <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: F_SANS, fontSize: 12.5, color: outcome === o ? C.text : C.text3 }}>
                          <input type="radio" checked={outcome === o} onChange={() => setOutcome(o)} style={{ accentColor: o === 'Approved' ? C.green : C.red }} />
                          {o}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Note (required)</label>
                    <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Resolution note…"
                      style={{ width: '100%', padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box' as const }} />
                  </div>
                  <button onClick={() => resolve(a.id)} disabled={resolveBusy}
                    style={{ padding: '7px 16px', background: outcome === 'Approved' ? C.green : C.red, color: '#0a0a0a', border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 600, cursor: resolveBusy ? 'not-allowed' : 'pointer', opacity: resolveBusy ? 0.6 : 1 }}>
                    {resolveBusy ? '…' : `Confirm ${outcome}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/pages/AppealsAdminPage.tsx
git commit -m "feat: add AppealsAdminPage admin component"
```

---

## Task 6: AuditLogPage

**Files:**
- Create: `frontend/components/admin/pages/AuditLogPage.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Props { apiUrl: string; adminRole: string; }

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

interface AuditItem { id: number; occurred_at: string; actor_email: string; action: string; details: Record<string, unknown> | null; }

const MOCK: AuditItem[] = [
  { id: 5, occurred_at: '2026-06-01T09:00:00Z', actor_email: 'admin@example.com', action: 'ATTENDANCE_APPROVED', details: { target_id: 42 } },
  { id: 4, occurred_at: '2026-05-31T16:30:00Z', actor_email: 'owner@example.com',  action: 'POLICY_UPDATED',      details: { key: 'threshold_minor_tardy', new_value: 3 } },
  { id: 3, occurred_at: '2026-05-30T11:00:00Z', actor_email: 'admin@example.com', action: 'LEAVE_APPROVED',       details: { target_id: 7 } },
  { id: 2, occurred_at: '2026-05-29T08:45:00Z', actor_email: 'owner@example.com',  action: 'MEMBER_PROMOTED',     details: { target_email: 'ana@example.com' } },
  { id: 1, occurred_at: '2026-05-28T14:00:00Z', actor_email: 'admin@example.com', action: 'ATTENDANCE_REJECTED',  details: { target_id: 39 } },
];

function fmtDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return iso; }
}

export default function AuditLogPage({ apiUrl, adminRole }: Props) {
  const [items,      setItems]      = useState<AuditItem[]>([]);
  const [busy,       setBusy]       = useState(false);
  const [page,       setPage]       = useState(1);
  const [total,      setTotal]      = useState(0);
  const PAGE_SIZE = 50;
  const [filterActor,  setFilterActor]  = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');
  const [expanded,     setExpanded]     = useState<Set<number>>(new Set());
  const [purgeBefore,  setPurgeBefore]  = useState('');
  const [purgeBusy,    setPurgeBusy]    = useState(false);
  const [purgeMsg,     setPurgeMsg]     = useState<string | null>(null);
  const [purgeErr,     setPurgeErr]     = useState<string | null>(null);

  const isOwner = adminRole === 'owner';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inp: React.CSSProperties = { padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_MONO, fontSize: 11.5, color: C.text, background: C.bg, boxSizing: 'border-box' };

  function buildUrl(p: number) {
    const params = new URLSearchParams({ page: String(p) });
    if (filterActor)  params.set('actor',  filterActor);
    if (filterAction) params.set('action', filterAction);
    if (filterFrom)   params.set('from',   filterFrom);
    if (filterTo)     params.set('to',     filterTo);
    return `${apiUrl}/audit?${params}`;
  }

  function load(p = 1) {
    setBusy(true);
    clientFetch(buildUrl(p))
      .then(r => r.ok ? r.json() : null)
      .then(d => { setItems(d?.items ?? MOCK); setTotal(d?.total ?? MOCK.length); })
      .catch(() => { setItems(MOCK); setTotal(MOCK.length); })
      .finally(() => setBusy(false));
  }
  useEffect(() => { load(page); }, [page, apiUrl]);

  function applyFilters(e: React.FormEvent) { e.preventDefault(); setPage(1); load(1); }

  function toggleExpand(id: number) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function purge(e: React.FormEvent) {
    e.preventDefault();
    setPurgeBusy(true); setPurgeMsg(null); setPurgeErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/audit?before=${encodeURIComponent(purgeBefore)}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) { setPurgeMsg(`Purged ${data.rows_deleted ?? 0} rows before ${purgeBefore}.`); setPurgeBefore(''); load(1); }
      else        { setPurgeErr(data.error ?? 'Purge failed.'); }
    } catch { setPurgeErr('Network error.'); }
    finally { setPurgeBusy(false); }
  }

  void F_SERIF;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200 }}>
      <div>
        <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Audit log.</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>{total} entries · 50 per page</div>
      </div>

      {/* Filter bar */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 20px' }}>
        <form onSubmit={applyFilters} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Actor email</label>
            <input value={filterActor} onChange={e => setFilterActor(e.target.value)} placeholder="email…" style={{ ...inp, width: 180 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Action</label>
            <input value={filterAction} onChange={e => setFilterAction(e.target.value)} placeholder="ATTENDANCE_APPROVED…" style={{ ...inp, width: 200 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>From</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>To</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={inp} />
          </div>
          <button type="submit" style={{ padding: '7px 16px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Apply</button>
          <button type="button" onClick={() => { setFilterActor(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); setPage(1); setTimeout(() => load(1), 0); }}
            style={{ padding: '7px 14px', background: 'transparent', color: C.text3, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, cursor: 'pointer' }}>Clear</button>
        </form>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {busy && <div style={{ padding: 24, fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}
        {!busy && items.length === 0 && <div style={{ padding: 40, textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>No log entries match the filter.</div>}
        {!busy && items.length > 0 && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                  {['Time', 'Actor', 'Action', 'Details'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const isExpanded = expanded.has(item.id);
                  return (
                    <tr key={item.id} onClick={() => item.details && toggleExpand(item.id)}
                      style={{ borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none', cursor: item.details ? 'pointer' : 'default' }}>
                      <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 11.5, color: C.text3, whiteSpace: 'nowrap' }}>{fmtDateTime(item.occurred_at)}</td>
                      <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 11.5, color: C.text2 }}>{item.actor_email}</td>
                      <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 11.5, color: C.text }}>{item.action}</td>
                      <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>
                        {item.details && (
                          isExpanded
                            ? <pre style={{ margin: 0, fontSize: 10.5, background: C.surface2, padding: '6px 10px', borderRadius: 6, overflowX: 'auto' }}>{JSON.stringify(item.details, null, 2)}</pre>
                            : <span>{JSON.stringify(item.details).slice(0, 60)}{JSON.stringify(item.details).length > 60 ? '…' : ''}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Pagination */}
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, background: C.surface2, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: F_SANS, fontSize: 12, color: C.text2, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>← Prev</button>
              <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: F_SANS, fontSize: 12, color: C.text2, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>Next →</button>
            </div>
          </>
        )}
      </div>

      {/* Purge section — owner only */}
      {isOwner && (
        <div style={{ background: C.surface, border: `1px solid ${C.redBorder}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.red, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Purge old logs</div>
          {purgeMsg && <div style={{ marginBottom: 8, fontFamily: F_MONO, fontSize: 11, color: C.green }}>{purgeMsg}</div>}
          {purgeErr && <div style={{ marginBottom: 8, fontFamily: F_MONO, fontSize: 11, color: C.red }}>{purgeErr}</div>}
          <form onSubmit={purge} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Delete entries before</label>
              <input type="date" value={purgeBefore} onChange={e => setPurgeBefore(e.target.value)} required style={inp} />
            </div>
            <button type="submit" disabled={purgeBusy}
              style={{ padding: '7px 16px', background: C.red, color: '#fafafa', border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: purgeBusy ? 'not-allowed' : 'pointer', opacity: purgeBusy ? 0.6 : 1 }}>
              {purgeBusy ? 'Purging…' : 'Purge'}
            </button>
          </form>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 8 }}>Must be at least 24 hours in the past. Irreversible.</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/pages/AuditLogPage.tsx
git commit -m "feat: add AuditLogPage admin component"
```

---

## Task 7: LeaveBalancesPage

**Files:**
- Create: `frontend/components/admin/pages/LeaveBalancesPage.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Props { apiUrl: string; adminRole: string; }

const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

interface BalanceMember {
  email: string; name: string; hire_year: number;
  grantsEarned: number; used: number; adjustments: number; balance: number;
}

const MOCK: BalanceMember[] = [
  { email: 'ana@example.com',   name: 'Ana Cruz',     hire_year: 2023, grantsEarned: 15, used: 5,  adjustments: 0,  balance: 10 },
  { email: 'ken@example.com',   name: 'Ken Tanaka',   hire_year: 2022, grantsEarned: 15, used: 12, adjustments: 2,  balance: 5  },
  { email: 'maria@example.com', name: 'Maria Santos', hire_year: 2024, grantsEarned: 10, used: 0,  adjustments: 0,  balance: 10 },
];

export default function LeaveBalancesPage({ apiUrl, adminRole }: Props) {
  const [members,     setMembers]     = useState<BalanceMember[]>([]);
  const [busy,        setBusy]        = useState(false);
  const [adjustingEmail, setAdjustingEmail] = useState<string | null>(null);
  const [adjAmount,   setAdjAmount]   = useState('');
  const [adjNote,     setAdjNote]     = useState('');
  const [adjBusy,     setAdjBusy]     = useState(false);
  const [adjErr,      setAdjErr]      = useState<string | null>(null);

  const inp: React.CSSProperties = { padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, color: C.text, background: C.bg, boxSizing: 'border-box' };

  function load() {
    setBusy(true);
    clientFetch(`${apiUrl}/leave-balance/all`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setMembers(d?.members ?? MOCK))
      .catch(() => setMembers(MOCK))
      .finally(() => setBusy(false));
  }
  useEffect(() => { load(); }, [apiUrl]);

  async function submitAdjust(email: string, e: React.FormEvent) {
    e.preventDefault();
    const amt = parseInt(adjAmount);
    if (!Number.isInteger(amt) || amt === 0) { setAdjErr('Amount must be a non-zero integer.'); return; }
    if (!adjNote.trim()) { setAdjErr('Note is required.'); return; }
    setAdjBusy(true); setAdjErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/leave-balance/adjust`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, amount: amt, note: adjNote }) });
      const data = await res.json();
      if (res.ok) { setAdjustingEmail(null); setAdjAmount(''); setAdjNote(''); load(); }
      else        { setAdjErr(data.error ?? 'Adjust failed.'); }
    } catch { setAdjErr('Network error.'); }
    finally { setAdjBusy(false); }
  }

  const totals = members.reduce((acc, m) => ({
    grantsEarned: acc.grantsEarned + m.grantsEarned,
    used: acc.used + m.used,
    adjustments: acc.adjustments + m.adjustments,
    balance: acc.balance + m.balance,
  }), { grantsEarned: 0, used: 0, adjustments: 0, balance: 0 });

  void F_SERIF;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div>
        <div style={{ fontFamily: F_SERIF, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Leave balances.</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>{members.length} members · current year</div>
      </div>

      {busy && <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>Loading…</div>}

      {!busy && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                {['Member', 'Hire year', 'Grants earned', 'Used', 'Adjustments', 'Balance', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const isAdj = adjustingEmail === m.email;
                return (
                  <>
                    <tr key={m.email} style={{ borderBottom: isAdj ? 'none' : i < members.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.name}</div>
                        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 1 }}>{m.email}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: C.text2 }}>{m.hire_year}</td>
                      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{m.grantsEarned}</td>
                      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: C.text2, fontVariantNumeric: 'tabular-nums' }}>{m.used}</td>
                      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 12.5, color: m.adjustments > 0 ? C.green : m.adjustments < 0 ? C.red : C.text3, fontVariantNumeric: 'tabular-nums' }}>
                        {m.adjustments > 0 ? `+${m.adjustments}` : m.adjustments}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: F_MONO, fontSize: 13, fontWeight: 600, color: m.balance <= 0 ? C.red : m.balance <= 3 ? C.accent : C.green, fontVariantNumeric: 'tabular-nums' }}>{m.balance}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button onClick={() => { setAdjustingEmail(isAdj ? null : m.email); setAdjAmount(''); setAdjNote(''); setAdjErr(null); }}
                          style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: F_MONO, fontSize: 10.5, color: C.text2, cursor: 'pointer' }}>
                          {isAdj ? 'Cancel' : 'Adjust'}
                        </button>
                      </td>
                    </tr>
                    {isAdj && (
                      <tr key={`${m.email}-adj`} style={{ borderBottom: i < members.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <td colSpan={7} style={{ padding: '12px 16px', background: C.surface2 }}>
                          {adjErr && <div style={{ marginBottom: 8, fontFamily: F_MONO, fontSize: 11, color: C.red }}>{adjErr}</div>}
                          <form onSubmit={e => submitAdjust(m.email, e)} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div>
                              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Amount (±)</label>
                              <input type="number" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} required placeholder="+2 or -1" style={{ ...inp, width: 100 }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 200 }}>
                              <label style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Note</label>
                              <input type="text" value={adjNote} onChange={e => setAdjNote(e.target.value)} required placeholder="Reason for adjustment…" style={{ ...inp, width: '100%' }} />
                            </div>
                            <button type="submit" disabled={adjBusy}
                              style={{ padding: '7px 14px', background: C.text, color: '#fafafa', border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: adjBusy ? 'not-allowed' : 'pointer', opacity: adjBusy ? 0.6 : 1 }}>
                              {adjBusy ? '…' : 'Submit'}
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {/* Totals row */}
              {members.length > 0 && (
                <tr style={{ borderTop: `1.5px solid ${C.text}`, background: C.surface2 }}>
                  <td style={{ padding: '10px 16px', fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' }} colSpan={2}>Totals</td>
                  <td style={{ padding: '10px 16px', fontFamily: F_MONO, fontSize: 12.5, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{totals.grantsEarned}</td>
                  <td style={{ padding: '10px 16px', fontFamily: F_MONO, fontSize: 12.5, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{totals.used}</td>
                  <td style={{ padding: '10px 16px', fontFamily: F_MONO, fontSize: 12.5, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{totals.adjustments > 0 ? `+${totals.adjustments}` : totals.adjustments}</td>
                  <td style={{ padding: '10px 16px', fontFamily: F_MONO, fontSize: 12.5, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{totals.balance}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/pages/LeaveBalancesPage.tsx
git commit -m "feat: add LeaveBalancesPage admin component"
```

---

## Task 8: Wire everything into AdminDashboard

**Files:**
- Modify: `frontend/components/admin/AdminDashboard.tsx`

- [ ] **Step 1: Add 7 imports after the existing import block**

After line `import MembersPage from './pages/MembersPage';`, add:

```ts
import TardyPage        from './pages/TardyPage';
import HolidaysPage     from './pages/HolidaysPage';
import PolicyPage       from './pages/PolicyPage';
import DisciplinePage   from './pages/DisciplinePage';
import AppealsAdminPage from './pages/AppealsAdminPage';
import AuditLogPage     from './pages/AuditLogPage';
import LeaveBalancesPage from './pages/LeaveBalancesPage';
```

- [ ] **Step 2: Extend the Page type**

Replace:
```ts
type Page = 'attendance' | 'approvals' | 'leave' | 'calendar' | 'payroll' | 'insights' | 'members';
```
With:
```ts
type Page = 'attendance' | 'approvals' | 'leave' | 'calendar' | 'payroll' | 'insights' | 'members'
          | 'tardy' | 'holidays' | 'policy' | 'discipline' | 'appeals-admin' | 'audit' | 'leave-balances';
```

- [ ] **Step 3: Replace NAV_GROUPS**

Replace the entire `const NAV_GROUPS = [...]` block with:

```ts
const NAV_GROUPS = [
  { label: 'Overview',   items: [
    { id: 'attendance'    as Page, label: 'Attendance',     icon: '◉', badge: null },
    { id: 'insights'      as Page, label: 'Reports',        icon: '▤', badge: null },
  ]},
  { label: 'Management', items: [
    { id: 'approvals'     as Page, label: 'Approvals',      icon: '✓', badge: 'pending' as const },
    { id: 'leave'         as Page, label: 'Leave requests', icon: '⌇', badge: 'leave'   as const },
    { id: 'tardy'         as Page, label: 'Tardy & AWOL',   icon: '⏱', badge: null },
    { id: 'discipline'    as Page, label: 'Discipline',     icon: '⚑', badge: null },
    { id: 'appeals-admin' as Page, label: 'Appeals',        icon: '⟳', badge: 'appeals' as const },
  ]},
  { label: 'Company',    items: [
    { id: 'calendar'       as Page, label: 'Calendar',       icon: '▦', badge: null },
    { id: 'payroll'        as Page, label: 'Payroll',        icon: '¥', badge: null },
    { id: 'members'        as Page, label: 'Members',        icon: '⊞', badge: null },
    { id: 'holidays'       as Page, label: 'Holidays',       icon: '✦', badge: null },
    { id: 'leave-balances' as Page, label: 'Leave balances', icon: '◈', badge: null },
  ]},
  { label: 'Settings',   items: [
    { id: 'policy' as Page, label: 'Policy config', icon: '⚙', badge: null },
    { id: 'audit'  as Page, label: 'Audit log',     icon: '≡', badge: null },
  ]},
];
```

- [ ] **Step 4: Add `pendingAppeals` state and update badge rendering**

After `const [dashData, setDashData] = useState<DashboardData | null>(dashboard);`, add:

```ts
const [pendingAppeals, setPendingAppeals] = useState(0);
```

In the badge rendering inside the nav button (currently `const badge = it.badge === 'pending' ? pendingCount : null;`), replace with:

```ts
const badge = it.badge === 'pending' ? pendingCount : it.badge === 'appeals' ? pendingAppeals : null;
```

- [ ] **Step 5: Add 7 render conditions in the page content area**

After `{page === 'members' && <MembersPage apiUrl={apiUrl} adminRole={adminRole} />}`, add:

```tsx
{page === 'tardy'         && <TardyPage         apiUrl={apiUrl} adminRole={adminRole} />}
{page === 'holidays'      && <HolidaysPage       apiUrl={apiUrl} adminRole={adminRole} />}
{page === 'policy'        && <PolicyPage         apiUrl={apiUrl} adminRole={adminRole} />}
{page === 'discipline'    && <DisciplinePage     apiUrl={apiUrl} adminRole={adminRole} />}
{page === 'appeals-admin' && <AppealsAdminPage   apiUrl={apiUrl} adminRole={adminRole} onPendingCount={setPendingAppeals} />}
{page === 'audit'         && <AuditLogPage       apiUrl={apiUrl} adminRole={adminRole} />}
{page === 'leave-balances'&& <LeaveBalancesPage  apiUrl={apiUrl} adminRole={adminRole} />}
```

- [ ] **Step 6: TypeScript check**

```bash
cd /home/erwindev/Attendance/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Run full backend test suite**

```bash
cd /home/erwindev/Attendance && npm test
```
Expected: all 308+ tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/admin/AdminDashboard.tsx
git commit -m "feat: wire 7 new admin pages into sidebar nav and routing"
```

- [ ] **Step 9: Push**

```bash
git push origin main
```
