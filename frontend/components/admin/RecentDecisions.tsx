'use client';

import { useState, useEffect, useCallback } from 'react';
import { clientFetch } from '@/lib/clientFetch';
import { C, F_SANS, F_MONO } from '../theme';

interface Decision {
  id: number | string;
  result: 'approved' | 'rejected';
  name: string;
  label: string;
  actor: string;
  occurred_at: string;
}

interface Props {
  apiUrl: string;
  type: 'leave' | 'attendance';
  refreshKey?: number;
  onViewAudit?: () => void;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

export default function RecentDecisions({ apiUrl, type, refreshKey, onViewAudit }: Props) {
  const [items, setItems] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const res = await clientFetch(`${apiUrl}/webhook/recent-decisions?type=${type}&limit=8`);
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, type]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Recent decisions
        </div>
        {onViewAudit && (
          <button onClick={onViewAudit} style={{ background: 'transparent', border: 'none', color: C.blue, fontFamily: F_SANS, fontSize: 11.5, cursor: 'pointer' }}>
            View all in audit log →
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '18px 16px', fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: '18px 16px', fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>Couldn&apos;t load recent decisions.</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '18px 16px', fontFamily: F_MONO, fontSize: 11, color: C.text3, letterSpacing: '0.04em' }}>No decisions yet.</div>
      ) : (
        items.map((it) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: `1px solid ${C.surface2}` }}>
            <span style={{ width: 18, textAlign: 'center', color: it.result === 'approved' ? C.green : C.red, fontWeight: 700 }}>
              {it.result === 'approved' ? '✓' : '✕'}
            </span>
            <span style={{ fontFamily: F_SANS, fontSize: 13, color: C.text, fontWeight: 500 }}>{it.name}</span>
            <span style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3 }}>· {it.label}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3 }}>by {it.actor}</span>
            <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text2, minWidth: 64, textAlign: 'right' }}>{timeAgo(it.occurred_at)}</span>
          </div>
        ))
      )}
    </div>
  );
}
