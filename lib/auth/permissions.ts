/**
 * Permission model - shared between server and client.
 * Must match the SQL enums in migration 002.
 */
export const APP_MODULES = [
  'dashboard',
  'projects',
  'marketing',
  'import',
  'field',
  'inventory',
  'reports',
  'settings',
] as const;

export type AppModule = (typeof APP_MODULES)[number];

export const MODULE_LABELS_HE: Record<AppModule, string> = {
  dashboard: 'בקרה',
  projects: 'פרויקטים',
  marketing: 'שיווק',
  import: 'יבוא',
  field: 'שדה',
  inventory: 'מלאי',
  reports: 'דוחות',
  settings: 'הגדרות',
};

export const MODULE_ICONS: Record<AppModule, string> = {
  dashboard: '🏠',
  projects: '📋',
  marketing: '📊',
  import: '🚢',
  field: '👷',
  inventory: '📦',
  reports: '📈',
  settings: '⚙️',
};

export const PERMISSION_LEVELS = ['none', 'view', 'edit', 'full'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const LEVEL_LABELS_HE: Record<PermissionLevel, string> = {
  none: 'אין גישה',
  view: 'צפייה',
  edit: 'עריכה',
  full: 'מלאה',
};

export const LEVEL_WEIGHT: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  full: 3,
};

export function hasAtLeast(
  actual: PermissionLevel | undefined,
  required: PermissionLevel
): boolean {
  if (!actual) return false;
  return LEVEL_WEIGHT[actual] >= LEVEL_WEIGHT[required];
}

/**
 * Password policy constants (enforced at UI + by a database function).
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_AGE_DAYS = 90;
export const PASSWORD_HISTORY_COUNT = 3;

export const PASSWORD_REQUIREMENTS_HE = [
  'לפחות 12 תווים',
  'לפחות אות גדולה אחת (A-Z)',
  'לפחות אות קטנה אחת (a-z)',
  'לפחות מספר אחד (0-9)',
  'לפחות סימן מיוחד אחד (! @ # $ % ^ & * ? + -)',
  'חובה להחליף כל 90 יום',
  'אי אפשר להשתמש באחת משלוש הסיסמאות הקודמות',
];

const SPECIAL_CHARS = /[!@#$%^&*?+\-_.,:;()[\]{}|<>/\\'"`~=]/;

export function validatePassword(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < PASSWORD_MIN_LENGTH)
    errors.push(`הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`);
  if (!/[A-Z]/.test(pw)) errors.push('הסיסמה חייבת להכיל לפחות אות גדולה אחת');
  if (!/[a-z]/.test(pw)) errors.push('הסיסמה חייבת להכיל לפחות אות קטנה אחת');
  if (!/[0-9]/.test(pw)) errors.push('הסיסמה חייבת להכיל לפחות מספר אחד');
  if (!SPECIAL_CHARS.test(pw))
    errors.push('הסיסמה חייבת להכיל לפחות סימן מיוחד אחד');
  return errors;
}
