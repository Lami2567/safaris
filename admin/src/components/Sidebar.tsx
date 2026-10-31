'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Wallet,
  CreditCard,
  FileText,
  BadgeDollarSign,
  Compass,
  BarChart2,
  PieChart,
  Sliders,
  Clock,
  MessageSquare,
  Settings,
  HelpCircle,
  Info,
  Moon,
  Sun,
  Activity,
  Image as BannerIcon,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';

interface NavItem {
  name: string;
  href: string;
  icon: any;
  badge?: string | number;
}

const MENU_ITEMS: NavItem[] = [
  { name: 'Overview', href: '/', icon: LayoutGrid },
  { name: 'My Wallet', href: '/payments?tab=wallets', icon: Wallet },
  { name: 'Transaction', href: '/payments', icon: CreditCard },
  { name: 'Loans', href: '/pricing', icon: FileText },
  { name: 'Investment', href: '/tourism', icon: Compass },
  { name: 'Statistic', href: '/operations', icon: BarChart2 },
  { name: 'Budgeting', href: '/services-config', icon: Sliders },
  { name: 'Report', href: '/banners', icon: Clock },
  { name: 'Message', href: '#', icon: MessageSquare, badge: 4 },
];

const HELP_ITEMS: NavItem[] = [
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Feedback', href: '#', icon: HelpCircle },
  { name: 'Help & Center', href: '#', icon: Info },
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
    <aside className="w-64 min-h-screen bg-white dark:bg-[#12141a] border-r border-slate-100 dark:border-[#20242f] flex flex-col justify-between shrink-0 select-none py-6 px-4 transition-colors duration-200 shadow-xs z-30">
      <div className="space-y-6">
        {/* DeliFin Brand Logo */}
        <div className="px-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0062FF] flex items-center justify-center text-white font-extrabold shadow-sm shadow-blue-500/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
                fill="currentColor"
              />
              <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z" fill="#FFFFFF" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-black tracking-tight text-slate-900 dark:text-white leading-none">
              DeliFin
            </div>
            <div className="text-[10px] text-slate-400 font-semibold tracking-wider mt-0.5 uppercase">
              Mumwe Safaris
            </div>
          </div>
        </div>

        {/* Section: Menu */}
        <div>
          <div className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            Menu
          </div>
          <nav className="space-y-1">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href.split('?')[0]);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#F1F3F9] dark:bg-[#1e222d] text-slate-900 dark:text-white font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#181b24]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                  <span>{item.name}</span>

                  {item.badge && (
                    <span className="ml-auto w-5 h-5 rounded-full bg-[#FF3B30] text-white text-[11px] font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Section: Help & Settings */}
        <div>
          <div className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            Help & Settings
          </div>
          <nav className="space-y-1">
            {HELP_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#F1F3F9] dark:bg-[#1e222d] text-slate-900 dark:text-white font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#181b24]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom: Dark Mode Toggle (DeliFin Switch Style) */}
      <div className="pt-4 border-t border-slate-100 dark:border-[#20242f] px-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Moon className="w-4 h-4 text-slate-400" />
          <span>Dark Mode</span>
        </div>

        {/* Toggle Switch */}
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
    </aside>
  );
};
