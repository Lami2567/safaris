'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';

export function AdminLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isCareers, setIsCareers] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname.toLowerCase();
      const isCareersHost = hostname.includes('careers.mumwesafarisuganda.com') || hostname.startsWith('careers.');
      const isCareersPath = window.location.pathname.startsWith('/careers');
      setIsCareers(isCareersHost || isCareersPath);
    }
  }, [pathname]);

  // Hide sidebar on careers subdomain or /careers path
  const hideSidebar = isCareers || pathname?.startsWith('/careers');

  if (hideSidebar) {
    return (
      <main className="min-h-screen w-full bg-black text-white">
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-black">{children}</div>
    </div>
  );
}
