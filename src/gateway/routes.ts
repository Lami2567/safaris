import { Router } from 'express';
import { AuthController } from '../services/auth/auth.controller';
import { UserController } from '../services/user/user.controller';
import { DriverController } from '../services/driver/driver.controller';
import { TripController } from '../services/trip/trip.controller';
import { TourismController } from '../services/tourism/tourism.controller';
import { TourGuideController } from '../services/tour_guide/tour_guide.controller';
import { DeliveryController } from '../services/delivery/delivery.controller';
import { PaymentController } from '../services/payment/payment.controller';
import { MessagingController } from '../services/messaging/messaging.controller';
import { NotificationController } from '../services/notification/notification.controller';
import { AppConfigController } from '../services/app_config/app_config.controller';
import { AdminController } from '../services/admin/admin.controller';
import { TelemetryController } from '../services/telemetry/telemetry.controller';
import { AdminAuditController } from '../services/admin/audit.controller';
import { StorageController } from '../services/storage/storage.controller';
import { CareerController } from '../services/career/career.controller';
import { FinancialController } from '../services/financial/financial.controller';
import { PricingEngineController } from '../services/pricing/pricing_engine.controller';
import { authenticate, requireRole } from './auth_middleware';

export const apiRouter = Router();

// -------------------------------------------------------------
// Health Check
// -------------------------------------------------------------
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'SAFARIS Uganda API Gateway',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// -------------------------------------------------------------
// Cloudflare R2 Object Storage & Direct Client Uploads
// -------------------------------------------------------------
apiRouter.post('/storage/upload-url', authenticate, StorageController.getPresignedUploadUrl);
apiRouter.post('/storage/upload', authenticate, StorageController.uploadDirect);
apiRouter.post('/storage/validate-media-url', StorageController.validateMediaUrl);
apiRouter.get('/storage/status', StorageController.getStatus);
apiRouter.get('/storage/private-url', authenticate, StorageController.getPresignedDownloadUrl);

// -------------------------------------------------------------
// Centralized Vehicle Catalogue & Server-Side Pricing Engine
// -------------------------------------------------------------
apiRouter.get('/catalogue/vehicles', PricingEngineController.getCatalogueVehicles);
apiRouter.post('/admin/catalogue/vehicles', authenticate, requireRole('admin'), PricingEngineController.upsertCatalogueVehicle);
apiRouter.put('/admin/catalogue/vehicles/:id', authenticate, requireRole('admin'), PricingEngineController.upsertCatalogueVehicle);
apiRouter.delete('/admin/catalogue/vehicles/:id', authenticate, requireRole('admin'), PricingEngineController.deleteCatalogueVehicle);

apiRouter.get('/pricing/rules', PricingEngineController.getServicePricingRules);
apiRouter.put('/admin/pricing/rules/:serviceKey', authenticate, requireRole('admin'), PricingEngineController.updateServicePricingRule);

apiRouter.post('/pricing/quote', authenticate, PricingEngineController.calculateQuote);
apiRouter.get('/pricing/quote/:quotationId', authenticate, PricingEngineController.getQuotation);

// -------------------------------------------------------------
// Careers Portal Integration (careers.mumwesafarisuganda.com)
// -------------------------------------------------------------
apiRouter.post('/careers/apply', CareerController.apply);
apiRouter.get('/careers/status', (_req, res) => res.status(403).json({ success: false, error: { message: 'Request a private status link using your registered email.' } }));
apiRouter.post('/careers/status-link', CareerController.requestStatusLink);
apiRouter.post('/careers/status', CareerController.checkStatus);

