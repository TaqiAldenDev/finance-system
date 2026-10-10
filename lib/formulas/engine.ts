import { HyperFormula } from 'hyperformula';
import type { ColumnDef } from './types';

/**
 * Thin HyperFormula wrapper for a single grid sheet.
 * Calculated columns hold formulas; everything else is plain data.
 * Values are exact numbers from the engine — never JS float arithmetic outside (rule: money exact).
 */
export class SheetEngine {
  private readonly hf: HyperFormula;
  private readonly sheetId: number;
  private readonly columns: ColumnDef[];

  constructor(columns: ColumnDef[]) {
    this.columns = columns;
    this.hf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' });
    const sheetName = this.hf.addSheet('Sheet1');
    const sheetId = this.hf.getSheetId(sheetName);
    if (sheetId === undefined) throw new Error('sheet creation failed');
    this.sheetId = sheetId;
  }

  /** Feed rows (object keyed by column key). Calculated cells become formulas. */
  setData(rows: Record<string, unknown>[]): void {
    const width = this.columns.length;
    const matrix: (number | string | null)[][] = rows.map((row, ri) =>
      this.columns.map((col, ci) => {
        if (col.calculated && col.formula) {
          // Data rows start at Excel row 2 (row 1 is the blank header spacer).
          return col.formula.replaceAll('{r}', String(ri + 2));
        }
        const v = row[col.key];
        if (v === null || v === undefined || v === '') return null;
        if (col.type === 'number' || col.type === 'currency') {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        return String(v);
      }),
    );

    const empty = Array.from({ length: width }, () => null);
    this.hf.setSheetContent(this.sheetId, [empty, ...matrix]);
  }

  /** Computed cell values (row 0 is a blank header spacer). */
  getDisplayValues(): (string | number | null)[][] {
    return this.hf
      .getSheetValues(this.sheetId)
      .slice(1)
      .map((row) =>
        row.map((v) => {
          if (v === null || v === undefined) return null;
          return typeof v === 'number' ? v : String(v);
        }),
      );
  }

  /** Sum of every number/currency column (calculated ones use computed values). NaN-safe. */
  getColumnTotals(): Record<number, number> {
    const totals: Record<number, number> = {};
    const cells = this.getDisplayValues();
    cells.forEach((row) => {
      this.columns.forEach((col, ci) => {
        if (col.type !== 'number' && col.type !== 'currency') return;
        const v = row[ci];
        if (typeof v === 'number') totals[ci] = (totals[ci] ?? 0) + v;
      });
    });
    return totals;
  }
}