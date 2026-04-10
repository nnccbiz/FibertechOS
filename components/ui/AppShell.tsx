'use client';

import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import FloatingChat from '../ai/FloatingChat';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <BottomNav />
      <FloatingChat />
      <main className="md:mr-[60px] pb-20 md:pb-6">
        {children}
      </main>
    </>
  );
}
