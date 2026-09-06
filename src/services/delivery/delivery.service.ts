import { localStore } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';
import { emitToUser, emitToRoom } from '../../realtime/socket_server';

export interface CreateDeliveryRequest {
  senderId: string;
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  packageCategory: string; // 'DOCUMENTS' | 'ELECTRONICS' | 'FOOD' | 'FRAGILE' | 'BOX'
  packageWeightKg: number;
  packageDescription?: string;
  isFragile?: boolean;
  distanceKm: number;
  paymentMethod?: string;
}

export class DeliveryService {
  public static calculateDeliveryFare(category: string, weightKg: number, distanceKm: number) {
    const baseFare = 3500; // UGX base for boda courier
    const perKmRate = 1200;
    const weightSurcharge = Math.max(0, weightKg - 2) * 500;
    const categorySurcharge = category === 'FRAGILE' ? 2000 : 0;

    const total = baseFare + distanceKm * perKmRate + weightSurcharge + categorySurcharge;
    return Math.round(total / 100) * 100; // round to nearest 100 UGX
  }

  public static createDelivery(data: CreateDeliveryRequest) {
    const deliveryId = `del_${uuidv4().substring(0, 8)}`;
    const trackingNumber = `SAF-${Math.floor(100000 + Math.random() * 900000)}`;
    const fareUGX = this.calculateDeliveryFare(data.packageCategory, data.packageWeightKg, data.distanceKm);

    const delivery = {
      id: deliveryId,
      tracking_number: trackingNumber,
      sender_id: data.senderId,
      courier_id: null,
      sender_name: data.senderName,
      sender_phone: data.senderPhone,
      recipient_name: data.recipientName,
      recipient_phone: data.recipientPhone,
      pickup_address: data.pickupAddress,
      pickup_lat: data.pickupLat,
      pickup_lng: data.pickupLng,
      dropoff_address: data.dropoffAddress,
      dropoff_lat: data.dropoffLat,
      dropoff_lng: data.dropoffLng,
      package_category: data.packageCategory,
      package_weight_kg: data.packageWeightKg,
      package_description: data.packageDescription || '',
      is_fragile: data.isFragile || false,
      fare_ugx: fareUGX,
      payment_method: data.paymentMethod || 'MTN Mobile Money',
      payment_status: 'PAID',
      status: 'SEARCHING_COURIER', // SEARCHING_COURIER, COURIER_ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localStore.deliveries.set(deliveryId, delivery);

    // Auto-match courier after 1.5s
    setTimeout(() => {
      this.matchCourier(deliveryId);
    }, 1500);

    return delivery;
  }

  public static matchCourier(deliveryId: string) {
    const delivery = localStore.deliveries.get(deliveryId);
    if (!delivery || delivery.status !== 'SEARCHING_COURIER') return;

    // Pick first online driver/courier
    let courier = Array.from(localStore.drivers.values()).find((d: any) => d.is_online);
    if (!courier) {
      courier = Array.from(localStore.drivers.values())[0];
    }

    if (courier) {
      delivery.courier_id = courier.id;
      delivery.status = 'COURIER_ASSIGNED';
      delivery.updated_at = new Date().toISOString();

      const courierUser = localStore.users.get(courier.id);
      const courierDetails = {
        id: courier.id,
        name: courierUser ? courierUser.full_name : 'Geoffrey Otim (Boda Courier)',
        phone: courierUser ? courierUser.phone : '+256 782 119944',
        rating: 4.95,
        vehicle: 'Bajaj Boxer 150cc - UEN 821D',
      };

      emitToUser(delivery.sender_id, 'delivery:courier_assigned', {
        deliveryId,
        trackingNumber: delivery.tracking_number,
        courier: courierDetails,
        status: 'COURIER_ASSIGNED',
      });
    }
  }

  public static updateDeliveryStatus(deliveryId: string, status: string) {
    const delivery = localStore.deliveries.get(deliveryId);
    if (!delivery) throw new Error('Delivery not found.');

    delivery.status = status;
    delivery.updated_at = new Date().toISOString();

    emitToRoom(`delivery:${deliveryId}`, 'delivery:status_update', {
      deliveryId,
      trackingNumber: delivery.tracking_number,
      status,
    });

    emitToUser(delivery.sender_id, 'delivery:status_update', {
      deliveryId,
      status,
    });

    return delivery;
  }

  public static getDeliveryById(deliveryId: string) {
    const delivery = localStore.deliveries.get(deliveryId);
    if (!delivery) throw new Error('Delivery not found.');

    let courierDetails = null;
    if (delivery.courier_id) {
      const courier = localStore.drivers.get(delivery.courier_id);
      const user = localStore.users.get(delivery.courier_id);
      courierDetails = {
        id: delivery.courier_id,
        name: user ? user.full_name : 'Courier',
        phone: user ? user.phone : '+256 782 119944',
        rating: 4.95,
        vehicle: 'Bajaj Boxer - UEN 821D',
      };
    }

    return { ...delivery, courier: courierDetails };
  }

  public static trackByTrackingNumber(trackingNumber: string) {
    for (const delivery of localStore.deliveries.values()) {
      if (delivery.tracking_number === trackingNumber) {
        return this.getDeliveryById(delivery.id);
      }
    }
    throw new Error(`Package with tracking number ${trackingNumber} not found.`);
  }

  public static getUserDeliveries(userId: string) {
    return Array.from(localStore.deliveries.values()).filter(
      (d: any) => d.sender_id === userId || d.courier_id === userId
    );
  }
}
