export const DEFAULT_PIPELINE_NAME = 'Asosiy savdo';

export const DEFAULT_STAGES = [
  { id: 'NEW', label: 'Yangi' },
  { id: 'CONTACTED', label: 'Gaplashilgan' },
  { id: 'IN_PROGRESS', label: 'Jarayonda' },
  { id: 'FOLLOW_UP', label: 'Qayta aloqaga chiqish' },
  { id: 'FUTURE_SALE', label: 'Keyinchalik sotuv' },
  { id: 'DEPOSIT_RECEIVED', label: 'Zaklad olingan' },
  { id: 'PAID', label: "To'lov qilindi" },
  { id: 'INSTALLATION_REQUIRED', label: "O'rnatish kerak" },
  { id: 'INSTALLED', label: "O'rnatib bo'ldi", isFinal: true },
];

export const ALL_PERMISSIONS = [
  'customers.view',
  'customers.create',
  'customers.edit',
  'customers.delete',
  'employees.view',
  'employees.create',
  'employees.edit',
  'employees.delete',
  'tasks.view',
  'tasks.create',
  'tasks.edit',
  'tasks.delete',
  'programs.view',
  'programs.create',
  'programs.edit',
  'programs.delete',
  'settings.view',
  'settings.edit',
  'settings.create',
  'settings.delete',
];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ALL_PERMISSIONS,
  SUPER_ADMIN: ALL_PERMISSIONS,
  EMPLOYEE: ['customers.view', 'customers.create', 'customers.edit', 'tasks.view', 'programs.view'],
  MANAGER: ALL_PERMISSIONS,
  SALES: ['customers.view', 'customers.create', 'customers.edit', 'tasks.view', 'programs.view'],
  SUPPORT: ['customers.view', 'tasks.view'],
  INSTALLER: ['customers.view', 'tasks.view'],
  DEVELOPER: ['customers.view', 'tasks.view', 'programs.view', 'settings.view'],
};
