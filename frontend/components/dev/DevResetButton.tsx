// DEV ONLY — Delete this file and remove its import+usage from MemberDashboard.tsx and AdminDashboard.tsx to disable
'use client';

import { useState } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Props {
  apiUrl: string;
  defaultEmail?: string;
  onReset?: () => void;
}

export default function DevResetButton({ apiUrl, defaultEmail, onReset }: Props) {
  const [email, setEmail]   = useState(defaultEmail ?? '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]       = useState<string | null>(null);

  async function reset() {
    if (!email) return;
    setLoading(true); setMsg(null);
    try {
      const res  = await clientFetch(`${apiUrl}/webhook/dev/reset-today`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`✕ ${data.error ?? 'Failed'}`);
      } else {
        setMsg(`✓ Reset (${data.date})`);
        onReset?.();
      }
    } catch {
      setMsg('✕ Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      background: '#111', border: '1px solid #333', borderRadius: 10,
      padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
      minWidth: 210, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        DEV · Reset Today
      </div>
      <input
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="email@example.com"
        style={{
          padding: '5px 8px', background: '#1e1e1e', border: '1px solid #3a3a3a',
          borderRadius: 6, color: '#ddd', fontFamily: 'monospace', fontSize: 11.5,
          outline: 'none', width: '100%', boxSizing: 'border-box',
        }}
      />
      <button
        onClick={reset}
        disabled={loading || !email}
        style={{
          padding: '6px 10px', background: '#7f1d1d', color: '#fca5a5',
          border: '1px solid #991b1b', borderRadius: 6, fontFamily: 'monospace',
          fontSize: 11, cursor: loading || !email ? 'not-allowed' : 'pointer',
          opacity: loading || !email ? 0.5 : 1,
        }}
      >
        {loading ? 'Resetting…' : '⟳ Reset today'}
      </button>
      {msg && (
        <div style={{
          fontFamily: 'monospace', fontSize: 11,
          color: msg.startsWith('✓') ? '#86efac' : '#f87171',
        }}>
          {msg}
        </div>
      )}
    </div>
  );
}
