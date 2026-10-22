import assert from 'assert';
import { ENV } from '../config/env';
import { localStore } from '../config/database';
import { DpoPayGateway, escapeXml, normalizeMsisdnForDpo } from '../services/payment/dpo_gateway';
import { PaymentService, PaymentError } from '../services/payment/payment.service';
import { AdminService } from '../services/admin/admin.service';

async function runDpoPaymentTests() {
  console.log('🧪 Starting MUMWE SAFARIS — DPO Pay Integration Test Suite...\n');

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

  // --------------------------------------------------------------------------
  // Group 1: Configuration & Environment Fail-Closed Security
  // --------------------------------------------------------------------------
  console.log('📦 1. Configuration & Fail-Closed Environment Security');

  await test('Default environment must be sandbox with ticket #2777504', () => {
    assert.strictEqual(ENV.DPO_ENVIRONMENT, 'sandbox');
    assert.strictEqual(ENV.DPO_SUPPORT_TICKET_REF, '2777504');
    assert.strictEqual(ENV.DPO_SANDBOX_SERVICE_TYPE_ID, '54841');
  });

  await test('Sandbox configuration validates cleanly when token and service ID are set', () => {
    const configCheck = ENV.validateDpoConfig();
    assert.strictEqual(configCheck.isValid, true, `Expected valid sandbox config, got: ${configCheck.message}`);
    assert.strictEqual(configCheck.environment, 'sandbox');
  });

  await test('Live mode strictly fails-closed when credentials or activation authorization are missing', () => {
    const originalEnv = process.env.DPO_ENVIRONMENT;
    try {
      process.env.DPO_ENVIRONMENT = 'production';
      const liveCheck = ENV.validateDpoConfig();
      assert.strictEqual(liveCheck.isValid, false);
      assert(
        liveCheck.errors.some((e: string) =>
          e.includes('Live payments disabled') ||
          e.includes('DPO_LIVE_COMPANY_TOKEN') ||
          e.includes('DPO_LIVE_ACTIVATION_CONFIRMED')
        ),
        `Unexpected errors: ${liveCheck.errors.join(', ')}`
      );
    } finally {
      process.env.DPO_ENVIRONMENT = originalEnv;
    }
  });

  await test('Rejects live mode if live service type ID assumes sandbox ID 54841 without confirmation', () => {
    const originalEnv = process.env.DPO_ENVIRONMENT;
    const originalToken = process.env.DPO_LIVE_COMPANY_TOKEN;
    const originalService = process.env.DPO_LIVE_SERVICE_TYPE_ID;
    const originalAuth = process.env.DPO_LIVE_ACTIVATION_CONFIRMED;

    try {
      process.env.DPO_ENVIRONMENT = 'production';
      process.env.DPO_LIVE_COMPANY_TOKEN = '11111111-2222-3333-4444-555555555555';
      process.env.DPO_LIVE_SERVICE_TYPE_ID = '54841'; // Same as sandbox!
      process.env.DPO_LIVE_ACTIVATION_CONFIRMED = 'true';

      const check = ENV.validateDpoConfig();
      assert.strictEqual(check.isValid, false);
      assert(check.errors.some((e: string) => e.includes('sandbox ID 54841 without explicit DPO confirmation')));
    } finally {
      process.env.DPO_ENVIRONMENT = originalEnv;
      if (originalToken) process.env.DPO_LIVE_COMPANY_TOKEN = originalToken; else delete process.env.DPO_LIVE_COMPANY_TOKEN;
      if (originalService) process.env.DPO_LIVE_SERVICE_TYPE_ID = originalService; else delete process.env.DPO_LIVE_SERVICE_TYPE_ID;
      if (originalAuth) process.env.DPO_LIVE_ACTIVATION_CONFIRMED = originalAuth; else delete process.env.DPO_LIVE_ACTIVATION_CONFIRMED;
    }
  });

  // --------------------------------------------------------------------------
  // Group 2: DPO API v6 Gateway Request Construction & XML Escaping
  // --------------------------------------------------------------------------
  console.log('\n📦 2. DPO API v6 XML Construction & Formatting');

  await test('escapeXml properly escapes XML special characters', () => {
    const escaped = escapeXml('Test & Co <hello> "world" \'quote\'');
    assert.strictEqual(escaped, 'Test &amp; Co &lt;hello&gt; &quot;world&quot; &apos;quote&apos;');
  });

  await test('normalizeMsisdnForDpo normalizes Uganda local numbers to international MSISDN', () => {
    const res1 = normalizeMsisdnForDpo('0704127185');
    assert.strictEqual(res1.valid, true);
    assert.strictEqual(res1.msisdn, '256704127185');

    const res2 = normalizeMsisdnForDpo('+256 772 123 456');
    assert.strictEqual(res2.valid, true);
    assert.strictEqual(res2.msisdn, '256772123456');

    const res3 = normalizeMsisdnForDpo('invalid_phone');
    assert.strictEqual(res3.valid, false);
  });

  // --------------------------------------------------------------------------
  // Group 3: Server-Side Authoritative Pricing & Double-Payment Protection
  // --------------------------------------------------------------------------
  console.log('\n📦 3. Authoritative Pricing & Concurrency Protection');

  // Setup mock user & trip
  const testUserId = 'usr_dpo_test_01';
  localStore.users.set(testUserId, {
    id: testUserId,
    full_name: 'Test Customer',
    email: 'dpo.test@safaris.ug',
    phone: '+256704127185',
    password_hash: 'hash',
    role: 'customer',
    avatar_url: '',
    rating: 5.0,
    total_trips: 0,
    wallet_balance_ugx: 0,
    sandbox_wallet_balance_ugx: 0,
    is_verified: true,
    approval_status: 'APPROVED',
    created_at: new Date().toISOString(),
  });

  const testTripId = 'trip_dpo_test_01';
  localStore.trips.set(testTripId, {
    id: testTripId,
    customer_id: testUserId,
    pickup_address: 'Kampala',
    dest_address: 'Entebbe',
    pickup_lat: 0.3,
    pickup_lng: 32.5,
    dest_lat: 0.04,
    dest_lng: 32.4,
    vehicle_tier: 'comfort',
    distance_km: 40,
    fare_ugx: 85000, // Authoritative price in DB
    payment_method: 'DPO_PAY',
    payment_status: 'UNPAID',
    status: 'SEARCHING',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Mock gateway createToken and chargeTokenMobile to succeed offline during unit tests
  const origCreateToken = DpoPayGateway.createToken;
  const origChargeMobile = DpoPayGateway.chargeTokenMobile;

  (DpoPayGateway as any).createToken = async (params: any) => ({
    success: true,
    transToken: `MOCK-TRANS-${Date.now()}`,
    transRef: params.referenceId,
    paymentUrl: `https://secure.3gdirectpay.com/payv3.php?ID=MOCK-TRANS-${Date.now()}`,
    resultCode: '000',
    resultExplanation: 'Token created successfully',
    serviceTypeId: '54841',
    supportTicketRef: '2777504',
    environment: 'sandbox' as const,
  });

  (DpoPayGateway as any).chargeTokenMobile = async () => ({
    success: true,
    statusCode: '130',
    resultExplanation: 'A prompt has been sent to your phone. Enter your PIN to confirm payment.',
    instructions: 'A prompt has been sent to your phone. Enter your PIN to confirm payment.',
    redirectOption: false,
    mnoUsed: 'MTNmobileMoney',
    mnoCountryUsed: 'uganda',
    hostedFallbackAvailable: false,
    environment: 'sandbox' as const,
  });

  try {
    await test('Rejects payment if customer tries to supply a tampered, lower amount', async () => {
      // PaymentService computes amount strictly from DB trip record (85000)
      const payment = await PaymentService.processPayment({
        userId: testUserId,
        referenceType: 'TRIP',
        referenceId: testTripId,
        amountUgx: 1000, // Client attempts to tamper with amount!
        paymentMethod: 'CARD',
      });

      assert.strictEqual(payment.amount_ugx, 85000, 'System must use authoritative backend price of 85,000, not 1,000');
      assert.strictEqual(payment.environment, 'sandbox');
    });

    await test('Rejects payment initiation for trips that are already marked PAID', async () => {
      const paidTripId = 'trip_dpo_test_paid';
      localStore.trips.set(paidTripId, {
        id: paidTripId,
        customer_id: testUserId,
        pickup_address: 'Kololo',
        dest_address: 'Bugolobi',
        pickup_lat: 0.32,
        pickup_lng: 32.59,
        dest_lat: 0.31,
        dest_lng: 32.61,
        vehicle_tier: 'boda',
        distance_km: 5,
        fare_ugx: 10000,
        payment_method: 'CARD',
        payment_status: 'PAID', // Already marked PAID!
        payment_environment: 'sandbox',
        status: 'COMPLETED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await assert.rejects(
        async () => {
          await PaymentService.processPayment({
            userId: testUserId,
            referenceType: 'TRIP',
            referenceId: paidTripId,
            paymentMethod: 'CARD',
          });
        },
        (err: any) => {
          assert(err instanceof PaymentError);
          assert.strictEqual(err.code, 'ALREADY_PAID');
          return true;
        }
      );
    });

    // --------------------------------------------------------------------------
    // Group 4: Server-Side Authoritative Verification & Status Reconciliation
    // --------------------------------------------------------------------------
    console.log('\n📦 4. Authoritative Verification & Status Reconciliation');

    await test('Authoritative verification updates payment and booking status upon valid DPO 000 approval', async () => {
      const tripToPayId = 'trip_to_pay_101';
      localStore.trips.set(tripToPayId, {
        id: tripToPayId,
        customer_id: testUserId,
        pickup_address: 'Acacia',
        dest_address: 'Lugogo',
        pickup_lat: 0.33,
        pickup_lng: 32.59,
        dest_lat: 0.32,
        dest_lng: 32.6,
        vehicle_tier: 'comfort',
        distance_km: 8,
        fare_ugx: 20000,
        payment_method: 'DPO_PAY',
        payment_status: 'UNPAID',
        status: 'SEARCHING',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const initPayment = await PaymentService.processPayment({
        userId: testUserId,
        referenceType: 'TRIP',
        referenceId: tripToPayId,
        paymentMethod: 'CARD',
      });

      // Mock an authoritative verify response matching the payment
      const origVerify = DpoPayGateway.verifyToken;
      (DpoPayGateway as any).verifyToken = async () => ({
        success: true,
        resultCode: '000',
        resultExplanation: 'Transaction Approved',
        lifecycleStatus: 'SUCCESSFUL' as const,
        transactionApproval: 'APPR-UGX-99881',
        transAmount: 20000,
        transCurrency: 'UGX',
        customerName: 'Test Customer',
        transactionApproved: true,
        environment: 'sandbox' as const,
      });

      try {
        const verified = await PaymentService.verifyPayment(initPayment.id);
        assert.strictEqual(verified.status, 'SUCCESSFUL');
        assert.strictEqual(verified.dpo_approval_code, 'APPR-UGX-99881');
        assert.strictEqual(verified.dpo_result_code, '000');

        // Check that the trip was authoritatively marked PAID
        const updatedTrip = localStore.trips.get(tripToPayId);
        assert.strictEqual(updatedTrip?.payment_status, 'PAID');
      } finally {
        (DpoPayGateway as any).verifyToken = origVerify;
      }
    });

    await test('Verification flags suspicious fraud code 002 without marking booking as paid', async () => {
      const fraudTripId = 'trip_fraud_test_01';
      localStore.trips.set(fraudTripId, {
        id: fraudTripId,
        customer_id: testUserId,
        pickup_address: 'Kampala',
        dest_address: 'Jinja',
        pickup_lat: 0.3,
        pickup_lng: 32.5,
        dest_lat: 0.44,
        dest_lng: 33.2,
        vehicle_tier: 'comfort',
        distance_km: 80,
        fare_ugx: 180000,
        payment_method: 'CARD',
        payment_status: 'UNPAID',
        status: 'SEARCHING',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const initPayment = await PaymentService.processPayment({
        userId: testUserId,
        referenceType: 'TRIP',
        referenceId: fraudTripId,
        paymentMethod: 'CARD',
      });

      // Mock an authoritative verify response with DPO fraud warning 002
      const origVerify = DpoPayGateway.verifyToken;
      (DpoPayGateway as any).verifyToken = async () => ({
        success: false,
        resultCode: '002',
        resultExplanation: 'Suspected Fraudulent Transaction',
        lifecycleStatus: 'FAILED' as const,
        transactionApproval: undefined,
        transAmount: 180000,
        transCurrency: 'UGX',
        transactionApproved: false,
        fraudAlert: 'POSSIBLE_FRAUD',
        environment: 'sandbox' as const,
      });

      try {
        const verified = await PaymentService.verifyPayment(initPayment.id);
        assert.strictEqual(verified.status, 'FAILED');
        assert.strictEqual(verified.dpo_result_code, '002');

        // Trip must REMAIN UNPAID
        const updatedTrip = localStore.trips.get(fraudTripId);
        assert.strictEqual(updatedTrip?.payment_status, 'UNPAID');
      } finally {
        (DpoPayGateway as any).verifyToken = origVerify;
      }
    });

    // --------------------------------------------------------------------------
    // Group 5: Revenue & Ledger Sandbox Isolation
    // --------------------------------------------------------------------------
    console.log('\n📦 5. Revenue & Ledger Sandbox Isolation');

    await test('Sandbox wallet top-up credits sandbox_wallet_balance_ugx and leaves real wallet at zero', async () => {
      const topUpAmount = 50000;
      const topUpPayment = await PaymentService.processPayment({
        userId: testUserId,
        referenceType: 'WALLET',
        referenceId: testUserId,
        amountUgx: topUpAmount,
        paymentMethod: 'MTN_MOMO',
        phone: '0772123456',
      });

      assert.strictEqual(topUpPayment.environment, 'sandbox');

      // Simulate successful verification
      const origVerify = DpoPayGateway.verifyToken;
      (DpoPayGateway as any).verifyToken = async () => ({
        success: true,
        resultCode: '000',
        resultExplanation: 'Transaction Approved',
        lifecycleStatus: 'SUCCESSFUL' as const,
        transactionApproval: 'APP-WAL-001',
        transAmount: topUpAmount,
        transCurrency: 'UGX',
        transactionApproved: true,
        environment: 'sandbox' as const,
      });

      try {
        await PaymentService.verifyPayment(topUpPayment.id);

        const userAfter = localStore.users.get(testUserId);
        assert.strictEqual(userAfter?.wallet_balance_ugx, 0, 'Real wallet balance must stay 0');
        assert.strictEqual(userAfter?.sandbox_wallet_balance_ugx, topUpAmount, 'Sandbox wallet balance must be 50,000');
      } finally {
        (DpoPayGateway as any).verifyToken = origVerify;
      }
    });

    await test('Admin dashboard strictly isolates live collected revenue from sandbox test volume', async () => {
      const stats: any = await AdminService.getDashboardStats();
      assert('kpis' in stats);
      assert('totalRevenueUgx' in stats.kpis);
      assert('liveRevenueUgx' in stats.kpis);
      assert('system' in stats);
      assert('dpo' in stats.system);

      assert.strictEqual(stats.system.dpo.environment, 'sandbox');
      assert(typeof stats.kpis.liveRevenueUgx === 'number');
      assert(typeof stats.kpis.sandboxRevenueUgx === 'number');
    });
  } finally {
    (DpoPayGateway as any).createToken = origCreateToken;
    (DpoPayGateway as any).chargeTokenMobile = origChargeMobile;
  }

  console.log(`\n========================================`);
  console.log(`🎉 All ${passed}/${total} DPO Payment integration tests passed successfully!`);
  console.log(`========================================\n`);
}

runDpoPaymentTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
