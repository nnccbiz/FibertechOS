'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

interface NavItem {
  icon: string;
  label: string;
  key: string;
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

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  function getActiveKey() {
    if (pathname === '/') return 'dashboard';
    const match = navItems.find((item) => item.href !== '/' && pathname.startsWith(item.href));
    return match?.key || 'dashboard';
  }

  const activeKey = getActiveKey();

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`hidden md:flex fixed top-0 right-0 h-screen bg-white border-l border-[#e2e8f0] flex-col z-40 transition-all duration-300 ${
        expanded ? 'w-[200px] shadow-lg' : 'w-[60px]'
      }`}
    >
      {/* Logo */}
      <div className={`border-b border-[#e2e8f0] flex items-center ${expanded ? 'px-4 py-4' : 'px-0 py-4 justify-center'}`}>
        {expanded ? (
          <div>
            <h1 className="text-lg font-bold text-[#1a56db]">FibertechOS</h1>
            <p className="text-[10px] text-gray-400">פיברטק תשתיות</p>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-[#1a56db] flex items-center justify-center text-white text-xs font-bold">
            F
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => (
          <a
            key={item.key}
            href={item.href}
            className={`flex items-center gap-3 py-3 text-sm font-medium transition-all duration-200 no-underline ${
              expanded ? 'px-4' : 'px-0 justify-center'
            } ${
              activeKey === item.key
                ? 'bg-blue-50 text-[#1a56db] border-l-[3px] border-[#1a56db]'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            }`}
            title={!expanded ? item.label : undefined}
          >
            <span className="text-lg flex-shrink-0">{item.icon}</span>
            {expanded && (
              <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
            )}
          </a>
        ))}
      </nav>

      {/* Footer */}
      <div className={`border-t border-[#e2e8f0] flex items-center ${expanded ? 'p-3 gap-2' : 'p-2 justify-center'}`}>
        <div className="w-8 h-8 rounded-full bg-[#1a56db] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          פ
        </div>
        {expanded && (
          <div>
            <p className="text-xs font-medium text-gray-700">פיברטק</p>
            <p className="text-[10px] text-gray-400">v0.1.0</p>
          </div>
        )}
      </div>
    </aside>
  );
}
