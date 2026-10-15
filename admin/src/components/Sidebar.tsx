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
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Tourism & Safaris', href: '/tourism', icon: Compass },
  { name: 'App Services', href: '/services-config', icon: Sliders },
  { name: 'Promo Banners', href: '/banners', icon: BannerIcon },
  { name: 'Fare Matrix', href: '/pricing', icon: BadgeDollarSign },
  { name: 'Live Operations', href: '/operations', icon: Activity },
  { name: 'System & Releases', href: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();

  return (
    <aside className="w-64 min-h-screen bg-black border-r border-white/10 flex flex-col justify-between shrink-0 select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center gap-3 border-b border-white/10">
          <div className="w-8 h-8 rounded border border-white/30 flex items-center justify-center font-bold text-white tracking-widest text-sm bg-white/5">
            S
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wider text-white">SAFARIS UGANDA</div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Command Center</div>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="p-4 space-y-1">
          <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-white/30 font-mono">
            Navigation
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white/10 text-white border border-white/20 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-white' : 'text-white/40 group-hover:text-white/80'
                  }`}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-white/10 space-y-3">
        <div className="px-3 py-2 rounded border border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2 text-[11px] text-white/80">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Target Domain:</span>
          </div>
          <div className="text-[10px] text-white/50 font-mono truncate mt-0.5">
            admin.mumwesafarisuganda.com
          </div>
        </div>

        <div className="px-3 text-[10px] text-white/30 flex items-center justify-between">
          <span>SAFARIS v1.0.1</span>
          <span className="font-mono">18.222.41.199</span>
        </div>
      </div>
    </aside>
  );
};
