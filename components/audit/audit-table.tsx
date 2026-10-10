'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';

type AuditLogRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  old_value: unknown;
  new_value: unknown;
  ip: string | null;
  created_at: string;
};

export function AuditTable({
  logs,
  emailByUserId,
  defaultLocale,
}: {
  logs: AuditLogRow[];
  emailByUserId: Map<string, string>;
  defaultLocale: string;
}) {
  const t = useTranslations('audit');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locallyFiltered, setLocallyFiltered] = useState<string>('all');

  const actions = useMemo(
    () => [...new Set(logs.map((l) => l.action))].sort(),
    [logs],
  );
  const actionFilter =
    searchParams.get('action') && searchParams.get('action') !== 'all'
      ? searchParams.get('action')!
      : locallyFiltered !== 'all'
        ? locallyFiltered
        : 'all';

  const filtered = actionFilter === 'all' ? logs : logs.filter((l) => l.action === actionFilter);

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const action = String(fd.get('action') ?? 'all');
          router.replace(`/${defaultLocale}/audit?action=${encodeURIComponent(action)}`);
        }}
      >
        <select name="action" defaultValue={actionFilter} className="rounded border px-2 py-1">
          <option value="all">{t('allActions')}</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {actionLabel(t, a)}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-white">
          {t('apply')}
        </button>
      </form>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-start">
              <th className="p-2 text-start">{t('time')}</th>
              <th className="p-2 text-start">{t('user')}</th>
              <th className="p-2 text-start">{t('action')}</th>
              <th className="p-2 text-start">{t('target')}</th>
              <th className="p-2 text-start">{t('changes')}</th>
              <th className="p-2 text-start">{t('ip')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2 whitespace-nowrap" dir="ltr">
                  {new Date(l.created_at).toLocaleString(defaultLocale === 'ar' ? 'ar-JO' : 'en-GB', {
                    timeZone: 'Asia/Amman',
                  })}
                </td>
                <td className="p-2" dir="ltr">
                  {l.user_id ? (emailByUserId.get(l.user_id) ?? '—') : '—'}
                </td>
                <td className="p-2">
                  {actionLabel(t, l.action)}
                  {l.role ? ` · ${l.role}` : ''}
                </td>
                <td className="p-2" dir="ltr">
                  {[l.target_type, l.target_id].filter(Boolean).join(' / ') || '—'}
                </td>
                <td className="p-2 font-mono text-xs" dir="ltr">
                  <JsonCell value={l.old_value} label="→" />
                  {l.old_value !== null && l.new_value !== null ? ' | ' : ''}
                  <JsonCell value={l.new_value} label="" />
                </td>
                <td className="p-2" dir="ltr">
                  {l.ip ?? '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  {t('noRows')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const KNOWN_ACTIONS = new Set([
  'insert',
  'update',
  'soft_delete',
  'submit',
  'approve',
  'return',
  'reopen',
  'history_session',
  'user_created',
  'password_changed',
]);

function actionLabel(t: (key: string) => string, action: string): string {
  return KNOWN_ACTIONS.has(action) ? t(`actions.${action}`) : action;
}

function JsonCell({ value, label }: { value: unknown; label: string }) {
  if (value === null || value === undefined) return null;
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s === '{}' || s === '[]') return null;
  return (
    <span>
      {label ? <span className="opacity-60">{label} </span> : null}
      {s.length > 120 ? `${s.slice(0, 120)}…` : s}
    </span>
  );
}