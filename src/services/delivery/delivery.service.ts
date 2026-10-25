import { localStore } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';
import { emitToUser, emitToRoom } from '../../realtime/socket_server';
import { PricingEngineService } from '../pricing/pricing_engine.service';

export interface CreateDeliveryRequest {
  id?: string;
  senderId: string;
  senderName?: string;
  senderPhone?: string;
  recipientName: string;
  recipientPhone: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  packageCategory: string; // 'DOCUMENTS' | 'ELECTRONICS' | 'FOOD_AND_PERISHABLES' | 'GENERAL_MERCHANDISE' | 'HEAVY_CARGO'
  packageWeightKg: number;
  packageDescription?: string;
  isFragile?: boolean;
  isExpressPriority?: boolean;
  vehicleId?: string;
  quotationId?: string;
  distanceKm: number;
  paymentMethod?: string;
}

export class DeliveryService {
  public static calculateDeliveryFare(
    category: string,
    weightKg: number,
    distanceKm: number,
    vehicleId?: string
  ): number {
    const eligibleVehicles = PricingEngineService.getAllCatalogueVehicles({ service: 'express_delivery' });
    let vehicle = vehicleId ? PricingEngineService.getCatalogueVehicleByIdOrCode(vehicleId) : null;
    if (!vehicle) {
      vehicle =
        weightKg > 15
          ? eligibleVehicles.find((v) => v.max_weight_kg >= weightKg) || eligibleVehicles[0]
          : eligibleVehicles[0];
    }

    const delConfig = vehicle?.service_pricing?.express_delivery || {
      baseFeeUgx: 3500,
      minimumFeeUgx: 5000,
      freeWeightKg: 5,
      perKgSurchargeUgx: 500,
      expressPriorityMultiplier: 1.25,
      multiStopFeeUgx: 2000,
      calculationMode: 'BAND_MATCH' as const,
      distanceBands: [
        { minKm: 0, maxKm: 5, ratePerKmUgx: 1000 },
        { minKm: 5, maxKm: 15, ratePerKmUgx: 900 },
        { minKm: 15, maxKm: null, ratePerKmUgx: 800 },
      ],
    };

    const globalDelRules = PricingEngineService.getAllServicePricingRules().express_delivery || {};
    const catKey = String(category || 'DOCUMENTS').toUpperCase().trim();
    const catSurcharges = globalDelRules.categorySurchargesUgx || {};
    const categorySurcharge = Number(catSurcharges[catKey] || (catKey === 'FRAGILE' ? 2000 : 0));

    const { distanceChargeUgx } = PricingEngineService.calculateDistanceBandCharge(
      Math.max(1, Number(distanceKm || 5)),
      delConfig.distanceBands || [],
      delConfig.calculationMode || 'BAND_MATCH'
    );

    const billableWeight = Math.max(0, Number(weightKg || 1) - Number(delConfig.freeWeightKg || 5));
    const weightSurcharge = billableWeight * Number(delConfig.perKgSurchargeUgx || 500);

    const rawTotal = Number(delConfig.baseFeeUgx || 3500) + distanceChargeUgx + weightSurcharge + categorySurcharge;
    const enforcedMin = Math.max(Number(delConfig.minimumFeeUgx || 5000), rawTotal);
    return Math.round(enforcedMin / 100) * 100;
  }

