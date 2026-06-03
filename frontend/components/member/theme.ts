import type { CSSProperties } from 'react';
import { createElement, Fragment, type ReactNode } from 'react';

export const C = {
  bg:'var(--c-bg)', surface:'var(--c-surface)', surface2:'var(--c-surface2)',
  border:'var(--c-border)', borderStrong:'var(--c-border-strong)',
  text:'var(--c-text)', text2:'var(--c-text2)', text3:'var(--c-text3)',
  accent:'var(--c-accent)', accentSoft:'var(--c-accent-soft)', accentBorder:'var(--c-accent-border)',
  green:'var(--c-green)', greenSoft:'var(--c-green-soft)', greenBorder:'var(--c-green-border)',
  red:'var(--c-red)', redSoft:'var(--c-red-soft)', redBorder:'var(--c-red-border)',
  blue:'var(--c-blue)', blueSoft:'var(--c-blue-soft)', blueBorder:'var(--c-blue-border)',
  purple:'var(--c-purple)', purpleSoft:'var(--c-purple-soft)',
  sidebarBg:'var(--c-sidebar-bg)', sidebarBorder:'var(--c-sidebar-border)', sidebarText:'var(--c-sidebar-text)',
  sidebarActive:'var(--c-sidebar-active)', sidebarActiveText:'var(--c-sidebar-active-text)',
  onAccent:'var(--c-on-accent)', brand:'var(--c-brand)', tick:'var(--c-tick)',
} as const;

export const F_SERIF = "'Geist', var(--font-geist, -apple-system), system-ui, sans-serif";
export const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
export const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

export const tickTrack: CSSProperties = {
  backgroundColor: 'var(--c-surface2)',
  backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 8px, var(--c-tick) 8px 9px)',
};

export function accentSecs(time: string): ReactNode {
  const i = time.lastIndexOf(':');
  if (i < 0) return time;
  return createElement(Fragment, null, time.slice(0, i), createElement('span', { style: { color: 'var(--c-accent)' } }, time.slice(i)));
}
