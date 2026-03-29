import Link from 'next/link';

const modules = [
  {
    title: 'טפסי שדה',
    items: [
      { label: 'B-244 — הנעה והדרכה', href: '/forms/b244' },
      { label: 'B-165 — פיילוט', href: '/forms/b165' },
      { label: 'B-116 — פיקוח שדה', href: '/forms/b116' },
      { label: 'B-12-2 — ארוע חריג', href: '/forms/b12-2' },
    ],
  },
  {
    title: 'לוגיסטיקה',
    items: [
      { label: 'מעקב ISKOOR', href: '/logistics/iskoor' },
    ],
  },
];

export default function HomePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10" dir="rtl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-blue-700">FibertechOS</h1>
        <p className="text-gray-500 mt-1">מערכת ניהול תפעולית — פיברטק תשתיות</p>
      </div>

      <div className="space-y-6">
        {modules.map((mod) => (
          <div key={mod.title} className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">{mod.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mod.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block p-4 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 font-medium text-sm transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
