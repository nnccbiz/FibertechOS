'use client';

import { usePathname } from 'next/navigation';
import { usePermissions } from '@/lib/auth/permissions-context';
import { AppModule } from '@/lib/auth/permissions';
import Icon, { type IconName } from '@/components/ui/Icon';

interface NavItem {
  icon: IconName;
  label: string;
  key: AppModule;
  href: string;
}

// Only routes that actually exist — keep in sync with Sidebar.tsx.
const navItems: NavItem[] = [
  { icon: 'dashboard', label: 'בקרה', key: 'dashboard', href: '/' },
  { icon: 'projects', label: 'פרויקטים', key: 'projects', href: '/projects/list' },
  { icon: 'drawings', label: 'שרטוטים', key: 'projects', href: '/drawings' },
  { icon: 'customers', label: 'לקוחות', key: 'marketing', href: '/customers' },
  { icon: 'import', label: 'יבוא', key: 'import', href: '/import' },
  { icon: 'logistics', label: 'לוגיסטיקה', key: 'import', href: '/logistics/iskoor' },
  { icon: 'invoice', label: 'תעודות משלוח', key: 'import', href: '/deliveries' },
  { icon: 'inventory', label: 'מלאי', key: 'inventory', href: '/inventory' },
  { icon: 'production', label: 'ייצור', key: 'production', href: '/production' },
  { icon: 'forms', label: 'טפסים', key: 'field', href: '/forms' },
  { icon: 'settings', label: 'הגדרות', key: 'settings', href: '/settings/users' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { canAccess, loading } = usePermissions();

  function getActiveHref() {
    if (pathname === '/') return '/';
    const match = navItems.find((item) => item.href !== '/' && pathname.startsWith(item.href));
    return match?.href || '/';
  }

  const activeHref = getActiveHref();
  const visibleItems = loading ? navItems : navItems.filter((item) => canAccess(item.key));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-line-subtle z-40">
      <div className="flex overflow-x-auto py-2 px-1 gap-1 scrollbar-hide">
        {visibleItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center min-w-[64px] px-2 py-1.5 rounded-lg text-[12px] font-medium transition-colors no-underline ${
              activeHref === item.href
                ? 'bg-azure-100 text-azure-600'
                : 'text-content-muted'
            }`}
          >
            <span className={`mb-0.5 ${activeHref === item.href ? 'text-azure-600' : 'text-primary'}`}>
              <Icon name={item.icon} size={22} />
            </span>
            <span>{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
