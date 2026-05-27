import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';

export default async function HelpPage() {
  const t = await getTranslations('HelpPage');
  const h = await headers();
  const name = h.get('x-user-name') || h.get('x-user-email') || 'Unknown';
  const role = h.get('x-user-role') || 'Unknown';

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>{t('title')}</h1>
      <p>
        {t('welcome', { name })} &mdash; {t('role', { role })}
      </p>
      <p>
        <Link href="/insights">{t('backToInsights')}</Link>
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2>{t('tardyTitle')}</h2>
        <p>{t('tardyIntro')}</p>
        <ul>
          <li>{t('tardyMinor')}</li>
          <li>{t('tardyMajor')}</li>
          <li>{t('tardyAwolHalf')}</li>
          <li>{t('tardyAwolFull')}</li>
        </ul>
        <p>{t('tardyNote')}</p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>{t('leaveTitle')}</h2>
        <p>{t('leaveText')}</p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>{t('disciplineTitle')}</h2>
        <p>{t('disciplineText')}</p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>{t('appealsTitle')}</h2>
        <p>{t('appealsText')}</p>
      </section>
    </main>
  );
}
