import { setRequestLocale } from 'next-intl/server';
import { locales, type Locale } from '@/lib/i18n/request';
import { ChangePasswordForm } from '@/components/auth/change-password-form';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function ChangePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ChangePasswordForm defaultLocale={locale as Locale} />;
}