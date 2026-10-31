'use client';

import React from 'react';
import { Search, Bell, ChevronDown } from 'lucide-react';
import { useTheme } from './ThemeProvider';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title = 'Overview' }) => {
  return (
    <header className="h-20 px-8 flex items-center justify-between bg-transparent select-none">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
          {title}
        </h1>
      </div>

      {/* Right Controls: Search, Bell, Profile */}
      <div className="flex items-center gap-3">
        {/* Circular Search Icon */}
        <button
          type="button"
          aria-label="Search"
          className="w-10 h-10 rounded-full bg-white dark:bg-[#151821] border border-slate-200/80 dark:border-[#242938] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors shadow-xs"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Circular Notification Bell */}
        <button
          type="button"
          aria-label="Notifications"
          className="w-10 h-10 rounded-full bg-white dark:bg-[#151821] border border-slate-200/80 dark:border-[#242938] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors shadow-xs relative"
        >
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 rounded-full bg-[#FF3B30] absolute top-2.5 right-2.5"></span>
        </button>

        {/* User Profile Pill */}
        <div className="flex items-center gap-2.5 pl-2 py-1 pr-2 rounded-full cursor-pointer hover:bg-slate-100/60 dark:hover:bg-[#151821] transition-colors">
          <div className="w-9 h-9 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold overflow-hidden border border-slate-300 dark:border-slate-700">
            JW
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
              Jerry Warren
            </div>
            <div className="text-[10px] text-slate-400 font-medium">Admin</div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>
    </header>
  );
};
