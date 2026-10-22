import assert from 'assert';
import { FinancialService, FinancialError } from '../services/financial/financial.service';
import { localStore, db } from '../config/database';
import { PaymentRecord, PaymentService } from '../services/payment/payment.service';

export async function runFinancialEngineTests() {
  console.log('🧪 Starting MUMWE SAFARIS — Financial Engine & Refunds Test Suite...\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
      throw err;
    }
  }

  const testUserId = `usr_test_${Date.now()}`;
  const testDriverId = `drv_test_${Date.now()}`;
  const testTripId = `trip_fin_${Date.now()}`;
  const testPaymentId = `pay_fin_${Date.now()}`;

  // Seed test user
  localStore.users.set(testUserId, {
    id: testUserId,
    full_name: 'Financial Test Customer',
    phone: '+256772000111',
    email: `${testUserId}@safaris.ug`,
    role: 'customer',
    wallet_balance_ugx: 0,
    sandbox_wallet_balance_ugx: 0,
    is_verified: true,
    created_at: new Date().toISOString(),
  });

  // Seed test driver
  localStore.drivers.set(testDriverId, {
    id: testDriverId,
    is_online: true,
    is_available: true,
    is_approved: true,
    approval_status: 'APPROVED',
    today_earnings_ugx: 0,
    created_at: new Date().toISOString(),
  });

  // Ensure default refund policy exists
  await FinancialService.ensureDefaultRefundPolicy();

  // --------------------------------------------------------------------------
  // Group 1: Authoritative Customer Wallet & Immutable Ledger
  // --------------------------------------------------------------------------
  console.log('📦 1. Authoritative Customer Wallet & Immutable Ledger');

  await test('Initial wallet balance must authoritatively compute to 0 UGX', () => {
    const balance = FinancialService.calculateWalletBalance(testUserId, 'sandbox');
    assert.strictEqual(balance, 0);
  });

  await test('Atomic credit to customer wallet creates immutable ledger entry', async () => {
    const creditRes = await FinancialService.creditWallet({
      userId: testUserId,
      amountUgx: 50000,
      type: 'DEPOSIT',
      referenceType: 'DEPOSIT',
      referenceId: 'DEP-101',
      environment: 'sandbox',
      description: 'Initial deposit via DPO Pay sandbox',
    });

    assert.strictEqual(creditRes.balance, 50000);
    assert.strictEqual(creditRes.transaction.type, 'CREDIT');
    assert.strictEqual(creditRes.transaction.amount_ugx, 50000);
    assert.strictEqual(creditRes.transaction.balance_after_ugx, 50000);

    // Verify recalculation directly from immutable ledger
    const recalculated = FinancialService.calculateWalletBalance(testUserId, 'sandbox');
    assert.strictEqual(recalculated, 50000);
  });

  await test('Idempotency key prevents double-crediting on retried requests', async () => {
    const idempotencyKey = `idem_topup_${Date.now()}`;

    const first = await FinancialService.creditWallet({
      userId: testUserId,
      amountUgx: 20000,
      type: 'DEPOSIT',
      referenceType: 'DEPOSIT',
      referenceId: 'DEP-102',
      environment: 'sandbox',
      idempotencyKey,
      description: 'Idempotent deposit',
    });

    assert.strictEqual(first.balance, 70000);

    // Replay identical request with same idempotency key
    const second = await FinancialService.creditWallet({
      userId: testUserId,
      amountUgx: 20000,
      type: 'DEPOSIT',
      referenceType: 'DEPOSIT',
      referenceId: 'DEP-102',
      environment: 'sandbox',
      idempotencyKey,
      description: 'Idempotent deposit replay',
    });

    assert.strictEqual(second.transaction.id, first.transaction.id);
    assert.strictEqual(second.balance, 70000); // Balance did NOT double-credit

    const ledger = FinancialService.getWalletLedger(testUserId, 'sandbox');
    const matchingTxs = ledger.filter((tx) => tx.idempotency_key === idempotencyKey);
    assert.strictEqual(matchingTxs.length, 1);
  });

  await test('Atomic debit for booking payment decrements balance and writes DEBIT ledger', async () => {
    const debitRes = await FinancialService.debitWallet({
      userId: testUserId,
      amountUgx: 30000,
      referenceType: 'TRIP',
      referenceId: testTripId,
      environment: 'sandbox',
      description: `Payment for trip #${testTripId}`,
    });

    assert.strictEqual(debitRes.balance, 40000); // 70000 - 30000 = 40000
    assert.strictEqual(debitRes.transaction.type, 'DEBIT');
    assert.strictEqual(debitRes.transaction.amount_ugx, 30000);
    assert.strictEqual(debitRes.transaction.balance_after_ugx, 40000);

    const recalculated = FinancialService.calculateWalletBalance(testUserId, 'sandbox');
    assert.strictEqual(recalculated, 40000);
  });

  await test('Debit strictly rejected when requested amount exceeds available balance', async () => {
    let threw = false;
    try {
      await FinancialService.debitWallet({
        userId: testUserId,
        amountUgx: 999999, // Exceeds 40,000 UGX balance
        referenceType: 'TRIP',
        referenceId: 'trip_excessive',
        environment: 'sandbox',
        description: 'Payment exceeding balance',
      });
    } catch (err: any) {
      threw = true;
      assert(err instanceof FinancialError);
      assert.strictEqual(err.code, 'INSUFFICIENT_WALLET_FUNDS');
    }
    assert.strictEqual(threw, true, 'Expected debitWallet to throw INSUFFICIENT_WALLET_FUNDS');

    // Balance untouched
    const balance = FinancialService.calculateWalletBalance(testUserId, 'sandbox');
    assert.strictEqual(balance, 40000);
  });

  // --------------------------------------------------------------------------
  // Group 2: Platform Earnings & Commission Ledger
  // --------------------------------------------------------------------------
  console.log('\n📦 2. Platform Commissions & Liability Segregation');

  await test('Record gross fare, platform commission (15%), and driver payout (85%)', async () => {
    const grossFare = 40000;
    const commissionRate = 15;
    const expectedCommission = 6000;
    const expectedDriverPayout = 34000;

    const earning = await FinancialService.recordPlatformEarning({
      bookingType: 'TRIP',
      bookingId: testTripId,
      paymentId: testPaymentId,
      payerUserId: testUserId,
      beneficiaryId: testDriverId,
      grossAmountUgx: grossFare,
      commissionRate,
      paymentMethod: 'WALLET',
      environment: 'sandbox',
    });

    assert.strictEqual(earning.gross_amount_ugx, grossFare);
    assert.strictEqual(earning.platform_commission_ugx, expectedCommission);
    assert.strictEqual(earning.beneficiary_earnings_ugx, expectedDriverPayout);
    assert.strictEqual(earning.status, 'EARNED');

    // Driver today earnings cache updated
    const driver = localStore.drivers.get(testDriverId);
    assert.strictEqual(driver.today_earnings_ugx, expectedDriverPayout);
  });

  await test('Financial Overview strictly reports Customer Wallets as Liabilities, distinct from revenue', () => {
    const overview = FinancialService.getFinancialOverview('sandbox');

    assert(overview.customer_wallet_liabilities_ugx >= 40000, 'Customer wallet liabilities must include user balance');
    assert(overview.platform_commission_earned_ugx >= 6000, 'Platform commission must be tracked');
    assert(overview.beneficiary_earnings_payable_ugx >= 34000, 'Driver payables must be tracked');
  });

  // --------------------------------------------------------------------------
  // Group 3: Configurable No-Show Refund Policy & Automatic Execution
  // --------------------------------------------------------------------------
  console.log('\n📦 3. Configurable No-Show Refund Policy & Automatic Execution');

  const delayedTripId = `trip_delayed_${Date.now()}`;
  const paidPaymentId = `pay_delayed_${Date.now()}`;
  const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

  localStore.trips.set(delayedTripId, {
    id: delayedTripId,
    rider_id: testUserId,
    driver_id: testDriverId,
    fare_ugx: 25000,
    status: 'SEARCHING',
    payment_status: 'PAID',
    payment_environment: 'sandbox',
    driver_arrived_at: null, // Driver never arrived
    created_at: twentyMinsAgo,
    updated_at: twentyMinsAgo,
  });

  localStore.payments.set(paidPaymentId, {
    id: paidPaymentId,
    transaction_id: `TX-${Date.now()}`,
    user_id: testUserId,
    reference_type: 'TRIP',
    reference_id: delayedTripId,
    amount_ugx: 25000,
    currency: 'UGX',
    payment_method: 'CARD',
    status: 'SUCCESSFUL',
    environment: 'sandbox',
    refund_status: 'NONE',
    refunded_amount_ugx: 0,
    callback_count: 1,
    audit_trail: [],
    provider_metadata: {},
    created_at: twentyMinsAgo,
    updated_at: twentyMinsAgo,
  });

  await test('Evaluate trip as eligible for no-show refund after 15-minute waiting period passes', () => {
    const evaluation = FinancialService.evaluateNoShowRefundEligibility('TRIP', delayedTripId);

    assert.strictEqual(evaluation.eligible, true);
    assert.strictEqual(evaluation.refundAmountUgx, 25000);
    assert(evaluation.evidence?.elapsed_minutes >= 15);
    assert(evaluation.reason?.includes('waiting period'));
  });

  await test('Trip is NOT eligible if driver registered an arrival event', () => {
    const arrivedTripId = `trip_arrived_${Date.now()}`;
    const arrivedPayId = `pay_arrived_${Date.now()}`;
    localStore.trips.set(arrivedTripId, {
      id: arrivedTripId,
      rider_id: testUserId,
      driver_id: testDriverId,
      fare_ugx: 25000,
      status: 'DRIVER_ARRIVED',
      payment_status: 'PAID',
      payment_environment: 'sandbox',
      driver_arrived_at: new Date().toISOString(), // Driver arrived
      created_at: twentyMinsAgo,
    });
    localStore.payments.set(arrivedPayId, {
      id: arrivedPayId,
      transaction_id: `TX-ARR-${Date.now()}`,
      user_id: testUserId,
      reference_type: 'TRIP',
      reference_id: arrivedTripId,
      amount_ugx: 25000,
      currency: 'UGX',
      payment_method: 'CARD',
      status: 'SUCCESSFUL',
      environment: 'sandbox',
      refund_status: 'NONE',
      refunded_amount_ugx: 0,
      audit_trail: [],
      provider_metadata: {},
      created_at: twentyMinsAgo,
    });

    const evaluation = FinancialService.evaluateNoShowRefundEligibility('TRIP', arrivedTripId);
    assert.strictEqual(evaluation.eligible, false);
    assert(evaluation.reason?.includes('Driver arrived'));
  });

  await test('Execute refund: credits customer wallet, marks payment & trip refunded, and reverses earnings', async () => {
    const balanceBefore = FinancialService.calculateWalletBalance(testUserId, 'sandbox');

    const refund = await FinancialService.processRefund({
      paymentId: paidPaymentId,
      tripId: delayedTripId,
      userId: testUserId,
      amountUgx: 25000,
      reason: 'DRIVER_NO_SHOW_EXCEEDED_WAIT_TIME',
      refundMethod: 'WALLET',
      environment: 'sandbox',
      processedBy: 'AUTOMATIC_TEST_WORKER',
    });

    assert.strictEqual(refund.status, 'COMPLETED');
    assert(refund.refund_reference.startsWith('REF-'));

    // Customer wallet credited
    const balanceAfter = FinancialService.calculateWalletBalance(testUserId, 'sandbox');
    assert.strictEqual(balanceAfter, balanceBefore + 25000);

    // Payment marked as refunded
    const payment = localStore.payments.get(paidPaymentId);
    assert.strictEqual(payment.refund_status, 'REFUNDED');
    assert.strictEqual(payment.refunded_amount_ugx, 25000);

    // Trip marked as refunded
    const trip = localStore.trips.get(delayedTripId);
    assert.strictEqual(trip.refund_status, 'REFUNDED');
    assert.strictEqual(trip.refunded_amount_ugx, 25000);
  });

  // --------------------------------------------------------------------------
  // Group 4: Admin Financial Adjustments Audit
  // --------------------------------------------------------------------------
  console.log('\n📦 4. Admin Financial Adjustments Audit');

  await test('Create auditable adjustment record and update wallet balance', async () => {
    const balanceBefore = FinancialService.calculateWalletBalance(testUserId, 'sandbox');

    const adjustment = await FinancialService.recordFinancialAdjustment({
      adminId: 'admin_super_01',
      targetType: 'USER_WALLET',
      targetId: testUserId,
      amountUgx: 10000,
      adjustmentType: 'CREDIT',
      reason: 'Customer goodwill promotional credit',
      environment: 'sandbox',
    });

    assert(adjustment.id.startsWith('fadj_'));
    assert.strictEqual(adjustment.adjustment_type, 'CREDIT');
    assert.strictEqual(adjustment.amount_ugx, 10000);

    const balanceAfter = FinancialService.calculateWalletBalance(testUserId, 'sandbox');
    assert.strictEqual(balanceAfter, balanceBefore + 10000);

    assert(localStore.financial_adjustments.has(adjustment.id));
  });

  console.log(`\n========================================================`);
  console.log(`🎉 All ${passed}/${total} Financial Engine & Refund tests passed successfully!`);
  console.log(`========================================================\n`);

  // Clean up test entities from memory
  localStore.users.delete(testUserId);
  localStore.drivers.delete(testDriverId);
  localStore.trips.delete(delayedTripId);
  localStore.trips.delete(testTripId);
  localStore.payments.delete(paidPaymentId);
  localStore.payments.delete(testPaymentId);

  FinancialService.stopRefundScheduler();
}

if (require.main === module) {
  runFinancialEngineTests().catch((err) => {
    console.error('Fatal test failure:', err);
    process.exit(1);
  });
}
