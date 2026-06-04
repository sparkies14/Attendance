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

const SAMPLE_CREDENTIALS = [
  { label: 'Admin', email: 'admin@anosupo.ai', password: 'admin123', role: 'admin' },
  { label: 'Member', email: 'member@anosupo.ai', password: 'member123', role: 'member' },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [jstTime, setJstTime] = useState('');
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const gsiLoaded = useRef(false);

  useEffect(() => {
    setMounted(true);
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
    if (role === 'admin' || role === 'owner') router.push('/admin');
    else router.push('/member');
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
        setLoading(false);
      } else {
        await fetch('/api/set-cookie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: data.token }),
        });
        localStorage.setItem('att_token', data.token);
        setSignedIn(true);
        redirectByRole(data.user?.role ?? '');
      }
    } catch {
      setError('Network error. Please try again.');
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
    if (!GOOGLE_CLIENT_ID) { setError('Google sign-in is not configured.'); return; }
    if (!window.google) { setError('Google sign-in is not ready. Please try again.'); return; }
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
            setLoading(false);
          } else {
            await fetch('/api/set-cookie', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: data.token }),
            });
            localStorage.setItem('att_token', data.token);
            setSignedIn(true);
            redirectByRole(data.user?.role ?? '');
          }
        } catch {
          setError('Network error. Please try again.');
          setLoading(false);
        }
      },
    });
    window.google.accounts.id.prompt();
  }

  function fillSample(cred: typeof SAMPLE_CREDENTIALS[0]) {
    setMode('signin');
    setEmail(cred.email);
    setPassword(cred.password);
    setError(null);
    setSuccessMessage(null);
  }

  // parse time for accent on seconds
  const timeParts = jstTime ? jstTime.split(':') : [];
  const timeDisplay = timeParts.length === 3
    ? <>{timeParts[0]}:{timeParts[1]}:<span style={{ color: 'var(--c-accent)' }}>{timeParts[2]}</span></>
    : jstTime;

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowPulse {
          0%,100% { opacity: .18; transform: scale(1); }
          50%      { opacity: .28; transform: scale(1.06); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes orbFloat {
          0%,100% { transform: translate(0,0); }
          33%      { transform: translate(12px,-18px); }
          66%      { transform: translate(-8px,10px); }
        }
        .login-card {
          animation: fadeUp .55s cubic-bezier(.22,1,.36,1) both;
        }
        .login-field {
          animation: fadeUp .55s cubic-bezier(.22,1,.36,1) both;
        }
        .login-field:nth-child(1) { animation-delay:.08s }
        .login-field:nth-child(2) { animation-delay:.14s }
        .login-field:nth-child(3) { animation-delay:.20s }
        .noc-input {
          width: 100%;
          padding: .65rem .9rem;
          background: var(--c-surface2);
          border: 1px solid var(--c-border);
          border-radius: 8px;
          color: var(--c-text);
          font-family: 'Geist', system-ui, sans-serif;
          font-size: .875rem;
          outline: none;
          box-sizing: border-box;
          transition: border-color .15s, box-shadow .15s;
        }
        .noc-input::placeholder { color: var(--c-text3); }
        .noc-input:focus {
          border-color: var(--c-accent-border);
          box-shadow: 0 0 0 3px var(--c-accent-soft);
        }
        .noc-btn-primary {
          width: 100%;
          padding: .75rem;
          background: var(--c-btn-bg);
          color: var(--c-btn-text);
          border: none;
          border-radius: 999px;
          font-family: 'Geist', system-ui, sans-serif;
          font-size: .8rem;
          font-weight: 700;
          letter-spacing: .05em;
          text-transform: uppercase;
          cursor: pointer;
          transition: opacity .15s, transform .1s;
        }
        .noc-btn-primary:hover:not(:disabled) { opacity: .88; transform: translateY(-1px); }
        .noc-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .noc-btn-google {
          width: 100%;
          padding: .7rem;
          background: var(--c-surface2);
          color: var(--c-text2);
          border: 1px solid var(--c-border);
          border-radius: 8px;
          font-family: 'Geist', system-ui, sans-serif;
          font-size: .8rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: .5rem;
          transition: border-color .15s, background .15s;
        }
        .noc-btn-google:hover:not(:disabled) {
          border-color: var(--c-border-strong);
          background: var(--c-surface);
          color: var(--c-text);
        }
        .noc-btn-google:disabled { opacity: .5; cursor: not-allowed; }
        .tab-btn {
          flex: 1;
          padding: .48rem;
          border: none;
          cursor: pointer;
          border-radius: 6px;
          font-family: 'Geist', system-ui, sans-serif;
          font-size: .72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .05em;
          transition: all .15s;
        }
        .tab-btn.active {
          background: var(--c-surface2);
          color: var(--c-text);
          box-shadow: 0 1px 3px rgba(0,0,0,.35);
        }
        .tab-btn.inactive {
          background: transparent;
          color: var(--c-text3);
        }
        .sample-pill {
          display: inline-flex;
          align-items: center;
          gap: .35rem;
          padding: .3rem .65rem;
          border: 1px solid var(--c-border);
          border-radius: 999px;
          font-size: .72rem;
          font-weight: 600;
          cursor: pointer;
          font-family: 'Geist', system-ui, sans-serif;
          transition: border-color .15s, background .15s;
        }
        .sample-pill:hover {
          border-color: var(--c-accent-border);
          background: var(--c-accent-soft);
          color: var(--c-accent);
        }
        .eye-btn {
          position: absolute;
          right: .75rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: var(--c-text3);
          padding: 0;
          display: flex;
          align-items: center;
          transition: color .15s;
        }
        .eye-btn:hover { color: var(--c-text2); }
      `}</style>

      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--c-bg)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Ambient orbs */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        }}>
          <div style={{
            position: 'absolute',
            width: 480, height: 480,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(84,230,255,.13) 0%, transparent 70%)',
            top: '-120px', left: '-80px',
            animation: 'orbFloat 12s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute',
            width: 320, height: 320,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(169,155,255,.10) 0%, transparent 70%)',
            bottom: '-60px', right: '-40px',
            animation: 'orbFloat 16s ease-in-out infinite reverse',
          }} />
          <div style={{
            position: 'absolute',
            width: 200, height: 200,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(95,217,138,.08) 0%, transparent 70%)',
            top: '45%', right: '20%',
            animation: 'orbFloat 10s ease-in-out infinite 4s',
          }} />
          {/* Dot grid */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 50%, black 40%, transparent 100%)',
          }} />
        </div>

        {/* Top bar */}
        <div style={{
          position: 'relative', zIndex: 10,
          borderBottom: '1px solid var(--c-border)',
          padding: '.55rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '.72rem',
          fontFamily: "'Geist', system-ui, sans-serif",
          color: 'var(--c-text3)',
          backgroundColor: 'rgba(9,10,12,.7)',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <span style={{
              width: 22, height: 22,
              borderRadius: 6,
              background: 'var(--c-accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="#0c0d10" strokeWidth="1.5"/>
                <path d="M5 4V3a3 3 0 016 0v1" stroke="#0c0d10" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="9" r="1.2" fill="#0c0d10"/>
              </svg>
            </span>
            <span style={{ fontWeight: 700, color: 'var(--c-text)', letterSpacing: '.01em' }}>
              Anosupo AI
            </span>
            <span style={{ color: 'var(--c-border-strong)' }}>·</span>
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: '.68rem' }}>出勤管理</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: '.72rem',
              color: 'var(--c-text2)',
              letterSpacing: '.04em',
            }}>
              {mounted ? timeDisplay : '––:––:––'} <span style={{ color: 'var(--c-text3)' }}>JST</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                backgroundColor: 'var(--c-green)',
                boxShadow: '0 0 6px var(--c-green)',
                display: 'inline-block',
              }} />
              <span style={{ color: 'var(--c-green)', fontWeight: 600 }}>Live</span>
            </span>
          </div>
        </div>

        {/* Main content */}
        <div style={{
          flex: 1,
          position: 'relative', zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}>
          <div className="login-card" style={{
            width: '100%',
            maxWidth: 420,
          }}>

            {/* Brand heading */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '2rem',
                fontWeight: 400,
                color: 'var(--c-text)',
                lineHeight: 1.1,
                letterSpacing: '-.01em',
              }}>
                {mode === 'signin' ? 'Welcome back.' : 'Join the team.'}
              </div>
              <div style={{
                fontFamily: "'Geist', system-ui, sans-serif",
                fontSize: '.8rem',
                color: 'var(--c-text3)',
                marginTop: '.45rem',
                letterSpacing: '.01em',
              }}>
                {mode === 'signin'
                  ? 'Sign in to your attendance dashboard'
                  : 'Create an account — admin approval required'}
              </div>
            </div>

            {/* Card */}
            <div style={{
              backgroundColor: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              borderRadius: 16,
              padding: '1.75rem',
              boxShadow: '0 0 0 1px rgba(84,230,255,.04), 0 16px 48px rgba(0,0,0,.5)',
            }}>

              {/* Tab toggle */}
              <div style={{
                display: 'flex',
                backgroundColor: 'var(--c-bg)',
                borderRadius: 8,
                padding: 3,
                marginBottom: '1.5rem',
                border: '1px solid var(--c-border)',
              }}>
                {(['signin', 'signup'] as const).map((m) => (
                  <button
                    key={m}
                    className={`tab-btn ${mode === m ? 'active' : 'inactive'}`}
                    onClick={() => {
                      setMode(m);
                      setError(null);
                      setSuccessMessage(null);
                      setSignedIn(false);
                    }}
                  >
                    {m === 'signin' ? 'Sign In' : 'Create Account'}
                  </button>
                ))}
              </div>

              {/* Form */}
              <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>

                  {mode === 'signup' && (
                    <div className="login-field">
                      <label style={{
                        display: 'block',
                        fontFamily: "'Geist', system-ui, sans-serif",
                        fontSize: '.7rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '.07em',
                        color: 'var(--c-text3)',
                        marginBottom: '.35rem',
                      }}>Full Name</label>
                      <input
                        className="noc-input"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="Your full name"
                      />
                    </div>
                  )}

                  <div className="login-field">
                    <label style={{
                      display: 'block',
                      fontFamily: "'Geist', system-ui, sans-serif",
                      fontSize: '.7rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '.07em',
                      color: 'var(--c-text3)',
                      marginBottom: '.35rem',
                    }}>Email</label>
                    <input
                      className="noc-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="login-field">
                    <label style={{
                      display: 'block',
                      fontFamily: "'Geist', system-ui, sans-serif",
                      fontSize: '.7rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '.07em',
                      color: 'var(--c-text3)',
                      marginBottom: '.35rem',
                    }}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="noc-input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        style={{ paddingRight: '2.5rem' }}
                      />
                      <button
                        type="button"
                        className="eye-btn"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                </div>

                {/* Error / success */}
                {error && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '.6rem .875rem',
                    backgroundColor: 'var(--c-red-soft)',
                    border: '1px solid var(--c-red-border)',
                    borderRadius: 8,
                    fontFamily: "'Geist', system-ui, sans-serif",
                    fontSize: '.8rem',
                    color: 'var(--c-red)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.4rem',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    {error}
                  </div>
                )}

                {successMessage && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '.6rem .875rem',
                    backgroundColor: 'var(--c-green-soft)',
                    border: '1px solid var(--c-green-border)',
                    borderRadius: 8,
                    fontFamily: "'Geist', system-ui, sans-serif",
                    fontSize: '.8rem',
                    color: 'var(--c-green)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.4rem',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {successMessage}
                  </div>
                )}

                <button
                  className="noc-btn-primary"
                  type="submit"
                  disabled={loading || signedIn}
                  style={{
                    marginTop: '1.25rem',
                    backgroundColor: signedIn ? 'var(--c-green)' : 'var(--c-btn-bg)',
                    color: signedIn ? '#0c0d10' : 'var(--c-btn-text)',
                  }}
                >
                  {signedIn
                    ? '✓ Redirecting…'
                    : loading
                    ? 'Please wait…'
                    : mode === 'signin'
                    ? 'Sign In'
                    : 'Create Account'}
                </button>
              </form>

              {/* Divider */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '.75rem',
                margin: '1.1rem 0',
              }}>
                <div style={{ flex: 1, height: 1, backgroundColor: 'var(--c-border)' }} />
                <span style={{
                  fontFamily: "'Geist', system-ui, sans-serif",
                  fontSize: '.68rem',
                  color: 'var(--c-text3)',
                  fontWeight: 600,
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                }}>or</span>
                <div style={{ flex: 1, height: 1, backgroundColor: 'var(--c-border)' }} />
              </div>

              {/* Google */}
              <button
                className="noc-btn-google"
                type="button"
                onClick={handleGoogleClick}
                disabled={loading}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
              </button>
            </div>

            {/* Sample credentials */}
            <div style={{
              marginTop: '1.25rem',
              padding: '1rem 1.1rem',
              backgroundColor: 'rgba(84,230,255,.04)',
              border: '1px solid var(--c-accent-border)',
              borderRadius: 12,
            }}>
              <div style={{
                fontFamily: "'Geist', system-ui, sans-serif",
                fontSize: '.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                color: 'var(--c-accent)',
                marginBottom: '.6rem',
                display: 'flex',
                alignItems: 'center',
                gap: '.3rem',
              }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3v4.5M8 11h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                Demo Credentials — click to fill
              </div>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                {SAMPLE_CREDENTIALS.map((cred) => (
                  <button
                    key={cred.label}
                    className="sample-pill"
                    style={{ color: 'var(--c-text2)' }}
                    onClick={() => fillSample(cred)}
                    type="button"
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      backgroundColor: cred.role === 'admin' ? 'var(--c-purple)' : 'var(--c-green)',
                      display: 'inline-block',
                    }} />
                    {cred.label}
                    <span style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: '.65rem',
                      color: 'var(--c-text3)',
                    }}>
                      {cred.email}
                    </span>
                  </button>
                ))}
              </div>
              <div style={{
                marginTop: '.6rem',
                fontFamily: "'Geist Mono', monospace",
                fontSize: '.65rem',
                color: 'var(--c-text3)',
              }}>
                password: <span style={{ color: 'var(--c-text2)' }}>admin123</span> / <span style={{ color: 'var(--c-text2)' }}>member123</span>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom strip */}
        <div style={{
          position: 'relative', zIndex: 10,
          textAlign: 'center',
          padding: '.9rem',
          fontFamily: "'Geist', system-ui, sans-serif",
          fontSize: '.68rem',
          color: 'var(--c-text3)',
          borderTop: '1px solid var(--c-border)',
          backgroundColor: 'rgba(9,10,12,.5)',
          backdropFilter: 'blur(8px)',
          letterSpacing: '.01em',
        }}>
          © {new Date().getFullYear()} Anosupo AI · 出勤管理システム
        </div>
      </div>
    </>
  );
}
