'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { AdminLoginView } from './AdminLoginView';
import { api } from '@/lib/api';

export function AdminLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isCareers, setIsCareers] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const status = await api.getAdminAuthStatus();
      setAuthConfigured(Boolean(status.configured));
      setIsAuthenticated(status.configured ? Boolean(status.authenticated) : true);
    } catch {
      // Do not enforce login if backend has not configured credentials
      setAuthConfigured(false);
      setIsAuthenticated(true);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname.toLowerCase();
      const isCareersHost = hostname.includes('careers.mumwesafarisuganda.com') || hostname.startsWith('careers.');
      const isCareersPath = window.location.pathname.startsWith('/careers');
      const careersMode = isCareersHost || isCareersPath;
      setIsCareers(careersMode);

      if (!careersMode) {
        checkAuth();
      } else {
        setAuthChecked(true);
      }
    }
  }, [pathname, checkAuth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleAuthChange = () => {
      checkAuth();
    };
    window.addEventListener('safaris-admin-auth-change', handleAuthChange);
    return () => {
      window.removeEventListener('safaris-admin-auth-change', handleAuthChange);
    };
  }, [checkAuth]);

  // Hide sidebar on careers subdomain or /careers path
  const hideSidebar = isCareers || pathname?.startsWith('/careers');

  if (hideSidebar) {
    return (
      <main className="min-h-screen w-full bg-black text-white">
        {children}
      </main>
    );
  }

  if (!authChecked) {
    return <div className="min-h-screen w-full bg-black" />;
  }

  // Only show and enforce the login screen AFTER credentials have been set in the admin panel
  if (authConfigured && !isAuthenticated) {
    return <AdminLoginView onLoginSuccess={checkAuth} />;
  }

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-black">{children}</div>
    </div>
  );
}