// -------------------------------------------------------------
// App Master Remote Config & Dynamic Controls
// -------------------------------------------------------------
apiRouter.get('/app-config', AppConfigController.getConfig);
apiRouter.put('/app-config', authenticate, requireRole('admin'), AppConfigController.updateConfig);
apiRouter.put('/app-config/services', authenticate, requireRole('admin'), AppConfigController.updateServices);
apiRouter.put('/app-config/banners', authenticate, requireRole('admin'), AppConfigController.updateBanners);
apiRouter.put('/app-config/features', authenticate, requireRole('admin'), AppConfigController.updateFeatures);
apiRouter.put('/app-config/version', authenticate, requireRole('admin'), AppConfigController.updateVersionConfig);
apiRouter.put('/app-config/payment-methods', authenticate, requireRole('admin'), AppConfigController.updatePaymentMethods);

// -------------------------------------------------------------
// Admin Hub & Controls (Protected with persistent Admin Auth)
// -------------------------------------------------------------
apiRouter.get('/admin/auth-status', AdminController.getAuthStatus);
apiRouter.post('/admin/login', AdminController.login);
apiRouter.post('/admin/setup-credentials', authenticate, requireRole('admin'), AdminController.setupCredentials);
apiRouter.get('/admin/stats', authenticate, requireRole('admin'), AdminController.getStats);
apiRouter.get('/admin/pricing', authenticate, requireRole('admin'), AdminController.getPricing);
apiRouter.put('/admin/pricing', authenticate, requireRole('admin'), AdminController.updatePricing);
apiRouter.get('/admin/trips', authenticate, requireRole('admin'), AdminController.getAllTrips);
apiRouter.get('/admin/deliveries', authenticate, requireRole('admin'), AdminController.getAllDeliveries);
apiRouter.get('/admin/fleet', authenticate, requireRole('admin'), AdminController.getDriversFleet);
apiRouter.get('/admin/live-fleet', authenticate, requireRole('admin'), AdminAuditController.getLiveFleet);
apiRouter.get('/admin/live-fleet/stream', authenticate, requireRole('admin'), AdminAuditController.streamLiveFleet);
apiRouter.get('/realtime/stream', authenticate, AdminAuditController.streamUserEvents);
apiRouter.post('/admin/audit-log', authenticate, requireRole('admin'), AdminAuditController.recordAudit);
apiRouter.get('/admin/audit-logs', authenticate, requireRole('admin'), AdminAuditController.getAuditLogs);
apiRouter.get('/admin/users', authenticate, requireRole('admin'), AdminController.getAllUsers);
apiRouter.post('/admin/change-password', authenticate, requireRole('admin'), AdminController.changePassword);

// Careers & Recruitment Applicant Review
apiRouter.get('/admin/applicants', authenticate, requireRole('admin'), CareerController.getApplicants);
apiRouter.post('/admin/applicants/:id/approve', authenticate, requireRole('admin'), CareerController.approveApplicant);
apiRouter.post('/admin/applicants/:id/reject', authenticate, requireRole('admin'), CareerController.rejectApplicant);
apiRouter.post('/admin/applicants/:id/suspend', authenticate, requireRole('admin'), CareerController.suspendApplicant);

// -------------------------------------------------------------
// Real-time Telemetry & Offline Location Queue Sync
// -------------------------------------------------------------
apiRouter.post('/telemetry/batch', authenticate, TelemetryController.batchUpload);
apiRouter.get('/telemetry/drivers/:driverId/history', authenticate, TelemetryController.getDriverHistory);
apiRouter.get('/telemetry/trips/:tripId/history', authenticate, TelemetryController.getTripHistory);

// -------------------------------------------------------------
// Authentication
// -------------------------------------------------------------
apiRouter.post('/auth/register', AuthController.register);
apiRouter.post('/auth/login', AuthController.login);
apiRouter.post('/auth/login-with-otp', AuthController.loginWithOtp);
apiRouter.post('/auth/setup-password', AuthController.setupPassword);
apiRouter.post('/auth/verify-email-otp', AuthController.verifyEmailOtp);
apiRouter.post('/auth/resend-email-otp', AuthController.resendEmailOtp);
apiRouter.get('/auth/me', authenticate, AuthController.me);

