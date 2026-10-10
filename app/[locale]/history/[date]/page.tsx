import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/guards';
import { SheetGrid, type SheetInfo } from '@/components/grid/sheet-grid';
import type { ColumnDef, SheetRow } from '@/lib/formulas/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HistoryDatePage({
  params,
}: {
  params: Promise<{ locale: string; date: string }>;
}) {
  const { locale, date } = await params;
  const profile = await requireUser(locale);
  const t = await getTranslations();
  const tnav = await getTranslations('nav');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return (
      <main className="p-6">
        <p>{t('errors.generic')}</p>
      </main>
    );
  }

  const serverToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date());
  if (profile.role === 'staff' && date >= serverToday) {
    return (
      <main className="p-6">
        <p>{t('history.pastOnly')}</p>
      </main>
    );
  }

  const supabase = await createClient();

  const { data: workbook } = await supabase
    .from('workbooks')
    .select('id, template_id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!workbook) return <main className="p-6"><p>{t('errors.noWorkbook')}</p></main>;

  const { data: sheet } = await supabase
    .from('daily_sheets')
    .select('*')
    .eq('workbook_id', workbook.id)
    .eq('entry_date', date)
    .maybeSingle();

  // Staff may only reach this page with an active session; RLS enforces it.
  const hasSession = profile.role === 'staff'
    ? await supabase
        .from('history_sessions')
        .select('expires_at')
        .eq('user_id', profile.id)
        .eq('target_date', date)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
    : null;

  if (!sheet || (profile.role === 'staff' && !hasSession?.data)) {
    return (
      <main className="p-6">
        <p>{t('history.noPastAccess')}</p>
      </main>
    );
  }

  const { data: template } = workbook.template_id
    ? await supabase.from('templates').select('columns').eq('id', workbook.template_id).single()
    : { data: null };
  const { data: entries } = await supabase
    .from('entries')
    .select('id, data')
    .eq('sheet_id', sheet.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  const columns = (template?.columns ?? []) as ColumnDef[];
  const rows: SheetRow[] = (entries ?? []).map((e) => ({
    id: e.id,
    values: (e.data ?? {}) as Record<string, unknown>,
  }));

  const sheetInfo: SheetInfo = {
    id: sheet.id,
    entry_date: sheet.entry_date,
    status: sheet.status,
    opening_balance: sheet.opening_balance,
    closing_balance: sheet.closing_balance,
  };

  const expiresAt = hasSession?.data?.expires_at
    ? new Date(hasSession.data.expires_at as string).toLocaleString(
        locale === 'ar' ? 'ar-JO' : 'en-GB',
        { timeZone: 'Asia/Amman' },
      )
    : null;

  return (
    <>
      <div className="p-4">
        <Link href={`/${locale}/history`} className="text-sm text-blue-600">
          ← {tnav('history')}
        </Link>
      </div>
      {expiresAt ? (
        <div className="mx-auto max-w-6xl px-6">
          <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
            {t('history.activeUntil')}: <strong dir="ltr">{expiresAt}</strong>
          </p>
        </div>
      ) : null}
      <SheetGrid
        columns={columns}
        rows={rows}
        sheet={sheetInfo}
        role={profile.role}
        canWrite={false}
        hasActiveHistorySession={false}
        serverToday={serverToday}
        user={{ id: profile.id }}
        defaultLocale={locale}
      />
    </>
  );
}