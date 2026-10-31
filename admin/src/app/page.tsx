'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Header } from '../components/Header';
import { api } from '../lib/api';
import {
  Calendar,
  Download,
  Info,
  ChevronDown,
  Copy,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  TrendingUp,
  TrendingDown,
  Check,
  X,
  CreditCard,
  Building,
  RotateCcw,
  Scale,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import CareersPage from './careers/page';

interface ActivityItem {
  id: string;
  name: string;
  account: string;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  icon: string;
  bgColor: string;
}

export default function OverviewPage() {
  const [isCareersHost, setIsCareersHost] = useState(false);
  const [data, setData] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal states
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showReceivedModal, setShowReceivedModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState('Robert Fox');

  // Form states
  const [transferAmount, setTransferAmount] = useState('1500');
  const [transferRecipient, setTransferRecipient] = useState('Robert Fox');
  const [adjustAmount, setAdjustAmount] = useState('500');
  const [adjustReason, setAdjustReason] = useState('Reserve balancing');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host.includes('careers.mumwesafarisuganda.com') || host.startsWith('careers.')) {
        setIsCareersHost(true);
      }
    }
  }, []);

  useEffect(() => {
    const loadOverviewData = async () => {
      try {
        const [statsRes, configRes] = await Promise.allSettled([api.getStats(), api.getConfig()]);
        if (statsRes.status === 'fulfilled') setData(statsRes.value);
        if (configRes.status === 'fulfilled') setConfig(configRes.value);
      } catch (err) {
        console.error('Failed to load overview data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadOverviewData();
  }, []);

  if (isCareersHost) {
    return <CareersPage />;
  }

  // DeliFin Recent Activity Items (matching screenshot 1:1)
  const activities: ActivityItem[] = [
    {
      id: 'act-1',
      name: 'PayPal',
      account: '****9484',
      date: '16 Jul 2024',
      amount: 848.84,
      type: 'income',
      icon: 'P',
      bgColor: 'bg-[#003087]',
    },
    {
      id: 'act-2',
      name: 'Wise',
      account: '****9485',
      date: '15 Jul 2024',
      amount: -665.56,
      type: 'expense',
      icon: 'W',
      bgColor: 'bg-[#00B9FF]',
    },
    {
      id: 'act-3',
      name: 'Atlassian',
      account: '****9485',
      date: '14 Jul 2024',
      amount: 546.84,
      type: 'income',
      icon: 'A',
      bgColor: 'bg-[#0052CC]',
    },
    {
      id: 'act-4',
      name: 'Dropbox',
      account: '****9486',
      date: '13 Jul 2024',
      amount: -738.59,
      type: 'expense',
      icon: 'D',
      bgColor: 'bg-[#0061FF]',
    },
  ];

  // DeliFin Quick Transfer Avatars (matching screenshot 1:1)
  const transferAvatars = [
    { name: 'Sarah Connor', img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80', initials: 'SC' },
    { name: 'Robert Fox', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80', initials: 'RF' },
    { name: 'Devon Lane', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80', initials: 'DL' },
    { name: 'Jane Cooper', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', initials: 'JC' },
    { name: 'Wade Warren', img: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&auto=format&fit=crop&q=80', initials: 'WW' },
    { name: 'Esther Howard', img: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80', initials: 'EH' },
  ];

  const handleCopyAccount = () => {
    navigator.clipboard?.writeText('7484747583839384');
    setCopiedAccount(true);
    showToast('Account number copied to clipboard');
    setTimeout(() => setCopiedAccount(false), 2500);
  };

  const handleExport = () => {
    const csvContent =
      'Type,Name,Account,Date,Amount\n' +
      activities.map((a) => `${a.type},${a.name},${a.account},${a.date},${a.amount}`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DeliFin_Financial_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Financial report exported successfully');
  };

  return (
    <div className="min-h-screen bg-[#F8F9FD] dark:bg-[#0A0C10] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top Header */}
      <Header title="Overview" />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold shadow-xl border border-slate-700 dark:border-slate-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="px-6 md:px-8 pb-12 space-y-6 max-w-[1440px] mx-auto">
        {/* ========================================================================= */}
        {/* ROW 1: WELCOME BANNER & DATE / EXPORT ACTIONS */}
        {/* ========================================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-2xl md:text-[26px] font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            Welcome, Jerry <span className="text-xl">🔥</span>
          </h2>

          <div className="flex items-center gap-3">
            {/* Date Pill Button */}
            <div className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#14161D] border border-slate-200/80 dark:border-[#222634] text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 shadow-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1a1d27] transition-colors">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>16 May 2024</span>
            </div>

            {/* Export Primary Blue Button */}
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded-xl bg-[#0062FF] hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm shadow-blue-500/25"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ROW 2: TOP 3 KPI CARDS (My Balance, Monthly Spent, Monthly Income) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* CARD 1: My Balance */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#14161D] border border-slate-200/80 dark:border-[#222634] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>My Balance</span>
                <Info className="w-3.5 h-3.5 text-slate-400 cursor-pointer" />
              </div>
              <button className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
                <span>July 16</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-3xl lg:text-[32px] font-extrabold text-slate-900 dark:text-white tracking-tight">
                  $24,847,84
                </span>
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#E6F9F0] text-[#00B050] dark:bg-emerald-950/40 dark:text-emerald-400">
                  <TrendingUp className="w-3 h-3" /> 16,8%
                </span>
              </div>

              {/* Account Number & Copy */}
              <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span className="font-mono">7484 7475 8383 9384</span>
                <button
                  onClick={handleCopyAccount}
                  className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedAccount ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Action Buttons: Transfer / Received / + */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setShowTransferModal(true)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#0062FF] hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Transfer</span>
              </button>

              <button
                onClick={() => setShowReceivedModal(true)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#F1F3F9] hover:bg-slate-200 dark:bg-[#1E222D] dark:hover:bg-[#272D3B] text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>Received</span>
              </button>

              <button
                onClick={() => setShowAdjustModal(true)}
                className="w-10 h-10 rounded-xl bg-[#F1F3F9] hover:bg-slate-200 dark:bg-[#1E222D] dark:hover:bg-[#272D3B] text-slate-800 dark:text-slate-200 flex items-center justify-center transition-colors shrink-0"
                title="Add / Adjust"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* CARD 2: Monthly Spent */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#14161D] border border-slate-200/80 dark:border-[#222634] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Monthly Spent</span>
                <Info className="w-3.5 h-3.5 text-slate-400 cursor-pointer" />
              </div>
              <button className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
                <span>July 16</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="py-2">
              <div className="text-3xl lg:text-[32px] font-extrabold text-slate-900 dark:text-white tracking-tight">
                $45,623.48
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#E6F9F0] text-[#00B050] dark:bg-emerald-950/40 dark:text-emerald-400">
                  <TrendingUp className="w-3 h-3" /> 16.5%
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Compared to last month</span>
              </div>
            </div>
          </div>

          {/* CARD 3: Monthly Income */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#14161D] border border-slate-200/80 dark:border-[#222634] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Monthly Income</span>
                <Info className="w-3.5 h-3.5 text-slate-400 cursor-pointer" />
              </div>
              <button className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
                <span>July 16</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="py-2">
              <div className="text-3xl lg:text-[32px] font-extrabold text-slate-900 dark:text-white tracking-tight">
                $84,884.80
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FDECEC] text-[#FF3B30] dark:bg-rose-950/40 dark:text-rose-400">
                  <TrendingDown className="w-3 h-3" /> 12.8%
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Compared to last month</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ROW 3: TWO-COLUMN SECTION (Quick Transfer + Activity / Cashflow + Savings) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ======================================================================= */}
          {/* LEFT COLUMN: Quick transfer & Recently Activity (~38% width -> 5 of 12) */}
          {/* ======================================================================= */}
          <div className="lg:col-span-5 space-y-6">
            {/* Quick transfer card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-[#14161D] border border-slate-200/80 dark:border-[#222634] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Quick transfer</h3>
                <button className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
                  <span>This Week</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Avatar list with selected Robert Fox tooltip bubble */}
              <div className="pt-6 pb-2 flex items-center justify-between gap-2 overflow-x-visible">
                {/* Plus circle button */}
                <button
                  onClick={() => setShowTransferModal(true)}
                  className="w-10 h-10 rounded-full bg-[#F1F3F9] dark:bg-[#1E222D] hover:bg-slate-200 dark:hover:bg-[#272D3B] text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {transferAvatars.map((avatar, idx) => {
                  const isSelected = avatar.name === selectedAvatar;

                  return (
                    <div key={avatar.name} className="relative flex flex-col items-center">
                      {/* Tooltip bubble on selected avatar (Robert Fox) */}
                      {isSelected && (
                        <div className="absolute -top-7 z-10 px-2 py-0.5 rounded-full bg-[#0062FF] text-white text-[10px] font-bold whitespace-nowrap shadow-xs animate-in fade-in slide-in-from-bottom-1">
                          {avatar.name}
                          <div className="w-1.5 h-1.5 bg-[#0062FF] rotate-45 absolute -bottom-0.5 left-1/2 -translate-x-1/2"></div>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          setSelectedAvatar(avatar.name);
                          setTransferRecipient(avatar.name);
                        }}
                        className={`w-10 h-10 rounded-full overflow-hidden transition-all ${
                          isSelected
                            ? 'ring-2 ring-[#0062FF] ring-offset-2 dark:ring-offset-[#14161D]'
                            : 'opacity-85 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={avatar.img}
                          alt={avatar.name}
                          className="w-full h-full object-cover"
                          onError={(e: any) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recently Activity table card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-[#14161D] border border-slate-200/80 dark:border-[#222634] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recently Activity</h3>
                <button className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
                  <span>This Week</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Table header */}
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 dark:text-slate-500 pt-1 pb-2 border-b border-slate-100 dark:border-[#20242f]">
                <div className="flex items-center gap-1 cursor-pointer hover:text-slate-600">
                  <span>Name</span>
                  <ChevronDown className="w-3 h-3" />
                </div>
                <div className="flex items-center gap-1 cursor-pointer hover:text-slate-600">
                  <span>Date</span>
                  <ChevronDown className="w-3 h-3" />
                </div>
                <div>Amount</div>
              </div>

              {/* Activity rows */}
              <div className="space-y-4 pt-1">
                {activities.map((act) => {
                  const isPositive = act.amount > 0;

                  return (
                    <div
                      key={act.id}
                      onClick={() => setSelectedActivity(act)}
                      className="flex items-center justify-between cursor-pointer p-1 rounded-xl hover:bg-slate-50 dark:hover:bg-[#1A1D27] transition-colors"
                    >
                      {/* Name & Icon */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full ${act.bgColor} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs`}
                        >
                          {act.icon}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                            {act.name}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                            {act.account}
                          </div>
                        </div>
                      </div>

                      {/* Date */}
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {act.date}
                      </div>

                      {/* Amount */}
                      <div
                        className={`text-xs font-bold ${
                          isPositive ? 'text-[#0062FF]' : 'text-[#FF3B30]'
                        }`}
                      >
                        {isPositive ? `+${act.amount.toFixed(2)}` : act.amount.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ======================================================================= */}
          {/* RIGHT COLUMN: Cashflow & Savings (~62% width -> 7 of 12) */}
          {/* ======================================================================= */}
          <div className="lg:col-span-7 space-y-6">
            {/* Cashflow Chart Card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-[#14161D] border border-slate-200/80 dark:border-[#222634] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cashflow</h3>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-medium">Total Balance</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      $83,074.00
                    </span>
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#E6F9F0] text-[#00B050] dark:bg-emerald-950/40 dark:text-emerald-400">
                      <TrendingUp className="w-3 h-3" /> 16,8%
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <button className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
                    <span>This Month</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Legend: Expense (Blue) & Income (Amber) */}
                  <div className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0062FF]"></span> Expense
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span> Income
                    </span>
                  </div>
                </div>
              </div>

              {/* Exact SVG Dual Curve Line Graph with Y-Axis and Month Markers */}
              <div className="relative w-full h-56 pt-4">
                <svg viewBox="0 0 680 180" className="w-full h-full overflow-visible">
                  {/* Horizontal Grid lines */}
                  <line x1="30" y1="20" x2="680" y2="20" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
                  <line x1="30" y1="55" x2="680" y2="55" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
                  <line x1="30" y1="90" x2="680" y2="90" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
                  <line x1="30" y1="125" x2="680" y2="125" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
                  <line x1="30" y1="160" x2="680" y2="160" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />

                  {/* Y-Axis Labels */}
                  <text x="0" y="24" fill="#9CA3AF" fontSize="10" fontWeight="500">20K</text>
                  <text x="0" y="59" fill="#9CA3AF" fontSize="10" fontWeight="500">15K</text>
                  <text x="0" y="94" fill="#9CA3AF" fontSize="10" fontWeight="500">10K</text>
                  <text x="0" y="129" fill="#9CA3AF" fontSize="10" fontWeight="500">5K</text>
                  <text x="0" y="164" fill="#9CA3AF" fontSize="10" fontWeight="500">1K</text>

                  {/* Blue Curve (Expense) */}
                  <path
                    d="M 35,65 Q 85,62 135,48 T 235,52 T 335,40 T 435,55 T 535,42 T 635,60 L 670,45"
                    fill="none"
                    stroke="#0062FF"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Amber Curve (Income) */}
                  <path
                    d="M 35,115 Q 85,118 135,85 T 235,110 T 335,88 T 435,110 T 535,92 T 635,108 L 670,100"
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* May Point Indicators & Dark Tooltip Pills (Matching DeliFin Screenshot) */}
                  <circle cx="435" cy="55" r="4.5" fill="#0062FF" stroke="#FFFFFF" strokeWidth="2" />
                  <circle cx="435" cy="110" r="4.5" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="2" />

                  {/* Black Tooltip Pills on May ($84,848.05) */}
                  <g transform="translate(445, 42)">
                    <rect width="78" height="20" rx="4" fill="#0A0C10" />
                    <text x="39" y="14" fill="#FFFFFF" fontSize="9.5" fontWeight="bold" textAnchor="middle">
                      $84,848.05
                    </text>
                  </g>
                  <g transform="translate(445, 97)">
                    <rect width="78" height="20" rx="4" fill="#0A0C10" />
                    <text x="39" y="14" fill="#FFFFFF" fontSize="9.5" fontWeight="bold" textAnchor="middle">
                      $84,848.05
                    </text>
                  </g>
                </svg>

                {/* X-Axis Month Labels */}
                <div className="flex justify-between text-[11px] font-medium text-slate-400 pl-8 pr-2 pt-2">
                  <span>Dec</span>
                  <span>Jan</span>
                  <span>Feb</span>
                  <span>Mar</span>
                  <span>Apr</span>
                  <span className="text-[#0062FF] font-bold">May</span>
                  <span>Jun</span>
                  <span>Jul</span>
                  <span>Aug</span>
                  <span>Sep</span>
                </div>
              </div>
            </div>

            {/* Savings Card (matching DeliFin Dream House & Education 1:1) */}
            <div className="p-6 rounded-2xl bg-white dark:bg-[#14161D] border border-slate-200/80 dark:border-[#222634] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Savings</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      $93,845.00
                    </span>
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#E6F9F0] text-[#00B050] dark:bg-emerald-950/40 dark:text-emerald-400">
                      <TrendingUp className="w-3 h-3" /> 16,8%
                    </span>
                  </div>
                </div>

                <button className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
                  <span>This Week</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Two Horizontal Savings Items Side by Side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                {/* Item 1: Dream House (Blue Bar) */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1 h-9 rounded-full bg-[#0062FF] shrink-0 mt-0.5"></div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">Dream House</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Target: $75,849.00</div>
                    </div>
                  </div>

                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    $84,857.00
                  </div>

                  {/* Progress bar: 72% blue with diagonal striped pattern on the end */}
                  <div className="relative w-full h-6 rounded-lg bg-[#F1F3F9] dark:bg-[#1E222D] overflow-hidden flex items-center">
                    <div
                      className="h-full bg-[#0062FF] rounded-l-lg flex items-center px-2.5 text-white text-[10px] font-bold"
                      style={{ width: '72%' }}
                    >
                      72%
                    </div>
                    {/* Diagonal Striped pattern on remainder */}
                    <div
                      className="h-full flex-1 opacity-40 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,#94a3b8_4px,#94a3b8_8px)]"
                    ></div>
                  </div>
                </div>

                {/* Item 2: Education (Amber Bar) */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1 h-9 rounded-full bg-[#F59E0B] shrink-0 mt-0.5"></div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">Education</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Target: $65,445.00</div>
                    </div>
                  </div>

                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    $53,949.00
                  </div>

                  {/* Progress bar: 84% amber with diagonal striped pattern on the end */}
                  <div className="relative w-full h-6 rounded-lg bg-[#F1F3F9] dark:bg-[#1E222D] overflow-hidden flex items-center">
                    <div
                      className="h-full bg-[#F59E0B] rounded-l-lg flex items-center px-2.5 text-white text-[10px] font-bold"
                      style={{ width: '84%' }}
                    >
                      84%
                    </div>
                    {/* Diagonal Striped pattern on remainder */}
                    <div
                      className="h-full flex-1 opacity-40 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,#94a3b8_4px,#94a3b8_8px)]"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* MODAL: TRANSFER MODAL (Matching DeliFin Transfer) */}
      {/* ========================================================================= */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#14161D] border border-slate-200 dark:border-[#222634] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#20242f]">
              <h3 className="text-base font-bold flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-[#0062FF]" />
                <span>Send Quick Transfer</span>
              </h3>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div>
                <label className="block text-slate-500 mb-1">Recipient</label>
                <input
                  type="text"
                  value={transferRecipient}
                  onChange={(e) => setTransferRecipient(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1E222D] border border-slate-200 dark:border-[#2C3242] rounded-xl text-slate-900 dark:text-white font-semibold focus:outline-none focus:border-[#0062FF]"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Amount ($)</label>
                <input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1E222D] border border-slate-200 dark:border-[#2C3242] rounded-xl text-slate-900 dark:text-white font-bold text-base focus:outline-none focus:border-[#0062FF]"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1E222D] text-slate-500 text-[11px]">
                Transfer fee: $0.00 (Instant deliFin clearing). Funds will arrive immediately.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#1E222D] text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    showToast(`$${transferAmount} sent to ${transferRecipient}`);
                    setShowTransferModal(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0062FF] hover:bg-blue-700 text-white font-bold shadow-sm"
                >
                  Send Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECEIVED MODAL */}
      {/* ========================================================================= */}
      {showReceivedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#14161D] border border-slate-200 dark:border-[#222634] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#20242f]">
              <h3 className="text-base font-bold flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                <span>Receive / Reconcile Funds</span>
              </h3>
              <button onClick={() => setShowReceivedModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="p-4 rounded-xl bg-[#E6F9F0] dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300">
                <div className="font-bold text-sm">Primary Escrow Account Active</div>
                <div className="mt-1 font-mono text-xs">Stanbic Bank (Uganda) •••• 9384</div>
                <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                  Total incoming pending settlement: $2,840.00
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReceivedModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#0062FF] hover:bg-blue-700 text-white font-bold shadow-sm"
                >
                  Reconcile Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADJUST MODAL */}
      {/* ========================================================================= */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#14161D] border border-slate-200 dark:border-[#222634] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#20242f]">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#0062FF]" />
                <span>Manual Balance Adjustment</span>
              </h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div>
                <label className="block text-slate-500 mb-1">Adjustment Amount ($)</label>
                <input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1E222D] border border-slate-200 dark:border-[#2C3242] rounded-xl text-slate-900 dark:text-white font-bold text-base focus:outline-none focus:border-[#0062FF]"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Reason / Note</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1E222D] border border-slate-200 dark:border-[#2C3242] rounded-xl text-slate-900 dark:text-white font-semibold focus:outline-none focus:border-[#0062FF]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#1E222D] text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    showToast(`Adjustment of $${adjustAmount} recorded.`);
                    setShowAdjustModal(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0062FF] hover:bg-blue-700 text-white font-bold shadow-sm"
                >
                  Confirm Adjustment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ACTIVITY RECEIPT MODAL */}
      {/* ========================================================================= */}
      {selectedActivity && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#14161D] border border-slate-200 dark:border-[#222634] rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#20242f]">
              <h3 className="text-base font-bold">Transaction Details</h3>
              <button onClick={() => setSelectedActivity(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1E222D] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold">{selectedActivity.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{selectedActivity.account}</div>
                </div>
                <div
                  className={`text-base font-extrabold ${
                    selectedActivity.amount > 0 ? 'text-[#0062FF]' : 'text-[#FF3B30]'
                  }`}
                >
                  {selectedActivity.amount > 0
                    ? `+$${selectedActivity.amount.toFixed(2)}`
                    : `-$${Math.abs(selectedActivity.amount).toFixed(2)}`}
                </div>
              </div>

              <div className="flex justify-between text-slate-500">
                <span>Date:</span>
                <span className="font-medium text-slate-900 dark:text-white">{selectedActivity.date}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Status:</span>
                <span className="font-semibold text-emerald-600">Settled & Verified</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Method:</span>
                <span className="font-medium text-slate-900 dark:text-white">Instant Clearing Gateway</span>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setSelectedActivity(null)}
                className="w-full py-2.5 rounded-xl bg-[#0062FF] hover:bg-blue-700 text-white font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
