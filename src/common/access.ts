export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export function roleOf(user?: any) {
  return String(user?.role || '').toUpperCase();
}

export function isAdmin(user?: any) {
  return ADMIN_ROLES.includes(roleOf(user) as (typeof ADMIN_ROLES)[number]);
}

export function isPartner(user?: any) {
  return Boolean(user?.partnerGroupId) && !isAdmin(user);
}

export function partnerGroupIdOf(user?: any) {
  return isPartner(user) ? String(user.partnerGroupId) : null;
}

export function canViewAll(user: any, permission = 'customers.viewAll') {
  return isAdmin(user) || ['MANAGER'].includes(roleOf(user)) || user?.permissions?.includes(permission);
}

export function customerScopeWhere(user: any) {
  const partnerGroupId = partnerGroupIdOf(user);
  if (isAdmin(user) || roleOf(user) === 'MANAGER' || user?.permissions?.includes('customers.viewAll')) return {};
  if (partnerGroupId) return { groups: { some: { id: partnerGroupId } } };
  return { assignedEmployeeId: user?.id };
}
