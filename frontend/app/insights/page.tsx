import { getTranslations } from 'next-intl/server';
import { headers, cookies } from 'next/headers';
import DateRangePicker from '@/components/insights/DateRangePicker';
import AttentionWidget from '@/components/insights/AttentionWidget';
import TardyChart from '@/components/insights/TardyChart';
import LeaveChart from '@/components/insights/LeaveChart';
import DisciplineChart from '@/components/insights/DisciplineChart';
import ExportButtons from '@/components/insights/ExportButtons';

interface TardyMember      { name: string; minor: number; major: number; awolHalf: number; awolFull: number; }
interface LeaveMember      { name: string; used: number; remaining: number; }
interface DisciplineMember { name: string; active: number; }
interface AttentionMember  { name: string; email: string; reasons: string[]; }

function getDefaultDates(): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

async function safeFetch<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const t = await getTranslations('InsightsPage');
  const h = await headers();
  const name = h.get('x-user-name') || h.get('x-user-email') || 'Unknown';
  const role = h.get('x-user-role') || 'Unknown';

  const params = await searchParams;
  const defaults = getDefaultDates();
  const from = params.from && isValidDate(params.from) ? params.from : defaults.from;
  const to   = params.to   && isValidDate(params.to)   ? params.to   : defaults.to;

  const cookieStore = await cookies();
  const token  = cookieStore.get('att_token')?.value ?? '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  const [tardyRaw, leaveRaw, disciplineRaw, attentionRaw] = await Promise.all([
    safeFetch<{ members: Record<string, unknown>[] }>(`${apiUrl}/reports/tardy?from=${from}&to=${to}`, token),
    safeFetch<{ members: Record<string, unknown>[] }>(`${apiUrl}/reports/leave?from=${from}&to=${to}`, token),
    safeFetch<{ members: Record<string, unknown>[] }>(`${apiUrl}/reports/discipline?from=${from}&to=${to}`, token),
    safeFetch<{ members: AttentionMember[] }>(`${apiUrl}/reports/attention`, token),
  ]);

  const tardyMembers: TardyMember[] | null = tardyRaw?.members?.map(m => ({
    name: String(m.name), minor: Number(m.minor), major: Number(m.major),
    awolHalf: Number(m.awolHalf), awolFull: Number(m.awolFull),
  })) ?? null;

  const leaveMembers: LeaveMember[] | null = leaveRaw?.members?.map(m => ({
    name: String(m.name), used: Number(m.used), remaining: Number(m.remaining),
  })) ?? null;

  const disciplineMembers: DisciplineMember[] | null = disciplineRaw?.members?.map(m => ({
    name: String(m.name), active: Number(m.active),
  })) ?? null;

  const attentionMembers: AttentionMember[] = attentionRaw?.members ?? [];

  const sectionHeaderStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    margin: '0 0 0.75rem 0',
  } as const;

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>{t('title')}</h1>
      <p>
        {t('welcome', { name })} &mdash; {t('role', { role })}
      </p>

      <DateRangePicker
        initialFrom={from}
        initialTo={to}
        labelFrom={t('dateFrom')}
        labelTo={t('dateTo')}
        labelApply={t('apply')}
        errorMessage={t('dateError')}
      />

      <section>
        <h2>{t('attentionTitle')}</h2>
        <AttentionWidget
          members={attentionMembers}
          emptyMessage={t('noAttention')}
        />
      </section>

      <section style={{ marginTop: '2rem' }}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0 }}>{t('tardyTitle')}</h2>
          <ExportButtons
            section="tardy"
            from={from}
            to={to}
            csvLabel={t('downloadCsv')}
            pdfLabel={t('downloadPdf')}
          />
        </div>
        {tardyMembers === null ? (
          <p style={{ color: 'red' }}>{t('errorLoad', { section: 'tardy' })}</p>
        ) : (
          <TardyChart
            members={tardyMembers}
            emptyMessage={t('noTardy')}
            legendMinor={t('legendMinor')}
            legendMajor={t('legendMajor')}
            legendAwolHalf={t('legendAwolHalf')}
            legendAwolFull={t('legendAwolFull')}
          />
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0 }}>{t('leaveTitle')}</h2>
          <ExportButtons
            section="leave"
            from={from}
            to={to}
            csvLabel={t('downloadCsv')}
            pdfLabel={t('downloadPdf')}
          />
        </div>
        {leaveMembers === null ? (
          <p style={{ color: 'red' }}>{t('errorLoad', { section: 'leave' })}</p>
        ) : (
          <LeaveChart
            members={leaveMembers}
            legendUsed={t('legendUsed')}
            legendRemaining={t('legendRemaining')}
          />
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0 }}>{t('disciplineTitle')}</h2>
          <ExportButtons
            section="discipline"
            from={from}
            to={to}
            csvLabel={t('downloadCsv')}
            pdfLabel={t('downloadPdf')}
          />
        </div>
        {disciplineMembers === null ? (
          <p style={{ color: 'red' }}>{t('errorLoad', { section: 'discipline' })}</p>
        ) : (
          <DisciplineChart
            members={disciplineMembers}
            emptyMessage={t('noWarnings')}
            legendActive={t('legendActive')}
          />
        )}
      </section>
    </main>
  );
}
