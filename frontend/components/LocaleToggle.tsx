'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export default function LocaleToggle() {
  const locale = useLocale();
  const t = useTranslations('LocaleToggle');
  const router = useRouter();

  function handleToggle() {
    const next = locale === 'en' ? 'ja' : 'en';
    document.cookie = `att_locale=${next}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <button
      onClick={handleToggle}
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        fontSize: '0.8rem',
        padding: '0.25rem 0.75rem',
        background: '#f3f4f6',
        border: '1px solid #d1d5db',
        borderRadius: '4px',
        cursor: 'pointer',
        zIndex: 1000,
      }}
    >
      {t('label')}
    </button>
  );
}
