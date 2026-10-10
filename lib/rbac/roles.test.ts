import { describe, expect, it } from 'vitest';
import {
  canReadDate,
  canWriteEntries,
  canSubmit,
  canApprove,
  canReopen,
  canViewAuditRecord,
} from './roles';

const TODAY = '2026-10-10';
const PAST = '2026-10-09';

describe('canReadDate (mirrors entries_select)', () => {
  it('admins read any date', () => {
    expect(canReadDate('super_admin', PAST, TODAY, false)).toBe(true);
    expect(canReadDate('admin', PAST, TODAY, false)).toBe(true);
  });
  it('staff read today without a session', () => {
    expect(canReadDate('staff', TODAY, TODAY, false)).toBe(true);
  });
  it('staff read the past only with an active history session', () => {
    expect(canReadDate('staff', PAST, TODAY, false)).toBe(false);
    expect(canReadDate('staff', PAST, TODAY, true)).toBe(true);
  });
});

describe('canWriteEntries (mirrors entries insert/update)', () => {
  it('staff write only today, open/returned, outside a history session', () => {
    expect(canWriteEntries('staff', 'open', TODAY, TODAY, false)).toBe(true);
    expect(canWriteEntries('staff', 'returned', TODAY, TODAY, false)).toBe(true);
    expect(canWriteEntries('staff', 'open', PAST, TODAY, false)).toBe(false);
    expect(canWriteEntries('staff', 'open', TODAY, TODAY, true)).toBe(false);
    expect(canWriteEntries('staff', 'submitted', TODAY, TODAY, false)).toBe(false);
    expect(canWriteEntries('staff', 'approved', TODAY, TODAY, false)).toBe(false);
  });
  it('admin writes any unlocked day', () => {
    expect(canWriteEntries('admin', 'open', PAST, TODAY, false)).toBe(true);
    expect(canWriteEntries('admin', 'submitted', PAST, TODAY, false)).toBe(true);
    expect(canWriteEntries('admin', 'approved', TODAY, TODAY, false)).toBe(false);
  });
  it('super_admin always writes', () => {
    expect(canWriteEntries('super_admin', 'approved', TODAY, TODAY, false)).toBe(true);
  });
});

describe('workflow state machine', () => {
  it('submit only from open/returned', () => {
    expect(canSubmit('staff', 'open')).toBe(true);
    expect(canSubmit('staff', 'returned')).toBe(true);
    expect(canSubmit('staff', 'submitted')).toBe(false);
    expect(canSubmit('staff', 'approved')).toBe(false);
  });
  it('approve only submitted, by admin/super_admin', () => {
    expect(canApprove('admin', 'submitted')).toBe(true);
    expect(canApprove('staff', 'submitted')).toBe(false);
    expect(canApprove('admin', 'open')).toBe(false);
  });
  it('reopen only approved, super_admin only', () => {
    expect(canReopen('super_admin', 'approved')).toBe(true);
    expect(canReopen('admin', 'approved')).toBe(false);
    expect(canReopen('super_admin', 'open')).toBe(false);
  });
});

describe('canViewAuditRecord (mirrors audit_logs_select)', () => {
  it('super_admin sees everything', () => {
    expect(canViewAuditRecord('super_admin', 'a', 'b', 'staff')).toBe(true);
  });
  it('admin sees own records and staff records', () => {
    expect(canViewAuditRecord('admin', 'a', 'a', 'admin')).toBe(true);
    expect(canViewAuditRecord('admin', 'a', 'b', 'staff')).toBe(true);
    expect(canViewAuditRecord('admin', 'a', 'b', 'admin')).toBe(false);
  });
  it('staff see only their own', () => {
    expect(canViewAuditRecord('staff', 'a', 'a', 'staff')).toBe(true);
    expect(canViewAuditRecord('staff', 'a', 'b', 'staff')).toBe(false);
  });
});