// -------------------------------------------------------------
// Users
// -------------------------------------------------------------
apiRouter.get('/users/profile', authenticate, UserController.getProfile);
apiRouter.get('/users/me', authenticate, UserController.getProfile);
apiRouter.get('/users/:id', authenticate, UserController.getProfile);
apiRouter.put('/users/:id', authenticate, UserController.updateProfile);
apiRouter.post('/users/wallet/topup', authenticate, UserController.topUpWallet);
apiRouter.post('/users/role', authenticate, requireRole('admin'), UserController.switchRole);
apiRouter.get('/admin/privileged-accounts', authenticate, requireRole('admin'), UserController.getPrivilegedAccounts);

// -------------------------------------------------------------
// Drivers
// -------------------------------------------------------------
apiRouter.get('/drivers/nearby', DriverController.getNearby);
apiRouter.get('/drivers/dashboard', authenticate, DriverController.getDashboard);
apiRouter.post('/drivers/status', authenticate, DriverController.setAvailability);
apiRouter.put('/drivers/status', authenticate, DriverController.setAvailability);
apiRouter.post('/drivers/location', authenticate, DriverController.updateLocation);
apiRouter.put('/drivers/location', authenticate, DriverController.updateLocation);
apiRouter.post('/drivers/cashout', authenticate, DriverController.cashOut);

// -------------------------------------------------------------
// Trips (Ride Hailing)
// -------------------------------------------------------------
apiRouter.post('/trips/estimate', TripController.estimateFare);
apiRouter.post('/trips', authenticate, TripController.createTrip);
apiRouter.get('/trips/active', authenticate, TripController.getActiveTrip);
apiRouter.get('/trips/:tripId', authenticate, TripController.getTrip);
apiRouter.post('/trips/:tripId/accept', authenticate, TripController.acceptTrip);
apiRouter.post('/trips/:tripId/reject', authenticate, TripController.rejectTrip);
apiRouter.post('/trips/:tripId/location', authenticate, TripController.updateLocation);
apiRouter.put('/trips/:tripId/status', authenticate, TripController.updateStatus);
apiRouter.post('/trips/:tripId/rate', authenticate, TripController.rateTrip);
apiRouter.get('/users/trips', authenticate, TripController.getUserTrips);

// -------------------------------------------------------------
// Tourism (Destinations, Packages, Bookings)
// -------------------------------------------------------------
apiRouter.get('/tourism/destinations', TourismController.getAllDestinations);
apiRouter.get('/tourism/destinations/:id', TourismController.getDestinationById);
apiRouter.post('/tourism/destinations', authenticate, requireRole('admin'), TourismController.createDestination);
apiRouter.put('/tourism/destinations/:id', authenticate, requireRole('admin'), TourismController.updateDestination);
apiRouter.post('/tourism/destinations/:id/duplicate', authenticate, requireRole('admin'), TourismController.duplicateDestination);
apiRouter.delete('/tourism/destinations/:id', authenticate, requireRole('admin'), TourismController.deleteDestination);

apiRouter.get('/tourism/packages', TourismController.getAllPackages);
apiRouter.get('/tourism/packages/:id', TourismController.getPackageById);
apiRouter.post('/tourism/packages', authenticate, requireRole('admin'), TourismController.createPackage);
apiRouter.put('/tourism/packages/:id', authenticate, requireRole('admin'), TourismController.updatePackage);
apiRouter.post('/tourism/packages/:id/duplicate', authenticate, requireRole('admin'), TourismController.duplicatePackage);
apiRouter.delete('/tourism/packages/:id', authenticate, requireRole('admin'), TourismController.deletePackage);

apiRouter.post('/tourism/bookings', authenticate, TourismController.createBooking);
apiRouter.get('/tourism/bookings', authenticate, requireRole('admin', 'tour_guide'), TourismController.getAllBookings);
apiRouter.get('/tourism/bookings/:id', authenticate, TourismController.getBookingById);
apiRouter.put('/tourism/bookings/:id/assign-guide', authenticate, requireRole('admin'), TourismController.assignGuide);
apiRouter.put('/tourism/bookings/:id/status', authenticate, TourismController.updateBookingStatus);
apiRouter.get('/tourism/user/bookings', authenticate, TourismController.getUserBookings);

