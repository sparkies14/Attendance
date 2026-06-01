'use client';

import { useState, useEffect, useCallback } from 'react';
import { clientFetch } from '@/lib/clientFetch';

interface Props {
  apiUrl: string;
  adminRole: string;
}

// ── Color / font constants (same as every other admin page) ──────────────────
const C = {
  bg: '#fafafa', surface: '#ffffff', surface2: '#f5f5f5',
  border: '#e6e6e6', borderStrong: '#d4d4d4',
  text: '#0a0a0a', text2: '#525252', text3: '#a3a3a3',
  accent: '#b45309', accentSoft: 'rgba(180,83,9,0.08)', accentBorder: 'rgba(180,83,9,0.25)',
  green: '#16a34a', greenSoft: 'rgba(22,163,74,0.08)', greenBorder: 'rgba(22,163,74,0.25)',
  red: '#dc2626', redSoft: 'rgba(220,38,38,0.08)', redBorder: 'rgba(220,38,38,0.22)',
  blue: '#2563eb', blueSoft: 'rgba(37,99,235,0.08)', blueBorder: 'rgba(37,99,235,0.22)',
  purple: '#7c3aed', purpleSoft: 'rgba(124,58,237,0.08)',
  btnBg: '#0a0a0a', btnText: '#fafafa',
};
const F_SERIF = "'Instrument Serif', var(--font-instrument-serif, 'Times New Roman'), serif";
const F_SANS  = "'Geist', var(--font-geist, -apple-system), BlinkMacSystemFont, system-ui, sans-serif";
const F_MONO  = "'Geist Mono', var(--font-geist-mono, 'JetBrains Mono'), ui-monospace, monospace";

// ── Helpers ──────────────────────────────────────────────────────────────────
const PALETTE = ['#f4b942','#a78bfa','#60a5fa','#4ade80','#fb923c','#f87171','#22c55e','#e879f9'];
function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Data model ────────────────────────────────────────────────────────────────
interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  job_role?: string;
  status: string;
  created_at: string;
  last_login_at?: string;
  discord_id?: string | null;
}

