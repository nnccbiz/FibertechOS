'use client';

import { usePathname } from 'next/navigation';
import { usePermissions } from '@/lib/auth/permissions-context';
import { AppModule } from '@/lib/auth/permissions';

interface NavItem {
  icon: string;
  label: string;
  key: AppModule;
  href: string;
}

// Only routes that actually exist — keep in sync with Sidebar.tsx.
const navItems: NavItem[] = [
  { icon: '🏠', label: 'בקרה', key: 'dashboard', href: '/' },
  { icon: '📋', label: 'פרויקטים', key: 'projects', href: '/projects/list' },
  { icon: '📐', label: 'שרטוטים', key: 'projects', href: '/drawings' },
  { icon: '👥', label: 'לקוחות', key: 'marketing', href: '/customers' },
  { icon: '🚢', label: 'יבוא', key: 'import', href: '/import' },
  { icon: '🚛', label: 'לוגיסטיקה', key: 'import', href: '/logistics/iskoor' },
  { icon: '🏭', label: 'ייצור', key: 'production', href: '/production' },
  { icon: '📄', label: 'טפסים', key: 'field', href: '/forms' },
  { icon: '⚙️', label: 'הגדרות', key: 'settings', href: '/settings/users' },
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
                ? 'bg-primary-50 text-primary'
                : 'text-content-muted'
            }`}
          >
            <span className="text-lg mb-0.5">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
