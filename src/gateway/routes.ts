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
import { authenticate } from './auth_middleware';

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
// App Master Remote Config
// -------------------------------------------------------------
apiRouter.get('/app-config', AppConfigController.getConfig);
apiRouter.put('/app-config', authenticate, AppConfigController.updateConfig);

// -------------------------------------------------------------
// Authentication
// -------------------------------------------------------------
apiRouter.post('/auth/register', AuthController.register);
apiRouter.post('/auth/login', AuthController.login);
apiRouter.post('/auth/send-otp', AuthController.sendOtp);
apiRouter.post('/auth/verify-otp', AuthController.verifyOtp);
apiRouter.get('/auth/me', authenticate, AuthController.me);

// -------------------------------------------------------------
// Users
// -------------------------------------------------------------
apiRouter.get('/users/:id', authenticate, UserController.getProfile);
apiRouter.put('/users/:id', authenticate, UserController.updateProfile);

// -------------------------------------------------------------
// Drivers
// -------------------------------------------------------------
apiRouter.get('/drivers/nearby', DriverController.getNearby);
apiRouter.get('/drivers/dashboard', authenticate, DriverController.getDashboard);
apiRouter.post('/drivers/status', authenticate, DriverController.setAvailability);
apiRouter.post('/drivers/location', authenticate, DriverController.updateLocation);
apiRouter.post('/drivers/cashout', authenticate, DriverController.cashOut);

// -------------------------------------------------------------
// Trips (Ride Hailing)
// -------------------------------------------------------------
apiRouter.post('/trips/estimate', TripController.estimateFare);
apiRouter.post('/trips', authenticate, TripController.createTrip);
apiRouter.get('/trips/:tripId', TripController.getTrip);
apiRouter.put('/trips/:tripId/status', authenticate, TripController.updateStatus);
apiRouter.post('/trips/:tripId/rate', authenticate, TripController.rateTrip);
apiRouter.get('/users/trips', authenticate, TripController.getUserTrips);

// -------------------------------------------------------------
// Tourism (Destinations, Packages, Bookings)
// -------------------------------------------------------------
apiRouter.get('/tourism/destinations', TourismController.getAllDestinations);
apiRouter.get('/tourism/destinations/:id', TourismController.getDestinationById);
apiRouter.get('/tourism/packages', TourismController.getAllPackages);
apiRouter.get('/tourism/packages/:id', TourismController.getPackageById);
apiRouter.post('/tourism/bookings', authenticate, TourismController.createBooking);
apiRouter.get('/tourism/bookings/:id', TourismController.getBookingById);
apiRouter.get('/tourism/user/bookings', authenticate, TourismController.getUserBookings);

// -------------------------------------------------------------
// Tour Guides
// -------------------------------------------------------------
apiRouter.get('/guides', TourGuideController.getAllGuides);
apiRouter.get('/guides/:id', TourGuideController.getGuideById);
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
// Payments (MTN MoMo, Airtel Money, Card)
// -------------------------------------------------------------
apiRouter.post('/payments/process', authenticate, PaymentController.processPayment);
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
apiRouter.put('/notifications/:id/read', authenticate, NotificationController.markAsRead);
apiRouter.post('/notifications', NotificationController.createNotification);
