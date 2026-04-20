'use client';

import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import FloatingChat from '../ai/FloatingChat';
import { PermissionsProvider } from '@/lib/auth/permissions-context';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <PermissionsProvider>
      <Sidebar />
      <BottomNav />
      <FloatingChat />
      <main className="md:mr-[60px] pb-20 md:pb-6">
        {children}
      </main>
    </PermissionsProvider>
  );
}
