import 'server-only';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/rbac/roles';

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  language: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
};

/** Returns the profile, or null when not signed in (disabled users: also null). */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, language, is_active, must_change_password, created_at')
    .eq('id', user.id)
    .single();

  if (data?.is_active === false) return null;
  return (data as Profile) ?? null;
}

/** Redirects to the login page when not signed in. */
export async function requireUser(locale: string): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  return profile;
}

/** Redirects unless the caller has one of the allowed roles. */
export async function requireRole(locale: string, roles: Role[]): Promise<Profile> {
  const profile = await requireUser(locale);
  if (!roles.includes(profile.role)) redirect(`/${locale}/`);
  return profile;
}