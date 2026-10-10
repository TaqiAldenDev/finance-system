// RBAC helpers. These MIRROR the RLS policies in supabase/migrations, they never
// replace them (rule 1, AGENTs §5). A mismatch is a bug — fix the policy too.

export type Role = 'super_admin' | 'admin' | 'staff';
export type DayStatus = 'open' | 'submitted' | 'returned' | 'approved';

/** Mirrors entries_select: which dates a role may read. */
export function canReadDate(
  role: Role,
  date: string,
  serverToday: string,
  hasHistorySession: boolean,
): boolean {
  if (role === 'super_admin' || role === 'admin') return true;
  return date === serverToday || hasHistorySession;
}

/** Mirrors entries_insert/entries_update for staff. Admins may edit any unlocked day. */
export function canWriteEntries(
  role: Role,
  status: DayStatus,
  entryDate: string,
  serverToday: string,
  inHistorySession: boolean,
): boolean {
  if (role === 'super_admin') return true;
  if (role === 'admin') return status !== 'approved';
  // staff
  return (
    entryDate === serverToday &&
    (status === 'open' || status === 'returned') &&
    !inHistorySession
  );
}

export function canSubmit(role: Role, status: DayStatus): boolean {
  return (
    (role === 'super_admin' || role === 'admin' || role === 'staff') &&
    (status === 'open' || status === 'returned')
  );
}

export function canApprove(role: Role, status: DayStatus): boolean {
  return (role === 'super_admin' || role === 'admin') && status === 'submitted';
}

export function canReturn(role: Role, status: DayStatus): boolean {
  return (role === 'super_admin' || role === 'admin') && status === 'submitted';
}

export function canReopen(role: Role, status: DayStatus): boolean {
  return role === 'super_admin' && status === 'approved';
}

/** Mirrors audit_logs_select (FR-AUD-07). */
export function canViewAuditRecord(
  viewerRole: Role,
  viewerId: string,
  recordUserId: string | null,
  recordRole: Role | null,
): boolean {
  if (viewerRole === 'super_admin') return true;
  if (viewerRole === 'admin') return recordUserId === viewerId || recordRole === 'staff';
  return recordUserId === viewerId;
}
