'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Download,
  Send,
  MoreHorizontal,
  Plus,
  RefreshCw,
  CheckCircle2,
  Sliders,
  Compass,
  Car,
  Package,
  Users,
  ShieldCheck,
  Smartphone,
  Mail,
  AlertCircle,
  TrendingUp,
  Layers,
} from 'lucide-react';

interface PayerProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  avatar_url: string;
  google_avatar_url: string;
  verified_paid_ugx: number;
  total_attempted_ugx: number;
  successful_count: number;
  total_attempts_count: number;
  last_payment_at: string;
  wallet_balance_ugx: number;
}

const formatUGX = (val: number | string | undefined | null): string => {
  const n = Number(val || 0);
  if (!Number.isFinite(n)) return 'UGX 0';
  return `UGX ${Math.round(n).toLocaleString()}`;
};

const getInitials = (name: string): string => {
  const parts = String(name || 'User')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const UserGmailAvatar: React.FC<{
  name: string;
  email?: string;
  avatarUrl?: string;
  sizeClass?: string;
  showGmailBadge?: boolean;
}> = ({ name, email, avatarUrl, sizeClass = 'w-12 h-12', showGmailBadge = true }) => {
  const [imgError, setImgError] = useState(false);
  const effectiveSrc = useMemo(() => {
    if (avatarUrl && avatarUrl.trim()) return avatarUrl.trim();
    if (email && email.includes('@')) {
      return `https://unavatar.io/google/${encodeURIComponent(email.trim().toLowerCase())}`;
    }
    return '';
  }, [avatarUrl, email]);

  const isGmail = Boolean(email && email.toLowerCase().includes('@gmail.com'));

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${sizeClass}`}>
      {effectiveSrc && !imgError ? (
        <img
          src={effectiveSrc}
          alt={name}
          onError={() => setImgError(true)}
          className="w-full h-full rounded-full object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-gradient-to-br from-[#0062FF] to-indigo-600 text-white font-extrabold text-xs flex items-center justify-center border border-blue-400/30 shadow-xs">
          {getInitials(name)}
        </div>
      )}
      {showGmailBadge && email && (
        <span
          title={`Google / Email Verified: ${email}`}
          className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black border border-white dark:border-[#161922] shadow-2xs ${
            isGmail
              ? 'bg-white text-[#EA4335]'
              : 'bg-emerald-500 text-white'
          }`}
        >
          {isGmail ? 'G' : '✓'}
        </span>
      )}
    </div>
  );
};

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<any>(null);
  const [paymentStats, setPaymentStats] = useState<any>(null);
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [refundsList, setRefundsList] = useState<any[]>([]);
  const [appConfig, setAppConfig] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingFeature, setSavingFeature] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<boolean>(false);

  // Quick Transfer State (Real Payers & Gmail Accounts)
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('');
  const [transferAmountUgx, setTransferAmountUgx] = useState<string>('1000');
  const [transferSending, setTransferSending] = useState<boolean>(false);
  const [transferBanner, setTransferBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Money Flow Graph State
  const [flowTimeframe, setFlowTimeframe] = useState<'timeline' | 'daily7' | 'monthly'>('timeline');
  const [includeSandboxInGraph, setIncludeSandboxInGraph] = useState<boolean>(true);
  const [selectedGraphIndex, setSelectedGraphIndex] = useState<number | null>(null);

  // Recent Activity Filter
  const [txFilterEnv, setTxFilterEnv] = useState<'ALL' | 'PRODUCTION' | 'SANDBOX'>('ALL');

  // Wallet Adjustment Modal State
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [adjustUserId, setAdjustUserId] = useState<string>('');
  const [adjustType, setAdjustType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjustAmountUgx, setAdjustAmountUgx] = useState<string>('5000');
  const [adjustReason, setAdjustReason] = useState<string>('Verified DPO Mobile Money Wallet Credit');
  const [adjustSubmitting, setAdjustSubmitting] = useState<boolean>(false);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, payStatsRes, payListRes, configRes, usersRes, refundsRes] = await Promise.all([
        api.getDashboardStats().catch(() => null),
        api.getPaymentStats().catch(() => null),
        api.getPayments({ limit: 200 }).catch(() => null),
        api.getAppConfig().catch(() => null),
        api.getUsers().catch(() => null),
        api.getRefunds().catch(() => null),
      ]);

      if (statsRes?.data) setStats(statsRes.data);
      if (payStatsRes?.data) setPaymentStats(payStatsRes.data);
      if (payListRes?.data?.items) setPaymentsList(payListRes.data.items);
      else if (Array.isArray(payListRes?.data)) setPaymentsList(payListRes.data);
      if (configRes?.data) setAppConfig(configRes.data);

      const loadedUsers = Array.isArray(usersRes?.data) ? usersRes.data : [];
      setUsersList(loadedUsers);

      const loadedRefunds = Array.isArray(refundsRes?.data) ? refundsRes.data : [];
      setRefundsList(loadedRefunds);
    } catch (err) {
      console.error('Failed to load dashboard telemetry:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Build real list of payers + Gmail users from database
  const quickTransferUsers: PayerProfile[] = useMemo(() => {
    if (Array.isArray(paymentStats?.recent_payers) && paymentStats.recent_payers.length > 0) {
      return paymentStats.recent_payers;
    }

    // Fallback computation directly from paymentsList + usersList
    const map = new Map<string, PayerProfile>();
    for (const u of usersList) {
      if (u.role === 'admin') continue;
      const email = u.email || '';
      const googleAvatar = email ? `https://unavatar.io/google/${encodeURIComponent(email)}` : '';
      map.set(u.id, {
        id: u.id,
        full_name: u.full_name || u.id,
        email,
        phone: u.phone || '',
        role: u.role || 'customer',
        avatar_url: u.avatar_url || googleAvatar,
        google_avatar_url: googleAvatar,
        verified_paid_ugx: 0,
        total_attempted_ugx: 0,
        successful_count: 0,
        total_attempts_count: 0,
        last_payment_at: u.created_at || new Date().toISOString(),
        wallet_balance_ugx: Number(u.wallet_balance_ugx || 0),
      });
    }

    for (const p of paymentsList) {
      if (!p.user_id) continue;
      const existing = map.get(p.user_id) || {
        id: p.user_id,
        full_name: p.customer_name || p.user_id,
        email: p.customer_email || '',
        phone: p.customer_phone || '',
        role: p.customer_role || 'customer',
        avatar_url: p.customer_avatar || '',
        google_avatar_url: p.customer_email
          ? `https://unavatar.io/google/${encodeURIComponent(p.customer_email)}`
          : '',
        verified_paid_ugx: 0,
        total_attempted_ugx: 0,
        successful_count: 0,
        total_attempts_count: 0,
        last_payment_at: p.created_at,
        wallet_balance_ugx: 0,
      };
      existing.total_attempts_count += 1;
      existing.total_attempted_ugx += Number(p.amount_ugx || 0);
      if (p.status === 'SUCCESSFUL' || p.status === 'COMPLETED') {
        existing.successful_count += 1;
        existing.verified_paid_ugx += Number(p.amount_ugx || 0);
      }
      map.set(p.user_id, existing);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.verified_paid_ugx !== a.verified_paid_ugx) return b.verified_paid_ugx - a.verified_paid_ugx;
      return b.total_attempts_count - a.total_attempts_count;
    });
  }, [paymentStats, usersList, paymentsList]);

  useEffect(() => {
    if (!selectedRecipientId && quickTransferUsers.length > 0) {
      setSelectedRecipientId(quickTransferUsers[0].id);
    }
    if (!adjustUserId && quickTransferUsers.length > 0) {
      setAdjustUserId(quickTransferUsers[0].id);
    }
  }, [quickTransferUsers, selectedRecipientId, adjustUserId]);

  const selectedRecipient = useMemo(
    () => quickTransferUsers.find((u) => u.id === selectedRecipientId) || quickTransferUsers[0] || null,
    [quickTransferUsers, selectedRecipientId]
  );

  // Exact Real Database Metrics (Strictly UGX, zero hardcoded fallbacks)
  const liveCollectedUgx = Number(
    paymentStats?.total_live_collected_ugx ?? stats?.revenue?.dpoLiveCollectedUGX ?? 0
  );
  const sandboxTestedUgx = Number(paymentStats?.total_sandbox_tested_ugx ?? 0);
  const totalVerifiedInflowUgx = liveCollectedUgx + sandboxTestedUgx;

  const liveSuccessCount = Number(paymentStats?.live?.successfulCount ?? 0);
  const sandboxSuccessCount = Number(paymentStats?.sandbox?.successfulCount ?? 0);
  const totalPaymentsCount = Number(paymentStats?.total_count ?? paymentsList.length);
  const failedOrExpiredCount =
    Number(paymentStats?.failed_count ?? 0) +
    Number(paymentStats?.live?.expiredCount ?? 0) +
    Number(paymentStats?.sandbox?.expiredCount ?? 0);

  const custodialWalletEscrowUgx = Number(
    stats?.financials?.custodialWalletLiabilityUGX ??
      usersList.reduce((acc, u) => acc + Number(u.wallet_balance_ugx || 0), 0)
  );
  const platformCommissionUgx = Number(
    stats?.revenue?.platformCommissionUGX ?? Math.round(liveCollectedUgx * 0.15)
  );
  const partnerAllocationUgx = Math.max(0, liveCollectedUgx - platformCommissionUgx);

  const settledPartnerPayoutsUgx = Number(stats?.financials?.settledPartnerPayoutsUGX ?? 0);
  const settledRefundsUgx = refundsList
    .filter((r) => r.status === 'PROCESSED' || r.status === 'APPROVED')
    .reduce((acc, r) => acc + Number(r.refund_amount_ugx || r.amount_ugx || 0), 0);
  const totalDisbursedOutflowUgx = settledPartnerPayoutsUgx + settledRefundsUgx;

  // Channel Breakdown from actual payments in DB
  const channelBreakdown = useMemo(() => {
    let mtnUgx = 0;
    let airtelUgx = 0;
    let cardUgx = 0;
    let mtnCount = 0;
    let airtelCount = 0;

    for (const p of paymentsList) {
      const amt = Number(p.amount_ugx || 0);
      const method = String(p.payment_method || '').toUpperCase();
      if (method.includes('MTN')) {
        mtnUgx += amt;
        mtnCount++;
      } else if (method.includes('AIRTEL')) {
        airtelUgx += amt;
        airtelCount++;
      } else {
        cardUgx += amt;
      }
    }
    const totalChannelUgx = mtnUgx + airtelUgx + cardUgx;
    const mtnPct = totalChannelUgx > 0 ? Math.round((mtnUgx / totalChannelUgx) * 100) : 0;
    const airtelPct = totalChannelUgx > 0 ? Math.round((airtelUgx / totalChannelUgx) * 100) : 0;

    return {
      mtnUgx,
      airtelUgx,
      cardUgx,
      mtnCount,
      airtelCount,
      totalChannelUgx,
      mtnPct,
      airtelPct,
    };
  }, [paymentsList]);

  // Real Money Flow Graph Data computed strictly from paymentsList & refundsList
  const moneyFlowSeries = useMemo(() => {
    const relevantPayments = paymentsList.filter((p) =>
      includeSandboxInGraph ? true : p.environment === 'production'
    );

    if (flowTimeframe === 'daily7') {
      // Last 7 calendar days ending today
      const buckets: {
        label: string;
        fullDate: string;
        verifiedInflowUgx: number;
        unsettledOrOutflowUgx: number;
        txCount: number;
      }[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const isoDay = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        buckets.push({
          label,
          fullDate: isoDay,
          verifiedInflowUgx: 0,
          unsettledOrOutflowUgx: 0,
          txCount: 0,
        });
      }

      for (const p of relevantPayments) {
        if (!p.created_at) continue;
        const isoDay = new Date(p.created_at).toISOString().slice(0, 10);
        const b = buckets.find((x) => x.fullDate === isoDay);
        if (b) {
          const amt = Number(p.amount_ugx || 0);
          b.txCount += 1;
          if (p.status === 'SUCCESSFUL' || p.status === 'COMPLETED') {
            b.verifiedInflowUgx += amt;
          } else {
            b.unsettledOrOutflowUgx += amt;
          }
        }
      }
      return buckets;
    }

    if (flowTimeframe === 'monthly') {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const buckets = monthNames.map((m, idx) => ({
        label: m,
        fullDate: `2026-${String(idx + 1).padStart(2, '0')}`,
        verifiedInflowUgx: 0,
        unsettledOrOutflowUgx: 0,
        txCount: 0,
      }));

      for (const p of relevantPayments) {
        if (!p.created_at) continue;
        const dt = new Date(p.created_at);
        const mIdx = dt.getMonth();
        const amt = Number(p.amount_ugx || 0);
        if (buckets[mIdx]) {
          buckets[mIdx].txCount += 1;
          if (p.status === 'SUCCESSFUL' || p.status === 'COMPLETED') {
            buckets[mIdx].verifiedInflowUgx += amt;
          } else {
            buckets[mIdx].unsettledOrOutflowUgx += amt;
          }
        }
      }
      return buckets;
    }

    // 'timeline': Individual transaction / active date timeline so every actual payment event is plotted accurately
    const sorted = [...relevantPayments].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    if (sorted.length === 0) {
      return [
        {
          label: 'No Tx Yet',
          fullDate: new Date().toISOString().slice(0, 10),
          verifiedInflowUgx: 0,
          unsettledOrOutflowUgx: 0,
          txCount: 0,
        },
      ];
    }

    return sorted.map((p, idx) => {
      const dt = new Date(p.created_at);
      const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const isOk = p.status === 'SUCCESSFUL' || p.status === 'COMPLETED';
      const amt = Number(p.amount_ugx || 0);
      return {
        label: `${label} #${idx + 1}`,
        fullDate: `${label}, ${timeStr} (${p.payment_method || 'MOMO'} • ${p.environment?.toUpperCase()})`,
        verifiedInflowUgx: isOk ? amt : 0,
        unsettledOrOutflowUgx: isOk ? 0 : amt,
        txCount: 1,
      };
    });
  }, [paymentsList, flowTimeframe, includeSandboxInGraph]);

  const maxGraphUgx = useMemo(() => {
    let m = 0;
    for (const pt of moneyFlowSeries) {
      if (pt.verifiedInflowUgx > m) m = pt.verifiedInflowUgx;
      if (pt.unsettledOrOutflowUgx > m) m = pt.unsettledOrOutflowUgx;
    }
    return m > 0 ? m : 2000;
  }, [moneyFlowSeries]);

  // Compute SVG coordinates for Money Flow Graph
  const svgChart = useMemo(() => {
    const width = 620;
    const height = 190;
    const padLeft = 16;
    const padRight = 16;
    const padTop = 20;
    const padBottom = 24;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const count = moneyFlowSeries.length;
    const getX = (i: number) => (count <= 1 ? width / 2 : padLeft + (i / (count - 1)) * plotW);
    const getY = (val: number) => padTop + plotH - Math.min(1, Math.max(0, val / maxGraphUgx)) * plotH;

    const inflowPts = moneyFlowSeries.map((pt, i) => ({
      x: getX(i),
      y: getY(pt.verifiedInflowUgx),
      ...pt,
    }));

    const unsettledPts = moneyFlowSeries.map((pt, i) => ({
      x: getX(i),
      y: getY(pt.unsettledOrOutflowUgx),
      ...pt,
    }));

    const buildSmoothPath = (pts: { x: number; y: number }[]) => {
      if (pts.length === 0) return '';
      if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
      let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const cx = ((p0.x + p1.x) / 2).toFixed(1);
        d += ` C ${cx},${p0.y.toFixed(1)} ${cx},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
      }
      return d;
    };

    const inflowPath = buildSmoothPath(inflowPts);
    const unsettledPath = buildSmoothPath(unsettledPts);
    const areaPath =
      inflowPts.length > 1
        ? `${inflowPath} L ${inflowPts[inflowPts.length - 1].x.toFixed(1)},${height - padBottom} L ${inflowPts[0].x.toFixed(1)},${height - padBottom} Z`
        : '';

    return {
      width,
      height,
      inflowPts,
      unsettledPts,
      inflowPath,
      unsettledPath,
      areaPath,
    };
  }, [moneyFlowSeries, maxGraphUgx]);

  const activeGraphPoint =
    selectedGraphIndex !== null && svgChart.inflowPts[selectedGraphIndex]
      ? svgChart.inflowPts[selectedGraphIndex]
      : svgChart.inflowPts[svgChart.inflowPts.length - 1] || null;

  // Filtered recent transactions
  const filteredTransactions = useMemo(() => {
    return paymentsList
      .filter((p) => {
        if (txFilterEnv === 'PRODUCTION') return p.environment === 'production';
        if (txFilterEnv === 'SANDBOX') return p.environment === 'sandbox';
        return true;
      })
      .slice(0, 8);
  }, [paymentsList, txFilterEnv]);

  // Execute Real UGX Quick Transfer to Selected Payer's Wallet
  const handleQuickTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericUgx = Number(String(transferAmountUgx).replace(/[^0-9]/g, ''));
    if (!selectedRecipient || !numericUgx || numericUgx < 500) {
      setTransferBanner({
        type: 'error',
        text: 'Please select a verified recipient and enter at least UGX 500.',
      });
      return;
    }

    setTransferSending(true);
    setTransferBanner(null);
    try {
      await api.recordFinancialAdjustment({
        userId: selectedRecipient.id,
        type: 'CREDIT',
        amountUgx: numericUgx,
        reason: `Admin Quick Transfer Credit to ${selectedRecipient.full_name} (${selectedRecipient.email || selectedRecipient.phone})`,
      });
      setTransferBanner({
        type: 'success',
        text: `Transferred ${formatUGX(numericUgx)} to ${selectedRecipient.full_name}'s wallet.`,
      });
      await fetchAllData();
    } catch (err: any) {
      setTransferBanner({
        type: 'error',
        text: err.message || 'Quick Transfer failed.',
      });
    } finally {
      setTransferSending(false);
    }
  };

  // Reconcile Pending DPO Payments
  const handleReconcileGateway = async () => {
    setReconciling(true);
    try {
      const res = await api.reconcilePendingPayments();
      await fetchAllData();
      setTransferBanner({
        type: 'success',
        text: res?.message || 'DPO Gateway reconciliation completed.',
      });
    } catch (err: any) {
      setTransferBanner({
        type: 'error',
        text: err.message || 'Gateway reconciliation error.',
      });
    } finally {
      setReconciling(false);
    }
  };

  // Submit Wallet Adjustment Modal
  const handleAdjustWalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(adjustAmountUgx);
    if (!adjustUserId || !amt || amt <= 0) return;
    setAdjustSubmitting(true);
    try {
      await api.recordFinancialAdjustment({
        userId: adjustUserId,
        type: adjustType,
        amountUgx: amt,
        reason: adjustReason,
      });
      setShowAdjustModal(false);
      await fetchAllData();
      setTransferBanner({
        type: 'success',
        text: `Wallet ${adjustType} of ${formatUGX(amt)} recorded in ledger.`,
      });
    } catch (err: any) {
      alert(err.message || 'Failed to record wallet adjustment.');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  // Toggle Mobile App Feature Switch
  const handleToggleFeature = async (featureKey: string) => {
    if (!appConfig?.features) return;
    setSavingFeature(featureKey);
    try {
      const updatedFeatures = {
        ...appConfig.features,
        [featureKey]: !appConfig.features[featureKey],
      };
      const res = await api.updateAppConfig({ features: updatedFeatures });
      if (res?.data) setAppConfig(res.data);
    } catch (err) {
      console.error('Failed to toggle mobile feature:', err);
    } finally {
      setSavingFeature(null);
    }
  };

  // Export Real System Ledger CSV in UGX
  const handleExportCsv = () => {
    const headers = [
      'Payment_ID',
      'Transaction_Ref',
      'Customer_Name',
      'Customer_Email',
      'Customer_Phone',
      'Environment',
      'Method',
      'Service_Type',
      'Amount_UGX',
      'Status',
      'Created_At',
    ];
    const rows = paymentsList.map((p) => [
      p.id,
      p.transaction_id || p.reference_id || '',
      `"${(p.customer_name || p.user_id || '').replace(/"/g, '""')}"`,
      p.customer_email || '',
      p.customer_phone || '',
      p.environment || 'production',
      p.payment_method || '',
      p.reference_type || '',
      Number(p.amount_ugx || 0),
      p.status || '',
      p.created_at || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safaris_uganda_ledger_ugx_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#F5F7FB] dark:bg-[#0d0f14] text-slate-900 dark:text-slate-100 pb-14 transition-colors duration-200">
      <Header
        title="Overview"
        subtitle="Real-time UGX financial telemetry, verified DPO collections & operations control"
        onRefresh={fetchAllData}
        isRefreshing={loading}
      />

      <div className="px-8 space-y-6 max-w-[1440px] mx-auto">
        {/* Status Banner */}
        {transferBanner && (
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs font-bold ${
              transferBanner.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {transferBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span>{transferBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setTransferBanner(null)}
              className="text-[11px] underline opacity-75 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Row 1: Welcome Banner + Date Pill + Export CSV */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Welcome Back, Safaris Admin
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              All figures below are live UGX values directly from the SAFARIS Uganda database &amp; DPO Service #28087
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-[#232836] text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-[#0062FF]" />
              <span>{todayFormatted}</span>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-4 py-2 rounded-xl bg-[#0B0F19] dark:bg-[#0062FF] hover:opacity-90 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export UGX CSV</span>
            </button>
          </div>
        </div>

        {/* Row 2: Top 3 Financial KPI Cards (DeliFin Card Style, 100% Real UGX Values) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Card 1: Live DPO Collected Revenue (5 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-[#161922] rounded-2xl p-6 border border-slate-200/70 dark:border-[#232836] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-[#0062FF]">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <span>Live DPO Collected Revenue</span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  <span>Service #28087</span>
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="flex items-baseline gap-2.5 my-1">
                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  {formatUGX(liveCollectedUgx)}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  {liveSuccessCount} Verified Live
                </span>
              </div>

              <p className="text-[11px] text-slate-400 font-medium">
                Sandbox Tested Volume: <strong className="text-slate-600 dark:text-slate-300">{formatUGX(sandboxTestedUgx)}</strong> ({sandboxSuccessCount} test payments)
              </p>
            </div>

            {/* 3 Action Pill Buttons */}
            <div className="grid grid-cols-3 gap-2.5 mt-5 pt-4 border-t border-slate-100 dark:border-[#232836]">
              <a
                href="#quick-transfer-card"
                className="py-2.5 px-3 rounded-xl bg-[#0062FF] hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs shadow-blue-500/20 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Transfer</span>
              </a>

              <button
                type="button"
                onClick={handleReconcileGateway}
                disabled={reconciling}
                className="py-2.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1f2430] hover:bg-slate-200/70 dark:hover:bg-[#282e3d] text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? 'animate-spin text-[#0062FF]' : ''}`} />
                <span>{reconciling ? 'Syncing…' : 'Reconcile'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAdjustModal(true)}
                className="py-2.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1f2430] hover:bg-slate-200/70 dark:hover:bg-[#282e3d] text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adjust Wallet</span>
              </button>
            </div>
          </div>

          {/* Card 2: Total Verified System Volume & Custodial Escrow (3.5 cols) */}
          <div className="lg:col-span-4 bg-white dark:bg-[#161922] rounded-2xl p-6 border border-slate-200/70 dark:border-[#232836] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span>Verified Gateway &amp; Escrow Volume</span>
              </div>
              <Link
                href="/payments"
                className="text-[11px] font-bold text-[#0062FF] hover:underline flex items-center gap-0.5"
              >
                <span>Ledger</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="my-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {formatUGX(totalVerifiedInflowUgx)}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600">
                  <ArrowUpRight className="w-3 h-3" />
                  {liveSuccessCount + sandboxSuccessCount}/{totalPaymentsCount} Cleared
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-1">
                Cumulative verified DPO payments in database
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-[#232836] flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Customer Wallet Escrow:</span>
              <span className="font-extrabold text-slate-900 dark:text-white">
                {formatUGX(custodialWalletEscrowUgx)}
              </span>
            </div>
          </div>

          {/* Card 3: Partner Payouts & Refund Disbursals (3 cols) */}
          <div className="lg:col-span-3 bg-white dark:bg-[#161922] rounded-2xl p-6 border border-slate-200/70 dark:border-[#232836] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <ArrowDownRight className="w-4 h-4" />
                </div>
                <span>Payouts &amp; Refunds</span>
              </div>
              <Link
                href="/payments"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Link>
            </div>

            <div className="my-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {formatUGX(totalDisbursedOutflowUgx)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-1">
                Disbursed to Drivers, Guides &amp; Refunds
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-[#232836] flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Unsettled / Expired Attempts:
              </span>
              <span className="font-extrabold text-amber-600 dark:text-amber-400">
                {failedOrExpiredCount} Tx
              </span>
            </div>
          </div>
        </div>

        {/* Row 3: Two-Column Main DeliFin Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column (5 cols): Quick Transfer (Real Payers' Gmail Avatars) + Recent System Transactions */}
          <div className="lg:col-span-5 space-y-5">
            {/* Quick Transfer Card */}
            <div
              id="quick-transfer-card"
              className="bg-white dark:bg-[#161922] rounded-2xl p-6 border border-slate-200/70 dark:border-[#232836] shadow-2xs"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Quick Transfer (Verified Payers &amp; Gmail Accounts)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-[#0062FF] dark:text-blue-400 text-[10px] font-extrabold">
                  Google Profile Sync
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-4">
                Select a customer or driver account synced with Google / Gmail to dispatch instant UGX wallet funds
              </p>

              {/* Avatars Row from Actual Payers & Registered Users */}
              <div className="flex items-center gap-3 overflow-x-auto pb-2 mb-4 scrollbar-thin">
                {quickTransferUsers.map((payer) => {
                  const isSelected = selectedRecipient?.id === payer.id;
                  const firstName = String(payer.full_name || 'User').split(' ')[0];
                  return (
                    <button
                      key={payer.id}
                      type="button"
                      onClick={() => setSelectedRecipientId(payer.id)}
                      className="flex flex-col items-center gap-1.5 group cursor-pointer shrink-0"
                    >
                      <div
                        className={`p-0.5 rounded-full transition-all ${
                          isSelected
                            ? 'ring-2 ring-[#0062FF] ring-offset-2 dark:ring-offset-[#161922]'
                            : 'opacity-80 group-hover:opacity-100'
                        }`}
                      >
                        <UserGmailAvatar
                          name={payer.full_name}
                          email={payer.email}
                          avatarUrl={payer.avatar_url}
                          sizeClass="w-12 h-12"
                          showGmailBadge={true}
                        />
                      </div>
                      <span
                        className={`text-[11px] font-bold truncate max-w-[68px] ${
                          isSelected
                            ? 'text-[#0062FF] dark:text-blue-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {firstName}
                      </span>
                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 leading-none">
                        {payer.verified_paid_ugx > 0
                          ? `Paid ${formatUGX(payer.verified_paid_ugx)}`
                          : payer.role}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selected Payer Details Pill */}
              {selectedRecipient && (
                <div className="mb-4 p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#1c202c] border border-slate-200/60 dark:border-[#262b3a] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserGmailAvatar
                      name={selectedRecipient.full_name}
                      email={selectedRecipient.email}
                      avatarUrl={selectedRecipient.avatar_url}
                      sizeClass="w-9 h-9"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {selectedRecipient.full_name}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-[#EA4335] shrink-0" />
                        <span className="truncate">{selectedRecipient.email || selectedRecipient.phone}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-slate-400 font-semibold">Wallet Balance</div>
                    <div className="text-xs font-black text-slate-900 dark:text-white">
                      {formatUGX(selectedRecipient.wallet_balance_ugx)}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick UGX Preset Chips */}
              <div className="flex items-center gap-1.5 mb-3">
                {[1000, 5000, 10000, 50000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTransferAmountUgx(String(preset))}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-colors cursor-pointer ${
                      Number(transferAmountUgx) === preset
                        ? 'bg-[#0062FF] text-white'
                        : 'bg-slate-100 dark:bg-[#1f2430] text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    UGX {preset.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Amount Input in UGX + Send Button */}
              <form onSubmit={handleQuickTransfer} className="flex items-center gap-2.5">
                <div className="flex-1 flex items-center bg-[#F4F6FA] dark:bg-[#1f2430] rounded-xl px-3.5 py-2.5 border border-slate-200/70 dark:border-[#2b3142]">
                  <span className="text-xs font-black text-[#0062FF] mr-2">UGX</span>
                  <input
                    type="number"
                    min={500}
                    step={500}
                    value={transferAmountUgx}
                    onChange={(e) => setTransferAmountUgx(e.target.value)}
                    placeholder="Enter UGX amount"
                    className="w-full bg-transparent text-sm font-extrabold text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={transferSending || !selectedRecipient}
                  className="px-5 py-2.5 rounded-xl bg-[#0062FF] hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{transferSending ? 'Sending…' : 'Send UGX'}</span>
                </button>
              </form>
            </div>

            {/* Recent System Activity Card (100% Real Payments from Database) */}
            <div className="bg-white dark:bg-[#161922] rounded-2xl p-6 border border-slate-200/70 dark:border-[#232836] shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Recent Activity (Live System Payments)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Showing real DPO Mobile Money &amp; Card transactions in UGX
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-[#F4F6FA] dark:bg-[#1f2430] p-1 rounded-xl">
                  {(['ALL', 'PRODUCTION', 'SANDBOX'] as const).map((envKey) => (
                    <button
                      key={envKey}
                      type="button"
                      onClick={() => setTxFilterEnv(envKey)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-extrabold transition-colors cursor-pointer ${
                        txFilterEnv === envKey
                          ? 'bg-white dark:bg-[#161922] text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {envKey === 'PRODUCTION' ? 'LIVE' : envKey}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No transactions found for the selected filter.
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredTransactions.map((tx) => {
                    const isSuccess = tx.status === 'SUCCESSFUL' || tx.status === 'COMPLETED';
                    const isLiveEnv = tx.environment === 'production';
                    const payerName = tx.customer_name || tx.user_id || 'Registered Customer';
                    const payerEmail = tx.customer_email || '';
                    const dt = tx.created_at
                      ? new Date(tx.created_at).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Just now';

                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[#202534] last:border-none"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserGmailAvatar
                            name={payerName}
                            email={payerEmail}
                            avatarUrl={tx.customer_avatar}
                            sizeClass="w-10 h-10"
                            showGmailBadge={true}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                                {payerName}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                  isLiveEnv
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                }`}
                              >
                                {isLiveEnv ? 'LIVE' : 'SANDBOX'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium truncate">
                              {tx.payment_method || 'MTN_MOMO'} • {tx.reference_type || 'PAYMENT'} • {dt}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-2">
                          <div
                            className={`text-xs font-black ${
                              isSuccess
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {isSuccess ? '+' : ''}
                            {formatUGX(tx.amount_ugx)}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">
                            {tx.status}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#232836] flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium">
                  Total in Database: {paymentsList.length} records
                </span>
                <Link
                  href="/payments"
                  className="text-xs font-bold text-[#0062FF] hover:underline flex items-center gap-1"
                >
                  <span>Open Full DPO Ledger</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column (7 cols): Actual Money Flow Graph (UGX) + Platform Financial Allocation & Channel Share */}
          <div className="lg:col-span-7 space-y-5 flex flex-col justify-between">
            {/* Actual Money Flow Graph Card */}
            <div className="bg-white dark:bg-[#161922] rounded-2xl p-6 border border-slate-200/70 dark:border-[#232836] shadow-2xs flex-1 flex flex-col justify-between">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Actual Money Flow (UGX Database Telemetry)
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Real-time UGX curve plotted directly from recorded DPO transactions
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIncludeSandboxInGraph((v) => !v)}
                      className={`px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold border transition-colors cursor-pointer ${
                        includeSandboxInGraph
                          ? 'bg-blue-500/10 border-blue-500/30 text-[#0062FF] dark:text-blue-400'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {includeSandboxInGraph ? 'All DB Tx (Live + Sandbox)' : 'Live Production Only'}
                    </button>

                    <div className="flex items-center bg-[#F4F6FA] dark:bg-[#1f2430] p-1 rounded-xl">
                      {[
                        { id: 'timeline', label: 'By Transaction' },
                        { id: 'daily7', label: 'Last 7 Days' },
                        { id: 'monthly', label: 'Monthly' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setFlowTimeframe(tab.id as any);
                            setSelectedGraphIndex(null);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-colors cursor-pointer ${
                            flowTimeframe === tab.id
                              ? 'bg-white dark:bg-[#161922] text-slate-900 dark:text-white shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Legend & Active Point Readout */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#1b1f2b] border border-slate-200/60 dark:border-[#252a3a]">
                  <div className="flex items-center gap-5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0062FF]"></span>
                      <span>Verified Inflow (UGX)</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                      <span>Unsettled / Expired (UGX)</span>
                    </div>
                  </div>

                  {activeGraphPoint && (
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-slate-400">
                        {activeGraphPoint.fullDate}
                      </div>
                      <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="text-[#0062FF]">
                          Verified: {formatUGX(activeGraphPoint.verifiedInflowUgx)}
                        </span>
                        {activeGraphPoint.unsettledOrOutflowUgx > 0 && (
                          <span className="text-amber-500">
                            Unsettled: {formatUGX(activeGraphPoint.unsettledOrOutflowUgx)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic SVG Curve Chart (Strictly Computed from Real UGX Data) */}
              <div className="relative flex-1 flex flex-col justify-end pt-2">
                <div className="flex">
                  {/* Y-axis UGX scale */}
                  <div className="flex flex-col justify-between text-[10px] font-bold text-slate-400 pr-3 pb-6 select-none shrink-0">
                    <span>{formatUGX(maxGraphUgx)}</span>
                    <span>{formatUGX(Math.round(maxGraphUgx * 0.75))}</span>
                    <span>{formatUGX(Math.round(maxGraphUgx * 0.5))}</span>
                    <span>{formatUGX(Math.round(maxGraphUgx * 0.25))}</span>
                    <span>UGX 0</span>
                  </div>

                  {/* SVG Canvas */}
                  <div className="flex-1 relative">
                    <svg
                      viewBox={`0 0 ${svgChart.width} ${svgChart.height}`}
                      className="w-full h-52 overflow-visible"
                    >
                      <defs>
                        <linearGradient id="ugxInflowGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0062FF" stopOpacity="0.28" />
                          <stop offset="100%" stopColor="#0062FF" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid Lines */}
                      {[30, 70, 110, 150].map((yLine) => (
                        <line
                          key={yLine}
                          x1="0"
                          y1={yLine}
                          x2={svgChart.width}
                          y2={yLine}
                          stroke="currentColor"
                          className="text-slate-100 dark:text-[#222634]"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                      ))}

                      {/* Area under Verified Inflow */}
                      {svgChart.areaPath && (
                        <path d={svgChart.areaPath} fill="url(#ugxInflowGrad)" />
                      )}

                      {/* Unsettled / Expired Dashed Curve */}
                      {svgChart.unsettledPath && (
                        <path
                          d={svgChart.unsettledPath}
                          fill="none"
                          stroke="#F59E0B"
                          strokeWidth="2.2"
                          strokeDasharray="5 5"
                          strokeLinecap="round"
                        />
                      )}

                      {/* Verified Inflow Solid Curve */}
                      {svgChart.inflowPath && (
                        <path
                          d={svgChart.inflowPath}
                          fill="none"
                          stroke="#0062FF"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      )}

                      {/* Interactive Data Points */}
                      {svgChart.inflowPts.map((pt, idx) => {
                        const isSelected =
                          (selectedGraphIndex === null && idx === svgChart.inflowPts.length - 1) ||
                          selectedGraphIndex === idx;
                        return (
                          <g
                            key={idx}
                            onClick={() => setSelectedGraphIndex(idx)}
                            onMouseEnter={() => setSelectedGraphIndex(idx)}
                            className="cursor-pointer"
                          >
                            {isSelected && (
                              <line
                                x1={pt.x}
                                y1={16}
                                x2={pt.x}
                                y2={svgChart.height - 24}
                                stroke="#0062FF"
                                strokeWidth="1.2"
                                strokeDasharray="3 3"
                              />
                            )}
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isSelected ? 6 : 4}
                              fill={isSelected ? '#0062FF' : '#FFFFFF'}
                              stroke="#0062FF"
                              strokeWidth="2.5"
                            />
                          </g>
                        );
                      })}
                    </svg>

                    {/* X-axis Labels */}
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1 px-1">
                      {moneyFlowSeries.map((pt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedGraphIndex(i)}
                          className={`truncate max-w-[68px] cursor-pointer transition-colors ${
                            selectedGraphIndex === i
                              ? 'text-[#0062FF] font-black'
                              : 'hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                        >
                          {pt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom-Right Card: Payment Channel Share & Revenue Allocation (DeliFin Striped Progress Style) */}
            <div className="bg-white dark:bg-[#161922] rounded-2xl p-6 border border-slate-200/70 dark:border-[#232836] shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Payment Channels &amp; Revenue Split (UGX)
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Actual Mobile Money collection share &amp; 85/15 partner escrow allocation
                  </p>
                </div>

                <Link
                  href="/payments"
                  className="text-xs font-bold text-[#0062FF] hover:underline flex items-center gap-1"
                >
                  <span>Manage Channels</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="space-y-4">
                {/* Bar 1: MTN MoMo vs Airtel Money */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      MTN Mobile Money ({channelBreakdown.mtnCount} Tx) vs Airtel Money ({channelBreakdown.airtelCount} Tx)
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {formatUGX(channelBreakdown.mtnUgx)}{' '}
                      <span className="text-slate-400 font-normal">
                        / {formatUGX(channelBreakdown.totalChannelUgx)}
                      </span>
                    </span>
                  </div>
                  <div className="w-full h-7 rounded-xl bg-[#F4F6FA] dark:bg-[#1f2430] overflow-hidden flex items-center p-1">
                    <div
                      style={{ width: `${Math.max(12, channelBreakdown.mtnPct)}%` }}
                      className="h-full rounded-lg bg-[#0062FF] text-white text-[10px] font-extrabold flex items-center px-2.5 transition-all"
                    >
                      MTN {channelBreakdown.mtnPct}%
                    </div>
                    {channelBreakdown.airtelPct > 0 && (
                      <div className="px-2.5 text-[10px] font-extrabold text-slate-600 dark:text-slate-300">
                        Airtel {channelBreakdown.airtelPct}% ({formatUGX(channelBreakdown.airtelUgx)})
                      </div>
                    )}
                  </div>
                </div>

                {/* Bar 2: Partner Allocation (85%) vs Platform Commission (15%) */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Partner Escrow Allocation (85%) vs Safaris Commission (15%)
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {formatUGX(partnerAllocationUgx)}{' '}
                      <span className="text-slate-400 font-normal">
                        + {formatUGX(platformCommissionUgx)} Fee
                      </span>
                    </span>
                  </div>
                  <div className="w-full h-7 rounded-xl bg-[#F4F6FA] dark:bg-[#1f2430] overflow-hidden flex items-center p-1">
                    <div
                      style={{ width: '85%' }}
                      className="h-full rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold flex items-center px-2.5"
                    >
                      85% Partner Escrow ({formatUGX(partnerAllocationUgx)})
                    </div>
                    <div className="px-2 text-[10px] font-extrabold text-slate-600 dark:text-slate-300">
                      15% ({formatUGX(platformCommissionUgx)})
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 4: Real Database Entities + Mobile App Feature Toggles */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* System Inventory Counts (7 cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-[#161922] rounded-2xl p-6 border border-slate-200/70 dark:border-[#232836] shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Live System Entities &amp; Operations Inventory
                </h3>
                <p className="text-[11px] text-slate-400">
                  Real records currently active in the SAFARIS PostgreSQL database
                </p>
              </div>
              <Link
                href="/operations"
                className="text-xs font-bold text-[#0062FF] hover:underline flex items-center gap-1"
              >
                <span>Live Operations</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Safari Destinations',
                  val: stats?.counts?.destinations ?? 0,
                  href: '/tourism',
                  icon: Compass,
                },
                {
                  label: 'Tour Packages',
                  val: stats?.counts?.packages ?? 0,
                  href: '/tourism',
                  icon: Layers,
                },
                {
                  label: 'UWA Tour Guides',
                  val: stats?.counts?.tourGuides ?? 0,
                  href: '/operations',
                  icon: ShieldCheck,
                },
                {
                  label: 'Registered Drivers',
                  val: stats?.counts?.drivers ?? 0,
                  href: '/operations',
                  icon: Car,
                },
                {
                  label: 'System Users',
                  val: stats?.counts?.users ?? usersList.length,
                  href: '/operations',
                  icon: Users,
                },
                {
                  label: 'Safari Bookings',
                  val: stats?.counts?.bookings ?? 0,
                  href: '/operations',
                  icon: Calendar,
                },
                {
                  label: 'Mobility Rides',
                  val: stats?.counts?.rides ?? 0,
                  href: '/operations',
                  icon: Car,
                },
                {
                  label: 'Express Deliveries',
                  val: stats?.counts?.deliveries ?? 0,
                  href: '/operations',
                  icon: Package,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#1c202c] border border-slate-200/60 dark:border-[#262b3a] hover:border-[#0062FF]/40 transition-all"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Icon className="w-4 h-4 text-[#0062FF]" />
                      <ArrowUpRight className="w-3 h-3 text-slate-400" />
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white">
                      {item.val}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Mobile App Feature Toggles (5 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-[#161922] rounded-2xl p-6 border border-slate-200/70 dark:border-[#232836] shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#0062FF]" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Mobile App Service Switches
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Toggle real-time availability on the Flutter mobile app
                  </p>
                </div>
              </div>
              <Link
                href="/services-config"
                className="text-xs font-bold text-[#0062FF] hover:underline"
              >
                Configure
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'enableTourism', label: 'Tourism & Safaris', desc: 'National Parks & Lodges' },
                { key: 'enableRides', label: 'Mobility Rides', desc: 'Boda, Economy, XL, Safari 4x4' },
                { key: 'enableDelivery', label: 'Express Delivery', desc: 'Bike, Van & Cargo Logistics' },
                { key: 'enableWallet', label: 'Safaris UGX Wallet', desc: 'DPO MoMo & Card Top-ups' },
              ].map((feat) => {
                const enabled = appConfig?.features?.[feat.key] ?? true;
                return (
                  <div
                    key={feat.key}
                    className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#1c202c] border border-slate-200/60 dark:border-[#262b3a] flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {feat.label}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{feat.desc}</div>
                    </div>
                    <button
                      type="button"
                      disabled={savingFeature === feat.key}
                      onClick={() => handleToggleFeature(feat.key)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                        enabled
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {savingFeature === feat.key ? 'Saving…' : enabled ? 'ACTIVE' : 'PAUSED'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Wallet Adjustment Modal (Strictly UGX) */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161922] border border-slate-200 dark:border-[#232836] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Record UGX Wallet Ledger Adjustment
              </h3>
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleAdjustWalletSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Target Account (Payer / Customer / Partner)
                </label>
                <select
                  value={adjustUserId}
                  onChange={(e) => setAdjustUserId(e.target.value)}
                  className="w-full rounded-xl bg-[#F4F6FA] dark:bg-[#1f2430] border border-slate-200 dark:border-[#2b3142] px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-white"
                >
                  {quickTransferUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email || u.phone}) — Bal: {formatUGX(u.wallet_balance_ugx)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(['CREDIT', 'DEBIT'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAdjustType(t)}
                    className={`py-2 rounded-xl text-xs font-extrabold border cursor-pointer ${
                      adjustType === t
                        ? t === 'CREDIT'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-rose-600 text-white border-rose-600'
                        : 'bg-[#F4F6FA] dark:bg-[#1f2430] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2b3142]'
                    }`}
                  >
                    {t === 'CREDIT' ? '+ CREDIT UGX' : '- DEBIT UGX'}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Amount (UGX)
                </label>
                <input
                  type="number"
                  min={500}
                  step={500}
                  value={adjustAmountUgx}
                  onChange={(e) => setAdjustAmountUgx(e.target.value)}
                  className="w-full rounded-xl bg-[#F4F6FA] dark:bg-[#1f2430] border border-slate-200 dark:border-[#2b3142] px-3.5 py-2.5 text-sm font-extrabold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Audit Reason
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full rounded-xl bg-[#F4F6FA] dark:bg-[#1f2430] border border-slate-200 dark:border-[#2b3142] px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#0062FF] hover:bg-blue-700 text-white text-xs font-bold"
                >
                  {adjustSubmitting ? 'Recording…' : 'Confirm UGX Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
