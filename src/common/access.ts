export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export function roleOf(user?: any) {
  return String(user?.role || '').toUpperCase();
}

export function isAdmin(user?: any) {
  return ADMIN_ROLES.includes(roleOf(user) as (typeof ADMIN_ROLES)[number]);
}

export function isPartner(user?: any) {
  return roleOf(user) === 'PARTNER' && Boolean(user?.partnerGroupId);
}

export function partnerGroupIdOf(user?: any) {
  return isPartner(user) ? String(user.partnerGroupId) : null;
}

export function canViewAll(user: any, permission = 'customers.viewAll') {
  return isAdmin(user) || ['MANAGER'].includes(roleOf(user)) || user?.permissions?.includes(permission);
}

export function customerScopeWhere(user: any) {
  const partnerGroupId = partnerGroupIdOf(user);
  const role = roleOf(user);
  if (isAdmin(user) || role === 'MANAGER' || user?.permissions?.includes('customers.viewAll')) return {};
  if (partnerGroupId) return { groups: { some: { id: partnerGroupId } } };
  if (role === 'EMPLOYEE') {
    const visibility = String(user?.customerVisibility || 'ASSIGNED').toUpperCase();
    if (visibility === 'ALL') return {};
    if (visibility === 'GROUPS') {
      const allowedGroupIds = Array.isArray(user?.allowedGroupIds)
        ? user.allowedGroupIds
        : Array.isArray(user?.allowedGroups)
          ? user.allowedGroups.map((item: any) => item.groupId || item.group?.id).filter(Boolean)
          : [];
      return allowedGroupIds.length ? { groups: { some: { id: { in: allowedGroupIds } } } } : { id: '__no_allowed_group__' };
    }
  }
  return { assignedEmployeeId: user?.id };
}
