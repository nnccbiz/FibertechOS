'use client';

/** תשלומים לספקים — placeholder עד בניית מעקב חשבוניות הספק (שלב 3 של מודול הכספים). */
import Icon from '@/components/ui/Icon';
import SectionTabs from '@/components/ui/SectionTabs';
import { FINANCE_TABS } from '@/lib/nav';

export default function SupplierPaymentsPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <SectionTabs tabs={FINANCE_TABS} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-strong"><Icon name="money" size={24} /> תשלומים לספקים</h1>
        <p className="text-sm text-content-muted mt-1">מעקב חשבוניות ספק ומועדי פירעון</p>
      </div>
      <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
        <p className="mb-3 text-neutral-300"><Icon name="pending" size={40} /></p>
        <p className="text-content-muted">בקרוב — מעקב תשלומים לספקים ייבנה בשלב הבא של מודול הכספים.</p>
        <p className="text-[13px] text-neutral-400 mt-2">בינתיים: נתוני חשבוניות ספק נמצאים בכרטיסי המשלוחים במסך <a href="/import" className="text-primary hover:underline">היבוא</a>.</p>
      </div>
    </div>
  );
}
