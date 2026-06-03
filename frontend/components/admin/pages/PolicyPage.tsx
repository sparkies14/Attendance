'use client';
import { useState, useEffect } from 'react';
import { clientFetch } from '@/lib/clientFetch';
import { C, F_SERIF, F_SANS, F_MONO } from '../../theme';

interface Props { apiUrl: string; adminRole: string; }

interface Config {
  threshold_minor_tardy: number; threshold_major_tardy: number;
  threshold_awol_half: number; threshold_awol_full: number;
}
const MOCK_CONFIG: Config = { threshold_minor_tardy: 3, threshold_major_tardy: 2, threshold_awol_half: 1, threshold_awol_full: 1 };
const FIELDS: { key: keyof Config; label: string; description: string }[] = [
  { key: 'threshold_minor_tardy', label: 'Minor tardy threshold',   description: 'Days before a minor tardy warning is triggered' },
  { key: 'threshold_major_tardy', label: 'Major tardy threshold',   description: 'Days before a major tardy warning is triggered' },
  { key: 'threshold_awol_half',   label: 'AWOL half-day threshold', description: 'Days before an AWOL half-day warning is triggered' },
  { key: 'threshold_awol_full',   label: 'AWOL full-day threshold', description: 'Days before an AWOL full-day warning is triggered' },
];

export default function PolicyPage({ apiUrl, adminRole }: Props) {
  const [config,  setConfig]  = useState<Config | null>(null);
  const [draft,   setDraft]   = useState<Config | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [lateManual, setLateManual] = useState<boolean>(true);
  const [toggleBusy, setToggleBusy] = useState(false);

  const isOwner = adminRole === 'owner';

  useEffect(() => {
    setBusy(true);
    clientFetch(`${apiUrl}/admin/policy-config`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { const c = d?.config ?? MOCK_CONFIG; setConfig(c); setDraft({ ...c }); setLateManual(d?.lateManualRequired ?? true); })
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

  async function toggleLateManual() {
    setToggleBusy(true);
    setSaveErr(null);
    try {
      const next = !lateManual;
      const res  = await clientFetch(`${apiUrl}/admin/policy-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ late_manual_required: next ? 'on' : 'off' }),
      });
      const d = await res.json();
      if (!res.ok) { setSaveErr(d.error ?? 'Failed to update.'); }
      else { setLateManual(d.lateManualRequired ?? next); setSaveMsg(`Late manual approval ${next ? 'enabled' : 'disabled'}.`); setTimeout(() => setSaveMsg(null), 3_000); }
    } catch { setSaveErr('Network error.'); }
    finally { setToggleBusy(false); }
  }

  void F_SERIF;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div>
        <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Policy config.</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
          Tardy &amp; AWOL thresholds · {isOwner ? 'Editable' : 'Thresholds read-only · toggle editable'}
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
                    style={{ padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: F_MONO, fontSize: 14, color: C.text, background: isOwner ? C.bg : C.surface2, width: 120, boxSizing: 'border-box' as const }}
                  />
                </div>
              ))}
            </div>

            {isOwner && (
              <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="submit" disabled={saving}
                  style={{ padding: '9px 22px', background: C.btnBg, color: C.btnText, border: 'none', borderRadius: 9, fontFamily: F_SANS, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saveMsg && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.green }}>{saveMsg}</span>}
                {saveErr && <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.red }}>{saveErr}</span>}
              </div>
            )}
          </form>

          <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontFamily: F_SANS, fontSize: 13.5, color: C.text, fontWeight: 500 }}>
                  Require manual approval for late (post-9:10) clock-ins
                </div>
                <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, marginTop: 4, letterSpacing: '0.02em' }}>
                  Off — late members clock in automatically but are still marked tardy.
                </div>
              </div>
              <button
                type="button"
                onClick={toggleLateManual}
                disabled={toggleBusy}
                aria-pressed={lateManual}
                style={{ position: 'relative', width: 46, height: 26, flexShrink: 0, borderRadius: 999, border: 'none', cursor: toggleBusy ? 'default' : 'pointer', background: lateManual ? C.accent : C.borderStrong, transition: 'background 0.15s', opacity: toggleBusy ? 0.6 : 1 }}
              >
                <span style={{ position: 'absolute', top: 3, left: lateManual ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: C.surface, transition: 'left 0.15s' }} />
              </button>
            </div>
            {saveMsg && <div style={{ marginTop: 8, fontFamily: F_MONO, fontSize: 11, color: C.green }}>{saveMsg}</div>}
            {saveErr && <div style={{ marginTop: 8, fontFamily: F_MONO, fontSize: 11, color: C.red }}>{saveErr}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
