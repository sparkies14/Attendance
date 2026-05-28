'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [jstTime, setJstTime] = useState('');
  const gsiLoaded = useRef(false);

  useEffect(() => {
    const update = () =>
      setJstTime(
        new Date().toLocaleTimeString('ja-JP', {
          timeZone: 'Asia/Tokyo',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (gsiLoaded.current) return;
    gsiLoaded.current = true;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  function redirectByRole(role: string) {
    if (role === 'admin' || role === 'owner') {
      router.push('/insights');
    } else {
      router.push('/member');
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Sign in failed.');
      } else {
        await fetch('/api/set-cookie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: data.token }) });
        localStorage.setItem('att_token', data.token);
        redirectByRole(data.user?.role ?? '');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Registration failed.');
      } else {
        setName('');
        setEmail('');
        setPassword('');
        setSuccessMessage('Account created. An admin will approve your access.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleClick() {
    if (!GOOGLE_CLIENT_ID) {
      setError('Google sign-in is not configured.');
      return;
    }
    if (!window.google) {
      setError('Google sign-in is not ready. Please try again.');
      return;
    }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        setError(null);
        setLoading(true);
        try {
          const res = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ credential }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error ?? 'Google sign-in failed.');
          } else {
            await fetch('/api/set-cookie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: data.token }) });
            localStorage.setItem('att_token', data.token);
            redirectByRole(data.user?.role ?? '');
          }
        } catch {
          setError('Network error. Please try again.');
        } finally {
          setLoading(false);
        }
      },
    });
    window.google.accounts.id.prompt();
  }

  const gridBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23e5e7eb' stroke-width='0.5'/%3E%3C/svg%3E")`;

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'monospace',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#374151',
    marginBottom: '0.4rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.65rem 0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    color: '#111',
    backgroundColor: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#fafafa',
        backgroundImage: gridBg,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top brand bar */}
      <div
        style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '0.5rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          fontFamily: 'monospace',
          color: '#6b7280',
        }}
      >
        <span style={{ fontWeight: 600, color: '#111' }}>Anosupo AI · 出勤管理</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span>{jstTime} JST</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                display: 'inline-block',
              }}
            />
            Live
          </span>
        </div>
      </div>

      {/* Centered card */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 440,
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: '2.5rem 2rem',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          {/* Brand mark */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#111',
              }}
            >
              出勤管理
            </div>
            <div
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: '0.9rem',
                color: '#6b7280',
                marginTop: '0.25rem',
              }}
            >
              {mode === 'signin' ? 'Welcome back.' : 'Create your account.'}
            </div>
          </div>

          {/* Segmented toggle */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#f3f4f6',
              borderRadius: 8,
              padding: 3,
              marginBottom: '1.75rem',
            }}
          >
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setSuccessMessage(null);
                }}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: mode === m ? '#fff' : 'transparent',
                  color: mode === m ? '#111' : '#6b7280',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}>
            {mode === 'signup' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your full name"
                  style={inputStyle}
                />
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>

            {error && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.65rem 0.875rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: '#dc2626',
                }}
              >
                {error}
              </div>
            )}

            {successMessage && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.65rem 0.875rem',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: '#16a34a',
                }}
              >
                {successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 999,
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              margin: '1.25rem 0',
            }}
          >
            <div style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                color: '#9ca3af',
                fontWeight: 600,
              }}
            >
              or
            </span>
            <div style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.7rem',
              backgroundColor: '#fff',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
          </button>
        </div>
      </div>

      {/* Bottom copyright strip */}
      <div
        style={{
          textAlign: 'center',
          padding: '1rem',
          fontFamily: 'monospace',
          fontSize: '0.7rem',
          color: '#9ca3af',
        }}
      >
        © {new Date().getFullYear()} Anosupo AI. All rights reserved.
      </div>
    </div>
  );
}
