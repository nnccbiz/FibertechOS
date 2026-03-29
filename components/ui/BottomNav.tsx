'use client';

const navItems = [
  { icon: '🏠', label: 'בקרה', key: 'dashboard' },
  { icon: '📋', label: 'פרויקטים', key: 'projects' },
  { icon: '📊', label: 'שיווק', key: 'marketing' },
  { icon: '🚢', label: 'יבוא', key: 'import' },
  { icon: '👷', label: 'שדה', key: 'field' },
  { icon: '📦', label: 'מלאי', key: 'inventory' },
  { icon: '📈', label: 'דוחות', key: 'reports' },
  { icon: '⚙️', label: 'הגדרות', key: 'settings' },
];

interface BottomNavProps {
  activeKey: string;
  onNavigate: (key: string) => void;
}

export default function BottomNav({ activeKey, onNavigate }: BottomNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e2e8f0] z-40">
      <div className="flex overflow-x-auto py-2 px-1 gap-1 scrollbar-hide">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`flex flex-col items-center min-w-[64px] px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
              activeKey === item.key
                ? 'bg-blue-50 text-[#1a56db]'
                : 'text-gray-500'
            }`}
          >
            <span className="text-base mb-0.5">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
