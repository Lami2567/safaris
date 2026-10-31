'use client';

import React from 'react';
import Link from 'next/link';
import { Bell, RefreshCw, Shield, CheckCircle2 } from 'lucide-react';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Overview',
  subtitle,
  onRefresh,
  isRefreshing = false,
}) => {
  return (
    <header className="min-h-20 px-8 py-4 flex items-center justify-between bg-transparent select-none">
      {/* Page Title & Subtitle */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            {subtitle}
          </p>
        )}
      </div>

      {/* Right Controls: Live Backend Status, Sync Button, Operations Bell, Admin Profile */}
      <div className="flex items-center gap-3">
        {/* Live Backend Status Pill */}
        <div className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-full bg-white dark:bg-[#151821] border border-slate-200/80 dark:border-[#242938] text-emerald-600 dark:text-emerald-400 text-xs font-bold shadow-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Backend Online (UGX)</span>
        </div>

        {/* Sync Button */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-3.5 py-2 rounded-full bg-white dark:bg-[#151821] border border-slate-200/80 dark:border-[#242938] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1d222f] text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#0062FF]' : ''}`} />
            <span>Sync</span>
          </button>
        )}

        {/* Circular Live Operations Bell */}
        <Link
          href="/operations"
          aria-label="Live Operations"
          className="w-10 h-10 rounded-full bg-white dark:bg-[#151821] border border-slate-200/80 dark:border-[#242938] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors shadow-xs relative"
        >
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 rounded-full bg-emerald-500 absolute top-2.5 right-2.5"></span>
        </Link>

        {/* Real System Administrator Profile Pill */}
        <Link
          href="/settings"
          className="flex items-center gap-2.5 pl-2 py-1 pr-3 rounded-full bg-white dark:bg-[#151821] border border-slate-200/80 dark:border-[#242938] hover:border-blue-500/40 transition-colors shadow-xs"
        >
          <div className="w-8 h-8 rounded-full bg-[#0062FF] text-white flex items-center justify-center text-xs font-black overflow-hidden">
            SA
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-1">
              <span>Safaris Admin Director</span>
              <CheckCircle2 className="w-3 h-3 text-[#0062FF]" />
            </div>
            <div className="text-[10px] text-slate-400 font-medium">admin@safaris.ug</div>
          </div>
        </Link>
      </div>
    </header>
  );
};
