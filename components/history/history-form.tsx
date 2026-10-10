'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  requestHistorySessionAction,
  type HistoryFormState,
} from '@/app/actions/day';

export function HistoryForm({ defaultLocale }: { defaultLocale: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<HistoryFormState, FormData>(
    requestHistorySessionAction,
    null,
  );

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t('history.title')}</h1>
      <p className="text-sm text-gray-500">{t('history.hint')}</p>

      <form action={formAction} className="space-y-3 rounded-lg border p-4">
        <input type="hidden" name="locale" value={defaultLocale} />

        <label className="block space-y-1">
          <span className="text-sm">{t('history.date')}</span>
          <input
            name="date"
            type="date"
            required
            className="w-full rounded border px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm">{t('history.reason')}</span>
          <input
            name="reason"
            type="text"
            required
            minLength={3}
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
          {t('history.create')}
        </button>
      </form>
    </main>
  );
}