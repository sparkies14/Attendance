'use client';
import { useState, useEffect, useCallback } from 'react';

const KEY = 'att_member_mode';
export type Mode = 'dark' | 'light';

export function useMemberMode() {
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (window.localStorage.getItem(KEY) as Mode) === 'light' ? 'light' : 'dark';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, mode);
  }, [mode]);
  const toggle = useCallback(() => setMode(m => (m === 'dark' ? 'light' : 'dark')), []);
  return { mode, toggle };
}
