'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import FloatingChat from '../ai/FloatingChat';
import { PermissionsProvider } from '@/lib/auth/permissions-context';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith('/quote/')) {
    return <>{children}</>;
  }

  return (
    <PermissionsProvider>
      <Sidebar />
      <BottomNav />
      <FloatingChat />
      <main className="md:mr-[60px] pb-20 md:pb-6 overflow-x-hidden">
        {children}
      </main>
    </PermissionsProvider>
  );
}
