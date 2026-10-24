'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CreditCard,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  ExternalLink,
  Filter,
  Eye,
  FileText,
  DollarSign,
  Smartphone,
  ChevronRight,
  HelpCircle,
  X,
  RotateCcw,
  Wallet,
  TrendingUp,
  Scale,
  Users,
  Sliders,
  Play,
  ArrowDownLeft,
  Settings,
  Sparkles,
  Radio,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTheme } from '@/components/ThemeProvider';

interface PaymentRecord {
  id: string;
  transaction_id?: string;
  user_id: string;
  customer_name?: string;
  booking_id: string | null;
  service_type: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  lifecycle_status?: string;
  dpo_trans_token: string | null;
  dpo_trans_ref: string | null;
  dpo_approval_code: string | null;
  dpo_result_code: string | null;
  dpo_result_explanation: string | null;
  payment_environment: 'sandbox' | 'live' | 'production';
  service_type_id: string;
  support_ticket_ref: string | null;
  idempotency_key: string | null;
  attempt_number: number;
  mobile_instructions: string | null;
  callback_count: number;
  last_callback_at: string | null;
  verified_at: string | null;
  refund_status?: string;
  refunded_amount_ugx?: number;
  refund_id?: string;
  created_at: string;
  updated_at: string;
  audit_trail?: Array<{
    at?: string;
    timestamp?: string;
    event: string;
    from?: string;
    to?: string;
    source?: string;
    status?: string;
    dpoResultCode?: string;
    note?: string;
    details?: any;
  }>;
}

interface PaymentStats {
  total_count: number;
  successful_count: number;
  pending_count: number;
  failed_count: number;
  sandbox_count: number;
  live_count: number;
  total_live_collected_ugx: number;
  total_sandbox_tested_ugx: number;
  current_environment: string;
}

interface DpoConfigStatus {
  environment: string;
  configured: boolean;
  validation_error: string | null;
  live_checklist: {
    token_present: boolean;
    service_type_confirmed: boolean;
    endpoints_verified: boolean;
    credentials_in_secret_store: boolean;
    operator_authorized: boolean;
    backend_validated: boolean;
    dpo_verification_passed: boolean;
    environment_recorded: boolean;
  };
  service_type_id: string;
  ticket_ref: string;
  active_gateway_endpoint: string;
}

interface FinancialOverviewData {
  environment: 'sandbox' | 'production';
  total_verified_payments_ugx: number;
  verified_payments_count: number;
  customer_wallet_liabilities_ugx: number;
  platform_commission_earned_ugx: number;
  beneficiary_earnings_payable_ugx: number;
  total_refunds_processed_ugx: number;
  refunds_processed_count: number;
  active_refund_requests_count: number;
  reconciliation_difference_ugx: number;
  as_of: string;
}

interface RefundPolicyItem {
  id: string;
  policy_name: string;
  is_enabled: boolean;
  max_waiting_minutes: number;
  applicable_service_types: string[];
  applicable_payment_methods: string[];
  refund_percentage: number;
  require_driver_assigned: boolean;
  require_no_arrival: boolean;
  auto_process_enabled: boolean;
  updated_by?: string;
  updated_at?: string;
}

