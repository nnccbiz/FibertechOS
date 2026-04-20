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

const navItems: NavItem[] = [
  { icon: '🏠', label: 'בקרה', key: 'dashboard', href: '/' },
  { icon: '📋', label: 'פרויקטים', key: 'projects', href: '/projects/list' },
  { icon: '📊', label: 'שיווק', key: 'marketing', href: '/marketing' },
  { icon: '🚢', label: 'יבוא', key: 'import', href: '/import' },
  { icon: '👷', label: 'שדה', key: 'field', href: '/field' },
  { icon: '📦', label: 'מלאי', key: 'inventory', href: '/inventory' },
  { icon: '📈', label: 'דוחות', key: 'reports', href: '/reports' },
  { icon: '⚙️', label: 'הגדרות', key: 'settings', href: '/settings' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { canAccess, loading } = usePermissions();

  function getActiveKey() {
    if (pathname === '/') return 'dashboard';
    const match = navItems.find((item) => item.href !== '/' && pathname.startsWith(item.href));
    return match?.key || 'dashboard';
  }

  const activeKey = getActiveKey();
  const visibleItems = loading ? navItems : navItems.filter((item) => canAccess(item.key));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e2e8f0] z-40">
      <div className="flex overflow-x-auto py-2 px-1 gap-1 scrollbar-hide">
        {visibleItems.map((item) => (
          <a
            key={item.key}
            href={item.href}
            className={`flex flex-col items-center min-w-[64px] px-2 py-1.5 rounded-lg text-[12px] font-medium transition-colors no-underline ${
              activeKey === item.key
                ? 'bg-blue-50 text-[#1a56db]'
                : 'text-gray-500'
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
