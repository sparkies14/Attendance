import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import LocaleToggle from '@/components/LocaleToggle';
import './globals.css';

export const metadata = {
  title: 'Anosupo AI · 出勤管理',
  viewport: 'width=device-width, initial-scale=1',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <LocaleToggle />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
