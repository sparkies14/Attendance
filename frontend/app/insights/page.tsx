import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

export default async function InsightsPage() {
  const t = await getTranslations('InsightsPage');
  const h = await headers();
  const name = h.get('x-user-name') || h.get('x-user-email') || 'Unknown';
  const role = h.get('x-user-role') || 'Unknown';

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>{t('title')}</h1>
      <hr />
      <p>{t('welcome', { name })}</p>
      <p>{t('role', { role })}</p>
      <p>{t('comingSoon')}</p>
    </main>
  );
}
