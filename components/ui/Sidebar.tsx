'use client';

interface NavItem {
  icon: string;
  label: string;
  key: string;
}

const navItems: NavItem[] = [
  { icon: '🏠', label: 'בקרה', key: 'dashboard' },
  { icon: '📋', label: 'פרויקטים', key: 'projects' },
  { icon: '📊', label: 'שיווק', key: 'marketing' },
  { icon: '🚢', label: 'יבוא', key: 'import' },
  { icon: '👷', label: 'שדה', key: 'field' },
  { icon: '📦', label: 'מלאי', key: 'inventory' },
  { icon: '📈', label: 'דוחות', key: 'reports' },
  { icon: '⚙️', label: 'הגדרות', key: 'settings' },
];

interface SidebarProps {
  activeKey: string;
  onNavigate: (key: string) => void;
}

export default function Sidebar({ activeKey, onNavigate }: SidebarProps) {
  return (
    <aside className="hidden md:flex fixed top-0 right-0 h-screen w-[220px] bg-white border-l border-[#e2e8f0] flex-col z-40">
      <div className="p-5 border-b border-[#e2e8f0]">
        <h1 className="text-xl font-bold text-[#1a56db]">FibertechOS</h1>
        <p className="text-xs text-gray-400 mt-0.5">פיברטק תשתיות</p>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`w-full flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
              activeKey === item.key
                ? 'bg-blue-50 text-[#1a56db] border-l-[3px] border-[#1a56db]'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-[#e2e8f0]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#1a56db] flex items-center justify-center text-white text-xs font-bold">
            פ
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700">פיברטק</p>
            <p className="text-[10px] text-gray-400">v0.1.0</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
