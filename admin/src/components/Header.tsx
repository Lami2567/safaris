'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Server, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

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
        <h1 className="text-sm font-semibold text-white tracking-wide">{title}</h1>
        {subtitle && <p className="text-[11px] text-white/50">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Backend Status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.03] text-xs font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              backendHealthy === true
                ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]'
                : backendHealthy === false
                ? 'bg-white/20'
                : 'bg-white/50 animate-pulse'
            }`}
          />
          <span className="text-[11px] text-white/80">
            {backendHealthy === true ? 'Backend Online (18.222.41.199)' : 'Checking Backend...'}
          </span>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-white/20 text-xs text-white/80 hover:text-white hover:border-white/50 hover:bg-white/[0.05] transition-all disabled:opacity-30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        )}
      </div>
    </header>
  );
};
