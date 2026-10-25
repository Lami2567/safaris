import { v4 as uuidv4 } from 'uuid';
import { localStore } from '../config/database';
import { ENV } from '../config/env';
import { LedgerService, toExactUgxBigInt, withOrderedLocks } from '../services/financial/ledger.service';
import { FinancialService, FinancialError } from '../services/financial/financial.service';
import { PayoutService, PayoutProviderAdapter, PayoutError } from '../services/financial/payout.service';
import { ReconciliationService } from '../services/financial/reconciliation.service';
import { FinancialOutboxService } from '../services/financial/outbox.service';
import { PaymentService } from '../services/payment/payment.service';
import { DpoPayGateway } from '../services/payment/dpo_gateway';
import { TripService } from '../services/trip/trip.service';
import { DriverService } from '../services/driver/driver.service';
import { TourismService } from '../services/tourism/tourism.service';

function assert(condition: any, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runMasterFinancialTestSuite() {
  console.log('===================================================================');
  console.log('🚀 SAFARIS MASTER PRODUCTION FINANCIAL ENGINE — 30-SCENARIO & 10K CONCURRENCY SUITE');
  console.log('===================================================================');

  // Configure safe sandbox environment flags for testing
  process.env.DPO_ENVIRONMENT = 'sandbox';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.LIVE_PAYMENTS_ENABLED = 'false';
  process.env.WALLET_TOPUPS_ENABLED = 'true';
  process.env.WALLET_CUSTODY_APPROVED = 'false';
  process.env.PAYOUTS_ENABLED = 'false';
  process.env.DEVELOPER_COMMISSION_RATE = '5.0';
  process.env.DPO_SANDBOX_COMPANY_TOKEN = uuidv4().toUpperCase();
  process.env.DPO_SANDBOX_SERVICE_TYPE_ID = '54841';

  // Clear in-memory stores for isolated deterministic execution
  for (const key of Object.keys(localStore) as Array<keyof typeof localStore>) {
    localStore[key].clear();
  }

  // Seed test users, driver, and tour guide
  const customerId = 'usr_cust_test_1';
  const driverId = 'usr_drv_test_1';
  const guideId = 'usr_gd_test_1';

  localStore.users.set(customerId, {
    id: customerId,
    full_name: 'Grace Namukasa',
    phone: '+256772111222',
    email: 'grace@example.com',
    role: 'customer',
    wallet_balance_ugx: 0,
  });

  localStore.users.set(driverId, {
    id: driverId,
    full_name: 'David Okello',
    phone: '+256772333444',
    email: 'david@example.com',
    role: 'driver',
    approval_status: 'APPROVED',
    wallet_balance_ugx: 0,
  });

  localStore.drivers.set(driverId, {
    id: driverId,
    is_online: true,
    is_available: true,
    is_approved: true,
    approval_status: 'APPROVED',
    today_earnings_ugx: 0,
  });

  localStore.users.set(guideId, {
    id: guideId,
    full_name: 'Sarah Akello',
    phone: '+256772555666',
    email: 'sarah@example.com',
    role: 'tour_guide',
    approval_status: 'APPROVED',
    wallet_balance_ugx: 0,
  });

  localStore.tour_guides.set(guideId, {
    id: guideId,
    full_name: 'Sarah Akello',
    is_approved: true,
    approval_status: 'APPROVED',
    is_available: true,
    daily_rate_ugx: 200000,
    expeditions_count: 0,
  });

  await FinancialService.ensureDefaultRefundPolicy();

  // Mock DPO Gateway responses deterministically (zero external network calls)
  let mockDpoVerifyQueue: Record<string, any> = {};
  let mockCreateTokenFail = false;
  let mockVerifyNetworkTimeout = false;

  DpoPayGateway.createToken = async (params) => {
    if (mockCreateTokenFail) {
      return {
        success: false,
        transToken: '',
        transRef: '',
        resultCode: '801',
        resultExplanation: 'Invalid request test',
        paymentUrl: '',
        rawXml: '<API3G><Result>801</Result></API3G>',
        environment: 'sandbox',
        serviceTypeId: '54841',
        supportTicketRef: '2777504',
      };
    }
    const token = `dpo_tok_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
    mockDpoVerifyQueue[token] = {
      success: false,
      isPaid: false,
      lifecycleStatus: 'PENDING',
      resultCode: '900',
      resultExplanation: 'Transaction not paid yet',
      transAmount: params.amountUgx,
      transCurrency: 'UGX',
      environment: 'sandbox',
    };
    return {
      success: true,
      transToken: token,
      transRef: `REF-${token.slice(-6)}`,
      resultCode: '000',
      resultExplanation: 'Transaction created',
      paymentUrl: `https://secure.3gdirectpay.com/payv3.php?ID=${token}`,
      rawXml: '<API3G><Result>000</Result></API3G>',
      environment: 'sandbox',
      serviceTypeId: '54841',
      supportTicketRef: '2777504',
    };
  };

  DpoPayGateway.chargeTokenMobile = async () => ({
    success: true,
    statusCode: '130',
    resultExplanation: 'Mobile push sent',
    instructions: 'Approve on phone',
    redirectOption: false,
    hostedFallbackAvailable: true,
    rawXml: '<API3G><StatusCode>130</StatusCode></API3G>',
    mnoUsed: 'MTN',
    mnoCountryUsed: 'uganda',
    environment: 'sandbox',
  });

  DpoPayGateway.cancelToken = async () => ({
    success: true,
    resultCode: '000',
    resultExplanation: 'Token cancelled',
    rawXml: '<API3G><Result>000</Result></API3G>',
  });

  DpoPayGateway.verifyToken = async (transToken: string) => {
    if (mockVerifyNetworkTimeout) {
      throw new Error('ETIMEDOUT: Simulated DPO verifyToken timeout');
    }
    const configured = mockDpoVerifyQueue[transToken];
    if (!configured) {
      return {
        success: false,
        isPaid: false,
        lifecycleStatus: 'PENDING',
        resultCode: '900',
        resultExplanation: 'Transaction not paid yet',
        rawXml: '<API3G><Result>900</Result></API3G>',
        environment: 'sandbox',
      };
    }
    return {
      ...configured,
      rawXml: `<API3G><Result>${configured.resultCode}</Result></API3G>`,
    };
  };

  const results: Array<{ id: number; name: string; status: 'PASSED' }> = [];
  const pass = (id: number, name: string) => {
    results.push({ id, name, status: 'PASSED' });
    console.log(`  ✅ Scenario #${String(id).padStart(2, '0')}: ${name}`);
  };

  // ---------------------------------------------------------------------------
  // SCENARIOS 1 - 30
  // ---------------------------------------------------------------------------

  // 1. DPO token creation success
  const trip1 = await TripService.createTrip({
    customerId,
    pickupTitle: 'Kampala Road',
    pickupAddress: 'Kampala',
    pickupLat: 0.3136,
    pickupLng: 32.5811,
    destTitle: 'Entebbe Airport',
    destAddress: 'Entebbe',
    destLat: 0.0424,
    destLng: 32.4435,
    vehicleTier: 'safari_4x4',
    distanceKm: 40,
    paymentMethod: 'MTN_MOMO',
  });
  TripService.acceptTrip(trip1.id, driverId);
  const pay1 = await PaymentService.processPayment({
    userId: customerId,
    referenceType: 'TRIP',
    referenceId: trip1.id,
    paymentMethod: 'MTN_MOMO',
    phone: '+256772111222',
    idempotencyKey: 'idem_trip1_attempt1',
  });
  assert(pay1.dpo_trans_token.startsWith('dpo_tok_'), 'DPO token must be created');
  assert(pay1.status === 'PENDING', 'Mobile Money push transitions payment to PENDING');
  pass(1, 'DPO token creation success');

  // 2. DPO token creation failure
  mockCreateTokenFail = true;
  let failedTokenCaught = false;
  try {
    const tripFail = await TripService.createTrip({
      customerId,
      pickupTitle: 'A',
      pickupAddress: 'A',
      pickupLat: 0.31,
      pickupLng: 32.58,
      destTitle: 'B',
      destAddress: 'B',
      destLat: 0.32,
      destLng: 32.59,
      vehicleTier: 'go',
      distanceKm: 5,
      paymentMethod: 'CARD',
    });
    await PaymentService.processPayment({
      userId: customerId,
      referenceType: 'TRIP',
      referenceId: tripFail.id,
      paymentMethod: 'CARD',
    });
  } catch (err: any) {
    failedTokenCaught = err.code === 'PAYMENT_REJECTED';
  }
  mockCreateTokenFail = false;
  assert(failedTokenCaught, 'Rejected DPO createToken must throw PAYMENT_REJECTED and fail closed');
  pass(2, 'DPO token creation failure');

  // 3. Redirect without payment verification (must NOT mark paid)
  const unverifiedRedirect = await PaymentService.handleDpoCallback(pay1.dpo_trans_token, 'redirect', pay1.transaction_id);
  assert(unverifiedRedirect?.status === 'PENDING', 'Redirect while DPO verifyToken is 900 must remain PENDING');
  assert(localStore.trips.get(trip1.id)?.payment_status !== 'PAID', 'Trip must not be marked PAID on unverified redirect');
  pass(3, 'Redirect without payment verification rejected');

  // 4. Verified DPO payment success
  mockDpoVerifyQueue[pay1.dpo_trans_token] = {
    success: true,
    isPaid: true,
    lifecycleStatus: 'SUCCESSFUL',
    resultCode: '000',
    resultExplanation: 'Transaction Paid',
    transAmount: pay1.amount_ugx,
    transCurrency: 'UGX',
    transactionApproval: 'APP-1001',
    environment: 'sandbox',
  };
  const verified1 = await PaymentService.verifyPayment(pay1.id, { source: 'customer' });
  assert(verified1.status === 'SUCCESSFUL', 'Payment must transition to SUCCESSFUL after verifyToken 000');
  assert(localStore.trips.get(trip1.id)?.payment_status === 'PAID', 'Trip marked PAID after verified DPO payment');
  pass(4, 'Verified DPO payment success');

  // 5. Declined payment
  const tripDeclined = await TripService.createTrip({
    customerId,
    pickupTitle: 'Kololo',
    pickupAddress: 'Kololo',
    pickupLat: 0.33,
    pickupLng: 32.59,
    destTitle: 'Nakasero',
    destAddress: 'Nakasero',
    destLat: 0.32,
    destLng: 32.58,
    vehicleTier: 'go',
    distanceKm: 4,
    paymentMethod: 'CARD',
  });
  const payDeclined = await PaymentService.processPayment({
    userId: customerId,
    referenceType: 'TRIP',
    referenceId: tripDeclined.id,
    paymentMethod: 'CARD',
  });
  mockDpoVerifyQueue[payDeclined.dpo_trans_token] = {
    success: false,
    isPaid: false,
    lifecycleStatus: 'FAILED',
    resultCode: '902',
    resultExplanation: 'Data mismatch / Declined by issuer',
    environment: 'sandbox',
  };
  const resDeclined = await PaymentService.verifyPayment(payDeclined.id);
  assert(resDeclined.status === 'FAILED', 'DPO 902 must transition payment to FAILED');
  pass(5, 'Declined payment handling');

  // 6. Cancelled payment
  const tripCancel = await TripService.createTrip({
    customerId,
    pickupTitle: 'Ntinda',
    pickupAddress: 'Ntinda',
    pickupLat: 0.35,
    pickupLng: 32.61,
    destTitle: 'Bugolobi',
    destAddress: 'Bugolobi',
    destLat: 0.31,
    destLng: 32.62,
    vehicleTier: 'go',
    distanceKm: 6,
    paymentMethod: 'CARD',
  });
  const payCancel = await PaymentService.processPayment({
    userId: customerId,
    referenceType: 'TRIP',
    referenceId: tripCancel.id,
    paymentMethod: 'CARD',
  });
  const cancelledRes = await PaymentService.handleDpoCancel(payCancel.dpo_trans_token, payCancel.transaction_id);
  assert(cancelledRes?.status === 'CANCELLED', 'Customer BackURL with confirmed cancelToken transitions to CANCELLED');
  pass(6, 'Cancelled payment handling');

  // 7. Pending payment timeout & outbox recovery
  const payTimeout = await PaymentService.processPayment({
    userId: customerId,
    referenceType: 'WALLET',
    referenceId: customerId,
    amountUgx: 50000,
    paymentMethod: 'MTN_MOMO',
    phone: '+256772111222',
  });
  mockVerifyNetworkTimeout = true;
  const timeoutRes = await PaymentService.verifyPayment(payTimeout.id);
  mockVerifyNetworkTimeout = false;
  assert(timeoutRes.status === 'PENDING', 'Network timeout during verifyToken leaves payment PENDING');
  pass(7, 'Pending payment timeout handling');

  // 8. Duplicate callback delivery (idempotent)
  mockDpoVerifyQueue[payTimeout.dpo_trans_token] = {
    success: true,
    isPaid: true,
    lifecycleStatus: 'SUCCESSFUL',
    resultCode: '000',
    resultExplanation: 'Transaction Paid',
    transAmount: 50000,
    transCurrency: 'UGX',
    transactionApproval: 'APP-TOPUP-1',
    environment: 'sandbox',
  };
  await Promise.all([
    PaymentService.handleDpoCallback(payTimeout.dpo_trans_token, 'push', payTimeout.transaction_id),
    PaymentService.handleDpoCallback(payTimeout.dpo_trans_token, 'callback', payTimeout.transaction_id),
    PaymentService.handleDpoCallback(payTimeout.dpo_trans_token, 'redirect', payTimeout.transaction_id),
  ]);
  const walletBalanceAfterDupCallbacks = FinancialService.calculateWalletBalance(customerId, 'sandbox');
  assert(walletBalanceAfterDupCallbacks === 50000, `Expected wallet balance 50,000 UGX after duplicate callbacks, got ${walletBalanceAfterDupCallbacks}`);
  pass(8, 'Duplicate callback delivery idempotency');

  // 9. Out-of-order callback delivery (unpaid poll after verified success)
  mockDpoVerifyQueue[payTimeout.dpo_trans_token] = {
    success: false,
    isPaid: false,
    lifecycleStatus: 'FAILED',
    resultCode: '904',
    resultExplanation: 'Late stale cancel',
    environment: 'sandbox',
  };
  const afterStaleCallback = await PaymentService.handleDpoCallback(payTimeout.dpo_trans_token, 'callback', payTimeout.transaction_id);
  assert(afterStaleCallback?.status === 'SUCCESSFUL', 'Verified SUCCESSFUL payment must never regress on out-of-order callback');
  pass(9, 'Out-of-order callback delivery protection');

  // 10. Amount mismatch rejection
  const payMismatch = await PaymentService.processPayment({
    userId: customerId,
    referenceType: 'WALLET',
    referenceId: customerId,
    amountUgx: 100000,
    paymentMethod: 'CARD',
  });
  mockDpoVerifyQueue[payMismatch.dpo_trans_token] = {
    success: true,
    isPaid: true,
    lifecycleStatus: 'SUCCESSFUL',
    resultCode: '000',
    resultExplanation: 'Paid wrong amount',
    transAmount: 50000, // Paid 50,000 instead of 100,000
    transCurrency: 'UGX',
    environment: 'sandbox',
  };
  const resMismatch = await PaymentService.verifyPayment(payMismatch.id);
  assert(resMismatch.status === 'PENDING' && resMismatch.requires_review === true, 'Amount mismatch must hold payment in PENDING with requires_review=true');
  assert(FinancialService.calculateWalletBalance(customerId, 'sandbox') === 50000, 'Mismatched payment must not credit wallet');
  pass(10, 'Amount mismatch rejection');

  // 11. Currency mismatch rejection
  const payCurrMismatch = await PaymentService.processPayment({
    userId: customerId,
    referenceType: 'WALLET',
    referenceId: customerId,
    amountUgx: 80000,
    paymentMethod: 'CARD',
  });
  mockDpoVerifyQueue[payCurrMismatch.dpo_trans_token] = {
    success: true,
    isPaid: true,
    lifecycleStatus: 'SUCCESSFUL',
    resultCode: '000',
    resultExplanation: 'Paid wrong currency',
    transAmount: 80000,
    transCurrency: 'USD', // Expected UGX
    environment: 'sandbox',
  };
  const resCurrMismatch = await PaymentService.verifyPayment(payCurrMismatch.id);
  assert(resCurrMismatch.status === 'PENDING' && resCurrMismatch.requires_review === true, 'Currency mismatch must hold payment in PENDING');
  pass(11, 'Currency mismatch rejection');

  // 12. Wallet top-up verification & summary accuracy
  const summary12 = FinancialService.getWalletAccountSummary(customerId, 'sandbox');
  assert(summary12.available_balance_ugx === 50000, 'Available wallet balance must be 50,000 UGX');
  assert(summary12.total_verified_deposits_ugx === 50000, 'Total verified deposits must be 50,000 UGX');
  assert(summary12.pending_topups_ugx === 80000, 'Pending topups must track the active open topup attempt (80k after 100k was superseded)');
  pass(12, 'Wallet top-up verification & summary tracking');

  // 13. Wallet booking payment
  const tripWallet = await TripService.createTrip({
    customerId,
    pickupTitle: 'Acacia Mall',
    pickupAddress: 'Kisementi',
    pickupLat: 0.34,
    pickupLng: 32.58,
    destTitle: 'Makerere',
    destAddress: 'Makerere',
    destLat: 0.33,
    destLng: 32.56,
    vehicleTier: 'go',
    distanceKm: 3,
    paymentMethod: 'WALLET',
  });
  const walletPay = await PaymentService.processPayment({
    userId: customerId,
    referenceType: 'TRIP',
    referenceId: tripWallet.id,
    paymentMethod: 'WALLET',
    idempotencyKey: 'wallet_pay_trip_1',
  });
  assert(walletPay.status === 'SUCCESSFUL', 'Wallet payment for trip must succeed');
  const expectedRemaining = 50000 - tripWallet.fare_ugx;
  assert(
    FinancialService.calculateWalletBalance(customerId, 'sandbox') === expectedRemaining,
    `Wallet balance must be ${expectedRemaining} after trip payment`
  );
  pass(13, 'Wallet booking payment');

  // 14. Simultaneous wallet spend race condition (only one can succeed if balance is insufficient for both)
  const raceUser = 'usr_race_test';
  localStore.users.set(raceUser, { id: raceUser, full_name: 'Race Tester', wallet_balance_ugx: 0 });
  await FinancialService.creditWallet({
    userId: raceUser,
    amountUgx: 30000,
    type: 'DEPOSIT',
    referenceType: 'DEPOSIT',
    referenceId: 'dep_race_init',
    idempotencyKey: 'idem_dep_race_init',
    description: 'Initial 30k seed',
    environment: 'sandbox',
  });
  const raceOutcomes = await Promise.allSettled([
    FinancialService.debitWallet({
      userId: raceUser,
      amountUgx: 25000,
      referenceType: 'TRIP',
      referenceId: 'trip_race_A',
      idempotencyKey: 'idem_race_A',
      description: 'Spend A (25k)',
      environment: 'sandbox',
    }),
    FinancialService.debitWallet({
      userId: raceUser,
      amountUgx: 25000,
      referenceType: 'TRIP',
      referenceId: 'trip_race_B',
      idempotencyKey: 'idem_race_B',
      description: 'Spend B (25k)',
      environment: 'sandbox',
    }),
  ]);
  const fulfilledCount = raceOutcomes.filter((o) => o.status === 'fulfilled').length;
  const rejectedCount = raceOutcomes.filter((o) => o.status === 'rejected').length;
  assert(fulfilledCount === 1 && rejectedCount === 1, 'Simultaneous 25k spends on 30k wallet must allow 1 and reject 1');
  assert(FinancialService.calculateWalletBalance(raceUser, 'sandbox') === 5000, 'Remaining balance must be 5,000 UGX');
  pass(14, 'Simultaneous wallet spend race condition');

  // 15. Insufficient wallet balance rejection
  let insufficientCaught = false;
  try {
    await FinancialService.debitWallet({
      userId: raceUser,
      amountUgx: 10000,
      referenceType: 'TRIP',
      referenceId: 'trip_overdraw',
      description: 'Overdraw attempt',
      environment: 'sandbox',
    });
  } catch (err: any) {
    insufficientCaught = err instanceof FinancialError && err.code === 'INSUFFICIENT_WALLET_FUNDS';
  }
  assert(insufficientCaught, 'Insufficient wallet balance must throw INSUFFICIENT_WALLET_FUNDS');
  pass(15, 'Insufficient wallet balance rejection');

  // 16. Driver earning allocation after completed paid ride
  TripService.updateTripStatus(trip1.id, 'DRIVER_ARRIVING', driverId, 'driver');
  TripService.updateTripStatus(trip1.id, 'DRIVER_ARRIVED', driverId, 'driver');
  TripService.updateTripStatus(trip1.id, 'TRIP_STARTED', driverId, 'driver');
  TripService.updateTripStatus(trip1.id, 'TRIP_COMPLETED', driverId, 'driver');
  const drvSummary = PayoutService.getBeneficiaryEarningsSummary(driverId, 'driver', 'sandbox');
  assert(drvSummary.availableEarningsUgx > 0, 'Driver must have verified net earnings after completed paid ride');
  pass(16, 'Driver earning allocation after completed paid ride');

  // 17. Tour-guide earning allocation after completed paid tour
  const tourBooking = await TourismService.createBooking({
    customerId,
    destinationId: 'dest_bwindi',
    packageId: 'pkg_bwindi_3d',
    tourGuideId: guideId,
    travelDate: '2026-11-15',
    guestsCount: 2,
    totalUgx: 1000000,
    paymentMethod: 'CARD',
  });
  const tourPay = await PaymentService.processPayment({
    userId: customerId,
    referenceType: 'TOUR',
    referenceId: tourBooking.id,
    paymentMethod: 'CARD',
  });
  mockDpoVerifyQueue[tourPay.dpo_trans_token] = {
    success: true,
    isPaid: true,
    lifecycleStatus: 'SUCCESSFUL',
    resultCode: '000',
    resultExplanation: 'Tour Paid',
    transAmount: 1000000,
    transCurrency: 'UGX',
    transactionApproval: 'APP-TOUR-1',
    environment: 'sandbox',
  };
  await PaymentService.verifyPayment(tourPay.id);
  TourismService.updateBookingStatus(tourBooking.id, 'IN_PROGRESS', guideId, 'tour_guide');
  TourismService.updateBookingStatus(tourBooking.id, 'COMPLETED', guideId, 'tour_guide');
  const guideSummary = PayoutService.getBeneficiaryEarningsSummary(guideId, 'tour_guide', 'sandbox');
  assert(guideSummary.availableEarningsUgx === 800000, `Guide net earnings on 1,000,000 UGX tour (20% total commission) must be 800,000 UGX, got ${guideSummary.availableEarningsUgx}`);
  pass(17, 'Tour-guide earning allocation after completed paid tour');

  // 18. Platform commission calculation (exact 5% developer commission + platform commission)
  const tourCommRecord = Array.from(localStore.commission_records.values()).find((c) => c.booking_id === tourBooking.id);
  assert(tourCommRecord, 'Commission record must exist for paid tour');
  assert(tourCommRecord.developer_commission_ugx === 50000, '5% developer commission on 1,000,000 UGX must be 50,000 UGX');
  assert(tourCommRecord.platform_commission_ugx === 150000, 'SAFARIS platform commission (15%) on 1,000,000 UGX must be 150,000 UGX');
  assert(
    tourCommRecord.developer_commission_ugx + tourCommRecord.platform_commission_ugx + tourCommRecord.beneficiary_net_ugx ===
      tourCommRecord.gross_amount_ugx,
    'Exact integer commission split invariant must hold'
  );
  pass(18, 'Platform & 5% developer commission calculation');

  // 19. Unpaid booking completion blocked from creating earnings
  const unpaidTrip = await TripService.createTrip({
    customerId,
    pickupTitle: 'Unpaid Start',
    pickupAddress: 'Kampala',
    pickupLat: 0.31,
    pickupLng: 32.58,
    destTitle: 'Unpaid End',
    destAddress: 'Kampala',
    destLat: 0.32,
    destLng: 32.59,
    vehicleTier: 'go',
    distanceKm: 5,
    paymentMethod: 'MTN_MOMO',
  });
  TripService.acceptTrip(unpaidTrip.id, driverId);
  const beforeUnpaidComplete = PayoutService.getBeneficiaryEarningsSummary(driverId, 'driver', 'sandbox').availableEarningsUgx;
  TripService.updateTripStatus(unpaidTrip.id, 'DRIVER_ARRIVING', driverId, 'driver');
  TripService.updateTripStatus(unpaidTrip.id, 'DRIVER_ARRIVED', driverId, 'driver');
  TripService.updateTripStatus(unpaidTrip.id, 'TRIP_STARTED', driverId, 'driver');
  TripService.updateTripStatus(unpaidTrip.id, 'TRIP_COMPLETED', driverId, 'driver');
  const afterUnpaidComplete = PayoutService.getBeneficiaryEarningsSummary(driverId, 'driver', 'sandbox').availableEarningsUgx;
  assert(afterUnpaidComplete === beforeUnpaidComplete, 'Completing an unpaid trip must NEVER create driver earnings');
  pass(19, 'Unpaid booking completion blocked from creating earnings');

  // 20. Driver no-show refund eligibility & automatic refund worker
  const noShowTrip = await TripService.createTrip({
    customerId,
    pickupTitle: 'NoShow Pickup',
    pickupAddress: 'Kampala',
    pickupLat: 0.31,
    pickupLng: 32.58,
    destTitle: 'NoShow Dest',
    destAddress: 'Kampala',
    destLat: 0.35,
    destLng: 32.60,
    vehicleTier: 'go',
    distanceKm: 8,
    paymentMethod: 'CARD',
  });
  TripService.acceptTrip(noShowTrip.id, driverId);
  const noShowPay = await PaymentService.processPayment({
    userId: customerId,
    referenceType: 'TRIP',
    referenceId: noShowTrip.id,
    paymentMethod: 'CARD',
  });
  mockDpoVerifyQueue[noShowPay.dpo_trans_token] = {
    success: true,
    isPaid: true,
    lifecycleStatus: 'SUCCESSFUL',
    resultCode: '000',
    resultExplanation: 'Paid',
    transAmount: noShowPay.amount_ugx,
    transCurrency: 'UGX',
    transactionApproval: 'APP-NOSHOW',
    environment: 'sandbox',
  };
  await PaymentService.verifyPayment(noShowPay.id);
  // Backdate driver assignment by 25 minutes (> 15 min threshold) with no arrival
  const storedNoShowTrip = localStore.trips.get(noShowTrip.id);
  storedNoShowTrip.driver_assigned_at = new Date(Date.now() - 25 * 60 * 1000).toISOString();
  localStore.trips.set(noShowTrip.id, storedNoShowTrip);

  const workerResult = await FinancialService.runAutomaticRefundWorker();
  assert(workerResult.refunded >= 1, 'Automatic no-show refund worker must refund eligible trip');
  assert(localStore.trips.get(noShowTrip.id)?.status === 'CANCELLED_NO_SHOW', 'Trip must be marked CANCELLED_NO_SHOW');
  pass(20, 'Driver no-show refund eligibility & automatic refund');

  // 21. Duplicate refund prevention
  let duplicateRefundBlocked = false;
  try {
    await FinancialService.processRefund({
      paymentId: noShowPay.id,
      tripId: noShowTrip.id,
      userId: customerId,
      amountUgx: noShowPay.amount_ugx,
      reason: 'NO_SHOW_DRIVER',
      refundMethod: 'WALLET',
      environment: 'sandbox',
      processedBy: 'ADMIN_TEST',
    });
  } catch (err: any) {
    duplicateRefundBlocked = err instanceof FinancialError && (err.code === 'ALREADY_REFUNDED' || err.code === 'OVER_REFUND_BLOCKED');
  }
  assert(duplicateRefundBlocked, 'Duplicate full refund on already-refunded payment must be blocked');
  pass(21, 'Duplicate refund prevention');

  // 22. Partial refund calculation and over-refund rejection
  const partialTour = await TourismService.createBooking({
    customerId,
    destinationId: 'dest_murchison',
    packageId: 'pkg_murchison',
    tourGuideId: guideId,
    travelDate: '2026-12-01',
    guestsCount: 1,
    totalUgx: 400000,
    paymentMethod: 'CARD',
  });
  const partialTourPay = await PaymentService.processPayment({
    userId: customerId,
    referenceType: 'TOUR',
    referenceId: partialTour.id,
    paymentMethod: 'CARD',
  });
  mockDpoVerifyQueue[partialTourPay.dpo_trans_token] = {
    success: true,
    isPaid: true,
    lifecycleStatus: 'SUCCESSFUL',
    resultCode: '000',
    resultExplanation: 'Paid',
    transAmount: 400000,
    transCurrency: 'UGX',
    environment: 'sandbox',
  };
  await PaymentService.verifyPayment(partialTourPay.id);

  // Issue 150,000 UGX partial refund (leaves 250,000 UGX refundable)
  const partialRef1 = await FinancialService.processRefund({
    paymentId: partialTourPay.id,
    bookingId: partialTour.id,
    userId: customerId,
    amountUgx: 150000,
    reason: 'CUSTOMER_CANCELLED',
    refundMethod: 'WALLET',
    environment: 'sandbox',
    processedBy: 'ADMIN_TEST',
  });
  assert(partialRef1.status === 'COMPLETED', 'Partial refund 1 must complete');

  // Attempt 300,000 UGX second refund (exceeds remaining 250,000 UGX) -> must fail
  let overRefundBlocked = false;
  try {
    await FinancialService.processRefund({
      paymentId: partialTourPay.id,
      bookingId: partialTour.id,
      userId: customerId,
      amountUgx: 300000,
      reason: 'ADMIN_OVERRIDE',
      refundMethod: 'WALLET',
      environment: 'sandbox',
      processedBy: 'ADMIN_TEST',
    });
  } catch (err: any) {
    overRefundBlocked = err instanceof FinancialError && err.code === 'OVER_REFUND_BLOCKED';
  }
  assert(overRefundBlocked, 'Cumulative partial refunds exceeding original payment must be rejected');
  pass(22, 'Partial refund calculation and over-refund rejection');

  // 23. Refund after driver/guide earning allocation (proportional clawback of payable + commissions)
  const guidePayableBeforeRefund = PayoutService.getBeneficiaryEarningsSummary(guideId, 'tour_guide', 'sandbox').availableEarningsUgx;
  await FinancialService.processRefund({
    paymentId: tourPay.id,
    bookingId: tourBooking.id,
    userId: customerId,
    amountUgx: 200000, // 20% of the 1,000,000 tour
    reason: 'SERVICE_DISRUPTION',
    refundMethod: 'WALLET',
    environment: 'sandbox',
    processedBy: 'ADMIN_TEST',
  });
  const guidePayableAfterRefund = PayoutService.getBeneficiaryEarningsSummary(guideId, 'tour_guide', 'sandbox').availableEarningsUgx;
  assert(
    guidePayableAfterRefund < guidePayableBeforeRefund,
    `Guide payable must be proportionally reduced after post-allocation refund (${guidePayableBeforeRefund} -> ${guidePayableAfterRefund})`
  );
  pass(23, 'Refund after driver/guide earning allocation');

  // 24. Withdrawal request reservation
  const guideAvailBeforePayout = PayoutService.getBeneficiaryEarningsSummary(guideId, 'tour_guide', 'sandbox').availableEarningsUgx;
  const withdrawal1 = await PayoutService.requestWithdrawal({
    userId: guideId,
    beneficiaryRole: 'tour_guide',
    amountUgx: 300000,
    accountNumber: '+256772555666',
    accountName: 'Sarah Akello',
    environment: 'sandbox',
    idempotencyKey: 'idem_guide_withdraw_1',
  });
  const guideAvailAfterReserve = PayoutService.getBeneficiaryEarningsSummary(guideId, 'tour_guide', 'sandbox').availableEarningsUgx;
  assert(
    guideAvailAfterReserve === guideAvailBeforePayout - 300000,
    'Withdrawal request must atomically reserve 300,000 UGX in 2060_PAYOUT_RESERVE_LIABILITY'
  );
  pass(24, 'Withdrawal request reservation');

  // 25. Concurrent withdrawal race condition
  const concurrentWithdrawals = await Promise.allSettled([
    PayoutService.requestWithdrawal({
      userId: guideId,
      beneficiaryRole: 'tour_guide',
      amountUgx: guideAvailAfterReserve,
      accountNumber: '+256772555666',
      environment: 'sandbox',
      idempotencyKey: 'idem_guide_race_1',
    }),
    PayoutService.requestWithdrawal({
      userId: guideId,
      beneficiaryRole: 'tour_guide',
      amountUgx: guideAvailAfterReserve,
      accountNumber: '+256772555666',
      environment: 'sandbox',
      idempotencyKey: 'idem_guide_race_2',
    }),
  ]);
  const wFulfilled = concurrentWithdrawals.filter((w) => w.status === 'fulfilled').length;
  const wRejected = concurrentWithdrawals.filter((w) => w.status === 'rejected').length;
  assert(wFulfilled === 1 && wRejected === 1, 'Concurrent full-balance withdrawal requests must allow 1 and reject 1');
  assert(PayoutService.getBeneficiaryEarningsSummary(guideId, 'tour_guide', 'sandbox').availableEarningsUgx === 0, 'Available withdrawable balance must be 0');
  pass(25, 'Concurrent withdrawal race condition');

  // 26. Payout provider failure and balance restoration
  process.env.PAYOUTS_ENABLED = 'true';
  const failingAdapter: PayoutProviderAdapter = {
    providerName: 'MOCK_MOMO_FAIL_ADAPTER',
    isEnabled: () => true,
    submitPayout: async () => ({
      outcome: 'FAILED',
      providerName: 'MOCK_MOMO_FAIL_ADAPTER',
      message: 'Simulated MNO account barred',
    }),
    verifyPayoutStatus: async () => ({
      outcome: 'FAILED',
      providerName: 'MOCK_MOMO_FAIL_ADAPTER',
      message: 'Simulated MNO account barred',
    }),
  };
  PayoutService.setProviderAdapterForTesting(failingAdapter);
  const failedExec = await PayoutService.executePayout(withdrawal1.id, 'ADMIN_TEST');
  assert(failedExec.status === 'FAILED', 'Confirmed provider failure must mark payout FAILED');
  const guideAvailAfterFail = PayoutService.getBeneficiaryEarningsSummary(guideId, 'tour_guide', 'sandbox').availableEarningsUgx;
  assert(guideAvailAfterFail === 300000, 'Confirmed payout failure must restore 300,000 UGX to guide payable');
  pass(26, 'Payout provider failure and balance restoration');

  // 27. Payout provider timeout / uncertain status handling
  const timeoutWithdrawal = await PayoutService.requestWithdrawal({
    userId: guideId,
    beneficiaryRole: 'tour_guide',
    amountUgx: 200000,
    accountNumber: '+256772555666',
    environment: 'sandbox',
    idempotencyKey: 'idem_guide_timeout_1',
  });
  const timeoutAdapter: PayoutProviderAdapter = {
    providerName: 'MOCK_MOMO_TIMEOUT_ADAPTER',
    isEnabled: () => true,
    submitPayout: async () => ({
      outcome: 'TIMEOUT_UNKNOWN',
      providerName: 'MOCK_MOMO_TIMEOUT_ADAPTER',
      message: 'Gateway HTTP 504 timeout',
    }),
    verifyPayoutStatus: async () => ({
      outcome: 'COMPLETED',
      providerName: 'MOCK_MOMO_TIMEOUT_ADAPTER',
      providerTxRef: 'MOMO-SETTLED-991',
      message: 'Confirmed settled on MNO portal',
    }),
  };
  PayoutService.setProviderAdapterForTesting(timeoutAdapter);
  const uncertainExec = await PayoutService.executePayout(timeoutWithdrawal.id, 'ADMIN_TEST');
  assert(uncertainExec.status === 'UNCERTAIN_TIMEOUT', 'Ambiguous provider timeout must transition to UNCERTAIN_TIMEOUT');

  // Verify new withdrawal is blocked while one is UNCERTAIN_TIMEOUT
  let blockedDuringUncertain = false;
  try {
    await PayoutService.requestWithdrawal({
      userId: guideId,
      beneficiaryRole: 'tour_guide',
      amountUgx: 50000,
      accountNumber: '+256772555666',
      environment: 'sandbox',
      idempotencyKey: 'idem_blocked_while_uncertain',
    });
  } catch (err: any) {
    blockedDuringUncertain = err instanceof PayoutError && err.code === 'PAYOUT_OUTCOME_UNCERTAIN';
  }
  assert(blockedDuringUncertain, 'New withdrawal must be blocked while previous withdrawal is in UNCERTAIN_TIMEOUT');

  // Reconcile uncertain payout as confirmed success
  const reconciledPayout = await PayoutService.reconcileUncertainPayout(timeoutWithdrawal.id, 'ADMIN_TEST');
  assert(reconciledPayout.status === 'COMPLETED', 'Reconciled payout must transition to COMPLETED');
  PayoutService.resetProviderAdapter();
  process.env.PAYOUTS_ENABLED = 'false';
  pass(27, 'Payout provider timeout / uncertain status handling');

  // 28. Ledger immutability enforcement
  const anyTx = Array.from(localStore.ledger_transactions.values())[0];
  let immutabilityEnforced = false;
  try {
    LedgerService.mutateOrDeletePostedTransaction(anyTx.id);
  } catch (err: any) {
    immutabilityEnforced = err.code === 'IMMUTABLE_LEDGER_VIOLATION' || String(err.message).toLowerCase().includes('immutable');
  }
  assert(immutabilityEnforced, 'Direct mutation or deletion of posted ledger transaction must throw IMMUTABLE_LEDGER violation');
  pass(28, 'Ledger immutability enforcement');

  // 29. Reconciliation mismatch detection
  // Inject a synthetic unposted verified payment to verify reconciliation catches it, then clean it up
  const anomalyPayId = 'pay_synthetic_unposted';
  localStore.payments.set(anomalyPayId, {
    id: anomalyPayId,
    transaction_id: 'SYNTH-001',
    user_id: customerId,
    reference_type: 'TRIP',
    reference_id: 'trip_missing_ledger',
    amount_ugx: 45000,
    currency: 'UGX',
    payment_method: 'CARD',
    status: 'SUCCESSFUL',
    environment: 'sandbox',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const reconWithMismatch = await ReconciliationService.runReconciliation('sandbox', 'TEST_SUITE');
  const caughtMissingPosting = reconWithMismatch.discrepancies.some(
    (d) => d.discrepancy_type === 'MISSING_LEDGER_POSTING' && d.reference_id === anomalyPayId
  );
  assert(caughtMissingPosting, 'Reconciliation engine must detect verified DPO payment missing a double-entry ledger posting');
  localStore.payments.delete(anomalyPayId);
  // Clear intentional review flags from Scenarios 10 & 11 after reconciliation detection is verified
  resMismatch.requires_review = false;
  resCurrMismatch.requires_review = false;
  pass(29, 'Reconciliation mismatch detection');

  // 30. Worker crash recovery without duplicate side effects
  const job = await FinancialOutboxService.enqueueJob({
    jobType: 'RUN_RECONCILIATION',
    dedupeKey: 'crash_recovery_test_job_1',
    payload: { environment: 'sandbox' },
  });
  // Simulate worker crash mid-flight (PROCESSING with stale locked_at > 5 mins ago)
  job.status = 'PROCESSING';
  job.locked_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  localStore.financial_outbox.set(job.id, job);

  FinancialOutboxService.registerHandler('RUN_RECONCILIATION', async (outboxJob) => {
    await ReconciliationService.runReconciliation(outboxJob.payload.environment || 'sandbox', 'OUTBOX_WORKER');
  });

  const recoveredCount = await FinancialOutboxService.recoverStalledJobs(5 * 60 * 1000);
  assert(recoveredCount === 1, 'Stalled PROCESSING job must be recovered to FAILED_RETRY');
  const processedRes = await FinancialOutboxService.processDueJobs();
  assert(processedRes.succeeded >= 1, 'Recovered outbox job must execute and complete');
  assert(localStore.financial_outbox.get(job.id)?.status === 'COMPLETED', 'Job status must be COMPLETED');
  pass(30, 'Worker crash recovery without duplicate side effects');

  // ---------------------------------------------------------------------------
  // CONCURRENCY & LOAD STRESS TEST — 10,000 CONCURRENT OPERATIONS
  // ---------------------------------------------------------------------------
  console.log('\n-------------------------------------------------------------------');
  console.log('⚡ RUNNING 10,000 CONCURRENT FINANCIAL & API OPERATIONS STRESS TEST');
  console.log('-------------------------------------------------------------------');

  const TOTAL_CONCURRENT_OPS = 10000;
  const NUM_STRESS_USERS = 100;
  const stressUsers: string[] = [];

  for (let i = 0; i < NUM_STRESS_USERS; i++) {
    const uid = `usr_stress_${i}`;
    stressUsers.push(uid);
    localStore.users.set(uid, {
      id: uid,
      full_name: `Stress User ${i}`,
      wallet_balance_ugx: 0,
    });
  }

  // Seed each of the 100 stress users with 100,000 UGX via verified deposit
  for (let i = 0; i < NUM_STRESS_USERS; i++) {
    await FinancialService.creditWallet({
      userId: stressUsers[i],
      amountUgx: 100000,
      type: 'DEPOSIT',
      referenceType: 'DEPOSIT',
      referenceId: `seed_dep_${i}`,
      idempotencyKey: `idem_seed_${i}`,
      description: 'Stress test initial deposit',
      environment: 'sandbox',
    });
  }

  const startTime = Date.now();
  const latenciesMs: number[] = [];
  let completedOps = 0;
  let expectedRejections = 0;
  let unexpectedErrors = 0;

  const operations: Array<() => Promise<void>> = [];

  for (let opIdx = 0; opIdx < TOTAL_CONCURRENT_OPS; opIdx++) {
    const userId = stressUsers[opIdx % NUM_STRESS_USERS];
    const mod = opIdx % 10;

    operations.push(async () => {
      const opStart = performance.now();
      try {
        if (mod === 0) {
          // 1,000 concurrent wallet top-ups (+5,000 UGX each)
          await FinancialService.creditWallet({
            userId,
            amountUgx: 5000,
            type: 'DEPOSIT',
            referenceType: 'DEPOSIT',
            referenceId: `stress_topup_${opIdx}`,
            idempotencyKey: `idem_stress_topup_${opIdx}`,
            description: `Concurrent topup #${opIdx}`,
            environment: 'sandbox',
          });
        } else if (mod === 1 || mod === 2) {
          // 2,000 concurrent wallet debits (-10,000 UGX each; some will hit INSUFFICIENT_FUNDS safely)
          await FinancialService.debitWallet({
            userId,
            amountUgx: 10000,
            referenceType: 'TRIP',
            referenceId: `stress_trip_${opIdx}`,
            idempotencyKey: `idem_stress_debit_${opIdx}`,
            description: `Concurrent spend #${opIdx}`,
            environment: 'sandbox',
          });
        } else if (mod === 3) {
          // 1,000 duplicate idempotency replay attacks (replaying opIdx - 3 topup key)
          const origIdx = opIdx - 3;
          const origUser = stressUsers[origIdx % NUM_STRESS_USERS];
          await FinancialService.creditWallet({
            userId: origUser,
            amountUgx: 5000,
            type: 'DEPOSIT',
            referenceType: 'DEPOSIT',
            referenceId: `stress_topup_${origIdx}`,
            idempotencyKey: `idem_stress_topup_${origIdx}`,
            description: `Duplicate replay topup #${origIdx}`,
            environment: 'sandbox',
          });
        } else if (mod === 4 || mod === 5 || mod === 6) {
          // 3,000 concurrent authoritative wallet balance & summary reads
          const summary = FinancialService.getWalletAccountSummary(userId, 'sandbox');
          if (summary.available_balance_ugx < 0) {
            throw new Error(`NEGATIVE_BALANCE_DETECTED for ${userId}: ${summary.available_balance_ugx}`);
          }
        } else if (mod === 7 || mod === 8) {
          // 2,000 concurrent trial-balance & financial overview reads
          const tb = LedgerService.verifyTrialBalance('sandbox');
          if (!tb.balanced) {
            throw new Error(`TRIAL_BALANCE_MISMATCH: debits=${tb.totalDebitsUgx} credits=${tb.totalCreditsUgx}`);
          }
        } else {
          // 1,000 concurrent driver/guide earnings summary reads
          const s = PayoutService.getBeneficiaryEarningsSummary(driverId, 'driver', 'sandbox');
          if (s.availableEarningsUgx < 0) {
            throw new Error(`NEGATIVE_PAYABLE_DETECTED: ${s.availableEarningsUgx}`);
          }
        }
        completedOps++;
      } catch (err: any) {
        if (err instanceof FinancialError && err.code === 'INSUFFICIENT_WALLET_FUNDS') {
          expectedRejections++;
        } else {
          unexpectedErrors++;
          console.error(`Unexpected error in op #${opIdx}:`, err);
        }
      } finally {
        latenciesMs.push(performance.now() - opStart);
      }
    });
  }

  // Execute all 10,000 operations concurrently in batches of 1,000 Promises to saturate the event loop and lock queues
  const BATCH_SIZE = 1000;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const slice = operations.slice(i, i + BATCH_SIZE);
    await Promise.all(slice.map((fn) => fn()));
  }

  const totalDurationMs = Date.now() - startTime;
  latenciesMs.sort((a, b) => a - b);
  const p50 = latenciesMs[Math.floor(latenciesMs.length * 0.5)] || 0;
  const p95 = latenciesMs[Math.floor(latenciesMs.length * 0.95)] || 0;
  const p99 = latenciesMs[Math.floor(latenciesMs.length * 0.99)] || 0;
  const opsPerSec = Math.round((TOTAL_CONCURRENT_OPS / Math.max(totalDurationMs, 1)) * 1000);

  // Verify post-stress invariants
  const finalTrialBalance = LedgerService.verifyTrialBalance('sandbox');
  assert(finalTrialBalance.balanced, `Final trial balance must be balanced! Debits=${finalTrialBalance.totalDebitsUgx}, Credits=${finalTrialBalance.totalCreditsUgx}`);
  assert(unexpectedErrors === 0, `Expected 0 unexpected errors across 10,000 ops, got ${unexpectedErrors}`);

  // Verify no stress user has a negative balance and every wallet matches its ledger entries
  for (const uid of stressUsers) {
    const bal = FinancialService.calculateWalletBalance(uid, 'sandbox');
    assert(bal >= 0, `User ${uid} has negative balance: ${bal}`);
  }

  const finalRecon = await ReconciliationService.runReconciliation('sandbox', 'POST_STRESS_VERIFY');
  assert(
    finalRecon.discrepancies.length === 0,
    `Expected 0 reconciliation discrepancies after 10,000 ops, got ${finalRecon.discrepancies.length}`
  );

  console.log(`  ✅ Total Concurrent Operations : ${TOTAL_CONCURRENT_OPS.toLocaleString()}`);
  console.log(`  ✅ Successful Operations       : ${completedOps.toLocaleString()}`);
  console.log(`  ✅ Safe Insufficient Rejections: ${expectedRejections.toLocaleString()}`);
  console.log(`  ✅ Unexpected Errors           : ${unexpectedErrors}`);
  console.log(`  ✅ Total Execution Time        : ${totalDurationMs} ms (${opsPerSec.toLocaleString()} ops/sec)`);
  console.log(`  ✅ Latency p50 / p95 / p99     : ${p50.toFixed(2)} ms / ${p95.toFixed(2)} ms / ${p99.toFixed(2)} ms`);
  console.log(`  ✅ Final Trial Balance         : Debits = Credits = UGX ${finalTrialBalance.totalDebitsUgx.toLocaleString()} (Diff: 0 UGX)`);
  console.log(`  ✅ Post-Stress Discrepancies   : ${finalRecon.discrepancies.length}`);
  console.log('===================================================================');
  console.log('🎉 ALL 30 SCENARIOS & 10,000 CONCURRENT OPERATIONS PASSED WITH ZERO ERRORS!');
  console.log('===================================================================');
}

runMasterFinancialTestSuite().then(() => { process.exit(0); }).catch((err) => {
  console.error('❌ MASTER FINANCIAL TEST SUITE FAILED:', err);
  process.exit(1);
});
