'use client';
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'att_sidebar_locked';
export const COLLAPSED_W = 64;

export function useSidebarCollapse(expandedW: number) {
  const [locked, setLocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });
  const [hovered, setHovered] = useState(false);

  const toggleLock = useCallback(() => {
    setLocked(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const hoverProps = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };

  return { expanded: locked || hovered, locked, toggleLock, hoverProps, COLLAPSED_W, EXPANDED_W: expandedW };
}
