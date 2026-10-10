import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { UsersPageClient } from '@/components/users/users-page';

export const dynamic = 'force-dynamic';

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireRole(locale, ['super_admin']);

  const supabase = await createClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, language, is_active, must_change_password')
    .order('created_at', { ascending: false });

  return <UsersPageClient users={users ?? []} defaultLocale={locale} />;
}