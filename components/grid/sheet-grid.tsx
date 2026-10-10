'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { SheetEngine } from '@/lib/formulas/engine';
import type { ColumnDef, SheetRow } from '@/lib/formulas/types';
import type { Role, DayStatus } from '@/lib/rbac/roles';
import {
  submitDayAction,
  approveDayAction,
  returnDayAction,
  reopenDayAction,
} from '@/app/actions/day';

export type SheetInfo = {
  id: string;
  entry_date: string;
  status: DayStatus;
  opening_balance: number | string;
  closing_balance: number | string;
};

type Props = {
  columns: ColumnDef[];
  rows: SheetRow[];
  sheet: SheetInfo;
  role: Role;
  canWrite: boolean;
  hasActiveHistorySession: boolean;
  serverToday: string;
  user: { id: string };
  defaultLocale: string;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function SheetGrid({
  columns,
  rows: initialRows,
  sheet,
  role,
  canWrite,
  hasActiveHistorySession,
  serverToday,
  user,
  defaultLocale,
}: Props) {
  const t = useTranslations();
  const supabaseRef = useRef(createClient());

  const [rows, setRows] = useState<SheetRow[]>(initialRows);
  const [active, setActive] = useState({ r: 0, c: 0 });
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const amountKey = columns.find((c) => c.isAmount)?.key;

  const display = useMemo(() => {
    const engine = new SheetEngine(columns);
    engine.setData(rows.map((r) => r.values));
    return {
      values: engine.getDisplayValues(),
      totals: engine.getColumnTotals(),
    };
  }, [rows, columns]);

  const cellValue = (r: number, c: number): string | number | null =>
    display.values[r]?.[c] ?? null;

  const colOf = (c: number): ColumnDef | undefined => columns[c];
  const isCellEditable = (c: number): boolean => {
    const col = colOf(c);
    return canWrite && !!col && !col.locked && !col.calculated;
  };

  async function persist(ri: number, next: SheetRow): Promise<void> {
    setSaveState('saving');
    const payload: Record<string, unknown> = { data: next.values };
    if (amountKey) {
      const n = Number(next.values[amountKey]);
      payload.amount = Number.isFinite(n) && n !== 0 ? n : null;
    }
    try {
      if (next.id) {
        const { error } = await supabaseRef.current
          .from('entries')
          .update(payload)
          .eq('id', next.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseRef.current
          .from('entries')
          .insert({
            ...payload,
            sheet_id: sheet.id,
            entry_date: sheet.entry_date,
            created_by: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        if (data?.id) {
          setRows((prev) => prev.map((x, i) => (i === ri ? { ...x, id: data.id as string } : x)));
        }
      }
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  function commitCell(r: number, c: number, value: string): void {
    if (!isCellEditable(c)) return;
    const col = columns[c]!;
    let v: unknown = value;
    if (col.type === 'number' || col.type === 'currency') {
      v = value === '' ? '' : Number(value);
    }
    const base = rowsRef.current[r];
    if (!base) return;
    const updated = { ...base.values, [col.key]: v };
    const next: SheetRow = { ...base, values: updated };
    setRows((prev) => prev.map((x, i) => (i === r ? { ...x, values: updated } : x)));
    void persist(r, next);
  }

  function startEdit(r: number, c: number, value: string): void {
    if (isCellEditable(c)) setEditing({ r, c, value });
  }

  function addRow(): void {
    setRows((prev) => [...prev, { id: null, values: {} }]);
    setActive({ r: rowsRef.current.length, c: 0 });
  }

  async function deleteRow(ri: number): Promise<void> {
    const row = rowsRef.current[ri];
    if (!row) return;
    setRows((prev) => prev.filter((_, i) => i !== ri));
    if (!row.id) return;
    setSaveState('saving');
    const { error } = await supabaseRef.current
      .from('entries')
      .update({ is_deleted: true })
      .eq('id', row.id);
    setSaveState(error ? 'error' : 'saved');
  }

  function onGridKeyDown(e: React.KeyboardEvent): void {
    if (editing) return;
    const lastR = rows.length - 1;
    const lastC = columns.length - 1;
    const move = (nr: number, nc: number) => {
      e.preventDefault();
      setActive({ r: nr, c: nc });
    };
    switch (e.key) {
      case 'ArrowDown': move(Math.min(active.r + 1, lastR), active.c); break;
      case 'ArrowUp': move(Math.max(active.r - 1, 0), active.c); break;
      case 'ArrowRight': move(active.r, Math.min(active.c + 1, lastC)); break;
      case 'ArrowLeft': move(active.r, Math.max(active.c - 1, 0)); break;
      case 'Tab':
        e.preventDefault();
        move(active.r, e.shiftKey ? Math.max(active.c - 1, 0) : Math.min(active.c + 1, lastC));
        break;
      case 'Enter':
        move(e.shiftKey ? Math.max(active.r - 1, 0) : Math.min(active.r + 1, lastR), active.c);
        break;
      case 'F2':
        startEdit(active.r, active.c, String(cellValue(active.r, active.c) ?? ''));
        break;
      case 'Delete':
        if (isCellEditable(active.c)) commitCell(active.r, active.c, '');
        break;
      default:
        if (e.key.length === 1 && isCellEditable(active.c)) {
          e.preventDefault();
          startEdit(active.r, active.c, e.key);
        }
    }
  }

  const saveLabel =
    saveState === 'saving' ? t('common.saving') : saveState === 'error' ? t('common.saveError') : saveState === 'saved' ? t('common.saved') : null;

  function exportCsv(): void {
    const head = columns.map((c) => (defaultLocale === 'ar' ? c.labelAr : c.label));
    const lines = [head.join(',')];
    for (const row of rows) {
      lines.push(
        columns
          .map((c) => {
            const v = row.values[c.key];
            const s = v === null || v === undefined ? '' : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      );
    }
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheet.entry_date}-${defaultLocale}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(f: File): Promise<void> {
    setImportMsg(null);
    const text = await f.text();
    const lines = text
      .replace(/^\ufeff/, '')
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '');
    if (lines.length < 2) {
      setImportMsg('grid.importFailed');
      return;
    }
    const first = lines[0];
    if (!first) {
      setImportMsg('grid.importFailed');
      return;
    }
    const head = first.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    const keyByHeader = new Map<number, string>();
    for (const col of columns) {
      const hi = head.indexOf(col.label);
      const har = head.indexOf(col.labelAr);
      const h = hi !== -1 ? hi : har;
      if (h !== -1) keyByHeader.set(h, col.key);
    }
    const parsed: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const cells = line.split(',');
      const data: Record<string, unknown> = {};
      let any = false;
      for (const [h, key] of keyByHeader) {
        const raw = (cells[h] ?? '').trim().replace(/^"|"$/g, '');
        if (raw === '') continue;
        const col = columns.find((c) => c.key === key)!;
        data[key] =
          col.type === 'number' || col.type === 'currency' ? Number(raw) : raw;
        any = true;
      }
      if (!any) continue;
      const payload: Record<string, unknown> = {
        data,
        sheet_id: sheet.id,
        entry_date: sheet.entry_date,
        created_by: user.id,
      };
      if (amountKey) {
        const n = Number(data[amountKey]);
        payload.amount = Number.isFinite(n) && n !== 0 ? n : null;
      }
      parsed.push(payload);
    }
    if (parsed.length === 0) {
      setImportMsg('grid.importFailed');
      return;
    }
    const { error } = await supabaseRef.current.from('entries').insert(parsed);
    if (error) {
      setImportMsg('grid.importFailed');
      return;
    }
    const { data } = await supabaseRef.current
      .from('entries')
      .select('id, data')
      .eq('sheet_id', sheet.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
    setRows((data ?? []).map((e) => ({ id: e.id, values: (e.data ?? {}) as Record<string, unknown> })));
    setImportMsg('grid.importDone');
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t('nav.today')}</h1>
        <span className="text-sm text-gray-500" dir="ltr">
          {serverToday}
        </span>
        <span className="rounded px-2 py-0.5 text-sm">{t(`dayStatus.${sheet.status}`)}</span>
        {saveLabel ? <span className="text-sm text-gray-500">{saveLabel}</span> : null}
      </div>

      {hasActiveHistorySession ? (
        <p role="status" className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          {t('history.activeWarning')}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 no-print">
        {canWrite ? (
          <button onClick={addRow} className="rounded border px-3 py-1 text-sm">
            + {t('common.addRow')}
          </button>
        ) : null}

        <button onClick={exportCsv} className="rounded border px-3 py-1 text-sm">
          {t('grid.export')}
        </button>
        <button onClick={() => window.print()} className="rounded border px-3 py-1 text-sm">
          {t('grid.print')}
        </button>

        {canWrite ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded border px-3 py-1 text-sm"
            >
              {t('grid.import')}
            </button>
          </>
        ) : null}
        {importMsg ? <span className="text-sm text-gray-500">{t(importMsg)}</span> : null}

        <WorkflowButtons
          role={role}
          status={sheet.status}
          sheetId={sheet.id}
          defaultLocale={defaultLocale}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" onKeyDown={onGridKeyDown} tabIndex={0}>
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="w-8 p-2 text-gray-400">#</th>
              {columns.map((col, c) => (
                <th key={col.key} className="whitespace-nowrap p-2 text-start">
                  {defaultLocale === 'ar' ? col.labelAr : col.label}
                  {col.calculated ? <span className="ms-1 text-xs text-gray-400">ƒ</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr
                key={row.id ?? `new-${r}`}
                onClick={() => setActive({ r, c: active.c })}
                className={r === active.r ? 'bg-blue-50' : ''}
              >
                <td className="p-2 text-center text-gray-400">
                  {canWrite ? (
                    <button
                      onClick={() => void deleteRow(r)}
                      className="text-gray-400 hover:text-red-600"
                      aria-label={t('common.remove')}
                    >
                      ✕
                    </button>
                  ) : (
                    r + 1
                  )}
                </td>
                {columns.map((col, c) => {
                  const value = cellValue(r, c);
                  const isActive = r === active.r && c === active.c;
                  const isEdit = editing?.r === r && editing?.c === c;
                  return (
                    <td
                      key={col.key}
                      className={`whitespace-nowrap p-0 ${
                        col.calculated ? 'bg-gray-50 text-gray-600' : ''
                      }`}
                    >
                      {isEdit ? (
                        <input
                          autoFocus
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          onBlur={() => {
                            commitCell(r, c, editing.value);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitCell(r, c, editing.value);
                              setEditing(null);
                              setActive({ r: Math.min(r + 1, rows.length - 1), c });
                            } else if (e.key === 'Tab') {
                              e.preventDefault();
                              commitCell(r, c, editing.value);
                              setEditing(null);
                              setActive({ r, c: Math.min(c + 1, columns.length - 1) });
                            } else if (e.key === 'Escape') {
                              setEditing(null);
                            }
                          }}
                          dir={col.type === 'number' || col.type === 'currency' ? 'ltr' : undefined}
                          className="w-full min-w-24 border border-blue-500 px-2 py-1 outline-none"
                        />
                      ) : (
                        <div
                          onClick={() => startEdit(r, c, String(value ?? ''))}
                          className={`cursor-text px-2 py-1 ${isActive && canWrite ? 'ring-1 ring-blue-400' : ''} ${
                            col.type === 'number' || col.type === 'currency' ? 'text-end' : ''
                          } ${value === null || value === '' ? 'text-gray-300' : ''}`}
                        >
                          {value === null || value === '' ? '' : String(value)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-gray-50 font-medium">
              <td className="p-2" />
              {columns.map((col, c) => (
                <td key={col.key} className={`p-2 ${col.type === 'number' || col.type === 'currency' ? 'text-end' : ''}`}>
                  {typeof display.totals[c] === 'number' ? String(display.totals[c]) : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}

function WorkflowButtons({
  role,
  status,
  sheetId,
  defaultLocale,
}: {
  role: Role;
  status: DayStatus;
  sheetId: string;
  defaultLocale: string;
}) {
  const t = useTranslations('day');
  const canSubmit = (role === 'super_admin' || role === 'admin' || role === 'staff') && (status === 'open' || status === 'returned');
  const canApprove = (role === 'super_admin' || role === 'admin') && status === 'submitted';
  const canReopen = role === 'super_admin' && status === 'approved';

  if (!canSubmit && !canApprove && !canReopen) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSubmit ? (
        <form action={submitDayAction}>
          <input type="hidden" name="locale" value={defaultLocale} />
          <input type="hidden" name="sheet_id" value={sheetId} />
          <button className="rounded bg-green-600 px-3 py-1 text-sm text-white">{t('submit')}</button>
        </form>
      ) : null}
      {canApprove ? (
        <>
          <form action={approveDayAction}>
            <input type="hidden" name="locale" value={defaultLocale} />
            <input type="hidden" name="sheet_id" value={sheetId} />
            <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white">{t('approve')}</button>
          </form>
          <form action={returnDayAction}>
            <input type="hidden" name="locale" value={defaultLocale} />
            <input type="hidden" name="sheet_id" value={sheetId} />
            <input name="comment" required placeholder={t('returnComment')} className="rounded border px-2 py-1 text-sm" />
            <button className="rounded bg-orange-600 px-3 py-1 text-sm text-white ms-2">{t('return')}</button>
          </form>
        </>
      ) : null}
      {canReopen ? (
        <form action={reopenDayAction}>
          <input type="hidden" name="locale" value={defaultLocale} />
          <input type="hidden" name="sheet_id" value={sheetId} />
          <input name="reason" required placeholder={t('reopenReason')} className="rounded border px-2 py-1 text-sm" />
          <button className="rounded bg-red-600 px-3 py-1 text-sm text-white ms-2">{t('reopen')}</button>
        </form>
      ) : null}
    </div>
  );
}