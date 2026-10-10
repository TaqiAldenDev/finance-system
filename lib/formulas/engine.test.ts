import { describe, expect, it } from 'vitest';
import { SheetEngine } from './engine';
import type { ColumnDef, SheetRow } from './types';

// Column layout mirrors the seed template (AMMAN reference): D=parts, E=labour, F=discount.
const cols: ColumnDef[] = [
  { key: 'vehicle', label: 'Vehicle', labelAr: 'المركبة', type: 'text' },
  { key: 'odometer', label: 'Odometer', labelAr: 'العداد', type: 'number' },
  { key: 'maint_type', label: 'Maintenance type', labelAr: 'نوع الصيانة', type: 'text' },
  { key: 'parts', label: 'Parts', labelAr: 'قطع', type: 'currency', isAmount: true },
  { key: 'labour', label: 'Labour', labelAr: 'صيانة', type: 'currency' },
  { key: 'discount', label: 'Discount', labelAr: 'خصم', type: 'currency' },
  { key: 'payment', label: 'Payment', labelAr: 'الدفع', type: 'text' },
  { key: 'notes', label: 'Notes', labelAr: 'ملاحظات', type: 'text' },
  {
    key: 'initial_invoice',
    label: 'Initial invoice',
    labelAr: 'الفاتورة الأولية',
    type: 'currency',
    calculated: true,
    formula: '=D{r}+E{r}-F{r}',
  },
  {
    key: 'final_invoice',
    label: 'Final invoice',
    labelAr: 'الفاتورة النهائية',
    type: 'currency',
    calculated: true,
    formula: '=D{r}+E{r}-F{r}',
  },
];

const D = 3;
const E = 4;
const F = 5;
const INITIAL = 8;
const FINAL = 9;

function rows(values: Record<string, unknown>[]): SheetRow[] {
  return values.map((v) => ({ id: null, values: v }));
}

describe('SheetEngine', () => {
  it('computes calculated columns from D/E/F cell references', () => {
    const engine = new SheetEngine(cols);
    engine.setData(
      rows([
        { vehicle: 'A', parts: 100, labour: 50, discount: 20 },
        { vehicle: 'B', parts: 10, labour: 5, discount: 0 },
      ]).map((r) => r.values),
    );
    const display = engine.getDisplayValues();
    expect(display[0]?.[INITIAL]).toBe(130);
    expect(display[1]?.[INITIAL]).toBe(15);
    expect(display[0]?.[FINAL]).toBe(130);
  });

  it('formula starts after the blank header row', () => {
    const engine = new SheetEngine(cols);
    engine.setData(rows([{ parts: 200, labour: 0, discount: 0 }]).map((r) => r.values));
    expect(engine.getDisplayValues()[0]?.[INITIAL]).toBe(200);
  });

  it('sums data columns and calculated columns without counting the header', () => {
    const engine = new SheetEngine(cols);
    const data = rows([
      { vehicle: 'A', parts: 100, labour: 50, discount: 20 },
      { vehicle: 'B', parts: 10, labour: 5, discount: 0 },
    ]);
    engine.setData(data.map((r) => r.values));
    const totals = engine.getColumnTotals();
    expect(totals[D]).toBe(110);
    expect(totals[E]).toBe(55);
    expect(totals[F]).toBe(20);
    expect(totals[INITIAL]).toBe(145);
    expect(totals[FINAL]).toBe(145);
  });

  it('handles empty rows without crashing', () => {
    const engine = new SheetEngine(cols);
    engine.setData(
      rows([{}, { vehicle: 'X', parts: 5, labour: 5, discount: 0 }]).map((r) => r.values),
    );
    expect(engine.getDisplayValues()[1]?.[INITIAL]).toBe(10);
  });
});