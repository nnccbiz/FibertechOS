'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/auth/permissions-context';
import Icon from '@/components/ui/Icon';
import { NAV_ITEMS, navHref, navMatches } from '@/lib/nav';

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const [canHover, setCanHover] = useState(true);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { canAccess, loading } = usePermissions();

  useEffect(() => {
    setCanHover(window.matchMedia('(hover: hover)').matches);
  }, []);

  // Open only after the cursor rests on the sidebar for 2s straight; leaving
  // before then cancels the pending open. Clear the timer on unmount too.
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  function handleEnter() {
    if (!canHover) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setExpanded(true), 2000);
  }

  function handleLeave() {
    if (!canHover) return;
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setExpanded(false);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const activeLabel = pathname === '/'
    ? 'בקרה'
    : NAV_ITEMS.find((item) => navMatches(item, pathname))?.label || 'בקרה';
  const visibleItems = loading ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.modules.some((m) => canAccess(m)));

  return (
    <aside
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
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
        {visibleItems.map((item) => {
          const active = activeLabel === item.label;
          return (
            <a
              key={item.label}
              href={loading ? item.href : navHref(item, canAccess)}
              className={`flex items-center gap-3 py-3 text-lg font-medium transition-all duration-200 no-underline ${
                expanded ? 'px-4' : 'px-0 justify-center'
              } ${
                active
                  ? 'bg-azure-100 text-azure-600 border-s-[3px] border-primary'
                  : 'text-content-muted hover:bg-neutral-50 hover:text-content-strong'
              }`}
              title={!expanded ? item.label : undefined}
            >
              <span className={`flex-shrink-0 ${active ? 'text-azure-600' : 'text-primary'}`}>
                <Icon name={item.icon} size={22} />
              </span>
              {expanded && (
                <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
              )}
            </a>
          );
        })}
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
