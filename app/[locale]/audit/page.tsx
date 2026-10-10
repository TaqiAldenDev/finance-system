import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/guards';
import { AuditTable } from '@/components/audit/audit-table';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ action?: string; user?: string; date?: string }>;
}) {
  const { locale } = await params;
  await requireRole(locale, ['super_admin', 'admin']);
  const t = await getTranslations();
  const tnav = await getTranslations('nav');
  const sp = await searchParams;

  const supabase = await createClient();

  let query = supabase
    .from('audit_logs')
    .select('id, user_id, role, action, target_type, target_id, old_value, new_value, ip, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (sp.action && sp.action !== 'all') query = query.eq('action', sp.action);
  if (sp.user && sp.user !== 'all') query = query.eq('user_id', sp.user);
  if (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)) {
    const next = new Date(`${sp.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    query = query.gte('created_at', `${sp.date}T00:00:00Z`).lt('created_at', next.toISOString());
  }

  const [{ data: logs }, { data: users }] = await Promise.all([
    query,
    supabase.from('profiles').select('id, email').order('email'),
  ]);

  const emailByUserId = new Map((users ?? []).map((u) => [u.id, u.email]));

  return (
    <>
      <div className="p-4">
        <Link href={`/${locale}/`} className="text-sm text-blue-600">
          ← {tnav('today')}
        </Link>
      </div>
      <main className="mx-auto max-w-6xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t('audit.title')}</h1>
        <AuditTable
          logs={logs ?? []}
          emailByUserId={emailByUserId}
          defaultLocale={locale}
        />
      </main>
    </>
  );
}