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
apiRouter.post('/storage/upload-url', StorageController.getPresignedUploadUrl);
apiRouter.post('/storage/upload', StorageController.uploadDirect);
apiRouter.get('/storage/status', StorageController.getStatus);

// -------------------------------------------------------------
// Careers Portal Integration (careers.mumwesafarisuganda.com)
// -------------------------------------------------------------
apiRouter.post('/careers/apply', CareerController.apply);
apiRouter.get('/careers/status', CareerController.checkStatus);

// -------------------------------------------------------------
// App Master Remote Config & Dynamic Controls
// -------------------------------------------------------------
apiRouter.get('/app-config', AppConfigController.getConfig);
apiRouter.put('/app-config', authenticate, requireRole('admin'), AppConfigController.updateConfig);
apiRouter.put('/app-config/services', authenticate, requireRole('admin'), AppConfigController.updateServices);
apiRouter.put('/app-config/banners', authenticate, requireRole('admin'), AppConfigController.updateBanners);
apiRouter.put('/app-config/features', authenticate, requireRole('admin'), AppConfigController.updateFeatures);
apiRouter.put('/app-config/version', authenticate, requireRole('admin'), AppConfigController.updateVersionConfig);

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
apiRouter.post('/telemetry/batch', TelemetryController.batchUpload);
apiRouter.get('/telemetry/drivers/:driverId/history', TelemetryController.getDriverHistory);
apiRouter.get('/telemetry/trips/:tripId/history', TelemetryController.getTripHistory);

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
apiRouter.get('/users/:id', authenticate, UserController.getProfile);
apiRouter.put('/users/:id', authenticate, UserController.updateProfile);
apiRouter.post('/users/wallet/topup', authenticate, UserController.topUpWallet);
apiRouter.post('/users/role', authenticate, UserController.switchRole);

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
apiRouter.get('/trips/:tripId', TripController.getTrip);
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
apiRouter.post('/tourism/destinations', TourismController.createDestination);
apiRouter.put('/tourism/destinations/:id', TourismController.updateDestination);
apiRouter.delete('/tourism/destinations/:id', TourismController.deleteDestination);

apiRouter.get('/tourism/packages', TourismController.getAllPackages);
apiRouter.get('/tourism/packages/:id', TourismController.getPackageById);
apiRouter.post('/tourism/packages', TourismController.createPackage);
apiRouter.put('/tourism/packages/:id', TourismController.updatePackage);
apiRouter.delete('/tourism/packages/:id', TourismController.deletePackage);

apiRouter.post('/tourism/bookings', authenticate, TourismController.createBooking);
apiRouter.get('/tourism/bookings', TourismController.getAllBookings);
apiRouter.get('/tourism/bookings/:id', TourismController.getBookingById);
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
apiRouter.post('/guides', TourGuideController.createGuide);
apiRouter.put('/guides/:id', TourGuideController.updateGuide);
apiRouter.delete('/guides/:id', TourGuideController.deleteGuide);
apiRouter.put('/guides/:id/availability', authenticate, TourGuideController.toggleAvailability);

// -------------------------------------------------------------
// Package Delivery
// -------------------------------------------------------------
apiRouter.post('/delivery/calculate-fare', DeliveryController.calculateFare);
apiRouter.post('/delivery/dispatch', authenticate, DeliveryController.createDelivery);
apiRouter.get('/delivery/:id', DeliveryController.getDeliveryById);
apiRouter.get('/delivery/track/:trackingNumber', DeliveryController.trackByTrackingNumber);
apiRouter.put('/delivery/:id/status', DeliveryController.updateStatus);
apiRouter.get('/delivery/user/history', authenticate, DeliveryController.getUserDeliveries);

// -------------------------------------------------------------
// Payments (DPO Pay XML Gateway, MTN MoMo, Airtel Money, Card)
// -------------------------------------------------------------
apiRouter.post('/payments/process', authenticate, PaymentController.processPayment);
apiRouter.post('/payments/:id/verify', authenticate, PaymentController.verifyPayment);
apiRouter.get('/payments/reference/:type/:id', authenticate, PaymentController.getPaymentByReference);
apiRouter.get('/payments/dpo/callback', PaymentController.handleDpoCallback);
apiRouter.post('/payments/dpo/callback', PaymentController.handleDpoCallback);
apiRouter.post('/payments/topup', authenticate, UserController.topUpWallet);
apiRouter.get('/payments/history/:userId', authenticate, PaymentController.getPaymentHistory);

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
apiRouter.post('/notifications', NotificationController.createNotification);
apiRouter.post('/admin/notifications/broadcast', authenticate, NotificationController.broadcastNotification);
apiRouter.post('/admin/notifications/send', authenticate, NotificationController.createNotification);
