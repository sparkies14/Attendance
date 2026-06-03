'use client';

import { clientFetch } from '@/lib/clientFetch';
import { useState, useEffect } from 'react';
import type { UserProfile } from '../MemberDashboard';
import { C, F_SERIF, F_SANS, F_MONO } from '../../theme';

interface Props {
  user: UserProfile;
  apiUrl: string;
  hireYear?: number;
}

function Chip({ label, bg, color, border }: { label: string; bg: string; color: string; border: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, background: bg, border: `1px solid ${border}`, fontFamily: F_MONO, fontSize: 10.5, color, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }}>
      {label}
    </span>
  );
}

export default function AccountPage({ user, apiUrl, hireYear }: Props) {
  // Password form
  const [curPw,     setCurPw]     = useState('');
  const [newPw,     setNewPw]     = useState('');
  const [conPw,     setConPw]     = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg,     setPwMsg]     = useState<string | null>(null);
  const [pwErr,     setPwErr]     = useState<string | null>(null);

  // Google
  const [hasGoogle, setHasGoogle] = useState(user.hasGoogle);
  const [gLoading,  setGLoading]  = useState(false);
  const [gMsg,      setGMsg]      = useState<string | null>(null);
  const [gErr,      setGErr]      = useState<string | null>(null);

  // Discord linking
  const [discordCode,    setDiscordCode]    = useState('');
  const [discordLoading, setDiscordLoading] = useState(false);
  const [discordMsg,     setDiscordMsg]     = useState<string | null>(null);
  const [discordErr,     setDiscordErr]     = useState<string | null>(null);
  const [discordLinked,  setDiscordLinked]  = useState(!!user.hasDiscord);

  // Locale
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)att_locale=([^;]+)/);
    setLocale(match ? match[1] : 'en');
  }, []);

  useEffect(() => {
    if (document.querySelector('script[src*="accounts.google.com/gsi"]')) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    document.head.appendChild(s);
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
    setGLoading(true); setGMsg(null); setGErr(null);
    if (!clientId || !(window as { google?: unknown }).google) {
      setGErr('Google sign-in is not available. Please try again in a moment.');
      setGLoading(false);
      return;
    }
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

  async function verifyDiscordLink(e: React.FormEvent) {
    e.preventDefault();
    setDiscordLoading(true); setDiscordMsg(null); setDiscordErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/discord/link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discordCode.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setDiscordLinked(true);
        setDiscordMsg('✅ Discord linked successfully!');
        setDiscordCode('');
      } else {
        setDiscordErr(data.error ?? 'Invalid or expired code.');
      }
    } catch { setDiscordErr('Network error.'); }
    finally { setDiscordLoading(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>

      {/* Page heading */}
      <div>
        <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 32, lineHeight: 1, letterSpacing: '-0.025em', color: C.text }}>Account.</div>
        <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>Profile · Security · Preferences</div>
      </div>

      {/* ── Profile card ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 28px' }}>
        <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 20, color: C.text, letterSpacing: '-0.015em', marginBottom: 3 }}>Profile</div>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 22 }}>Identity</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.brand, color: C.onAccent, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: F_SANS, letterSpacing: '-0.02em' }}>
            {inits}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 28, color: C.text, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 4 }}>{user.name || user.email}</div>
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
        <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 20, color: C.text, letterSpacing: '-0.015em', marginBottom: 3 }}>Security</div>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 22 }}>Password · Google account</div>

        {!user.hasPassword && (
          <div style={{ marginBottom: 22, padding: '10px 14px', background: C.surface2, borderRadius: 10, fontFamily: F_MONO, fontSize: 11.5, color: C.text3, letterSpacing: '0.02em' }}>
            Your account uses Google sign-in only.
          </div>
        )}

        {user.hasPassword && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Change password</div>
            {pwMsg && <div style={{ marginBottom: 10, padding: '8px 12px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 8, fontSize: 12.5, color: C.green }}>{pwMsg}</div>}
            {pwErr && <div style={{ marginBottom: 10, padding: '8px 12px', background: C.redSoft,   border: `1px solid ${C.redBorder}`,   borderRadius: 8, fontSize: 12.5, color: C.red   }}>{pwErr}</div>}
            <form onSubmit={changePassword} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label htmlFor="acc-cur-pw" style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Current</label>
                <input id="acc-cur-pw" type="password" value={curPw} onChange={e => setCurPw(e.target.value)} required autoComplete="current-password" style={inp} />
              </div>
              <div>
                <label htmlFor="acc-new-pw" style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>New</label>
                <input id="acc-new-pw" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required autoComplete="new-password" style={inp} />
              </div>
              <div>
                <label htmlFor="acc-con-pw" style={{ display: 'block', fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Confirm</label>
                <input id="acc-con-pw" type="password" value={conPw} onChange={e => setConPw(e.target.value)} required autoComplete="new-password" style={inp} />
              </div>
              <button type="submit" disabled={pwLoading}
                style={{ padding: '8px 16px', background: C.text, color: C.onAccent, border: 'none', borderRadius: 8, fontSize: 12.5, fontFamily: F_SANS, fontWeight: 500, cursor: pwLoading ? 'not-allowed' : 'pointer', opacity: pwLoading ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
                {pwLoading ? '…' : 'Update'}
              </button>
            </form>
          </div>
        )}

        <div style={{ height: 1, background: C.border, margin: '4px 0 22px' }} />

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

      {/* ── Discord card ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 28px' }}>
        <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 20, color: C.text, letterSpacing: '-0.015em', marginBottom: 3 }}>Discord</div>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 22 }}>
          {discordLinked ? 'Linked' : 'Clock in from Discord'}
        </div>

        {discordLinked ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 999, fontSize: 13, color: C.green, fontFamily: F_SANS, fontWeight: 500 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
            Discord linked — clock in by posting in #clock-in
          </div>
        ) : (
          <>
            <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, marginBottom: 16, lineHeight: 1.7 }}>
              1. Type <span style={{ color: C.text, fontWeight: 600 }}>/link</span> in the Discord server<br />
              2. The bot will DM you a 6-digit code<br />
              3. Enter it below
            </div>
            {discordMsg && <div style={{ marginBottom: 10, padding: '8px 12px', background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 8, fontSize: 12.5, color: C.green }}>{discordMsg}</div>}
            {discordErr && <div style={{ marginBottom: 10, padding: '8px 12px', background: C.redSoft,   border: `1px solid ${C.redBorder}`,   borderRadius: 8, fontSize: 12.5, color: C.red   }}>{discordErr}</div>}
            <form onSubmit={verifyDiscordLink} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={discordCode}
                onChange={e => setDiscordCode(e.target.value)}
                required
                placeholder="6-digit code"
                maxLength={6}
                style={{ padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: F_MONO, fontSize: 14, color: C.text, background: C.bg, width: 130, letterSpacing: '0.15em', boxSizing: 'border-box' as const }}
              />
              <button type="submit" disabled={discordLoading}
                style={{ padding: '8px 16px', background: '#5865F2', color: '#fff' /* static white on Discord brand blue */, border: 'none', borderRadius: 8, fontSize: 13, fontFamily: F_SANS, fontWeight: 500, cursor: discordLoading ? 'not-allowed' : 'pointer', opacity: discordLoading ? 0.6 : 1 }}>
                {discordLoading ? 'Linking…' : 'Link Discord'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* ── Preferences card ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 28px' }}>
        <div style={{ fontFamily: F_SERIF, fontWeight: 600, fontSize: 20, color: C.text, letterSpacing: '-0.015em', marginBottom: 3 }}>Preferences</div>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 22 }}>Language</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Display language</span>
          <div style={{ display: 'inline-flex', background: C.surface2, borderRadius: 999, padding: 3, border: `1px solid ${C.border}` }}>
            {(['en', 'ja'] as const).map((l) => (
              <button key={l} onClick={() => toggleLocale(l)}
                style={{ padding: '5px 18px', background: locale === l ? C.text : 'transparent', color: locale === l ? C.onAccent : C.text3, border: 'none', borderRadius: 999, fontSize: 12, fontFamily: F_SANS, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}>
                {l === 'en' ? 'English' : '日本語'}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