  public static createDelivery(data: CreateDeliveryRequest) {
    const deliveryId = data.id || `del_${uuidv4().substring(0, 8)}`;
    const trackingNumber = `SAF-${Math.floor(100000 + Math.random() * 900000)}`;

    let fareUGX = 0;
    let quotationId: string | null = data.quotationId || null;
    let pricingVersion = 1;
    let quotationSnapshot: any = {};
    let existingQuote: any = null;

    if (quotationId) {
      existingQuote = PricingEngineService.validateAndConsumeQuotation({
        quotationId,
        expectedServiceType: 'DELIVERY',
        customerId: data.senderId,
        vehicleId: data.vehicleId,
      });
      fareUGX = Number(existingQuote.total_price_ugx || existingQuote.totalPriceUgx || 0);
      pricingVersion = Number(existingQuote.pricing_version || existingQuote.pricingVersion || 1);
      quotationSnapshot = existingQuote;
    } else {
      const serverDistKm = PricingEngineService.calculateServerDistanceKm(
        Number(data.pickupLat ?? 0.3136),
        Number(data.pickupLng ?? 32.5811),
        Number(data.dropoffLat ?? 0.0424),
        Number(data.dropoffLng ?? 32.4435)
      );
      const clientDist = Number(data.distanceKm || 0);
      const distanceKm = (!clientDist || clientDist < 0.5 * serverDistKm) ? serverDistKm : clientDist;
      fareUGX = this.calculateDeliveryFare(
        data.packageCategory,
        data.packageWeightKg,
        distanceKm,
        data.vehicleId
      );
    }

    const delivery = {
      id: deliveryId,
      tracking_number: trackingNumber,
      sender_id: data.senderId,
      customer_id: data.senderId,
      courier_id: null as string | null,
      vehicle_id: data.vehicleId || existingQuote?.vehicle_id || null,
      quotation_id: quotationId,
      pricing_version: pricingVersion,
      quotation_snapshot: quotationSnapshot,
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
      distance_km: Number(data.distanceKm || 5),
      package_category: data.packageCategory,
      category: data.packageCategory,
      package_weight_kg: data.packageWeightKg,
      weight_kg: data.packageWeightKg,
      package_description: data.packageDescription || '',
      description: data.packageDescription || '',
      is_fragile: data.isFragile || false,
      fare_ugx: fareUGX,
      price_ugx: fareUGX,
      payment_method: data.paymentMethod || 'MTN Mobile Money',
      payment_status: 'PENDING',
      status: 'SEARCHING_COURIER',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localStore.deliveries.set(deliveryId, delivery);

    setTimeout(() => {
      this.matchCourier(deliveryId);
    }, 1500);

    return delivery;
  }

  public static matchCourier(deliveryId: string) {
    const delivery = localStore.deliveries.get(deliveryId);
    if (!delivery || delivery.status !== 'SEARCHING_COURIER') return;

    const courier = Array.from(localStore.drivers.values()).find(
      (d: any) => d.is_online && d.is_approved && d.approval_status === 'APPROVED'
    );

    if (courier) {
      delivery.courier_id = courier.id;
      delivery.status = 'COURIER_ASSIGNED';
      delivery.updated_at = new Date().toISOString();

      const courierUser = localStore.users.get(courier.id);
      const veh = courier.vehicle_id ? localStore.vehicles.get(courier.vehicle_id) : null;
      const courierDetails = {
        id: courier.id,
        name: courierUser ? courierUser.full_name : 'Assigned Safaris Courier',
        phone: courierUser ? courierUser.phone : '',
        rating: Number(courierUser?.rating || 4.95),
        vehicle: veh ? `${veh.make} ${veh.model} • ${veh.registration_plate}` : 'Safaris Express Courier',
      };

      emitToUser(delivery.sender_id, 'delivery:courier_assigned', {
        deliveryId,
        trackingNumber: delivery.tracking_number,
        courier: courierDetails,
        status: 'COURIER_ASSIGNED',
      });
    }
  }

  public static updateDeliveryStatus(
    deliveryId: string,
    status: string,
    actorId?: string,
    actorRole?: string
  ) {
    const delivery = localStore.deliveries.get(deliveryId);
    if (!delivery) throw new Error('Delivery not found.');

    if (!actorId) {
      throw new Error('Authentication required to update delivery status.');
    }

    const currentStatus = String(delivery.status || 'SEARCHING_COURIER').toUpperCase();
    const targetStatus = String(status || '').toUpperCase();

    const ALLOWED_STATUSES = ['SEARCHING_COURIER', 'COURIER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
    if (!ALLOWED_STATUSES.includes(targetStatus)) {
      throw new Error(`Invalid delivery status '${status}'. Allowed statuses: ${ALLOWED_STATUSES.join(', ')}.`);
    }

    // Role and ownership authorization
    if (actorRole !== 'admin') {
      const isSender = delivery.sender_id === actorId || delivery.customer_id === actorId;
      const isAssignedCourier = delivery.courier_id === actorId;

      if (!isSender && !isAssignedCourier) {
        throw new Error('You are not authorized to update this delivery.');
      }

      // Sender rules: Can only cancel while searching or assigned
      if (isSender && !isAssignedCourier) {
        if (targetStatus !== 'CANCELLED') {
          throw new Error('Customers may only cancel a pending delivery. Status progression must be performed by the assigned courier.');
        }
        if (!['SEARCHING_COURIER', 'COURIER_ASSIGNED'].includes(currentStatus)) {
          throw new Error(`Cannot cancel delivery once package is ${currentStatus.toLowerCase().replace('_', ' ')}.`);
        }
      }

      // Courier rules: Enforce valid operational progression
      if (isAssignedCourier) {
        const validCourierTransitions: Record<string, string[]> = {
          COURIER_ASSIGNED: ['PICKED_UP', 'CANCELLED'],
          PICKED_UP: ['IN_TRANSIT', 'CANCELLED'],
          IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
          DELIVERED: [],
          CANCELLED: [],
        };
        const allowedNext = validCourierTransitions[currentStatus] || [];
        if (!allowedNext.includes(targetStatus)) {
          throw new Error(`Invalid status transition from ${currentStatus} to ${targetStatus} for assigned courier.`);
        }
      }
    }

    delivery.status = targetStatus;
    delivery.updated_at = new Date().toISOString();

    emitToRoom(`delivery:${deliveryId}`, 'delivery:status_update', {
      deliveryId,
      trackingNumber: delivery.tracking_number,
      status: targetStatus,
    });

    emitToUser(delivery.sender_id, 'delivery:status_update', {
      deliveryId,
      status: targetStatus,
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
      const veh = courier?.vehicle_id ? localStore.vehicles.get(courier.vehicle_id) : null;
      courierDetails = {
        id: delivery.courier_id,
        name: user ? user.full_name : 'Assigned Courier',
        phone: user ? user.phone : '',
        rating: Number(user?.rating || 4.95),
        vehicle: veh ? `${veh.make} ${veh.model} • ${veh.registration_plate}` : 'Safaris Courier',
      };
    }

    return { ...delivery, courier: courierDetails };
  }

  /**
   * Public tracking endpoint: Sanitizes response to protect customer PII
   */
  public static trackByTrackingNumber(trackingNumber: string) {
    for (const delivery of localStore.deliveries.values()) {
      if (delivery.tracking_number === trackingNumber) {
        const courierUser = delivery.courier_id ? localStore.users.get(delivery.courier_id) : null;
        return {
          tracking_number: delivery.tracking_number,
          status: delivery.status,
          package_category: delivery.package_category || delivery.category,
          pickup_address: delivery.pickup_address,
          dropoff_address: delivery.dropoff_address,
          distance_km: delivery.distance_km,
          created_at: delivery.created_at,
          updated_at: delivery.updated_at,
          courier: courierUser ? {
            name: courierUser.full_name,
            rating: Number(courierUser.rating || 4.9),
          } : null,
        };
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
