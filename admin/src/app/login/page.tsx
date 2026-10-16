'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLoginView } from '@/components/AdminLoginView';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    api
      .getAdminAuthStatus()
      .then((status) => {
        // Login should only appear after setting credentials in the admin panel
        if (!status.configured || status.authenticated) {
          router.replace('/');
        }
      })
      .catch(() => {});
  }, [router]);

  return <AdminLoginView onLoginSuccess={() => router.replace('/')} />;
}
