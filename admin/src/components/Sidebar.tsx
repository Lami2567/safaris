'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Compass,
  Sliders,
  Image as BannerIcon,
  BadgeDollarSign,
  Activity,
  Settings,
  CreditCard,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';

const NAV_ITEMS = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Tourism & Safaris', href: '/tourism', icon: Compass },
  { name: 'DPO Payments', href: '/payments', icon: CreditCard },
  { name: 'App Services', href: '/services-config', icon: Sliders },
  { name: 'Promo Banners', href: '/banners', icon: BannerIcon },
  { name: 'Fare Matrix', href: '/pricing', icon: BadgeDollarSign },
  { name: 'Live Operations', href: '/operations', icon: Activity },
  { name: 'System & Releases', href: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('careers') || window.location.pathname.startsWith('/careers')) {
      return null;
    }
  }

  if (pathname?.startsWith('/careers')) {
    return null;
  }

  return (
    <aside className="w-64 min-h-screen bg-black border-r border-white/10 flex flex-col justify-between shrink-0 select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center gap-3 border-b border-white/10">
          <div className="w-8 h-8 rounded border border-white/30 flex items-center justify-center font-extrabold text-white tracking-widest text-sm bg-white/5">
            S
          </div>
          <div>
            <div className="text-sm font-bold tracking-wider text-white">SAFARIS UGANDA</div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Command Center</div>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="p-4 space-y-1.5">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white/40">
            Navigation
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md text-[13px] font-semibold transition-all ${
                  isActive
                    ? 'bg-white/10 text-white border border-white/20 shadow-sm font-bold'
                    : 'text-white/70 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-white' : 'text-white/50 group-hover:text-white/80'
                  }`}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-white/10 space-y-2.5">
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full px-3 py-2 text-xs font-semibold text-white/80 hover:text-white border border-white/15 hover:border-white/30 hover:bg-white/[0.04] rounded-md transition-colors flex items-center justify-between"
        >
          <span>Theme: {theme === 'light' ? 'Light Mode' : 'Dark Mode'}</span>
          {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>

        {typeof window !== 'undefined' && localStorage.getItem('safaris_admin_token') && (
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('safaris_admin_token');
              window.dispatchEvent(new Event('safaris-admin-auth-change'));
            }}
            className="w-full px-3 py-2 text-xs font-semibold text-white/80 hover:text-white border border-white/15 hover:border-white/30 hover:bg-white/[0.04] rounded-md transition-colors text-left"
          >
            Logout
          </button>
        )}

        <div className="px-3 py-2 rounded border border-amber-500/30 bg-amber-500/10">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              DPO Gateway:
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase tracking-wider">
              SANDBOX
            </span>
          </div>
          <div className="text-[10px] font-mono text-amber-300/70 truncate mt-1">
            Service: 54841 • Ref: #2777504
          </div>
        </div>

        <div className="px-3 py-2 rounded border border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Target Domain:</span>
          </div>
          <div className="text-[11px] font-medium text-white/60 font-mono truncate mt-0.5">
            admin.mumwesafarisuganda.com
          </div>
        </div>

        <div className="px-3 text-[11px] font-semibold text-white/50 flex items-center justify-between">
          <span>SAFARIS v1.0.1</span>
          <span className="font-mono">18.222.41.199</span>
        </div>
      </div>
    </aside>
  );
};
