'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, Sun, Moon } from 'lucide-react';
import { api } from '../lib/api';
import { useTheme } from './ThemeProvider';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onRefresh,
  isRefreshing = false,
}) => {
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    let mounted = true;
    api
      .getHealth()
      .then(() => {
        if (mounted) setBackendHealthy(true);
      })
      .catch(() => {
        if (mounted) setBackendHealthy(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <header className="h-16 px-8 border-b border-white/10 flex items-center justify-between bg-black sticky top-0 z-30">
      <div>
        <h1 className="text-base font-bold text-white tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs font-medium text-white/60">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Theme Switcher */}
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3 py-1.5 rounded border border-white/20 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.05] transition-colors"
          title="Switch between Light and Dark mode"
        >
          {theme === 'light' ? (
            <>
              <Moon className="w-3.5 h-3.5" />
              <span>Dark Mode</span>
            </>
          ) : (
            <>
              <Sun className="w-3.5 h-3.5" />
              <span>Light Mode</span>
            </>
          )}
        </button>

        {/* Backend Status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-white/15 bg-white/[0.03] text-xs font-semibold">
          <span
            className={`w-2 h-2 rounded-full ${
              backendHealthy === true
                ? 'bg-emerald-500'
                : backendHealthy === false
                ? 'bg-red-500'
                : 'bg-amber-500 animate-pulse'
            }`}
          />
          <span className="text-xs text-white/80">
            {backendHealthy === true ? 'Backend Online (18.222.41.199)' : 'Checking Backend...'}
          </span>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-white/20 text-xs font-semibold text-white/80 hover:text-white hover:border-white/50 hover:bg-white/[0.05] transition-all disabled:opacity-30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        )}
      </div>
    </header>
  );
};
