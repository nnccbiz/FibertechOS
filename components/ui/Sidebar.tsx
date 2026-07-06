'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/auth/permissions-context';
import { AppModule } from '@/lib/auth/permissions';
import Icon, { type IconName } from '@/components/ui/Icon';

interface NavItem {
  icon: IconName;
  label: string;
  key: AppModule;
  href: string;
}

// Only routes that actually exist. /marketing, /field, /inventory, /reports
// were dead 404 links — re-add each when its module is built.
const navItems: NavItem[] = [
  { icon: 'dashboard', label: 'בקרה', key: 'dashboard', href: '/' },
  { icon: 'projects', label: 'פרויקטים', key: 'projects', href: '/projects/list' },
  { icon: 'drawings', label: 'שרטוטים', key: 'projects', href: '/drawings' },
  { icon: 'customers', label: 'לקוחות', key: 'marketing', href: '/customers' },
  { icon: 'import', label: 'יבוא', key: 'import', href: '/import' },
  { icon: 'logistics', label: 'לוגיסטיקה', key: 'import', href: '/logistics/iskoor' },
  { icon: 'invoice', label: 'תעודות משלוח', key: 'import', href: '/deliveries' },
  { icon: 'production', label: 'ייצור', key: 'production', href: '/production' },
  { icon: 'forms', label: 'טפסים', key: 'field', href: '/forms' },
  { icon: 'settings', label: 'הגדרות', key: 'settings', href: '/settings/users' },
];

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const [canHover, setCanHover] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { canAccess, loading } = usePermissions();

  useEffect(() => {
    setCanHover(window.matchMedia('(hover: hover)').matches);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function getActiveHref() {
    if (pathname === '/') return '/';
    const match = navItems.find((item) => item.href !== '/' && pathname.startsWith(item.href));
    return match?.href || '/';
  }

  const activeHref = getActiveHref();
  const visibleItems = loading ? navItems : navItems.filter((item) => canAccess(item.key));

  return (
    <aside
      onMouseEnter={() => canHover && setExpanded(true)}
      onMouseLeave={() => canHover && setExpanded(false)}
      className={`hidden md:flex fixed top-0 right-0 h-screen bg-white border-l border-line-subtle flex-col z-40 transition-all duration-300 ${
        expanded ? 'w-[200px] shadow-lg' : 'w-[60px]'
      }`}
    >
      {/* Logo */}
      <div className={`border-b border-line-subtle flex items-center ${expanded ? 'px-4 py-4' : 'px-0 py-4 justify-center'}`}>
        {expanded ? (
          <div>
            <h1 className="text-2xl font-bold text-primary">FibertechOS</h1>
            <p className="text-[12px] text-neutral-400">פיברטק תשתיות</p>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-bold">
            F
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {visibleItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 py-3 text-lg font-medium transition-all duration-200 no-underline ${
              expanded ? 'px-4' : 'px-0 justify-center'
            } ${
              activeHref === item.href
                ? 'bg-azure-100 text-azure-600 border-s-[3px] border-primary'
                : 'text-content-muted hover:bg-neutral-50 hover:text-content-strong'
            }`}
            title={!expanded ? item.label : undefined}
          >
            <span className={`flex-shrink-0 ${activeHref === item.href ? 'text-azure-600' : 'text-primary'}`}>
              <Icon name={item.icon} size={22} />
            </span>
            {expanded && (
              <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
            )}
          </a>
        ))}
      </nav>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className={`border-t border-line-subtle flex items-center gap-3 py-3 text-lg font-medium text-content-muted hover:bg-danger-soft hover:text-danger transition-all duration-200 ${
          expanded ? 'px-4' : 'px-0 justify-center'
        }`}
        title={!expanded ? 'התנתק' : undefined}
      >
        <span className="flex-shrink-0 text-primary">
          <Icon name="logout" size={22} />
        </span>
        {expanded && <span className="whitespace-nowrap">התנתק</span>}
      </button>

      {/* Footer */}
      <div className={`border-t border-line-subtle flex items-center ${expanded ? 'p-3 gap-2' : 'p-2 justify-center'}`}>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          פ
        </div>
        {expanded && (
          <div>
            <p className="text-sm font-medium text-content-body">פיברטק</p>
            <p className="text-[12px] text-neutral-400">v0.1.0</p>
          </div>
        )}
      </div>
    </aside>
  );
}
