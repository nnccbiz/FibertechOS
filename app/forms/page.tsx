'use client';

// Index page for the Israeli standard field forms — the nav's טפסים entry
// pointed at /forms which had no page (each form lives in its own sub-route).
const FORMS = [
  { href: '/forms/b116', code: 'B-116', title: 'דוח פיקוח שדה שוטף', desc: 'פיקוח שדה שוטף לצנרת דחיקה' },
  { href: '/forms/b12-2', code: 'B-12-2', title: 'דו״ח אירוע חריג / תקלות בשטח', desc: 'תיעוד אירוע חריג או תקלה בשטח' },
  { href: '/forms/b165', code: 'B-165', title: 'טופס ביצוע פיילוט', desc: 'ביצוע פיילוט לצנרת דחיקה' },
  { href: '/forms/b244', code: 'B-244', title: 'טופס תיוג להנעה והדרכה', desc: 'תיוג להנעה והדרכה של צנרת דחיקה' },
];

export default function FormsIndexPage() {
  return (
    <div className="min-h-screen" dir="rtl">
      <header className="bg-white border-b border-[#e2e8f0] px-5 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800">📄 טפסי שטח</h1>
          <p className="text-[13px] text-gray-400">טפסים תקניים ישראליים למילוי באתר</p>
        </div>
      </header>
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {FORMS.map((f) => (
          <a key={f.href} href={f.href} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-[#1a56db] transition-all no-underline">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[12px] font-bold text-[#1a56db] bg-blue-50 px-2 py-0.5 rounded" dir="ltr">{f.code}</span>
              <h2 className="text-lg font-bold text-gray-800">{f.title}</h2>
            </div>
            <p className="text-sm text-gray-500">{f.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
