'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';
import { C, F_SERIF, F_SANS, F_MONO } from '../../theme';

interface Props { apiUrl: string; adminRole: string; }

interface Holiday { id: number; date: string; name: string; country: string; source?: string; }

const MOCK: Holiday[] = [
  { id: 1, date: '2026-01-01', name: "New Year's Day",  country: 'PH' },
  { id: 2, date: '2026-01-01', name: 'Shōgatsu',         country: 'JP' },
  { id: 3, date: '2026-06-12', name: 'Independence Day', country: 'PH' },
];
const COUNTRIES = ['PH', 'JP'];
const FLAG: Record<string, string> = { PH: '🇵🇭', JP: '🇯🇵' };

export default function HolidaysPage({ apiUrl, adminRole }: Props) {
  const [holidays,   setHolidays]   = useState<Holiday[]>([]);
  const [filter,     setFilter]     = useState<string>('All');
  const [busy,       setBusy]       = useState(false);
  const [addDate,    setAddDate]    = useState('');
  const [addName,    setAddName]    = useState('');
  const [addCountry, setAddCountry] = useState('PH');
  const [addBusy,    setAddBusy]    = useState(false);
  const [addErr,     setAddErr]     = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const SYNC_COUNTRIES = [
    { code: 'PH', name: 'Philippines' }, { code: 'JP', name: 'Japan' },
    { code: 'TH', name: 'Thailand' },    { code: 'MM', name: 'Myanmar' },
    { code: 'IN', name: 'India' },       { code: 'BD', name: 'Bangladesh' },
    { code: 'MY', name: 'Malaysia' },
  ];
  const [syncCountry, setSyncCountry] = useState('PH');
  const [syncYear,    setSyncYear]    = useState(new Date().getFullYear());
  const [syncBusy,    setSyncBusy]    = useState(false);
  const [syncMsg,     setSyncMsg]     = useState<string | null>(null);
  const [syncErr,     setSyncErr]     = useState<string | null>(null);

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

  async function syncHolidays() {
    setSyncBusy(true); setSyncMsg(null); setSyncErr(null);
    try {
      const res = await clientFetch(`${apiUrl}/admin/holidays/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: syncCountry, year: syncYear }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncMsg(`Imported ${data.imported} holiday${data.imported === 1 ? '' : 's'} for ${syncCountry} ${syncYear}.`);
        const list = await clientFetch(`${apiUrl}/admin/holidays`).then(r => r.json());
        setHolidays(list?.holidays ?? []);
      } else {
        setSyncErr(data.error ?? 'Sync failed.');
      }
    } catch {
      setSyncErr('Network error.');
    } finally {
      setSyncBusy(false);
    }
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <div>
        <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Holidays.</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>{holidays.length} total · PH &amp; JP</div>
      </div>

      {/* Country tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {['All', ...COUNTRIES].map(c => (
          <button key={c} onClick={() => setFilter(c)}
            style={{ padding: '5px 14px', borderRadius: 7, background: filter === c ? C.btnBg : 'transparent', color: filter === c ? C.btnText : C.text3, border: `1px solid ${filter === c ? C.btnBg : C.border}`, fontFamily: F_SANS, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {c === 'All' ? 'All' : `${FLAG[c]} ${c}`}
          </button>
        ))}
      </div>

      {/* Sync panel */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
          Sync official holidays
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={syncCountry} onChange={e => setSyncCountry(e.target.value)}
            style={{ padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: F_SANS, fontSize: 13, color: C.text, background: C.surface }}>
            {SYNC_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
          </select>
          <input type="number" value={syncYear} onChange={e => setSyncYear(parseInt(e.target.value, 10) || syncYear)}
            style={{ padding: '7px 10px', width: 90, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: F_MONO, fontSize: 13, color: C.text, background: C.surface }} />
          <button onClick={syncHolidays} disabled={syncBusy}
            style={{ padding: '7px 14px', background: C.btnBg, color: C.btnText, border: 'none', borderRadius: 8, fontFamily: F_SANS, fontSize: 13, fontWeight: 500, cursor: syncBusy ? 'not-allowed' : 'pointer', opacity: syncBusy ? 0.6 : 1 }}>
            {syncBusy ? 'Syncing…' : 'Sync'}
          </button>
          {syncMsg && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.green }}>{syncMsg}</span>}
          {syncErr && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.red }}>{syncErr}</span>}
        </div>
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
                  <td style={{ padding: '11px 16px', fontSize: 13, color: C.text, fontWeight: 500 }}>
                    {h.name}
                    <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 999, fontFamily: F_MONO, fontSize: 9, letterSpacing: '0.06em',
                      background: h.source === 'auto' ? C.surface2 : C.blueSoft,
                      color: h.source === 'auto' ? C.text3 : C.blue,
                      border: `1px solid ${h.source === 'auto' ? C.border : C.blueBorder}` }}>
                      {h.source === 'auto' ? 'AUTO' : 'MANUAL'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 13, color: C.text }}>{FLAG[h.country] ?? h.country} {h.country}</td>
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
                style={{ padding: '7px 16px', background: C.btnBg, color: C.btnText, border: 'none', borderRadius: 7, fontFamily: F_SANS, fontSize: 12.5, fontWeight: 500, cursor: addBusy ? 'not-allowed' : 'pointer', opacity: addBusy ? 0.6 : 1 }}>
                {addBusy ? '…' : '+ Add'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
