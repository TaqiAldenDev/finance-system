import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth/guards';
import { HistoryForm } from '@/components/history/history-form';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireUser(locale);
  const t = await getTranslations('nav');

  return (
    <>
      <div className="p-4">
        <Link href={`/${locale}/`} className="text-sm text-blue-600">
          ← {t('today')}
        </Link>
      </div>
      <HistoryForm defaultLocale={locale} />
    </>
  );
}