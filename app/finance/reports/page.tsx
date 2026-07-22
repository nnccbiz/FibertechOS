'use client';

/** דוחות ותזרים — placeholder עד בניית צפי תקבולים מול תשלומים (שלב 3 של מודול הכספים). */
import Icon from '@/components/ui/Icon';
import SectionTabs from '@/components/ui/SectionTabs';
import { FINANCE_TABS } from '@/lib/nav';

export default function FinanceReportsPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <SectionTabs tabs={FINANCE_TABS} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-strong"><Icon name="reports" size={24} /> דוחות ותזרים</h1>
        <p className="text-sm text-content-muted mt-1">צפי תקבולים מול צפי תשלומים על ציר זמן</p>
      </div>
      <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
        <p className="mb-3 text-neutral-300"><Icon name="pending" size={40} /></p>
        <p className="text-content-muted">בקרוב — דוח תזרים ייבנה אחרי שמעקב התשלומים לספקים יעלה.</p>
      </div>
    </div>
  );
}