// -------------------------------------------------------------
// Tour Guides
// -------------------------------------------------------------
apiRouter.get('/guides', TourGuideController.getAllGuides);
apiRouter.get('/guides/dashboard', authenticate, TourGuideController.getDashboard);
apiRouter.get('/guides/me/dashboard', authenticate, TourGuideController.getDashboard);
apiRouter.put('/guides/me/availability', authenticate, TourGuideController.toggleAvailability);
apiRouter.post('/guides/status', authenticate, TourGuideController.toggleAvailability);
apiRouter.get('/guides/:id', TourGuideController.getGuideById);
apiRouter.post('/guides', authenticate, requireRole('admin'), TourGuideController.createGuide);
apiRouter.put('/guides/:id', authenticate, requireRole('admin'), TourGuideController.updateGuide);
apiRouter.delete('/guides/:id', authenticate, requireRole('admin'), TourGuideController.deleteGuide);
apiRouter.put('/guides/:id/availability', authenticate, TourGuideController.toggleAvailability);

// -------------------------------------------------------------
// Package Delivery
// -------------------------------------------------------------
apiRouter.post('/delivery/calculate-fare', DeliveryController.calculateFare);
apiRouter.post('/delivery/dispatch', authenticate, DeliveryController.createDelivery);
apiRouter.get('/delivery/:id', authenticate, DeliveryController.getDeliveryById);
apiRouter.get('/delivery/track/:trackingNumber', DeliveryController.trackByTrackingNumber);
apiRouter.put('/delivery/:id/status', authenticate, DeliveryController.updateStatus);
apiRouter.get('/delivery/user/history', authenticate, DeliveryController.getUserDeliveries);

// -------------------------------------------------------------
// Payments (DPO Pay XML Gateway, MTN MoMo, Airtel Money, Card)
// -------------------------------------------------------------
apiRouter.post('/payments/process', authenticate, PaymentController.processPayment);
apiRouter.post('/payments/:id/verify', authenticate, PaymentController.verifyPayment);
apiRouter.get('/payments/reference/:type/:id', authenticate, PaymentController.getPaymentByReference);
apiRouter.get('/payments/dpo/callback', PaymentController.handleDpoCallback);
apiRouter.post('/payments/dpo/callback', PaymentController.handleDpoCallback);
apiRouter.get('/payments/dpo/cancel', PaymentController.handleDpoCancel);
apiRouter.post('/payments/dpo/cancel', PaymentController.handleDpoCancel);
apiRouter.post('/payments/topup', authenticate, PaymentController.topUpWallet);
apiRouter.get('/payments/history/:userId', authenticate, PaymentController.getPaymentHistory);
apiRouter.get('/payments/cards', authenticate, PaymentController.getUserCards);
apiRouter.post('/payments/cards', authenticate, PaymentController.saveUserCard);
apiRouter.delete('/payments/cards/:cardId', authenticate, PaymentController.deleteUserCard);

// Admin Payments Management & DPO Verification Center
apiRouter.get('/admin/payments', authenticate, requireRole('admin'), PaymentController.adminListPayments);
apiRouter.get('/admin/payments/stats', authenticate, requireRole('admin'), PaymentController.adminGetPaymentStats);
apiRouter.get('/admin/payments/config-status', authenticate, requireRole('admin'), PaymentController.adminGetConfigStatus);
apiRouter.post('/admin/payments/:id/reconcile', authenticate, requireRole('admin'), PaymentController.adminReconcilePayment);
apiRouter.post('/admin/payments/reconcile-open', authenticate, requireRole('admin'), PaymentController.adminReconcileOpen);

// -------------------------------------------------------------
// Financial Engine: Customer Wallets, Platform Earnings & Automatic Refunds
// -------------------------------------------------------------
apiRouter.get('/wallet/balance', authenticate, FinancialController.getBalance);
apiRouter.get('/wallet/summary', authenticate, FinancialController.getWalletSummary);
apiRouter.get('/wallet/transactions', authenticate, FinancialController.getTransactions);