export default function PaymentsPage() {
  const { theme } = useTheme();

  // Tab State
  const [activeTab, setActiveTab] = useState<'stream' | 'financials' | 'wallets' | 'refunds' | 'methods'>('stream');

  // Payment Methods (Master Source of Truth)
  const [paymentMethods, setPaymentMethods] = useState<any[]>([
    { id: 'MTN_MOMO', name: 'MTN Mobile Money', description: 'Instant MoMo push prompt (*165#)', enabled: true, isOnline: true },
    { id: 'AIRTEL_MONEY', name: 'Airtel Money', description: 'Instant Airtel Money push prompt (*185#)', enabled: true, isOnline: true },
    { id: 'CARD', name: 'Credit / Debit Card', description: 'Visa, MasterCard, American Express via DPO Gateway', enabled: true, isOnline: true, supportsCardInput: true },
    { id: 'WALLET', name: 'SAFARIS Wallet', description: 'Pay instantly with your verified SAFARIS balance', enabled: true, isOnline: true },
  ]);
  const [savingMethods, setSavingMethods] = useState(false);

  // Core Data
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [configStatus, setConfigStatus] = useState<DpoConfigStatus | null>(null);
  const [overview, setOverview] = useState<FinancialOverviewData | null>(null);
  const [policies, setPolicies] = useState<RefundPolicyItem[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [earningsLedger, setEarningsLedger] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // Loading States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [reconcilingAll, setReconcilingAll] = useState(false);
  const [runningWorker, setRunningWorker] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [environmentFilter, setEnvironmentFilter] = useState('ALL');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('ALL');

  // Wallet Inspector State
  const [walletSearchUser, setWalletSearchUser] = useState('');
  const [searchedUserBalance, setSearchedUserBalance] = useState<{ balance_ugx: number; userId: string } | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(false);

  // Modals
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundModalPayment, setRefundModalPayment] = useState<PaymentRecord | null>(null);
  const [adjustmentData, setAdjustmentData] = useState({
    targetType: 'USER_WALLET',
    targetId: '',
    amountUgx: '',
    adjustmentType: 'CREDIT',
    reason: '',
  });
  const [manualRefundData, setManualRefundData] = useState({
    userId: '',
    bookingId: '',
    paymentId: '',
    amountUgx: '',
    reason: 'NO_SHOW_DRIVER',
    refundMethod: 'WALLET',
    notes: '',
  });

  // Real-Time Stream Status
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const togglePaymentMethod = async (id: string, newEnabled: boolean) => {
    const updated = paymentMethods.map(m => m.id === id ? { ...m, enabled: newEnabled } : m);
    setPaymentMethods(updated);
    setSavingMethods(true);
    try {
      await api.updatePaymentMethods(updated);
      showToast(`Payment method "${id}" ${newEnabled ? 'enabled' : 'disabled'} across all mobile & web clients.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update payment method', 'error');
      // revert
      setPaymentMethods(paymentMethods);
    } finally {
      setSavingMethods(false);
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const [paymentsRes, statsRes, configRes, overviewRes, policiesRes, refundsRes, earningsRes, appConfigRes, usersRes] =
        await Promise.allSettled([
          api.getPayments({
            limit: 100,
            status: statusFilter !== 'ALL' ? statusFilter : undefined,
            payment_environment: environmentFilter !== 'ALL' ? environmentFilter : undefined,
            service_type: serviceTypeFilter !== 'ALL' ? serviceTypeFilter : undefined,
            search: searchQuery || undefined,
          }),
          api.getPaymentStats(),
          api.getDpoConfigStatus(),
          api.getFinancialOverview(),
          api.getRefundPolicies(),
          api.getRefunds(),
          api.getEarningsLedger(),
          api.getConfig(),
          api.getUsers(),
        ]);

      if (paymentsRes.status === 'fulfilled' && paymentsRes.value?.payments) {
        setPayments(paymentsRes.value.payments);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setStats(statsRes.value);
      }
      if (configRes.status === 'fulfilled' && configRes.value) {
        setConfigStatus(configRes.value);
      }
      if (overviewRes.status === 'fulfilled' && overviewRes.value) {
        setOverview(overviewRes.value);
      }
      if (policiesRes.status === 'fulfilled' && policiesRes.value?.policies) {
        setPolicies(policiesRes.value.policies);
      }
      if (refundsRes.status === 'fulfilled' && refundsRes.value?.refunds) {
        setRefunds(refundsRes.value.refunds);
      }
      if (earningsRes.status === 'fulfilled' && earningsRes.value?.earnings) {
        setEarningsLedger(earningsRes.value.earnings);
      }
      if (appConfigRes.status === 'fulfilled' && appConfigRes.value?.paymentMethods) {
        const filtered = (appConfigRes.value.paymentMethods as any[]).filter(
          (m: any) => String(m?.id || '').toUpperCase().trim() !== 'CASH'
        );
        if (filtered.length > 0) setPaymentMethods(filtered);
      }
      if (usersRes.status === 'fulfilled' && Array.isArray(usersRes.value)) {
        setAllUsers(usersRes.value);
      }
    } catch (err: any) {
      console.error('Failed to load financial data:', err);
      showToast(err.message || 'Failed to load data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Real-Time SSE Stream Connection for Live Zero-Refresh Updates
  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout;

    const connectStream = () => {
      try {
        const streamUrl = api.getLiveFleetStreamUrl();
        const es = new EventSource(streamUrl);
        eventSourceRef.current = es;

        es.onopen = () => {
          setIsLiveConnected(true);
        };

        es.addEventListener('payment:update', (event) => {
          try {
            const updated = JSON.parse(event.data);
            setPayments((prev) => {
              const idx = prev.findIndex((p) => p.id === updated.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...updated };
                return next;
              }
              return [updated, ...prev];
            });
            api.getFinancialOverview().then((o) => setOverview(o)).catch(() => {});
          } catch (_) {}
        });

        es.addEventListener('payment:refunded', (event) => {
          try {
            const updated = JSON.parse(event.data);
            setPayments((prev) =>
              prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
            );
            api.getRefunds().then((r) => setRefunds(r.refunds)).catch(() => {});
            api.getFinancialOverview().then((o) => setOverview(o)).catch(() => {});
          } catch (_) {}
        });

        es.addEventListener('financial:kpis', (event) => {
          try {
            const kpis = JSON.parse(event.data);
            setOverview(kpis);
          } catch (_) {}
        });

        es.onerror = () => {
          setIsLiveConnected(false);
          es.close();
          reconnectTimer = setTimeout(connectStream, 5000);
        };
      } catch (_) {
        setIsLiveConnected(false);
        reconnectTimer = setTimeout(connectStream, 5000);
      }
    };

    connectStream();

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [statusFilter, environmentFilter, serviceTypeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(true);
  };

  const handleReconcileOne = async (id: string) => {
    setReconcilingId(id);
    try {
      const res = await api.reconcilePayment(id);
      showToast(res.message || 'Payment successfully reconciled with DPO', 'success');
      if (selectedPayment && selectedPayment.id === id) {
        setSelectedPayment((prev) => (prev ? { ...prev, ...res.payment } : null));
      }
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Reconciliation failed', 'error');
    } finally {
      setReconcilingId(null);
    }
  };

  const handleReconcileOpen = async () => {
    setReconcilingAll(true);
    try {
      const res = await api.reconcileOpenPayments();
      showToast(`Reconciled ${res.reconciledCount || 0} open transactions`, 'success');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Bulk reconciliation failed', 'error');
    } finally {
      setReconcilingAll(false);
    }
  };

  const handleRunRefundWorker = async () => {
    setRunningWorker(true);
    try {
      const res = await api.triggerRefundWorker();
      showToast(
        `No-Show Worker finished: ${res.evaluated} trips checked, ${res.refunded} automatic refunds executed.`,
        'success'
      );
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to run refund worker', 'error');
    } finally {
      setRunningWorker(false);
    }
  };

  const handleSavePolicy = async (policy: RefundPolicyItem) => {
    try {
      await api.updateRefundPolicy(policy.id, policy);
      showToast('Refund policy updated successfully', 'success');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to update refund policy', 'error');
    }
  };

  const inspectUserWallet = async (targetUserId: string) => {
    const cleanId = targetUserId.trim();
    if (!cleanId) return;
    setWalletSearchUser(cleanId);
    setLoadingWallet(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('safaris_admin_token') : null;
      const headers: Record<string, string> = { 'x-admin-key': 'mumwe_safaris_secret_jwt_2026' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/v1/wallet/transactions?userId=${encodeURIComponent(cleanId)}`, {
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        setSearchedUserBalance({ userId: cleanId, balance_ugx: data.balance_ugx || 0 });
        setWalletTransactions(data.transactions || []);
      } else {
        showToast(data.error || 'Failed to find wallet', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Network error searching wallet', 'error');
    } finally {
      setLoadingWallet(false);
    }
  };

  const handleSearchWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    await inspectUserWallet(walletSearchUser);
  };

  const handleExecuteAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.recordFinancialAdjustment({
        ...adjustmentData,
        amountUgx: Number(adjustmentData.amountUgx),
      });
      showToast('Financial adjustment recorded successfully', 'success');
      setShowAdjustmentModal(false);
      setAdjustmentData({ targetType: 'USER_WALLET', targetId: '', amountUgx: '', adjustmentType: 'CREDIT', reason: '' });
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to record adjustment', 'error');
    }
  };

  const handleExecuteManualRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createRefund({
        ...manualRefundData,
        amountUgx: Number(manualRefundData.amountUgx),
      });
      showToast('Refund processed successfully', 'success');
      setShowRefundModal(false);
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to process refund', 'error');
    }
  };

  const formatUGX = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'SUCCESSFUL' || s === 'PAID' || s === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border border-black/30 bg-black/10 text-black dark:border-white/30 dark:bg-white/10 dark:text-white">
          <CheckCircle2 className="w-3.5 h-3.5 text-black dark:text-white" /> SUCCESSFUL
        </span>
      );
    }
    if (s === 'PENDING' || s === 'INITIATED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border border-black/20 bg-black/[0.04] text-black/75 dark:border-white/20 dark:bg-white/[0.06] dark:text-white/75 font-mono">
          <Clock className="w-3.5 h-3.5 animate-pulse text-black/60 dark:text-white/60" /> PENDING
        </span>
      );
    }
    if (s === 'REFUNDED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border border-black/25 bg-black/[0.08] text-black/90 dark:border-white/25 dark:bg-white/[0.12] dark:text-white/90 font-mono">
          <RotateCcw className="w-3.5 h-3.5 text-black/70 dark:text-white/70" /> REFUNDED
        </span>
      );
    }
    if (s === 'FAILED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border border-black/20 bg-black/[0.04] text-black/50 line-through dark:border-white/20 dark:bg-white/[0.04] dark:text-white/50 font-mono">
          <XCircle className="w-3.5 h-3.5 text-black/40 dark:text-white/40" /> FAILED
        </span>
      );
    }
    if (s === 'CANCELLED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border border-black/15 bg-black/[0.03] text-black/50 dark:border-white/15 dark:bg-white/[0.03] dark:text-white/50 font-mono">
          <RotateCcw className="w-3.5 h-3.5 text-black/40 dark:text-white/40" /> CANCELLED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border border-black/15 bg-black/[0.03] text-black/70 dark:border-white/15 dark:bg-white/[0.03] dark:text-white/70">
        {s}
      </span>
    );
  };

  const getEnvironmentBadge = (env: string) => {
    if (env === 'live' || env === 'production') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold uppercase tracking-wider bg-black text-white dark:bg-white dark:text-black shadow-sm">
          LIVE
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider border border-black/20 bg-black/[0.05] text-black/80 dark:border-white/20 dark:bg-white/10 dark:text-white/80">
        SANDBOX
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-white text-black dark:bg-[#0a0a0a] dark:text-white p-6 space-y-6 transition-colors">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 transition-all ${
            toastMessage.type === 'success'
              ? 'bg-black text-white border-black/40 dark:bg-white dark:text-black dark:border-white/40'
              : 'bg-black/90 text-white border-black/50 dark:bg-neutral-900 dark:text-white dark:border-white/30'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-white dark:text-black shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-white shrink-0" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header & Navigation */}
      {/* Top Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/10 dark:border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg border border-black/15 bg-black/5 text-black dark:border-white/20 dark:bg-white/5 dark:text-white flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-black dark:text-white flex items-center gap-3">
                Mumwe Safaris Financial Engine
                <span className="text-xs px-2.5 py-1 rounded border border-black/20 bg-black/[0.04] text-black/80 dark:border-white/20 dark:bg-white/10 dark:text-white/80 font-mono font-bold uppercase tracking-wider">
                  SANDBOX ACTIVE
                </span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-mono ${
                    isLiveConnected
                      ? 'border-black/30 bg-black/5 text-black dark:border-white/30 dark:bg-white/10 dark:text-white'
                      : 'border-black/15 bg-black/[0.02] text-black/50 dark:border-white/15 dark:bg-white/[0.02] dark:text-white/50'
                  }`}
                >
                  <Radio className={`w-3 h-3 ${isLiveConnected ? 'animate-pulse text-black dark:text-white' : 'opacity-40'}`} />
                  {isLiveConnected ? 'LIVE STREAM CONNECTED' : 'STREAM RECONNECTING'}
                </span>
              </h1>
              <p className="text-xs text-black/60 dark:text-white/50">
                Authoritative DPO API v6 integration, Customer Wallets (Liabilities), Platform Commissions, and Automatic No-Show Refunds.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowAdjustmentModal(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-black/20 bg-black/5 hover:bg-black/10 text-black dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white flex items-center gap-2 transition-colors"
          >
            <Scale className="w-4 h-4 text-black dark:text-white" />
            <span>Audit Adjustment</span>
          </button>
          <button
            onClick={() => setShowChecklistModal(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-black/20 bg-black/5 hover:bg-black/10 text-black dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white flex items-center gap-2 transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-black dark:text-white" />
            <span>Production Checklist</span>
          </button>
          <button
            onClick={handleReconcileOpen}
            disabled={reconcilingAll}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-black/20 bg-black/5 hover:bg-black/10 text-black dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-4 h-4 text-black dark:text-white ${reconcilingAll ? 'animate-spin' : ''}`} />
            <span>Reconcile Pending</span>
          </button>
          <button
            onClick={() => loadData()}
            disabled={refreshing}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-black/15 bg-black/5 hover:bg-black/10 text-black dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-black dark:text-white ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-black/10 dark:border-white/10 space-x-1">
        <button
          onClick={() => setActiveTab('stream')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'stream'
              ? 'border-black text-black bg-black/[0.04] dark:border-white dark:text-white dark:bg-white/[0.04]'
              : 'border-transparent text-black/50 hover:text-black dark:text-white/60 dark:hover:text-white'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Live Payment Stream</span>
        </button>
        <button
          onClick={() => setActiveTab('financials')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'financials'
              ? 'border-black text-black bg-black/[0.04] dark:border-white dark:text-white dark:bg-white/[0.04]'
              : 'border-transparent text-black/50 hover:text-black dark:text-white/60 dark:hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Platform Financials & Liabilities</span>
        </button>
        <button
          onClick={() => setActiveTab('wallets')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'wallets'
              ? 'border-black text-black bg-black/[0.04] dark:border-white dark:text-white dark:bg-white/[0.04]'
              : 'border-transparent text-black/50 hover:text-black dark:text-white/60 dark:hover:text-white'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Customer Wallets & Ledger</span>
        </button>
        <button
          onClick={() => setActiveTab('refunds')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'refunds'
              ? 'border-black text-black bg-black/[0.04] dark:border-white dark:text-white dark:bg-white/[0.04]'
              : 'border-transparent text-black/50 hover:text-black dark:text-white/60 dark:hover:text-white'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>No-Show Refund Policies & Cases</span>
        </button>
        <button
          onClick={() => setActiveTab('methods')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'methods'
              ? 'border-black text-black bg-black/[0.04] dark:border-white dark:text-white dark:bg-white/[0.04]'
              : 'border-transparent text-black/50 hover:text-black dark:text-white/60 dark:hover:text-white'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Payment Methods (Source of Truth)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIVE PAYMENT TRACKING STREAM */}
      {/* ========================================================================= */}
      {activeTab === 'stream' && (
        <div className="space-y-6">
          {/* Warning Banner */}
          <div className="p-4 rounded-xl border border-black/15 bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.03] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-black/70 dark:text-white/70 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-xs font-bold text-black dark:text-white flex items-center gap-2">
                  <span>TESTING MODE: Fail-Closed DPO Pay Sandbox</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-black/15 bg-black/5 text-black/80 dark:border-white/15 dark:bg-white/10 dark:text-white/80">
                    Service ID: {configStatus?.service_type_id || '54841'}
                  </span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-black/15 bg-black/5 text-black/80 dark:border-white/15 dark:bg-white/10 dark:text-white/80">
                    Ticket Ref: #{configStatus?.ticket_ref || '2777504'}
                  </span>
                </div>
                <p className="text-xs text-black/60 dark:text-white/70">
                  Every transaction is permanently recorded in PostgreSQL. Live push events update this table in real-time without requiring a browser refresh.
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] font-mono text-black/40 dark:text-white/50">DPO v6 API Endpoint</div>
              <div className="text-xs font-mono text-black/80 dark:text-white/80">{configStatus?.active_gateway_endpoint || 'https://secure.3gdirectpay.com/API/v6/'}</div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black hover:border-black/25 dark:hover:border-white/25 transition-colors shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">Total Attempts</div>
              <div className="text-2xl font-black text-black dark:text-white mt-1">{stats?.total_count ?? 0}</div>
              <div className="text-[10px] text-black/40 dark:text-white/40 mt-1 font-mono">All environments</div>
            </div>
            <div className="p-4 rounded-xl border border-black/15 bg-white dark:border-white/15 dark:bg-black hover:border-black/30 dark:hover:border-white/30 transition-colors shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-black/70 dark:text-white/70">Verified Paid</div>
              <div className="text-2xl font-black text-black dark:text-white mt-1">{stats?.successful_count ?? 0}</div>
              <div className="text-[10px] text-black/40 dark:text-white/40 mt-1 font-mono">DPO Result 000</div>
            </div>
            <div className="p-4 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black hover:border-black/25 dark:hover:border-white/25 transition-colors shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">Pending / Open</div>
              <div className="text-2xl font-black text-black dark:text-white mt-1">{stats?.pending_count ?? 0}</div>
              <div className="text-[10px] text-black/40 dark:text-white/40 mt-1 font-mono">Awaiting customer PIN</div>
            </div>
            <div className="p-4 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black hover:border-black/25 dark:hover:border-white/25 transition-colors shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">Failed / Cancelled</div>
              <div className="text-2xl font-black text-black/80 dark:text-white/80 mt-1">{stats?.failed_count ?? 0}</div>
              <div className="text-[10px] text-black/40 dark:text-white/40 mt-1 font-mono">Declined or aborted</div>
            </div>
            <div className="p-4 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black hover:border-black/25 dark:hover:border-white/25 transition-colors shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">Sandbox Tested Volume</div>
              <div className="text-lg font-black text-black dark:text-white mt-1 truncate">
                {formatUGX(stats?.total_sandbox_tested_ugx ?? 0)}
              </div>
              <div className="text-[10px] text-black/40 dark:text-white/40 mt-1 font-mono">{stats?.sandbox_count ?? 0} test payments</div>
            </div>
            <div className="p-4 rounded-xl border border-black/15 bg-white dark:border-white/15 dark:bg-black hover:border-black/30 dark:hover:border-white/30 transition-colors shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-black/70 dark:text-white/70">Real Live Revenue</div>
              <div className="text-lg font-black text-black dark:text-white mt-1 truncate">
                {formatUGX(stats?.total_live_collected_ugx ?? 0)}
              </div>
              <div className="text-[10px] text-black/40 dark:text-white/40 mt-1 font-mono">{stats?.live_count ?? 0} live payments</div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-4 rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" />
                <input
                  type="text"
                  placeholder="Search by Customer ID, Booking Ref, DPO Token, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-black/15 rounded-lg text-black placeholder-black/40 focus:outline-none focus:border-black dark:bg-black/40 dark:border-white/15 dark:text-white dark:placeholder-white/40 dark:focus:border-white transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 text-xs font-semibold bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 rounded-lg transition-colors"
              >
                Search
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-black/60 dark:text-white/60">
                <Filter className="w-3.5 h-3.5" />
                <span>Status:</span>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs bg-white border border-black/15 rounded-lg px-2.5 py-1.5 text-black focus:outline-none focus:border-black dark:bg-black/40 dark:border-white/15 dark:text-white dark:focus:border-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="SUCCESSFUL">SUCCESSFUL</option>
                <option value="PENDING">PENDING</option>
                <option value="REFUNDED">REFUNDED</option>
                <option value="FAILED">FAILED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>

              <div className="flex items-center gap-1.5 text-xs text-black/60 dark:text-white/60 ml-2">
                <span>Environment:</span>
              </div>
              <select
                value={environmentFilter}
                onChange={(e) => setEnvironmentFilter(e.target.value)}
                className="text-xs bg-white border border-black/15 rounded-lg px-2.5 py-1.5 text-black focus:outline-none focus:border-black dark:bg-black/40 dark:border-white/15 dark:text-white dark:focus:border-white"
              >
                <option value="ALL">All Environments</option>
                <option value="sandbox">Sandbox Only</option>
                <option value="live">Live Only</option>
              </select>

              <div className="flex items-center gap-1.5 text-xs text-black/60 dark:text-white/60 ml-2">
                <span>Service:</span>
              </div>
              <select
                value={serviceTypeFilter}
                onChange={(e) => setServiceTypeFilter(e.target.value)}
                className="text-xs bg-white border border-black/15 rounded-lg px-2.5 py-1.5 text-black focus:outline-none focus:border-black dark:bg-black/40 dark:border-white/15 dark:text-white dark:focus:border-white"
              >
                <option value="ALL">All Services</option>
                <option value="ride">Ride Hailing</option>
                <option value="airport_shuttle">Airport Shuttle</option>
                <option value="tour_package">Tour Package</option>
                <option value="delivery">Delivery</option>
                <option value="wallet_topup">Safaris Wallet</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.02]">
              <div className="text-xs font-bold uppercase tracking-wider text-black/60 dark:text-white/60 flex items-center gap-2">
                <span>Live Transaction Stream ({payments.length})</span>
              </div>
              <span className="text-xs font-mono text-black/40 dark:text-white/40">Real-time socket pushed</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 bg-black/[0.02] dark:bg-white/[0.02]">
                    <th className="px-4 py-3 font-semibold">Customer / Booking</th>
                    <th className="px-4 py-3 font-semibold">Service Type</th>
                    <th className="px-4 py-3 font-semibold">Amount Paid</th>
                    <th className="px-4 py-3 font-semibold">Method & Provider</th>
                    <th className="px-4 py-3 font-semibold">DPO Reference</th>
                    <th className="px-4 py-3 font-semibold">Payment Status</th>
                    <th className="px-4 py-3 font-semibold">Refund Status</th>
                    <th className="px-4 py-3 font-semibold">Env</th>
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-black/40 dark:text-white/40">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-black/30 dark:text-white/30" />
                        Loading payment stream...
                      </td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-black/40 dark:text-white/40">
                        No payment records match your current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-bold text-black dark:text-white truncate max-w-[150px]">
                            {p.customer_name || 'Customer'}
                          </div>
                          <div className="text-[10px] text-black/50 dark:text-white/40 font-mono truncate max-w-[150px]">
                            UID: {p.user_id}
                          </div>
                          {p.booking_id && (
                            <div className="text-[10px] text-black/70 dark:text-white/70 font-mono">
                              Book: {p.booking_id}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-black/90 dark:text-white/90 uppercase">{p.service_type || 'BOOKING'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-black dark:text-white">
                            {p.currency} {new Intl.NumberFormat().format(p.amount)}
                          </div>
                          <div className="text-[10px] text-black/50 dark:text-white/40">Attempt #{p.attempt_number || 1}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-black/80 dark:text-white/80">
                            {p.payment_method?.includes('mobile') || p.payment_method?.includes('momo') || p.payment_method?.includes('airtel') ? (
                              <Smartphone className="w-3.5 h-3.5 text-black/70 dark:text-white/70" />
                            ) : p.payment_method === 'WALLET' ? (
                              <Wallet className="w-3.5 h-3.5 text-black/70 dark:text-white/70" />
                            ) : (
                              <CreditCard className="w-3.5 h-3.5 text-black/70 dark:text-white/70" />
                            )}
                            <span className="uppercase text-[11px] font-semibold text-black dark:text-white">{p.payment_method || 'CARD'}</span>
                          </div>
                          <div className="text-[10px] text-black/50 dark:text-white/40 font-mono">DPO Pay</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-black/80 dark:text-white/80 text-[11px] truncate max-w-[120px]">
                            {p.dpo_trans_token || p.dpo_trans_ref || 'N/A'}
                          </div>
                          {p.dpo_approval_code && (
                            <div className="text-[10px] font-mono text-black/60 dark:text-white/60">
                              Appr: {p.dpo_approval_code}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(p.status)}</td>
                        <td className="px-4 py-3">
                          {p.refund_status && p.refund_status !== 'NONE' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-black/5 text-black border border-black/20 dark:bg-white/10 dark:text-white dark:border-white/20">
                              {p.refund_status}: {formatUGX(p.refunded_amount_ugx || 0)}
                            </span>
                          ) : (
                            <span className="text-black/30 dark:text-white/30 text-[11px]">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{getEnvironmentBadge(p.payment_environment)}</td>
                        <td className="px-4 py-3 text-black/70 dark:text-white/60 font-mono text-[11px]">
                          <div>
                            {new Date(p.created_at).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          {p.verified_at && (
                            <div className="text-[9px] text-black/50 dark:text-white/50">
                              Ver: {new Date(p.verified_at).toLocaleTimeString('en-GB')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedPayment(p)}
                              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-black/5 hover:bg-black/10 text-black border border-black/15 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white dark:border-white/15 flex items-center gap-1 transition-colors"
                              title="Inspect details and audit trail"
                            >
                              <Eye className="w-3 h-3" /> Inspect
                            </button>
                            {p.status === 'SUCCESSFUL' && (!p.refund_status || p.refund_status === 'NONE') && (
                              <button
                                onClick={() => {
                                  setRefundModalPayment(p);
                                  setManualRefundData({
                                    userId: p.user_id,
                                    bookingId: p.booking_id || '',
                                    paymentId: p.id,
                                    amountUgx: String(p.amount),
                                    reason: 'CUSTOMER_SATISFACTION',
                                    refundMethod: 'WALLET',
                                    notes: '',
                                  });
                                  setShowRefundModal(true);
                                }}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-black text-white hover:bg-black/80 border border-black dark:bg-white dark:text-black dark:hover:bg-white/90 dark:border-white flex items-center gap-1 transition-colors"
                              >
                                Refund
                              </button>
                            )}
                            {p.status === 'PENDING' && (
                              <button
                                onClick={() => handleReconcileOne(p.id)}
                                disabled={reconcilingId === p.id}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-black/10 hover:bg-black/15 text-black border border-black/20 dark:bg-white/15 dark:hover:bg-white/25 dark:text-white dark:border-white/20 flex items-center gap-1 transition-colors disabled:opacity-50"
                              >
                                <RotateCcw className={`w-3 h-3 ${reconcilingId === p.id ? 'animate-spin' : ''}`} />
                                Recheck
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PLATFORM FINANCIALS, COMMISSIONS & LIABILITIES */}
      {/* ========================================================================= */}
      {activeTab === 'financials' && (
        <div className="space-y-6">
          {/* Summary Alert */}
          <div className="p-4 rounded-xl border border-black/15 bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.03] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Scale className="w-5 h-5 text-black dark:text-white shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-black dark:text-white">Liability & Revenue Segregation Invariant</h4>
                <p className="text-xs text-black/70 dark:text-white/70">
                  Customer Wallet balances represent <strong>liabilities</strong> (custodial funds held for customers), NEVER platform earnings or revenue. Platform earnings are strictly commissions earned from completed bookings.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-black dark:text-white bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 px-2 py-1 rounded">
              As of: {overview ? new Date(overview.as_of).toLocaleTimeString() : 'Live'}
            </span>
          </div>

          {/* Core Financial Overview KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black space-y-2 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-black/60 dark:text-white/60 flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Customer Wallet Liability
              </div>
              <div className="text-2xl font-black text-black dark:text-white">
                {formatUGX(overview?.customer_wallet_liabilities_ugx ?? 0)}
              </div>
              <p className="text-[11px] text-black/50 dark:text-white/50">
                Custodial funds held for customers across all wallets.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black space-y-2 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-black/60 dark:text-white/60 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Total Verified Payments
              </div>
              <div className="text-2xl font-black text-black dark:text-white">
                {formatUGX(overview?.total_verified_payments_ugx ?? 0)}
              </div>
              <p className="text-[11px] text-black/50 dark:text-white/50">
                {overview?.verified_payments_count ?? 0} confirmed payments from DPO & wallets.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black space-y-2 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-black/60 dark:text-white/60 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Platform Commission Earned
              </div>
              <div className="text-2xl font-black text-black dark:text-white">
                {formatUGX(overview?.platform_commission_earned_ugx ?? 0)}
              </div>
              <p className="text-[11px] text-black/50 dark:text-white/50">
                Mumwe Safaris company net gross earnings (15-20% margin).
              </p>
            </div>

            <div className="p-5 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black space-y-2 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-black/60 dark:text-white/60 flex items-center gap-2">
                <Users className="w-4 h-4" /> Beneficiary Driver/Guide Payable
              </div>
              <div className="text-2xl font-black text-black dark:text-white">
                {formatUGX(overview?.beneficiary_earnings_payable_ugx ?? 0)}
              </div>
              <p className="text-[11px] text-black/50 dark:text-white/50">
                Total earnings owed to drivers & tour guides.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black space-y-2 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-black/60 dark:text-white/60 flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Total Refunds Processed
              </div>
              <div className="text-2xl font-black text-black dark:text-white">
                {formatUGX(overview?.total_refunds_processed_ugx ?? 0)}
              </div>
              <p className="text-[11px] text-black/50 dark:text-white/50">
                {overview?.refunds_processed_count ?? 0} refunds completed via wallets or DPO.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black space-y-2 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-black/60 dark:text-white/60 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Active Refund Requests
              </div>
              <div className="text-2xl font-black text-black dark:text-white">
                {overview?.active_refund_requests_count ?? 0}
              </div>
              <p className="text-[11px] text-black/50 dark:text-white/50">
                Cases pending review or automated evaluation.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black space-y-2 col-span-1 md:col-span-2 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-black/60 dark:text-white/60 flex items-center gap-2">
                <Scale className="w-4 h-4" /> Financial Reconciliation Balance
              </div>
              <div className="text-2xl font-black text-black dark:text-white">
                {formatUGX(overview?.reconciliation_difference_ugx ?? 0)}
              </div>
              <p className="text-[11px] text-black/50 dark:text-white/50">
                Formula: Verified Payments - (Commissions + Driver Earnings + Wallet Liabilities - Refunds). Difference of 0 UGX indicates perfect mathematical ledger alignment.
              </p>
            </div>
          </div>

          {/* Platform Earnings Ledger Table */}
          <div className="rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.02]">
              <div className="text-xs font-bold uppercase tracking-wider text-black/60 dark:text-white/60">
                <span>Platform Earnings & Commission Ledger ({earningsLedger.length})</span>
              </div>
              <span className="text-xs font-mono text-black/40 dark:text-white/40">Immutable database records</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 bg-black/[0.02] dark:bg-white/[0.02]">
                    <th className="px-4 py-3 font-semibold">Booking / Service</th>
                    <th className="px-4 py-3 font-semibold">Payer / Beneficiary</th>
                    <th className="px-4 py-3 font-semibold">Gross Fare</th>
                    <th className="px-4 py-3 font-semibold">Commission Rate</th>
                    <th className="px-4 py-3 font-semibold">Platform Commission</th>
                    <th className="px-4 py-3 font-semibold">Driver/Guide Payout</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {earningsLedger.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-black/40 dark:text-white/40">
                        No platform earning records found in this environment.
                      </td>
                    </tr>
                  ) : (
                    earningsLedger.map((e) => (
                      <tr key={e.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <span className="font-semibold uppercase text-black dark:text-white">{e.booking_type}</span>
                          <div className="text-[10px] text-black/50 dark:text-white/40 font-mono">Ref: {e.booking_id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-black dark:text-white font-mono text-[11px]">Payer: {e.payer_user_id || 'N/A'}</div>
                          <div className="text-[10px] text-black/70 dark:text-white/70 font-mono">Driver/Guide: {e.beneficiary_id || 'N/A'}</div>
                        </td>
                        <td className="px-4 py-3 font-bold text-black dark:text-white">{formatUGX(e.gross_amount_ugx)}</td>
                        <td className="px-4 py-3 font-mono text-black/80 dark:text-white/80">{e.platform_commission_rate}%</td>
                        <td className="px-4 py-3 font-bold text-black dark:text-white">{formatUGX(e.platform_commission_ugx)}</td>
                        <td className="px-4 py-3 font-bold text-black/80 dark:text-white/80">{formatUGX(e.beneficiary_earnings_ugx)}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/5 text-black border border-black/20 dark:bg-white/10 dark:text-white dark:border-white/20">
                            {e.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-black/50 dark:text-white/50 font-mono text-[11px]">
                          {new Date(e.created_at).toLocaleString('en-GB')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CUSTOMER WALLETS & LEDGER INSPECTOR */}
      {/* ========================================================================= */}
      {activeTab === 'wallets' && (
        <div className="space-y-6">
          {/* All Users Authoritative Wallet Balances Table */}
          <div className="rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.02]">
              <div className="text-xs font-bold uppercase tracking-wider text-black/60 dark:text-white/60 flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>All Registered Users & Authoritative Server Wallet Balances ({allUsers.length})</span>
              </div>
              <span className="text-xs font-mono text-black/40 dark:text-white/40">Zero local storage — 100% server ledger computed</span>
            </div>

            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 bg-black/[0.02] dark:bg-white/[0.02]">
                    <th className="px-4 py-3 font-semibold">User ID</th>
                    <th className="px-4 py-3 font-semibold">Full Name</th>
                    <th className="px-4 py-3 font-semibold">Email & Phone</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Server Wallet Balance</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {allUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-black/40 dark:text-white/40">
                        No registered users found.
                      </td>
                    </tr>
                  ) : (
                    allUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-mono text-[11px] text-black/80 dark:text-white/80">{u.id}</td>
                        <td className="px-4 py-3 font-bold text-black dark:text-white">{u.full_name || 'Customer'}</td>
                        <td className="px-4 py-3">
                          <div className="text-black/80 dark:text-white/80">{u.email}</div>
                          <div className="font-mono text-[10px] text-black/50 dark:text-white/50">{u.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-black/5 text-black border border-black/15 dark:bg-white/10 dark:text-white dark:border-white/15">
                            {u.role || 'customer'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-black text-sm text-black dark:text-white">
                          {formatUGX(Number(u.wallet_balance_ugx || 0))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => inspectUserWallet(u.id)}
                              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-black/5 hover:bg-black/10 text-black border border-black/15 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white dark:border-white/15 flex items-center gap-1 transition-colors"
                            >
                              <Eye className="w-3 h-3" /> Inspect Ledger
                            </button>
                            <button
                              onClick={() => {
                                setAdjustmentData((prev) => ({ ...prev, targetType: 'USER_WALLET', targetId: u.id }));
                                setShowAdjustmentModal(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/90 transition-colors"
                            >
                              Adjust
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* User Search & Balance Inspector */}
          <div className="p-5 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black space-y-4 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-black dark:text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-black dark:text-white" />
              <span>Inspect Customer Wallet & Ledger</span>
            </h3>

            <form onSubmit={handleSearchWallet} className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Customer User ID (e.g. usr_123 or phone number)..."
                value={walletSearchUser}
                onChange={(e) => setWalletSearchUser(e.target.value)}
                className="flex-1 px-4 py-2 text-xs bg-white border border-black/15 rounded-lg text-black placeholder-black/40 focus:outline-none focus:border-black dark:bg-black/40 dark:border-white/15 dark:text-white dark:placeholder-white/40 dark:focus:border-white"
              />
              <button
                type="submit"
                disabled={loadingWallet}
                className="px-4 py-2 text-xs font-semibold bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/90 rounded-lg transition-colors flex items-center gap-2"
              >
                {loadingWallet && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Fetch Ledger</span>
              </button>
            </form>

            {searchedUserBalance && (
              <div className="p-4 rounded-lg border border-black/15 bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.03] flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-mono text-black/70 dark:text-white/70">Customer: {searchedUserBalance.userId}</div>
                  <div className="text-xl font-black text-black dark:text-white mt-0.5">
                    {formatUGX(searchedUserBalance.balance_ugx)}
                  </div>
                  <div className="text-[10px] text-black/50 dark:text-white/50">
                    Authoritatively calculated from {walletTransactions.length} immutable ledger transactions.
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAdjustmentData((prev) => ({ ...prev, targetId: searchedUserBalance.userId }));
                    setShowAdjustmentModal(true);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-black/10 text-black border border-black/20 hover:bg-black/15 dark:bg-white/15 dark:text-white dark:border-white/20 dark:hover:bg-white/25 transition-colors"
                >
                  Adjust Balance
                </button>
              </div>
            )}
          </div>

          {/* Ledger Entries Table */}
          <div className="rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.02]">
              <div className="text-xs font-bold uppercase tracking-wider text-black/60 dark:text-white/60">
                <span>Wallet Ledger Transactions ({walletTransactions.length})</span>
              </div>
              <span className="text-xs font-mono text-black/40 dark:text-white/40">Append-only ledger entries</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 bg-black/[0.02] dark:bg-white/[0.02]">
                    <th className="px-4 py-3 font-semibold">Transaction ID</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Reference</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Balance After</th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="px-4 py-3 font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {walletTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-black/40 dark:text-white/40">
                        {searchedUserBalance
                          ? 'No ledger entries recorded for this user yet.'
                          : 'Search a Customer User ID above to inspect their immutable wallet ledger.'}
                      </td>
                    </tr>
                  ) : (
                    walletTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-mono text-black/80 dark:text-white/80">{tx.id}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              tx.type === 'CREDIT'
                                ? 'bg-black/10 text-black border-black/20 dark:bg-white/15 dark:text-white dark:border-white/20'
                                : 'bg-black/5 text-black/80 border-black/10 dark:bg-white/5 dark:text-white/80 dark:border-white/10'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-black dark:text-white uppercase">{tx.reference_type}</span>
                          <div className="text-[10px] text-black/50 dark:text-white/40 font-mono">Ref: {tx.reference_id}</div>
                        </td>
                        <td className="px-4 py-3 font-bold">
                          <span className="text-black dark:text-white">
                            {tx.type === 'CREDIT' ? '+' : '-'} {formatUGX(tx.amount_ugx)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-black dark:text-white">{formatUGX(tx.balance_after_ugx)}</td>
                        <td className="px-4 py-3 text-black/70 dark:text-white/70 max-w-[200px] truncate">{tx.description}</td>
                        <td className="px-4 py-3 font-mono text-black/50 dark:text-white/50 text-[11px]">
                          {new Date(tx.created_at).toLocaleString('en-GB')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: NO-SHOW REFUND POLICIES & CASES */}
      {/* ========================================================================= */}
      {activeTab === 'refunds' && (
        <div className="space-y-6">
          {/* Policy Settings Editor */}
          {policies.map((p) => (
            <div key={p.id} className="p-5 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black space-y-4 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-black/10 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-black/5 border border-black/15 text-black dark:bg-white/10 dark:border-white/20 dark:text-white flex items-center justify-center">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-black dark:text-white">{p.policy_name}</h3>
                    <p className="text-xs text-black/50 dark:text-white/50">
                      Configures automatic no-show refund eligibility conditions and refund execution.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunRefundWorker}
                    disabled={runningWorker}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-black/10 text-black border border-black/20 hover:bg-black/15 dark:bg-white/15 dark:text-white dark:border-white/20 dark:hover:bg-white/25 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                  >
                    <Play className={`w-3.5 h-3.5 ${runningWorker ? 'animate-spin' : ''}`} />
                    <span>Run Auto-Refund Worker Now</span>
                  </button>
                  <button
                    onClick={() => handleSavePolicy(p)}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/90 flex items-center gap-1.5 transition-colors"
                  >
                    <span>Save Policy</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-black/60 dark:text-white/50">Max Waiting Time (Mins)</label>
                  <input
                    type="number"
                    value={p.max_waiting_minutes}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPolicies((prev) =>
                        prev.map((item) => (item.id === p.id ? { ...item, max_waiting_minutes: val } : item))
                      );
                    }}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                  />
                  <span className="text-[10px] text-black/40 dark:text-white/40">Default: 15 minutes before eligible</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-black/60 dark:text-white/50">Refund Percentage (%)</label>
                  <input
                    type="number"
                    value={p.refund_percentage}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPolicies((prev) =>
                        prev.map((item) => (item.id === p.id ? { ...item, refund_percentage: val } : item))
                      );
                    }}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                  />
                  <span className="text-[10px] text-black/40 dark:text-white/40">Default: 100% full refund</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-black/60 dark:text-white/50">Auto-Process Worker</label>
                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.auto_process_enabled}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setPolicies((prev) =>
                            prev.map((item) => (item.id === p.id ? { ...item, auto_process_enabled: val } : item))
                          );
                        }}
                        className="rounded border-black/20 bg-white text-black focus:ring-0 dark:border-white/20 dark:bg-black/40 dark:text-white"
                      />
                      <span className="text-xs text-black dark:text-white">Enable Automatic Refunds</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase text-black/60 dark:text-white/50">Conditions Required</label>
                  <div className="pt-1 text-[11px] text-black/70 dark:text-white/70 space-y-1">
                    <div>• Require Driver Assigned: {p.require_driver_assigned ? 'Yes' : 'No'}</div>
                    <div>• Require Driver No Arrival: {p.require_no_arrival ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Refunds Case Queue Table */}
          <div className="rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.02]">
              <div className="text-xs font-bold uppercase tracking-wider text-black/60 dark:text-white/60">
                <span>Refund Cases & Audit History ({refunds.length})</span>
              </div>
              <span className="text-xs font-mono text-black/40 dark:text-white/40">Processed & Pending Refunds</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 bg-black/[0.02] dark:bg-white/[0.02]">
                    <th className="px-4 py-3 font-semibold">Reference</th>
                    <th className="px-4 py-3 font-semibold">User / Booking</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold">Method</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Processed By</th>
                    <th className="px-4 py-3 font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {refunds.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-black/40 dark:text-white/40">
                        No refunds recorded yet.
                      </td>
                    </tr>
                  ) : (
                    refunds.map((r) => (
                      <tr key={r.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-mono text-black dark:text-white font-bold">{r.refund_reference}</td>
                        <td className="px-4 py-3">
                          <div className="text-black dark:text-white font-mono text-[11px]">User: {r.user_id}</div>
                          <div className="text-[10px] text-black/50 dark:text-white/40 font-mono">Trip: {r.trip_id || r.booking_id || 'N/A'}</div>
                        </td>
                        <td className="px-4 py-3 font-bold text-black dark:text-white">{formatUGX(r.amount_ugx)}</td>
                        <td className="px-4 py-3 font-semibold text-black/80 dark:text-white/80">{r.reason}</td>
                        <td className="px-4 py-3 font-mono uppercase text-black/80 dark:text-white/80">{r.refund_method}</td>
                        <td className="px-4 py-3">{getStatusBadge(r.status)}</td>
                        <td className="px-4 py-3 text-black/60 dark:text-white/60 text-[11px] font-mono">{r.processed_by}</td>
                        <td className="px-4 py-3 font-mono text-black/50 dark:text-white/50 text-[11px]">
                          {new Date(r.created_at).toLocaleString('en-GB')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: PAYMENT METHODS MASTER CONTROLS (SOURCE OF TRUTH) */}
      {/* ========================================================================= */}
      {activeTab === 'methods' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#121212] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-black/10 dark:border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                    Single Source of Truth
                  </span>
                  <span className="text-xs text-black/40 dark:text-white/40 font-mono">Real-time sync to all mobile & web clients</span>
                </div>
                <h2 className="text-lg font-bold text-black dark:text-white mt-1">Platform Payment Channels & Gateways</h2>
                <p className="text-xs text-black/60 dark:text-white/60 mt-1 max-w-2xl">
                  Enable or disable payment methods accepted across Ride Hailing, Express Package Delivery, and Uganda Safaris Tourism. Changes saved here immediately update the customer checkout sheets and remove stale or unauthorized payment options.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {savingMethods && (
                  <div className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving config...</span>
                  </div>
                )}
                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-black dark:text-white">
                    {paymentMethods.filter((m) => m.enabled !== false).length} of {paymentMethods.length} Channels Active
                  </div>
                  <div className="text-[10px] text-black/50 dark:text-white/50">Production & Sandbox Ledger Active</div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paymentMethods.map((method) => {
                const isEnabled = method.enabled !== false;
                const getMethodIcon = (id: string) => {
                  switch (id) {
                    case 'MTN_MOMO':
                    case 'AIRTEL_MONEY':
                      return <Smartphone className="w-5 h-5 text-amber-500" />;
                    case 'CARD':
                      return <CreditCard className="w-5 h-5 text-indigo-500" />;
                    case 'WALLET':
                      return <Wallet className="w-5 h-5 text-emerald-500" />;
                    case 'CASH':
                    default:
                      return <DollarSign className="w-5 h-5 text-blue-500" />;
                  }
                };

                return (
                  <div
                    key={method.id}
                    className={`rounded-xl border p-5 transition-all flex flex-col justify-between ${
                      isEnabled
                        ? 'border-black/15 bg-black/[0.02] dark:border-white/15 dark:bg-white/[0.02]'
                        : 'border-black/5 bg-black/[0.01] opacity-60 dark:border-white/5 dark:bg-white/[0.01]'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center">
                          {getMethodIcon(method.id)}
                        </div>
                        <button
                          onClick={() => togglePaymentMethod(method.id, !isEnabled)}
                          disabled={savingMethods}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            isEnabled ? 'bg-emerald-500' : 'bg-black/20 dark:bg-white/20'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              isEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-black dark:text-white">{method.name}</h3>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black/70 dark:text-white/70">
                            {method.id}
                          </span>
                        </div>
                        <p className="text-xs text-black/60 dark:text-white/60 mt-1 leading-relaxed">
                          {method.description || 'Channel payment option'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                          }`}
                        />
                        <span className="font-semibold text-black/80 dark:text-white/80">
                          {isEnabled ? 'Available to Customers' : 'Disabled / Hidden'}
                        </span>
                      </div>
                      <span className="font-mono text-black/40 dark:text-white/40">
                        {method.isOnline ? 'DPO Gateway' : 'Direct Handover'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-blue-900 dark:text-blue-200 text-xs flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 flex-shrink-0 text-blue-500 mt-0.5" />
              <div>
                <p className="font-semibold">Security & Ledger Verification Protocol</p>
                <p className="mt-1 text-black/70 dark:text-white/70">
                  Card details are processed directly through DPO XML API v6 without storing raw PAN or CVV on disk. Wallet balances are computed strictly by aggregating non-repudiable ledger transactions from <code className="font-mono font-bold">wallet_transactions</code> to prevent balance manipulation and race condition exploits.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: PAYMENT INSPECTION & AUDIT TRAIL */}
      {/* ========================================================================= */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121212] border border-black/20 dark:border-white/20 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6 text-black dark:text-white">
            <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-black/5 border border-black/15 text-black dark:bg-white/10 dark:border-white/20 dark:text-white flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-black dark:text-white">Payment Audit & Verification</h3>
                  <p className="text-xs text-black/50 dark:text-white/50 font-mono">ID: {selectedPayment.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPayment(null)}
                className="w-8 h-8 rounded-lg bg-black/5 hover:bg-black/10 text-black/60 hover:text-black dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/60 dark:hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-black/[0.02] border border-black/10 dark:bg-white/[0.03] dark:border-white/10">
                <div className="text-[10px] uppercase font-semibold text-black/50 dark:text-white/40">Status</div>
                <div className="mt-1">{getStatusBadge(selectedPayment.status)}</div>
              </div>
              <div className="p-3 rounded-lg bg-black/[0.02] border border-black/10 dark:bg-white/[0.03] dark:border-white/10">
                <div className="text-[10px] uppercase font-semibold text-black/50 dark:text-white/40">Amount</div>
                <div className="text-sm font-bold text-black dark:text-white mt-1">
                  {selectedPayment.currency} {new Intl.NumberFormat().format(selectedPayment.amount)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-black/[0.02] border border-black/10 dark:bg-white/[0.03] dark:border-white/10">
                <div className="text-[10px] uppercase font-semibold text-black/50 dark:text-white/40">Environment</div>
                <div className="mt-1">{getEnvironmentBadge(selectedPayment.payment_environment)}</div>
              </div>
              <div className="p-3 rounded-lg bg-black/[0.02] border border-black/10 dark:bg-white/[0.03] dark:border-white/10">
                <div className="text-[10px] uppercase font-semibold text-black/50 dark:text-white/40">DPO Approval</div>
                <div className="text-xs font-mono font-bold text-black dark:text-white mt-1">
                  {selectedPayment.dpo_approval_code || 'None'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-black/[0.02] border border-black/10 dark:bg-white/[0.03] dark:border-white/10">
                <div className="text-[10px] uppercase font-semibold text-black/50 dark:text-white/40">Verified Completion</div>
                <div className="text-xs font-mono text-black/70 dark:text-white/70 mt-1">
                  {selectedPayment.verified_at ? new Date(selectedPayment.verified_at).toLocaleTimeString() : 'Not yet'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-black/[0.02] border border-black/10 dark:bg-white/[0.03] dark:border-white/10">
                <div className="text-[10px] uppercase font-semibold text-black/50 dark:text-white/40">Refund Status</div>
                <div className="text-xs font-mono text-black dark:text-white mt-1">
                  {selectedPayment.refund_status || 'NONE'}
                </div>
              </div>
            </div>

            {/* Audit Trail */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase text-black/60 dark:text-white/60">Immutable Audit Log</div>
              <div className="p-3 rounded-lg bg-black/[0.03] border border-black/10 dark:bg-black/40 dark:border-white/10 max-h-48 overflow-y-auto space-y-2 text-xs font-mono">
                {selectedPayment.audit_trail && selectedPayment.audit_trail.length > 0 ? (
                  selectedPayment.audit_trail.map((entry, i) => (
                    <div key={i} className="text-black/70 dark:text-white/70 border-b border-black/5 dark:border-white/5 pb-1">
                      <span className="text-black/50 dark:text-white/50">[{new Date(entry.at || entry.timestamp || '').toLocaleTimeString()}]</span>{' '}
                      <span className="text-black dark:text-white font-bold">{entry.event}</span>: {entry.note || entry.status || ''}
                    </div>
                  ))
                ) : (
                  <div className="text-black/40 dark:text-white/40">No audit log entries recorded.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: FINANCIAL ADJUSTMENT */}
      {/* ========================================================================= */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121212] border border-black/20 dark:border-white/20 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 text-black dark:text-white">
            <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
              <h3 className="text-base font-bold text-black dark:text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-black dark:text-white" />
                <span>Record Auditable Financial Adjustment</span>
              </h3>
              <button onClick={() => setShowAdjustmentModal(false)} className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteAdjustment} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold uppercase text-black/60 dark:text-white/50">Target Type</label>
                <select
                  value={adjustmentData.targetType}
                  onChange={(e) => setAdjustmentData((prev) => ({ ...prev, targetType: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                >
                  <option value="USER_WALLET">Customer Wallet</option>
                  <option value="DRIVER_EARNINGS">Driver Earnings</option>
                  <option value="PLATFORM_RESERVE">Platform Reserve</option>
                </select>
              </div>

              <div>
                <label className="font-semibold uppercase text-black/60 dark:text-white/50">Target User / Entity ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. usr_123..."
                  value={adjustmentData.targetId}
                  onChange={(e) => setAdjustmentData((prev) => ({ ...prev, targetId: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold uppercase text-black/60 dark:text-white/50">Adjustment Action</label>
                  <select
                    value={adjustmentData.adjustmentType}
                    onChange={(e) => setAdjustmentData((prev) => ({ ...prev, adjustmentType: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                  >
                    <option value="CREDIT">CREDIT (+ Add Funds)</option>
                    <option value="DEBIT">DEBIT (- Deduct Funds)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold uppercase text-black/60 dark:text-white/50">Amount (UGX)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 50000"
                    value={adjustmentData.amountUgx}
                    onChange={(e) => setAdjustmentData((prev) => ({ ...prev, amountUgx: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold uppercase text-black/60 dark:text-white/50">Audit Justification & Reason</label>
                <textarea
                  required
                  rows={3}
                  placeholder="State the commercial or operational rationale for this financial adjustment..."
                  value={adjustmentData.reason}
                  onChange={(e) => setAdjustmentData((prev) => ({ ...prev, reason: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  className="px-4 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-black border border-black/15 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white dark:border-white/15 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/90 font-bold transition-colors"
                >
                  Record & Execute Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: MANUAL ISSUE REFUND */}
      {/* ========================================================================= */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121212] border border-black/20 dark:border-white/20 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 text-black dark:text-white">
            <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
              <h3 className="text-base font-bold text-black dark:text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-black dark:text-white" />
                <span>Issue Refund</span>
              </h3>
              <button onClick={() => setShowRefundModal(false)} className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteManualRefund} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold uppercase text-black/60 dark:text-white/50">Customer User ID</label>
                <input
                  type="text"
                  required
                  value={manualRefundData.userId}
                  onChange={(e) => setManualRefundData((prev) => ({ ...prev, userId: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold uppercase text-black/60 dark:text-white/50">Amount (UGX)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={manualRefundData.amountUgx}
                    onChange={(e) => setManualRefundData((prev) => ({ ...prev, amountUgx: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                  />
                </div>
                <div>
                  <label className="font-semibold uppercase text-black/60 dark:text-white/50">Refund Method</label>
                  <select
                    value={manualRefundData.refundMethod}
                    onChange={(e) => setManualRefundData((prev) => ({ ...prev, refundMethod: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                  >
                    <option value="WALLET">Safaris Wallet (Immediate)</option>
                    <option value="ORIGINAL_PAYMENT">Original Payment Method</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold uppercase text-black/60 dark:text-white/50">Refund Reason</label>
                <select
                  value={manualRefundData.reason}
                  onChange={(e) => setManualRefundData((prev) => ({ ...prev, reason: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                >
                  <option value="NO_SHOW_DRIVER">Driver No-Show Exceeded Waiting Period</option>
                  <option value="CUSTOMER_CANCELLED">Customer Cancelled Within Policy</option>
                  <option value="DUPLICATE_PAYMENT">Duplicate Payment Received</option>
                  <option value="SERVICE_DISRUPTION">Service Disruption or Vehicle Breakdown</option>
                  <option value="ADMIN_OVERRIDE">Administrative Discretionary Refund</option>
                </select>
              </div>

              <div>
                <label className="font-semibold uppercase text-black/60 dark:text-white/50">Notes / Evidence</label>
                <textarea
                  rows={2}
                  placeholder="Optional internal notes..."
                  value={manualRefundData.notes}
                  onChange={(e) => setManualRefundData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-white border border-black/15 rounded-lg text-black dark:bg-black/40 dark:border-white/15 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="px-4 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-black border border-black/15 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white dark:border-white/15 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/90 font-bold transition-colors"
                >
                  Confirm & Process Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: PRODUCTION CHECKLIST */}
      {/* ========================================================================= */}
      {showChecklistModal && configStatus && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121212] border border-black/20 dark:border-white/20 rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-5 text-black dark:text-white">
            <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
              <h3 className="text-base font-bold text-black dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-black dark:text-white" />
                <span>Production Live Payment Checklist</span>
              </h3>
              <button onClick={() => setShowChecklistModal(false)} className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {Object.entries(configStatus.live_checklist).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between p-2.5 rounded bg-black/[0.03] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
                  <span className="capitalize text-black dark:text-white">{key.replace(/_/g, ' ')}</span>
                  {val ? (
                    <span className="text-black dark:text-white font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                    </span>
                  ) : (
                    <span className="text-black/60 dark:text-white/60 font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Pending DPO Production
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-black/5 border border-black/15 text-xs text-black/80 dark:bg-white/5 dark:border-white/15 dark:text-white/80">
              Live payments will remain safely disabled until DPO Pay supplies verified production credentials.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