// ── Role pill ────────────────────────────────────────────────────────────────
function RolePill({ role }: { role: string }) {
  const r = role.toLowerCase();
  let bg = C.surface2;
  let color = C.text2;
  let border = C.border;
  if (r === 'owner') { bg = C.accentSoft; color = C.accent; border = C.accentBorder; }
  else if (r === 'admin') { bg = C.blueSoft; color = C.blue; border = C.blueBorder; }

  return (
    <span style={{
      fontFamily: F_MONO,
      fontSize: 10.5,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      background: bg,
      color,
      border: `1px solid ${border}`,
      borderRadius: 6,
      padding: '2px 8px',
      whiteSpace: 'nowrap',
    }}>
      {role}
    </span>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  let bg = C.surface2;
  let color = C.text2;
  let border = C.border;
  if (s === 'active')   { bg = C.greenSoft;  color = C.green;  border = C.greenBorder; }
  else if (s === 'pending') { bg = C.accentSoft; color = C.accent; border = C.accentBorder; }
  else if (s === 'inactive') { bg = C.redSoft; color = C.red; border = C.redBorder; }

  return (
    <span style={{
      fontFamily: F_MONO,
      fontSize: 10.5,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      background: bg,
      color,
      border: `1px solid ${border}`,
      borderRadius: 6,
      padding: '2px 8px',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

// ── Outline action button ─────────────────────────────────────────────────────
interface OutlineBtnProps {
  label: string;
  color: string;
  borderColor: string;
  bgColor: string;
  disabled: boolean;
  onClick: () => void;
}
function OutlineBtn({ label, color, borderColor, bgColor, disabled, onClick }: OutlineBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: F_MONO,
        fontSize: 10.5,
        letterSpacing: '0.05em',
        color: disabled ? C.text3 : color,
        background: disabled ? C.surface2 : bgColor,
        border: `1px solid ${disabled ? C.border : borderColor}`,
        borderRadius: 7,
        padding: '4px 10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.15s',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[220, 80, 70, 100, 140].map((w, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div style={{ height: 14, width: w, borderRadius: 6, background: C.surface2, animation: 'pulse 1.4s ease-in-out infinite' }} />
        </td>
      ))}
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MembersPage({ apiUrl, adminRole }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [invName, setInvName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<'member' | 'admin'>('member');
  const [invLoading, setInvLoading] = useState(false);
  const [invMsg, setInvMsg] = useState<string | null>(null);
  const [invErr, setInvErr] = useState<string | null>(null);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Discord ID edit state
  const [discordEditId,  setDiscordEditId]  = useState<string | null>(null);
  const [discordValue,   setDiscordValue]   = useState('');
  const [discordLoading, setDiscordLoading] = useState(false);
  const [discordMsg,     setDiscordMsg]     = useState<string | null>(null);
  const [discordErr,     setDiscordErr]     = useState<string | null>(null);

  async function saveDiscordId(userId: string) {
    setDiscordLoading(true); setDiscordMsg(null); setDiscordErr(null);
    try {
      const res  = await clientFetch(`${apiUrl}/users/${userId}/discord`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discord_id: discordValue.trim() || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, discord_id: discordValue.trim() || null } : u));
        setDiscordMsg('Saved.');
        setTimeout(() => { setDiscordMsg(null); setDiscordEditId(null); }, 2_000);
      } else {
        setDiscordErr(data.error ?? 'Save failed.');
      }
    } catch { setDiscordErr('Network error.'); }
    finally { setDiscordLoading(false); }
  }

  // ── Load users ──────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clientFetch(`${apiUrl}/users`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Invite ──────────────────────────────────────────────────────────────────
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInvLoading(true);
    setInvMsg(null);
    setInvErr(null);
    try {
      const res = await clientFetch(`${apiUrl}/users/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, name: invName, role: invRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvErr(data.error ?? 'Invite failed.');
      } else {
        setInvMsg(`Invite sent to ${invEmail}.`);
        setInvName('');
        setInvEmail('');
        setInvRole('member');
        setTimeout(() => { setInvMsg(null); setShowInvite(false); }, 3000);
        await loadUsers();
      }
    } catch {
      setInvErr('Network error.');
    } finally {
      setInvLoading(false);
    }
  }

  // ── Action ──────────────────────────────────────────────────────────────────
  async function doAction(userId: string, action: 'promote' | 'demote' | 'activate' | 'deactivate') {
    setActionLoading(userId);
    setActionMsg(null);
    setActionErr(null);
    try {
      const res = await clientFetch(`${apiUrl}/users/${userId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setActionErr(data.error ?? 'Action failed.');
      else {
        setActionMsg(`Done — ${data.user?.name ?? ''} updated.`);
        setTimeout(() => setActionMsg(null), 3000);
        await loadUsers();
      }
    } catch {
      setActionErr('Network error.');
    } finally {
      setActionLoading(null);
    }
  }

  // ── Filter ──────────────────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const visible = q
    ? users.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (u.job_role ?? '').toLowerCase().includes(q)
      )
    : users;

  // ── Shared input style ──────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    fontFamily: F_SANS,
    fontSize: 13,
    color: C.text,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '7px 11px',
    outline: 'none',
    flex: 1,
    minWidth: 0,
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    flex: 'none',
    width: 140,
    cursor: 'pointer',
  };

  return (
    <div style={{ fontFamily: F_SANS, padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* ── Keyframe for skeleton pulse ── */}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }`}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <h1 style={{ fontFamily: F_SERIF, fontSize: 32, fontWeight: 400, color: C.text, margin: 0 }}>
              Members.
            </h1>
            <span style={{ fontFamily: F_SERIF, fontSize: 22, fontStyle: 'italic', color: C.text2 }}>team.</span>
          </div>
          <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.text3, marginTop: 4, letterSpacing: '0.05em' }}>
            {loading ? '—' : users.length} members · manage roles &amp; access
          </div>
        </div>

        <button
          onClick={() => { setShowInvite(v => !v); setInvErr(null); setInvMsg(null); }}
          style={{
            fontFamily: F_MONO,
            fontSize: 12,
            letterSpacing: '0.05em',
            color: C.btnText,
            background: C.btnBg,
            border: 'none',
            borderRadius: 9,
            padding: '9px 18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          + Invite member
        </button>
      </div>

      {/* ── Invite form ── */}
      {showInvite && (
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '16px 18px',
          marginBottom: 18,
        }}>
          <form onSubmit={handleInvite}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
                <label style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Name</label>
                <input
                  style={inputStyle}
                  placeholder="Full name"
                  value={invName}
                  onChange={e => setInvName(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 }}>
                <label style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Email</label>
                <input
                  style={inputStyle}
                  type="email"
                  placeholder="email@company.com"
                  value={invEmail}
                  onChange={e => setInvEmail(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontFamily: F_MONO, fontSize: 10, color: C.text3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Role</label>
                <select
                  style={selectStyle}
                  value={invRole}
                  onChange={e => setInvRole(e.target.value as 'member' | 'admin')}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, paddingBottom: 1 }}>
                <button
                  type="submit"
                  disabled={invLoading}
                  style={{
                    fontFamily: F_MONO,
                    fontSize: 11.5,
                    color: C.btnText,
                    background: invLoading ? C.text3 : C.btnBg,
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    cursor: invLoading ? 'not-allowed' : 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  {invLoading ? 'Sending…' : 'Send invite'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setInvErr(null); setInvMsg(null); }}
                  style={{
                    fontFamily: F_MONO,
                    fontSize: 11.5,
                    color: C.text2,
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>

            {invMsg && (
              <div style={{ marginTop: 10, fontFamily: F_MONO, fontSize: 11, color: C.green, background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 7, padding: '6px 12px' }}>
                ✓ {invMsg}
              </div>
            )}
            {invErr && (
              <div style={{ marginTop: 10, fontFamily: F_MONO, fontSize: 11, color: C.red, background: C.redSoft, border: `1px solid ${C.redBorder}`, borderRadius: 7, padding: '6px 12px' }}>
                {invErr}
              </div>
            )}
          </form>
        </div>
      )}

      {/* ── Action feedback ── */}
      {(actionMsg || actionErr) && (
        <div style={{
          marginBottom: 14,
          fontFamily: F_MONO,
          fontSize: 11,
          color: actionErr ? C.red : C.green,
          background: actionErr ? C.redSoft : C.greenSoft,
          border: `1px solid ${actionErr ? C.redBorder : C.greenBorder}`,
          borderRadius: 7,
          padding: '7px 14px',
        }}>
          {actionErr ?? actionMsg}
        </div>
      )}

      {/* ── Search bar ── */}
      <div style={{ marginBottom: 16 }}>
        <input
          style={{
            fontFamily: F_SANS,
            fontSize: 13,
            color: C.text,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 9,
            padding: '9px 14px',
            width: '100%',
            maxWidth: 360,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          placeholder="Search by name, email, or role…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Members table ── */}
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {/* Error state */}
        {error && !loading && (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.red, marginBottom: 12 }}>{error}</div>
            <button
              onClick={loadUsers}
              style={{
                fontFamily: F_MONO,
                fontSize: 11,
                color: C.text2,
                background: C.surface2,
                border: `1px solid ${C.border}`,
                borderRadius: 7,
                padding: '6px 14px',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!error && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Employee', 'Role', 'Status', 'Last login', 'Actions'].map(col => (
                  <th key={col} style={{
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontFamily: F_MONO,
                    fontSize: 10.5,
                    color: C.text3,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    background: C.surface2,
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [0,1,2,3,4].map(i => <SkeletonRow key={i} />)}

              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '36px 24px', textAlign: 'center', fontFamily: F_MONO, fontSize: 12, color: C.text3 }}>
                    No members found.
                  </td>
                </tr>
              )}

              {!loading && visible.map((user, idx) => {
                const isOwner = user.role.toLowerCase() === 'owner';
                const isMember = user.role.toLowerCase() === 'member';
                const isAdmin = user.role.toLowerCase() === 'admin';
                const isActive = user.status.toLowerCase() === 'active';
                const isInactiveOrPending = ['inactive', 'pending'].includes(user.status.toLowerCase());
                const isActionLoading = actionLoading !== null;
                const color = nameColor(user.name);

                return (
                  <tr
                    key={user.id}
                    style={{
                      borderBottom: idx < visible.length - 1 ? `1px solid ${C.border}` : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Employee col */}
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Avatar */}
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: color,
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: F_MONO,
                          fontSize: 12,
                          fontWeight: 600,
                          flexShrink: 0,
                          letterSpacing: '0.03em',
                        }}>
                          {initials(user.name)}
                        </div>
                        <div>
                          <div style={{ fontFamily: F_SANS, fontSize: 13.5, color: C.text, fontWeight: 500 }}>
                            {user.name}
                          </div>
                          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3 }}>
                            {user.email}
                          </div>
                          {user.job_role && (
                            <div style={{ fontFamily: F_SANS, fontSize: 11, color: C.text2, marginTop: 1 }}>
                              {user.job_role}
                            </div>
                          )}
                          {/* Discord ID inline editor */}
                          <div style={{ marginTop: 4 }}>
                            {discordEditId === user.id ? (
                              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                  value={discordValue}
                                  onChange={e => setDiscordValue(e.target.value)}
                                  placeholder="18-digit Discord ID"
                                  style={{ padding: '3px 7px', border: `1px solid ${C.border}`, borderRadius: 5, fontFamily: F_MONO, fontSize: 10.5, color: C.text, background: C.bg, width: 150 }}
                                />
                                <button onClick={() => saveDiscordId(user.id)} disabled={discordLoading}
                                  style={{ padding: '3px 8px', background: C.green, color: '#fff', border: 'none', borderRadius: 5, fontFamily: F_MONO, fontSize: 10, cursor: discordLoading ? 'not-allowed' : 'pointer' }}>
                                  {discordLoading ? '…' : 'Save'}
                                </button>
                                <button onClick={() => { setDiscordEditId(null); setDiscordErr(null); }}
                                  style={{ padding: '3px 7px', background: 'transparent', color: C.text3, border: `1px solid ${C.border}`, borderRadius: 5, fontFamily: F_MONO, fontSize: 10, cursor: 'pointer' }}>
                                  ✕
                                </button>
                                {discordMsg && <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.green }}>{discordMsg}</span>}
                                {discordErr && <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.red }}>{discordErr}</span>}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontFamily: F_MONO, fontSize: 10, color: user.discord_id ? C.text3 : C.text3 }}>
                                  {user.discord_id ? `Discord: ${user.discord_id}` : 'Discord: —'}
                                </span>
                                <button onClick={() => { setDiscordEditId(user.id); setDiscordValue(user.discord_id ?? ''); setDiscordErr(null); }}
                                  style={{ padding: '1px 6px', background: 'transparent', color: C.text3, border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: F_MONO, fontSize: 9, cursor: 'pointer' }}>
                                  Edit
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td style={{ padding: '11px 16px' }}>
                      <RolePill role={user.role} />
                    </td>

                    {/* Status */}
                    <td style={{ padding: '11px 16px' }}>
                      <StatusPill status={user.status} />
                    </td>

                    {/* Last login */}
                    <td style={{ padding: '11px 16px', fontFamily: F_MONO, fontSize: 11.5, color: C.text3 }}>
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'Never'}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '11px 16px' }}>
                      {isOwner ? (
                        <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.text3 }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {/* Promote: owner only, target is member */}
                          {adminRole === 'owner' && isMember && (
                            <OutlineBtn
                              label="Promote"
                              color={C.blue}
                              borderColor={C.blueBorder}
                              bgColor={C.blueSoft}
                              disabled={isActionLoading}
                              onClick={() => doAction(user.id, 'promote')}
                            />
                          )}

                          {/* Demote: owner only, target is admin */}
                          {adminRole === 'owner' && isAdmin && (
                            <OutlineBtn
                              label="Demote"
                              color={C.accent}
                              borderColor={C.accentBorder}
                              bgColor={C.accentSoft}
                              disabled={isActionLoading}
                              onClick={() => doAction(user.id, 'demote')}
                            />
                          )}

                          {/* Deactivate: target is active */}
                          {isActive && (
                            <OutlineBtn
                              label="Deactivate"
                              color={C.red}
                              borderColor={C.redBorder}
                              bgColor={C.redSoft}
                              disabled={isActionLoading}
                              onClick={() => doAction(user.id, 'deactivate')}
                            />
                          )}

                          {/* Activate: target is inactive or pending */}
                          {isInactiveOrPending && (
                            <OutlineBtn
                              label="Activate"
                              color={C.green}
                              borderColor={C.greenBorder}
                              bgColor={C.greenSoft}
                              disabled={isActionLoading}
                              onClick={() => doAction(user.id, 'activate')}
                            />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
