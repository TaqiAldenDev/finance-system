-- Seed data. Runs on `supabase db reset`. Idempotent.

insert into public.currencies (code, name, rate, effective_date)
values ('JOD', 'Jordanian Dinar', 1, current_date)
on conflict (code) do nothing;

insert into public.settings (key, value)
values
  ('history_session', '{"history_session_minutes": 60}'::jsonb),
  ('session_timeout', '{"inactivity_minutes": 30}'::jsonb),
  ('company', '{"name": "Finance Sheets", "base_currency": "JOD", "timezone": "Asia/Amman"}'::jsonb)
on conflict (key) do nothing;

-- Default workbook + template modeled on the reference Excel (AUTO WORKSHOP).
-- Columns mirror the AMMAN sheet: vehicle, odometer, maintenance type, parts,
-- labour, payment, invoices. Two calculated columns show the formula wiring.
insert into public.templates (id, name, columns, validations, version, is_active)
values (
  '00000000-0000-0000-0000-000000000001',
  'AMMAN Daily',
  '[
    {"key": "vehicle", "label": "Vehicle", "labelAr": "المركبة", "type": "text"},
    {"key": "odometer", "label": "Odometer", "labelAr": "العداد", "type": "number"},
    {"key": "maint_type", "label": "Maintenance", "labelAr": "نوع الصيانة", "type": "dropdown",
     "options": ["صيانة 1000", "صيانة 5000", "صيانة 10000", "صيانة 20000", "غيار زيت", "فحص كمبيوتر"]},
    {"key": "parts", "label": "Parts value", "labelAr": "قيمة القطع", "type": "currency"},
    {"key": "labour", "label": "Labour", "labelAr": "أجور يد", "type": "currency"},
    {"key": "discount", "label": "Discount", "labelAr": "الخصم", "type": "currency"},
    {"key": "payment", "label": "Payment", "labelAr": "طريقة الدفع", "type": "dropdown",
     "options": ["كاش", "فيزا", "محفظة", "ذمم", "كليك"]},
    {"key": "notes", "label": "Notes", "labelAr": "ملاحظات", "type": "text"},
    {"key": "initial_invoice", "label": "Initial invoice", "labelAr": "الفاتورة الأولية",
     "type": "currency", "calculated": true, "formula": "=D{r}+E{r}-F{r}"},
    {"key": "final_invoice", "label": "Final invoice", "labelAr": "الفاتورة النهائية",
     "type": "currency", "calculated": true, "formula": "=D{r}+E{r}-F{r}"}
  ]'::jsonb,
  '{}'::jsonb,
  1,
  true
)
on conflict (id) do nothing;

insert into public.workbooks (id, name, template_id, is_active)
values (
  '00000000-0000-0000-0000-000000000002',
  'AMMAN',
  '00000000-0000-0000-0000-000000000001',
  true
)
on conflict (id) do nothing;
