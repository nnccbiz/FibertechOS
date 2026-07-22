'use client';

import { usePathname } from 'next/navigation';
import { usePermissions } from '@/lib/auth/permissions-context';
import Icon from '@/components/ui/Icon';
import { NAV_ITEMS, navHref, navMatches } from '@/lib/nav';

export default function BottomNav() {
  const pathname = usePathname();
  const { canAccess, loading } = usePermissions();

  const activeLabel = pathname === '/'
    ? 'בקרה'
    : NAV_ITEMS.find((item) => navMatches(item, pathname))?.label || 'בקרה';
  const visibleItems = loading ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.modules.some((m) => canAccess(m)));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-line-subtle z-40">
      <div className="flex overflow-x-auto py-2 px-1 gap-1 scrollbar-hide">
        {visibleItems.map((item) => {
          const active = activeLabel === item.label;
          return (
            <a
              key={item.label}
              href={loading ? item.href : navHref(item, canAccess)}
              className={`flex flex-col items-center min-w-[64px] px-2 py-1.5 rounded-lg text-[12px] font-medium transition-colors no-underline ${
                active ? 'bg-azure-100 text-azure-600' : 'text-content-muted'
              }`}
            >
              <span className={`mb-0.5 ${active ? 'text-azure-600' : 'text-primary'}`}>
                <Icon name={item.icon} size={22} />
              </span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
