'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRole, requireUser } from '@/lib/auth/guards';

const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type SignInState = { message: string } | null;

export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { message: 'auth.invalidCredentials' };
  }

  const locale = (formData.get('locale') ?? 'en').toString();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Rate-limited failures are surfaced verbatim; never leak server internals.
    return { message: error.code === 'invalid_credentials' ? 'auth.invalidCredentials' : 'errors.generic' };
  }

  // Forced first-login password change (FR-AUTH-03, AC-01).
  const { data: profile } = await supabase
    .from('profiles')
    .select('must_change_password, is_active')
    .single();

  if (profile?.is_active === false) {
    await supabase.auth.signOut();
    return { message: 'errors.notAllowed' };
  }
  if (profile?.must_change_password) {
    redirect(`/${locale}/change-password`);
  }

  redirect(`/${locale}/`);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/en');
}

const changePasswordSchema = z.object({
  password: z
    .string()
    .min(10, 'auth.passwordTooShort')
    .regex(/[a-zA-Z]/, 'auth.passwordTooShort')
    .regex(/[0-9]/, 'auth.passwordTooShort'),
});

export type ChangePasswordState = { message: string } | null;

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const locale = (formData.get('locale') ?? 'en').toString();
  const parsed = changePasswordSchema.safeParse({
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? 'errors.generic' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { message: 'errors.generic' };

  // Clear the forced-change flag server-side.
  const admin = createAdminClient();
  await admin.from('profiles').update({ must_change_password: false }).eq('id', user.id);

  redirect(`/${locale}/`);
}

const createUserSchema = z.object({
  full_name: z.string().trim().min(2),
  email: z.string().trim().email(),
  role: z.enum(['super_admin', 'admin', 'staff']),
  language: z.enum(['en', 'ar']),
});

export type CreateUserState = { message: string; ok?: boolean; tempPassword?: string } | null;

export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const locale = (formData.get('locale') ?? 'en').toString();
  await requireRole(locale, ['super_admin']);

  const parsed = createUserSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    role: formData.get('role'),
    language: formData.get('language'),
  });
  if (!parsed.success) return { message: 'errors.generic' };

  // Temporary password; the user must change it on first login.
  const tempPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 14);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name, language: parsed.data.language },
  });

  if (error) return { message: 'errors.generic' };
  if (!data.user) return { message: 'errors.generic' };

  // Profile trigger defaults the role to staff; elevate explicitly.
  const { error: profileError } = await admin
    .from('profiles')
    .update({ role: parsed.data.role, full_name: parsed.data.full_name })
    .eq('id', data.user.id);
  if (profileError) return { message: 'errors.generic' };

  // Shown once to the creator, never logged or stored (rule 9 / NFR-SEC-04).
  return { message: 'users.created', ok: true, tempPassword };
}

const updateUserSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['super_admin', 'admin', 'staff']).optional(),
  is_active: z.boolean().optional(),
});

export async function updateUserAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const locale = (formData.get('locale') ?? 'en').toString();
  await requireRole(locale, ['super_admin']);

  const parsed = updateUserSchema.safeParse({
    user_id: formData.get('user_id'),
    role: formData.get('role') ?? undefined,
    is_active: formData.get('is_active') === 'true' ? true : formData.get('is_active') === 'false' ? false : undefined,
  });
  if (!parsed.success) return { message: 'errors.generic' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ role: parsed.data.role, is_active: parsed.data.is_active })
    .eq('id', parsed.data.user_id);
  if (error) return { message: 'errors.generic' };

  return { message: 'users.updated', ok: true };
}

export async function resetUserPasswordAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const locale = (formData.get('locale') ?? 'en').toString();
  await requireRole(locale, ['super_admin']);

  const user_id = z.string().uuid().safeParse(formData.get('user_id'));
  if (!user_id.success) return { message: 'errors.generic' };

  const tempPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 14);
  const admin = createAdminClient();

  const { error: authError } = await admin.auth.admin.updateUserById(user_id.data, {
    password: tempPassword,
  });
  if (authError) return { message: 'errors.generic' };

  const { error: profileError } = await admin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', user_id.data);
  if (profileError) return { message: 'errors.generic' };

  return { message: 'users.passwordReset', ok: true };
}

/** Staff-only history session creation. */
const historySessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(3),
});

export type HistorySessionState = { message: string } | null;

export async function createHistorySessionAction(
  _prev: HistorySessionState,
  formData: FormData,
): Promise<HistorySessionState> {
  const locale = (formData.get('locale') ?? 'en').toString();
  await requireUser(locale);

  const parsed = historySessionSchema.safeParse({
    date: formData.get('date'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { message: 'history.reasonRequired' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('create_history_session', {
    p_date: parsed.data.date,
    p_reason: parsed.data.reason,
  });
  if (error) return { message: error.message === 'a reason is required' ? 'history.reasonRequired' : 'errors.generic' };

  redirect(`/${locale}/?history=${parsed.data.date}`);
}