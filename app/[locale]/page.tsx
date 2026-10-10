import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/guards';
import { canWriteEntries } from '@/lib/rbac/roles';
import { SheetGrid, type SheetInfo } from '@/components/grid/sheet-grid';
import type { ColumnDef, SheetRow } from '@/lib/formulas/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const profile = await requireUser(locale);
  const t = await getTranslations('errors');
  const tnav = await getTranslations('nav');

  const supabase = await createClient();

  // Server-side date in Asia/Amman — never from the client (rule 2).
  const serverToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date());

  const { data: workbook } = await supabase
    .from('workbooks')
    .select('id, template_id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!workbook) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p>{t('noWorkbook')}</p>
      </main>
    );
  }

  const { data: sheetId } = await supabase.rpc('ensure_today_sheet', {
    p_workbook: workbook.id,
  });
  if (!sheetId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p>{t('generic')}</p>
      </main>
    );
  }

  const { data: sheet } = await supabase
    .from('daily_sheets')
    .select('id, entry_date, status, opening_balance, closing_balance')
    .eq('id', sheetId)
    .single();

  const { data: template } = workbook.template_id
    ? await supabase
        .from('templates')
        .select('columns')
        .eq('id', workbook.template_id)
        .single()
    : { data: null };

  const { data: entries } = await supabase
    .from('entries')
    .select('id, data, amount')
    .eq('sheet_id', sheetId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  const { count: activeSessions } = await supabase
    .from('history_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .gt('expires_at', new Date().toISOString());

  if (!sheet) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p>{t('generic')}</p>
      </main>
    );
  }

  const columns = (template?.columns ?? []) as ColumnDef[];
  const rows: SheetRow[] = (entries ?? []).map((e) => ({
    id: e.id,
    values: (e.data ?? {}) as Record<string, unknown>,
  }));

  const hasItems = columns.length > 0;

  const sheetInfo: SheetInfo = {
    id: sheet.id,
    entry_date: sheet.entry_date,
    status: sheet.status,
    opening_balance: sheet.opening_balance,
    closing_balance: sheet.closing_balance,
  };

  const canWrite = canWriteEntries(
    profile.role,
    sheet.status,
    serverToday,
    serverToday,
    (activeSessions ?? 0) > 0,
  );

  if (!hasItems) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p>{t('noWorkbook')}</p>
      </main>
    );
  }

  return (
    <>
      <div className="p-4">
        <Link href={`/${locale}/history`} className="text-sm text-blue-600">
          {tnav('history')}
        </Link>
      </div>
      <SheetGrid
      columns={columns}
      rows={rows}
      sheet={sheetInfo}
      role={profile.role}
      canWrite={canWrite}
      hasActiveHistorySession={(activeSessions ?? 0) > 0}
      serverToday={serverToday}
      user={{ id: profile.id }}
        defaultLocale={locale}
      />
    </>
  );
}