apiRouter.get('/payouts', authenticate, FinancialController.getUserPayouts);
apiRouter.post('/payouts/request', authenticate, FinancialController.requestPayout);

apiRouter.get('/admin/financials/overview', authenticate, requireRole('admin'), FinancialController.getOverview);
apiRouter.get('/admin/financials/ledger', authenticate, requireRole('admin'), FinancialController.getEarningsLedger);
apiRouter.get('/admin/financials/double-entry', authenticate, requireRole('admin'), FinancialController.getDoubleEntryLedger);
apiRouter.get('/admin/financials/payouts', authenticate, requireRole('admin'), FinancialController.adminGetPayouts);
apiRouter.post('/admin/financials/payouts/:id/execute', authenticate, requireRole('admin'), FinancialController.adminExecutePayout);
apiRouter.post('/admin/financials/payouts/:id/reconcile', authenticate, requireRole('admin'), FinancialController.adminReconcilePayout);
apiRouter.get('/admin/financials/reconciliation', authenticate, requireRole('admin'), FinancialController.getReconciliationStatus);
apiRouter.post('/admin/financials/reconciliation/run', authenticate, requireRole('admin'), FinancialController.runReconciliation);
apiRouter.post('/admin/financials/settlements/import', authenticate, requireRole('admin'), FinancialController.importSettlementReport);
apiRouter.get('/admin/financials/audit-logs', authenticate, requireRole('admin'), FinancialController.getFinancialAuditLogs);
apiRouter.get('/admin/financials/outbox', authenticate, requireRole('admin'), FinancialController.getOutboxStatus);
apiRouter.get('/admin/refund-policies', authenticate, requireRole('admin'), FinancialController.getPolicies);
apiRouter.put('/admin/refund-policies/:id', authenticate, requireRole('admin'), FinancialController.updatePolicy);
apiRouter.get('/admin/refunds', authenticate, requireRole('admin'), FinancialController.getRefunds);
apiRouter.post('/admin/refunds', authenticate, requireRole('admin'), FinancialController.createRefund);
apiRouter.post('/admin/refunds/run-worker', authenticate, requireRole('admin'), FinancialController.triggerRefundWorker);
apiRouter.post('/admin/financial-adjustments', authenticate, requireRole('admin'), FinancialController.recordAdjustment);

// -------------------------------------------------------------
// In-App Encrypted Messaging
// -------------------------------------------------------------
apiRouter.post('/messages', authenticate, MessagingController.sendMessage);
apiRouter.get('/messages/trip/:tripId', authenticate, MessagingController.getTripMessages);
apiRouter.get('/messages/conversation/:userId', authenticate, MessagingController.getConversation);

// -------------------------------------------------------------
// Notifications
// -------------------------------------------------------------
apiRouter.get('/notifications/user/:userId', authenticate, NotificationController.getUserNotifications);
apiRouter.get('/notifications/user/:userId/unread-count', authenticate, NotificationController.getUnreadCount);
apiRouter.put('/notifications/:id/read', authenticate, NotificationController.markAsRead);
apiRouter.put('/notifications/user/:userId/read-all', authenticate, NotificationController.markAllAsRead);
apiRouter.delete('/notifications/:id', authenticate, NotificationController.deleteNotification);
apiRouter.post('/notifications/:id/delete', authenticate, NotificationController.deleteNotification);
apiRouter.delete('/notifications/user/:userId/clear', authenticate, NotificationController.clearNotifications);
apiRouter.post('/notifications/user/:userId/clear', authenticate, NotificationController.clearNotifications);
apiRouter.post('/notifications', authenticate, requireRole('admin'), NotificationController.createNotification);
apiRouter.post('/admin/notifications/broadcast', authenticate, NotificationController.broadcastNotification);
apiRouter.post('/admin/notifications/send', authenticate, NotificationController.createNotification);
