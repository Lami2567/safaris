'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Compass,
  CreditCard,
  Sliders,
  Image as BannerIcon,
  BadgeDollarSign,
  Activity,
  Settings,
  ShieldCheck,
  Moon,
  Sun,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTheme } from './ThemeProvider';

interface NavItem {
  name: string;
  href: string;
  icon: any;
  badge?: string;
}

const PLATFORM_NAV_ITEMS: NavItem[] = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Tourism & Safaris', href: '/tourism', icon: Compass },
  { name: 'DPO Payments', href: '/payments', icon: CreditCard, badge: 'LIVE' },
  { name: 'App Services', href: '/services-config', icon: Sliders },
  { name: 'Promo Banners', href: '/banners', icon: BannerIcon },
  { name: 'Fare Matrix', href: '/pricing', icon: BadgeDollarSign },
  { name: 'Live Operations', href: '/operations', icon: Activity },
];

const SYSTEM_NAV_ITEMS: NavItem[] = [
  { name: 'System & Releases', href: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [dpoStatus, setDpoStatus] = useState<{
    env: string;
    serviceType: string;
    ticketRef: string;
  }>({
    env: 'production',
    serviceType: '28087',
    ticketRef: '2777504',
  });

  useEffect(() => {
    api
      .getDpoConfigStatus()
      .then((res: any) => {
        const d = res?.data || res;
        if (d) {
          setDpoStatus({
            env: d.environment || d.activeEnvironment || 'production',
            serviceType: String(d.service_type_id || d.serviceTypeId || '28087'),
            ticketRef: String(d.ticket_ref || d.supportTicketRef || '2777504'),
          });
        }
      })
      .catch(() => {});
  }, []);

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('careers') || window.location.pathname.startsWith('/careers')) {
      return null;
    }
  }

  if (pathname?.startsWith('/careers')) {
    return null;
  }

  const isLive = dpoStatus.env === 'production' || dpoStatus.env === 'live';

  return (
    <aside className="w-64 min-h-screen bg-white dark:bg-[#12141a] border-r border-slate-100 dark:border-[#20242f] flex flex-col justify-between shrink-0 select-none py-6 px-4 transition-colors duration-200 shadow-xs z-30">
      <div className="space-y-6">
        {/* SAFARIS UGANDA Brand Identity in clean card style */}
        <div className="px-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0062FF] flex items-center justify-center text-white font-black text-base shadow-sm shadow-blue-500/20">
            S
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-slate-900 dark:text-white leading-none">
              SAFARIS UGANDA
            </div>
            <div className="text-[10px] text-slate-400 font-semibold tracking-wider mt-1 uppercase">
              Command Center
            </div>
          </div>
        </div>

        {/* Section: Platform Management */}
        <div>
          <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            Platform Modules
          </div>
          <nav className="space-y-1">
            {PLATFORM_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#F1F3F9] dark:bg-[#1e222d] text-slate-900 dark:text-white font-bold shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#181b24]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-[#0062FF] dark:text-[#3b82f6]' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                  <span>{item.name}</span>

                  {item.badge && (
                    <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-extrabold tracking-wider">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Section: System & Configuration */}
        <div>
          <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            System & Security
          </div>
          <nav className="space-y-1">
            {SYSTEM_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#F1F3F9] dark:bg-[#1e222d] text-slate-900 dark:text-white font-bold shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#181b24]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-[#0062FF] dark:text-[#3b82f6]' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom: Live DPO Gateway Status + Dark Mode Toggle */}
      <div className="space-y-4">
        <div className="p-3.5 rounded-2xl bg-[#F8FAFC] dark:bg-[#181b24] border border-slate-200/70 dark:border-[#242938]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              DPO Pay Gateway
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                isLive
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
              }`}
            >
              {isLive ? 'PRODUCTION' : 'SANDBOX'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 font-bold">
            <ShieldCheck className="w-4 h-4 text-[#0062FF] shrink-0" />
            <span>Service ID: {dpoStatus.serviceType}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Ref #{dpoStatus.ticketRef} • Currency: UGX
          </p>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-[#20242f] px-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-[#0062FF]" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
              theme === 'dark' ? 'bg-[#0062FF] justify-end' : 'bg-slate-200 dark:bg-slate-700 justify-start'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white shadow-xs block"></span>
          </button>
        </div>
      </div>
    </aside>
  );
};
