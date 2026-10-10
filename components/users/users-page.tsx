'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  createUserAction,
  updateUserAction,
  resetUserPasswordAction,
  type CreateUserState,
} from '@/app/actions/auth';
import type { Role } from '@/lib/rbac/roles';

export type ListedUser = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  language: string;
  is_active: boolean;
  must_change_password: boolean;
};

export function UsersPageClient({
  users,
  defaultLocale,
}: {
  users: ListedUser[];
  defaultLocale: string;
}) {
  const t = useTranslations('users');
  const tr = useTranslations('roles');
  const tAll = useTranslations();

  const [createState, createAction, createPending] = useActionState<
    CreateUserState,
    FormData
  >(createUserAction, null);
  const [updateState, updateAction] = useActionState<CreateUserState, FormData>(
    updateUserAction,
    null,
  );
  const [resetState, resetAction] = useActionState<CreateUserState, FormData>(
    resetUserPasswordAction,
    null,
  );

  const msg = (state: CreateUserState) =>
    state?.message ? tAll(state.message) : null;

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">{t('title')}</h1>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-medium">{t('create')}</h2>
        <form action={createAction} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="locale" value={defaultLocale} />
          <input name="full_name" required placeholder={t('fullName')} className="rounded border px-3 py-2" />
          <input name="email" type="email" required placeholder="email" className="rounded border px-3 py-2" />
          <select name="role" className="rounded border px-3 py-2">
            <option value="staff">{tr('staff')}</option>
            <option value="admin">{tr('admin')}</option>
            <option value="super_admin">{tr('super_admin')}</option>
          </select>
          <select name="language" className="rounded border px-3 py-2">
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
          <button type="submit" disabled={createPending} className="col-span-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
            {t('create')}
          </button>
        </form>
        {createState?.message && createState.ok ? (
          <>
            <p className="mt-3 text-sm text-green-700">{t('created')}</p>
            <p className="mt-2 text-sm">
              {t('tempPasswordNote')}{' '}
              <code className="rounded bg-gray-100 px-2 py-0.5" dir="ltr">
                {createState.tempPassword}
              </code>
            </p>
          </>
        ) : null}
        {createState?.message && !createState.ok ? (
          <p className="mt-3 text-sm text-red-600">{tAll(createState.message)}</p>
        ) : null}
      </section>

      <section className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start">
              <th className="p-3 text-start">{t('fullName')}</th>
              <th className="p-3 text-start">Email</th>
              <th className="p-3 text-start">{t('role')}</th>
              <th className="p-3 text-start">{t('language')}</th>
              <th className="p-3 text-start">{/* actions */}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="p-3">
                  {u.full_name}
                  {u.must_change_password ? (
                    <span className="ms-2 text-xs text-amber-600">⚠</span>
                  ) : null}
                </td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">{tr(u.role)}</td>
                <td className="p-3">{u.language}</td>
                <td className="p-3">
                  <form action={resetAction} className="inline-flex gap-2">
                    <input type="hidden" name="locale" value={defaultLocale} />
                    <input type="hidden" name="user_id" value={u.id} />
                    <button
                      type="submit"
                      className="rounded border px-2 py-1 text-xs"
                    >
                      {t('passwordReset')}
                    </button>
                  </form>
                  <form action={updateAction} className="inline-flex gap-2 ms-2">
                    <input type="hidden" name="locale" value={defaultLocale} />
                    <input type="hidden" name="user_id" value={u.id} />
                    <select
                      name="role"
                      defaultValue={u.role}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      <option value="staff">{tr('staff')}</option>
                      <option value="admin">{tr('admin')}</option>
                      <option value="super_admin">{tr('super_admin')}</option>
                    </select>
                    <select
                      name="is_active"
                      defaultValue={u.is_active ? 'true' : 'false'}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      <option value="true">active</option>
                      <option value="false">disabled</option>
                    </select>
                    <button type="submit" className="rounded border px-2 py-1 text-xs">
                      save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {updateState?.message ? (
          <p className="p-3 text-sm text-green-700">{msg(updateState)}</p>
        ) : null}
        {resetState?.message ? (
          <p className="p-3 text-sm text-green-700">{msg(resetState)}</p>
        ) : null}
      </section>
    </main>
  );
}