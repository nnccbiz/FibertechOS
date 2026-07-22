import type { AppModule } from '@/lib/auth/permissions';
import type { IconName } from '@/components/ui/Icon';

/**
 * Shared navigation model — single source of truth for Sidebar, BottomNav and
 * the SectionTabs strip. A domain nav item (tabs present) groups several pages
 * under one entry; each tab keeps its own module permission, and the nav item
 * is visible when the user can access at least one of its modules.
 */

export interface SectionTab {
  label: string;
  href: string;
  module: AppModule;
}

// לוגיסטיקה — רכש · יבוא · תעודות משלוח · מלאי
export const LOGISTICS_TABS: SectionTab[] = [
  { label: 'רכש', href: '/procurement', module: 'import' },
  { label: 'יבוא', href: '/import', module: 'import' },
  { label: 'תעודות משלוח', href: '/deliveries', module: 'import' },
  { label: 'מלאי', href: '/inventory', module: 'inventory' },
];

// כספים — חשבוניות ללקוח וגבייה · תשלומים לספקים · דוחות ותזרים
export const FINANCE_TABS: SectionTab[] = [
  { label: 'חשבוניות וגבייה', href: '/finance/collections', module: 'import' },
  { label: 'תשלומים לספקים', href: '/finance/suppliers', module: 'import' },
  { label: 'דוחות ותזרים', href: '/finance/reports', module: 'import' },
];

export interface NavEntry {
  icon: IconName;
  label: string;
  modules: AppModule[]; // visible if the user can access ANY of these
  href: string;         // default target (tabs: fallback when none accessible)
  tabs?: SectionTab[];
}

export const NAV_ITEMS: NavEntry[] = [
  { icon: 'dashboard', label: 'בקרה', modules: ['dashboard'], href: '/' },
  { icon: 'projects', label: 'פרויקטים', modules: ['projects'], href: '/projects/list' },
  { icon: 'customers', label: 'לקוחות', modules: ['marketing'], href: '/customers' },
  { icon: 'logistics', label: 'לוגיסטיקה', modules: ['import', 'inventory'], href: '/procurement', tabs: LOGISTICS_TABS },
  { icon: 'money', label: 'כספים', modules: ['import'], href: '/finance/collections', tabs: FINANCE_TABS },
  { icon: 'production', label: 'ייצור', modules: ['production'], href: '/production' },
  { icon: 'forms', label: 'טפסים', modules: ['field'], href: '/forms' },
  { icon: 'settings', label: 'הגדרות', modules: ['settings'], href: '/settings/users' },
];

/** Target for a nav item — a domain item points at its first accessible tab. */
export function navHref(item: NavEntry, canAccess: (m: AppModule) => boolean): string {
  if (item.tabs) {
    const first = item.tabs.find((t) => canAccess(t.module));
    if (first) return first.href;
  }
  return item.href;
}

/** Does the current pathname belong to this nav item (any of its tabs)? */
export function navMatches(item: NavEntry, pathname: string): boolean {
  const prefixes = item.tabs ? item.tabs.map((t) => t.href) : [item.href];
  return prefixes.some((p) => p !== '/' && pathname.startsWith(p));
}
