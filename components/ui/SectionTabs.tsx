'use client';

/**
 * Secondary tab strip for a nav domain (e.g. לוגיסטיקה: רכש · יבוא · תעודות
 * משלוח · מלאי). Rendered at the top of every page in the domain; each tab is
 * shown only if the user has view access to its module. Visual language
 * follows the pricing tabs (rounded-t, primary active).
 */
import { usePathname } from 'next/navigation';
import { usePermissions } from '@/lib/auth/permissions-context';
import type { SectionTab } from '@/lib/nav';

export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  const { canAccess, loading } = usePermissions();
  const visible = loading ? [] : tabs.filter((t) => canAccess(t.module));
  if (visible.length < 2) return null;

  return (
    <div className="flex gap-1 border-b border-line-subtle mb-5 overflow-x-auto" dir="rtl">
      {visible.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <a
            key={t.href}
            href={t.href}
            className={`px-4 py-1.5 text-sm rounded-t-lg no-underline whitespace-nowrap transition-colors ${
              active
                ? 'bg-primary text-white font-bold'
                : 'bg-neutral-100 text-content-body hover:bg-neutral-200'
            }`}
          >
            {t.label}
          </a>
        );
      })}
    </div>
  );
}
