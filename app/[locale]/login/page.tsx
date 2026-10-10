import { setRequestLocale } from 'next-intl/server';
import { locales, type Locale } from '@/lib/i18n/request';
import { LoginForm } from '@/components/auth/login-form';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LoginForm defaultLocale={locale as Locale} />;
}