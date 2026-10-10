export type ColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'dropdown'
  | 'checkbox'
  | 'attachment';

export type ColumnDef = {
  key: string;
  label: string;
  labelAr: string;
  type: ColumnType;
  /** Staff cannot overwrite calc/locked columns (FR-CALC-05). */
  locked?: boolean;
  calculated?: boolean;
  /** Per-row formula, {r} = 1-based row. Column letters optional: use =A{r} style. */
  formula?: string;
  options?: string[];
  /** Mirrors entries.amount so closing balances sum correctly. */
  isAmount?: boolean;
};

export type SheetRow = {
  id: string | null;
  values: Record<string, unknown>;
};