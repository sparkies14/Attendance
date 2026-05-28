'use client';

import { clientFetch } from '@/lib/clientFetch';

import { useState, useEffect, useRef } from 'react';
import type { UserProfile } from '../MemberDashboard';

interface Props {
  user: UserProfile;
  apiUrl: string;
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function SettingsTab({ user, apiUrl }: Props) {
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [pwLoading,  setPwLoading]  = useState(false);
  const [pwMsg,      setPwMsg]      = useState<string | null>(null);
  const [pwErr,      setPwErr]      = useState<string | null>(null);

  const [googleMsg,  setGoogleMsg]  = useState<string | null>(null);
  const [googleErr,  setGoogleErr]  = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [hasGoogle, setHasGoogle]   = useState(user.hasGoogle);

  const gsiLoaded = useRef(false);

  useEffect(() => {
    if (gsiLoaded.current) return;
    gsiLoaded.current = true;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwErr('Passwords do not match.'); return; }
    setPwLoading(true);
    setPwMsg(null);
    setPwErr(null);
    try {
      const body: Record<string, string> = { new_password: newPw };
      if (user.hasPassword) body.current_password = currentPw;
      const res = await clientFetch(`${apiUrl}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwErr(data.error ?? 'Password change failed.');
      } else {
        setPwMsg('Password updated successfully.');
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      }
    } catch {
      setPwErr('Network error. Please try again.');
    } finally {
      setPwLoading(false);
    }
  }

  function linkGoogle() {
    if (!GOOGLE_CLIENT_ID) { setGoogleErr('Google sign-in is not configured.'); return; }
    if (!window.google)    { setGoogleErr('Google not ready. Please try again.'); return; }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        setGoogleLoading(true);
        setGoogleErr(null);
        try {
          const res = await clientFetch(`${apiUrl}/auth/link-google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
          });
          const data = await res.json();
          if (!res.ok) {
            setGoogleErr(data.error ?? 'Failed to link Google account.');
          } else {
            setGoogleMsg('Google account linked.');
            setHasGoogle(true);
          }
        } catch {
          setGoogleErr('Network error. Please try again.');
        } finally {
          setGoogleLoading(false);
        }
      },
    });
    window.google.accounts.id.prompt();
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '0.75rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.55rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: '#111',
    boxSizing: 'border-box',
    marginBottom: '0.75rem',
  };

  return (
    <div>
      {/* Change password */}
      <div style={{ marginBottom: '2rem' }}>
        <p style={labelStyle}>Change Password</p>
        {pwMsg && <div style={{ marginBottom: '0.75rem', padding: '0.65rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>{pwMsg}</div>}
        {pwErr && <div style={{ marginBottom: '0.75rem', padding: '0.65rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626' }}>{pwErr}</div>}
        <form onSubmit={changePassword}>
          {user.hasPassword && (
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required placeholder="Current password" style={inputStyle} />
          )}
          <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required placeholder="New password (8–128 chars)" style={inputStyle} />
          <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required placeholder="Confirm new password" style={{ ...inputStyle, marginBottom: 0 }} />
          <button type="submit" disabled={pwLoading} style={{ marginTop: '0.75rem', padding: '0.55rem 1.1rem', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: 999, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: pwLoading ? 'not-allowed' : 'pointer', opacity: pwLoading ? 0.6 : 1 }}>
            {pwLoading ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Link Google */}
      <div>
        <p style={labelStyle}>Google Account</p>
        {googleMsg && <div style={{ marginBottom: '0.75rem', padding: '0.65rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#16a34a' }}>{googleMsg}</div>}
        {googleErr && <div style={{ marginBottom: '0.75rem', padding: '0.65rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: '#dc2626' }}>{googleErr}</div>}
        {hasGoogle ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.875rem', border: '1px solid #bbf7d0', borderRadius: 999, backgroundColor: '#f0fdf4', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>
            ✓ Google account linked
          </div>
        ) : (
          <button onClick={linkGoogle} disabled={googleLoading} style={{ padding: '0.55rem 1.1rem', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, cursor: googleLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: googleLoading ? 0.6 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Link Google Account
          </button>
        )}
      </div>
    </div>
  );
}
