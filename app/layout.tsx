import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/ui/AppShell';

export const metadata: Metadata = {
  title: 'FibertechOS — מערכת ניהול תפעולית',
  description: 'מערכת ניהול תפעולית לפיברטק תשתיות',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-[#f0f4f8] text-gray-900 min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
