'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireRole, requireUser } from '@/lib/auth/guards';

function localeOf(formData: FormData): string {
  return (formData.get('locale') ?? 'en').toString();
}

export async function submitDayAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  await requireRole(locale, ['super_admin', 'admin', 'staff']);
  const sheetId = z.string().uuid().parse(formData.get('sheet_id'));

  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_day', { p_sheet: sheetId });
  if (error) throw new Error(error.message);

  revalidatePath(`/${locale}/`);
  redirect(`/${locale}/`);
}

export async function approveDayAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  await requireRole(locale, ['super_admin', 'admin']);
  const sheetId = z.string().uuid().parse(formData.get('sheet_id'));

  const supabase = await createClient();
  const { error } = await supabase.rpc('approve_day', { p_sheet: sheetId });
  if (error) throw new Error(error.message);

  revalidatePath(`/${locale}/`);
  redirect(`/${locale}/`);
}

export async function returnDayAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  await requireRole(locale, ['super_admin', 'admin']);
  const sheetId = z.string().uuid().parse(formData.get('sheet_id'));
  const comment = z.string().trim().min(1).parse(formData.get('comment'));

  const supabase = await createClient();
  const { error } = await supabase.rpc('return_day', {
    p_sheet: sheetId,
    p_comment: comment,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/${locale}/`);
  redirect(`/${locale}/`);
}

export async function reopenDayAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  await requireRole(locale, ['super_admin']);
  const sheetId = z.string().uuid().parse(formData.get('sheet_id'));
  const reason = z.string().trim().min(1).parse(formData.get('reason'));

  const supabase = await createClient();
  const { error } = await supabase.rpc('reopen_day', {
    p_sheet: sheetId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/${locale}/`);
  redirect(`/${locale}/`);
}

export type HistoryFormState = { message: string } | null;

/** Staff history-session request: date + reason -> read-only session (FR-ACC-04). */
export async function requestHistorySessionAction(
  _prev: HistoryFormState,
  formData: FormData,
): Promise<HistoryFormState> {
  const locale = localeOf(formData);
  await requireUser(locale);
  const parsed = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().trim().min(3),
    })
    .safeParse({ date: formData.get('date'), reason: formData.get('reason') });
  if (!parsed.success) return { message: 'history.reasonRequired' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('create_history_session', {
    p_date: parsed.data.date,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return {
      message: error.message === 'history sessions are only for past days'
        ? 'history.pastOnly'
        : 'errors.generic',
    };
  }

  revalidatePath(`/${locale}/`);
  redirect(`/${locale}/?history=${parsed.data.date}`);
}