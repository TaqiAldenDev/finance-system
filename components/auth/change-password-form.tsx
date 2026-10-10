'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  changePasswordAction,
  type ChangePasswordState,
} from '@/app/actions/auth';

export function ChangePasswordForm({ defaultLocale }: { defaultLocale: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<
    ChangePasswordState,
    FormData
  >(changePasswordAction, null);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-lg border p-6 shadow-sm"
      >
        <input type="hidden" name="locale" value={defaultLocale} />
        <h1 className="text-xl font-semibold">{t('auth.changePassword')}</h1>
        <p className="text-sm text-gray-600">{t('auth.mustChangePassword')}</p>

        <label className="block space-y-1">
          <span className="text-sm">{t('auth.newPassword')}</span>
          <input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="w-full rounded border px-3 py-2"
          />
        </label>

        {state?.message ? (
          <p role="alert" className="text-sm text-red-600">
            {t(state.message)}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {t('auth.changePassword')}
        </button>
      </form>
    </main>
  );
}