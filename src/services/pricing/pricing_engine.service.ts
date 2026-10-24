import { v4 as uuidv4 } from 'uuid';
import { db, localStore } from '../../config/database';
import { broadcastConfigUpdate } from '../../realtime/socket_server';

export type ServiceAssignmentKey = 'ride_hailing' | 'airport_shuttle' | 'tours' | 'express_delivery';
export type QuoteServiceType = 'RIDE' | 'AIRPORT_SHUTTLE' | 'TOUR' | 'DELIVERY';

export interface DistanceBand {
  id?: string;
  label?: string;
  minKm: number;
  maxKm: number | null; // null means open-ended (e.g. 15 km and above)
  ratePerKmUgx: number;
}

export interface TouristPricingTier {
  id?: string;
  minTourists: number;
  maxTourists: number | null; // null means open-ended (e.g. 7+ tourists)
  priceUgx: number;
  pricingMode: 'PER_PERSON' | 'GROUP_TOTAL';
  extraPersonChargeUgx?: number;
  currency?: string;
  notes?: string;
}

export interface AdditionalChargeConfig {
  id: string;
  name: string;
  amountUgx: number;
  chargeType: 'PER_PERSON' | 'PER_BOOKING' | 'PER_DAY';
  isMandatory: boolean;
}

export interface CatalogueVehicle {
  id: string;
  code: string;
  name: string;
  category: string;
  make: string;
  model: string;
  description: string;
  image_url: string;
  icon_name: string;
  passenger_capacity: number;
  luggage_capacity: number;
  max_weight_kg: number;
  eta_minutes: number;
  is_available: boolean;
  is_active: boolean;
  display_order: number;
  assigned_services: ServiceAssignmentKey[];
  service_pricing: {
    ride_hailing?: {
      baseFareUgx: number;
      minimumFareUgx: number;
      perMinuteUgx: number;
      waitingFeePerMinUgx: number;
      bookingFeeUgx: number;
      cancellationFeeUgx: number;
      nightSurchargeUgx: number;
      peakMultiplier: number;
      calculationMode: 'BAND_MATCH' | 'PROGRESSIVE';
      distanceBands: DistanceBand[];
    };
    airport_shuttle?: {
      baseFareUgx: number;
      minimumFareUgx: number;
      perKmUgx: number;
      extraPassengerFeeUgx: number;
      extraLuggageFeeUgx: number;
      waitingFeePerMinUgx: number;
      roundTripMultiplier: number;
      fixedRoutes?: Record<string, number>; // e.g. { "kampala_ebb": 110000 }
      distanceBands?: DistanceBand[];
    };
    tours?: {
      dailyHireRateUgx: number;
      perKmRateUgx: number;
      driverAllowancePerDayUgx: number;
      includedKmPerDay: number;
    };
    express_delivery?: {
      baseFeeUgx: number;
      minimumFeeUgx: number;
      freeWeightKg: number;
      perKgSurchargeUgx: number;
      expressPriorityMultiplier: number;
      multiStopFeeUgx: number;
      calculationMode: 'BAND_MATCH' | 'PROGRESSIVE';
      distanceBands: DistanceBand[];
    };
  };
  pricing_version: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteBreakdownItem {
  code: string;
  label: string;
  amountUgx: number;
  details?: string;
}

export interface PriceQuotationResult {
  quotationId: string;
  serviceType: QuoteServiceType;
  referenceId?: string | null;
  vehicleId?: string | null;
  vehicleName?: string | null;
  guideId?: string | null;
  guideName?: string | null;
  guestCount: number;
  distanceKm: number;
  weightKg: number;
  durationDays: number;
  basePriceUgx: number;
  distancePriceUgx: number;
  vehicleChargeUgx: number;
  touristCountChargeUgx: number;
  tourGuideFeeUgx: number;
  additionalChargesUgx: number;
  discountsUgx: number;
  taxesUgx: number;
  totalPriceUgx: number;
  currency: 'UGX';
  pricingVersion: number;
  breakdown: QuoteBreakdownItem[];
  expiresAt: string;
  createdAt: string;
}

export class PricingEngineService {
  private static isInitialized = false;

  private static getDefaultCatalogueVehicles(): CatalogueVehicle[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'veh_boda',
        code: 'boda',
        name: 'Safaris Boda',
        category: 'Motorcycle / Boda',
        make: 'Bajaj',
        model: 'Boxer 150',
        description: 'Fast motorbike transit across city traffic • Helmet provided',
        image_url: '',
        icon_name: 'two_wheeler',
        passenger_capacity: 1,
        luggage_capacity: 1,
        max_weight_kg: 15,
        eta_minutes: 2,
        is_available: true,
        is_active: true,
        display_order: 1,
        assigned_services: ['ride_hailing', 'express_delivery'],
        service_pricing: {
          ride_hailing: {
            baseFareUgx: 2000,
            minimumFareUgx: 3000,
            perMinuteUgx: 100,
            waitingFeePerMinUgx: 100,
            bookingFeeUgx: 0,
            cancellationFeeUgx: 1000,
            nightSurchargeUgx: 1000,
            peakMultiplier: 1.0,
            calculationMode: 'BAND_MATCH',
            distanceBands: [
              { id: 'b1', label: 'Short Trip (0 - 5 km)', minKm: 0, maxKm: 5, ratePerKmUgx: 1200 },
              { id: 'b2', label: 'Medium Trip (5 - 15 km)', minKm: 5, maxKm: 15, ratePerKmUgx: 1000 },
              { id: 'b3', label: 'Long Trip (15+ km)', minKm: 15, maxKm: null, ratePerKmUgx: 900 },
            ],
          },
          express_delivery: {
            baseFeeUgx: 3500,
            minimumFeeUgx: 5000,
            freeWeightKg: 5,
            perKgSurchargeUgx: 500,
            expressPriorityMultiplier: 1.25,
            multiStopFeeUgx: 2000,
            calculationMode: 'BAND_MATCH',
            distanceBands: [
              { id: 'd1', label: '0 - 5 km', minKm: 0, maxKm: 5, ratePerKmUgx: 1000 },
              { id: 'd2', label: '5 - 15 km', minKm: 5, maxKm: 15, ratePerKmUgx: 900 },
              { id: 'd3', label: '15+ km', minKm: 15, maxKm: null, ratePerKmUgx: 800 },
            ],
          },
        },
        pricing_version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'veh_go',
        code: 'go',
        name: 'Safaris Go',
        category: 'Sedan / Economy',
        make: 'Toyota',
        model: 'Ist / Vitz',
        description: 'Affordable everyday air-conditioned rides across Kampala',
        image_url: '',
        icon_name: 'directions_car',
        passenger_capacity: 4,
        luggage_capacity: 2,
        max_weight_kg: 50,
        eta_minutes: 4,
        is_available: true,
        is_active: true,
        display_order: 2,
        assigned_services: ['ride_hailing', 'airport_shuttle'],
        service_pricing: {
          ride_hailing: {
            baseFareUgx: 4000,
            minimumFareUgx: 7000,
            perMinuteUgx: 150,
            waitingFeePerMinUgx: 200,
            bookingFeeUgx: 0,
            cancellationFeeUgx: 2500,
            nightSurchargeUgx: 2000,
            peakMultiplier: 1.0,
            calculationMode: 'BAND_MATCH',
            distanceBands: [
              { id: 'b1', label: 'Short Trip (0 - 5 km)', minKm: 0, maxKm: 5, ratePerKmUgx: 2200 },
              { id: 'b2', label: 'Medium Trip (5 - 15 km)', minKm: 5, maxKm: 15, ratePerKmUgx: 1900 },
              { id: 'b3', label: 'Long Trip (15+ km)', minKm: 15, maxKm: null, ratePerKmUgx: 1700 },
            ],
          },
          airport_shuttle: {
            baseFareUgx: 15000,
            minimumFareUgx: 85000,
            perKmUgx: 2200,
            extraPassengerFeeUgx: 0,
            extraLuggageFeeUgx: 5000,
            waitingFeePerMinUgx: 300,
            roundTripMultiplier: 1.85,
            fixedRoutes: {
              kampala_ebb: 95000,
              entebbe_ebb: 35000,
              mukono_ebb: 130000,
              jinja_ebb: 240000,
            },
          },
        },
        pricing_version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'veh_comfort',
        code: 'comfort',
        name: 'Safaris Comfort',
        category: 'Comfort / Executive',
        make: 'Toyota',
        model: 'Premio / Wish',
        description: 'Premium air-conditioned sedans & top-rated executive drivers',
        image_url: '',
        icon_name: 'car_rental',
        passenger_capacity: 4,
        luggage_capacity: 3,
        max_weight_kg: 75,
        eta_minutes: 5,
        is_available: true,
        is_active: true,
        display_order: 3,
        assigned_services: ['ride_hailing', 'airport_shuttle'],
        service_pricing: {
          ride_hailing: {
            baseFareUgx: 7000,
            minimumFareUgx: 12000,
            perMinuteUgx: 250,
            waitingFeePerMinUgx: 300,
            bookingFeeUgx: 0,
            cancellationFeeUgx: 4000,
            nightSurchargeUgx: 3000,
            peakMultiplier: 1.0,
            calculationMode: 'BAND_MATCH',
            distanceBands: [
              { id: 'b1', label: 'Short Trip (0 - 5 km)', minKm: 0, maxKm: 5, ratePerKmUgx: 3200 },
              { id: 'b2', label: 'Medium Trip (5 - 15 km)', minKm: 5, maxKm: 15, ratePerKmUgx: 2800 },
              { id: 'b3', label: 'Long Trip (15+ km)', minKm: 15, maxKm: null, ratePerKmUgx: 2500 },
            ],
          },
          airport_shuttle: {
            baseFareUgx: 25000,
            minimumFareUgx: 110000,
            perKmUgx: 2800,
            extraPassengerFeeUgx: 0,
            extraLuggageFeeUgx: 5000,
            waitingFeePerMinUgx: 400,
            roundTripMultiplier: 1.85,
            fixedRoutes: {
              kampala_ebb: 110000,
              entebbe_ebb: 45000,
              mukono_ebb: 150000,
              jinja_ebb: 280000,
            },
          },
        },
        pricing_version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'veh_safari_4x4',
        code: 'safari4x4',
        name: 'Safari Prado 4x4',
        category: 'SUV / 4x4',
        make: 'Toyota',
        model: 'Land Cruiser Prado TX',
        description: 'Rugged 4x4 Land Cruiser with pop-up roof for national parks & executive transfers',
        image_url: '',
        icon_name: 'airport_shuttle',
        passenger_capacity: 6,
        luggage_capacity: 6,
        max_weight_kg: 150,
        eta_minutes: 12,
        is_available: true,
        is_active: true,
        display_order: 4,
        assigned_services: ['ride_hailing', 'airport_shuttle', 'tours'],
        service_pricing: {
          ride_hailing: {
            baseFareUgx: 35000,
            minimumFareUgx: 50000,
            perMinuteUgx: 400,
            waitingFeePerMinUgx: 500,
            bookingFeeUgx: 0,
            cancellationFeeUgx: 10000,
            nightSurchargeUgx: 5000,
            peakMultiplier: 1.0,
            calculationMode: 'BAND_MATCH',
            distanceBands: [
              { id: 'b1', label: 'Short Trip (0 - 5 km)', minKm: 0, maxKm: 5, ratePerKmUgx: 6500 },
              { id: 'b2', label: 'Medium Trip (5 - 15 km)', minKm: 5, maxKm: 15, ratePerKmUgx: 5800 },
              { id: 'b3', label: 'Long Trip (15+ km)', minKm: 15, maxKm: null, ratePerKmUgx: 5200 },
            ],
          },
          airport_shuttle: {
            baseFareUgx: 50000,
            minimumFareUgx: 180000,
            perKmUgx: 4500,
            extraPassengerFeeUgx: 10000,
            extraLuggageFeeUgx: 10000,
            waitingFeePerMinUgx: 600,
            roundTripMultiplier: 1.85,
            fixedRoutes: {
              kampala_ebb: 180000,
              entebbe_ebb: 80000,
              mukono_ebb: 220000,
              jinja_ebb: 380000,
            },
          },
          tours: {
            dailyHireRateUgx: 350000,
            perKmRateUgx: 2500,
            driverAllowancePerDayUgx: 50000,
            includedKmPerDay: 150,
          },
        },
        pricing_version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'veh_tour_van',
        code: 'tour_van',
        name: 'Safaris Tour Van',
        category: 'Safari Van',
        make: 'Toyota',
        model: 'HiAce Super Custom 4WD',
        description: 'Pop-up roof 9-seater safari van for group expeditions & airport transfers',
        image_url: '',
        icon_name: 'rv_hookup',
        passenger_capacity: 9,
        luggage_capacity: 10,
        max_weight_kg: 250,
        eta_minutes: 15,
        is_available: true,
        is_active: true,
        display_order: 5,
        assigned_services: ['airport_shuttle', 'tours'],
        service_pricing: {
          airport_shuttle: {
            baseFareUgx: 65000,
            minimumFareUgx: 220000,
            perKmUgx: 5500,
            extraPassengerFeeUgx: 10000,
            extraLuggageFeeUgx: 10000,
            waitingFeePerMinUgx: 800,
            roundTripMultiplier: 1.85,
            fixedRoutes: {
              kampala_ebb: 220000,
              entebbe_ebb: 100000,
              mukono_ebb: 260000,
              jinja_ebb: 450000,
            },
          },
          tours: {
            dailyHireRateUgx: 420000,
            perKmRateUgx: 3000,
            driverAllowancePerDayUgx: 60000,
            includedKmPerDay: 150,
          },
        },
        pricing_version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'veh_delivery_van',
        code: 'delivery_van',
        name: 'Safaris Cargo Van',
        category: 'Pickup / Delivery Van',
        make: 'Toyota',
        model: 'TownAce Cargo',
        description: ' Enclosed weather-proof cargo van for boxes, electronics & heavy merchandise up to 500kg',
        image_url: '',
        icon_name: 'local_shipping',
        passenger_capacity: 2,
        luggage_capacity: 15,
        max_weight_kg: 500,
        eta_minutes: 10,
        is_available: true,
        is_active: true,
        display_order: 6,
        assigned_services: ['express_delivery'],
        service_pricing: {
          express_delivery: {
            baseFeeUgx: 12000,
            minimumFeeUgx: 18000,
            freeWeightKg: 25,
            perKgSurchargeUgx: 400,
            expressPriorityMultiplier: 1.25,
            multiStopFeeUgx: 5000,
            calculationMode: 'BAND_MATCH',
            distanceBands: [
              { id: 'd1', label: '0 - 5 km', minKm: 0, maxKm: 5, ratePerKmUgx: 2500 },
              { id: 'd2', label: '5 - 15 km', minKm: 5, maxKm: 15, ratePerKmUgx: 2200 },
              { id: 'd3', label: '15+ km', minKm: 15, maxKm: null, ratePerKmUgx: 1900 },
            ],
          },
        },
        pricing_version: 1,
        created_at: now,
        updated_at: now,
      },
    ];
  }

  private static getDefaultServicePricingRules(): Record<string, any> {
    return {
      ride_hailing: {
        serviceName: 'Ride-Hailing',
        isEnabled: true,
        currency: 'UGX',
        defaultCalculationMode: 'BAND_MATCH',
        nightHoursStart: 22,
        nightHoursEnd: 5,
        nightSurchargeEnabled: false,
        peakMultiplier: 1.0,
        waitingGracePeriodMinutes: 5,
      },
      airport_shuttle: {
        serviceName: 'Airport Shuttle',
        isEnabled: true,
        currency: 'UGX',
        supportedAirports: [
          { code: 'EBB', name: 'Entebbe International Airport', city: 'Entebbe', latitude: 0.0444, longitude: 32.4469 },
          { code: 'KJJ', name: 'Kajjansi Airfield', city: 'Kajjansi', latitude: 0.1972, longitude: 32.5525 },
        ],
        routes: [
          { id: 'kampala_ebb', name: 'Kampala City ⇄ Entebbe Airport (EBB)', distanceKm: 42, defaultMinutes: 55 },
          { id: 'entebbe_ebb', name: 'Entebbe Town ⇄ Entebbe Airport (EBB)', distanceKm: 8, defaultMinutes: 15 },
          { id: 'mukono_ebb', name: 'Mukono ⇄ Entebbe Airport (EBB)', distanceKm: 64, defaultMinutes: 85 },
          { id: 'jinja_ebb', name: 'Jinja Nile Source ⇄ Entebbe Airport (EBB)', distanceKm: 122, defaultMinutes: 160 },
        ],
        includedLuggageCount: 2,
        extraLuggageFeeUgx: 5000,
        roundTripDiscountPercent: 15,
      },
      express_delivery: {
        serviceName: 'Express Delivery',
        isEnabled: true,
        currency: 'UGX',
        categorySurchargesUgx: {
          DOCUMENTS: 0,
          ELECTRONICS: 2500,
          FOOD_AND_PERISHABLES: 1500,
          GENERAL_MERCHANDISE: 2000,
          HEAVY_CARGO: 8000,
        },
        sizeSurchargesUgx: {
          SMALL: 0,
          MEDIUM: 2000,
          LARGE: 5000,
          EXTRA_LARGE: 10000,
        },
        expressPriorityMultiplier: 1.25,
      },
      tour_guides: {
        serviceName: 'Certified Tour Guides',
        isEnabled: true,
        currency: 'UGX',
        defaultDailyRateUgx: 150000,
        defaultMultiDayRateUgx: 140000,
        groupSizeThreshold: 6,
        extraTouristGuideSurchargeUgx: 20000,
      },
    };
  }

  public static async init(): Promise<void> {
    if (this.isInitialized) return;

    // 1. Seed default catalogue vehicles if none exist yet
    if (localStore.catalogue_vehicles.size === 0) {
      const defaults = this.getDefaultCatalogueVehicles();
      for (const veh of defaults) {
        await db.persistCatalogueVehicle(veh);
      }
    }

    // 2. Seed default service pricing rules if none exist yet
    const defaultRules = this.getDefaultServicePricingRules();
    for (const [key, config] of Object.entries(defaultRules)) {
      if (!localStore.service_pricing_rules.has(key)) {
        await db.persistServicePricingRule({
          service_key: key,
          config,
          pricing_version: 1,
          updated_by: 'SYSTEM_INIT',
          updated_at: new Date().toISOString(),
        });
      }
    }

    this.isInitialized = true;
  }

  /**
   * Validates distance bands to prevent negative values or overlapping ranges.
   */
  public static validateDistanceBands(bands: DistanceBand[]): DistanceBand[] {
    if (!Array.isArray(bands) || bands.length === 0) {
      throw new Error('At least one distance pricing band must be configured.');
    }

    const normalized = bands.map((b, idx) => {
      const minKm = Number(b.minKm);
      const maxKm = b.maxKm === null || b.maxKm === undefined || String(b.maxKm).trim() === '' ? null : Number(b.maxKm);
      const ratePerKmUgx = Math.round(Number(b.ratePerKmUgx));

      if (!Number.isFinite(minKm) || minKm < 0) {
        throw new Error(`Distance band #${idx + 1} has an invalid minKm (${b.minKm}). Must be >= 0.`);
      }
      if (maxKm !== null && (!Number.isFinite(maxKm) || maxKm <= minKm)) {
        throw new Error(`Distance band #${idx + 1} maxKm (${maxKm}) must be greater than minKm (${minKm}).`);
      }
      if (!Number.isFinite(ratePerKmUgx) || ratePerKmUgx < 0) {
        throw new Error(`Distance band #${idx + 1} ratePerKmUgx (${b.ratePerKmUgx}) cannot be negative.`);
      }

      return {
        id: b.id || `band_${idx + 1}`,
        label: b.label || (maxKm !== null ? `${minKm} - ${maxKm} km` : `${minKm}+ km`),
        minKm,
        maxKm,
        ratePerKmUgx,
      };
    });

    normalized.sort((a, b) => a.minKm - b.minKm);

    for (let i = 0; i < normalized.length - 1; i++) {
      const curr = normalized[i];
      const next = normalized[i + 1];
      if (curr.maxKm === null) {
        throw new Error(`Open-ended distance band (${curr.minKm}+ km) must be the final band.`);
      }
      if (curr.maxKm > next.minKm) {
        throw new Error(
          `Overlapping distance bands detected: [${curr.minKm} - ${curr.maxKm} km] overlaps with [${next.minKm} - ${next.maxKm ?? '∞'} km].`
        );
      }
    }

    return normalized;
  }

  /**
   * Validates tourist-count pricing tiers to prevent overlapping tourist ranges or negative prices.
   */
  public static validateTouristPricingTiers(tiers: TouristPricingTier[]): TouristPricingTier[] {
    if (!Array.isArray(tiers) || tiers.length === 0) return [];

    const normalized = tiers.map((t, idx) => {
      const minTourists = Math.floor(Number(t.minTourists));
      const maxTourists =
        t.maxTourists === null || t.maxTourists === undefined || String(t.maxTourists).trim() === ''
          ? null
          : Math.floor(Number(t.maxTourists));
      const priceUgx = Math.round(Number(t.priceUgx));
      const extraPersonChargeUgx = Math.round(Number(t.extraPersonChargeUgx || 0));
      const pricingMode: 'PER_PERSON' | 'GROUP_TOTAL' =
        t.pricingMode === 'GROUP_TOTAL' ? 'GROUP_TOTAL' : 'PER_PERSON';

      if (!Number.isFinite(minTourists) || minTourists < 1) {
        throw new Error(`Tourist pricing tier #${idx + 1} minTourists must be at least 1.`);
      }
      if (maxTourists !== null && (!Number.isFinite(maxTourists) || maxTourists < minTourists)) {
        throw new Error(
          `Tourist pricing tier #${idx + 1} maxTourists (${maxTourists}) must be >= minTourists (${minTourists}).`
        );
      }
      if (!Number.isFinite(priceUgx) || priceUgx <= 0) {
        throw new Error(`Tourist pricing tier #${idx + 1} priceUgx must be greater than 0.`);
      }
      if (extraPersonChargeUgx < 0) {
        throw new Error(`Tourist pricing tier #${idx + 1} extraPersonChargeUgx cannot be negative.`);
      }

      return {
        id: t.id || `tier_${idx + 1}`,
        minTourists,
        maxTourists,
        priceUgx,
        pricingMode,
        extraPersonChargeUgx,
        currency: 'UGX',
        notes: t.notes || '',
      };
    });

    normalized.sort((a, b) => a.minTourists - b.minTourists);

    for (let i = 0; i < normalized.length - 1; i++) {
      const curr = normalized[i];
      const next = normalized[i + 1];
      if (curr.maxTourists === null) {
        throw new Error(`Open-ended tourist tier (${curr.minTourists}+ tourists) must be the last tier.`);
      }
      if (curr.maxTourists >= next.minTourists) {
        throw new Error(
          `Overlapping tourist count pricing tiers detected: [${curr.minTourists}–${curr.maxTourists} tourists] overlaps with [${next.minTourists}–${next.maxTourists ?? '∞'} tourists].`
        );
      }
    }

    return normalized;
  }

  /**
   * Computes distance charge using configured distance bands and calculation mode.
   */
  public static calculateDistanceBandCharge(
    distanceKm: number,
    bands: DistanceBand[],
    mode: 'BAND_MATCH' | 'PROGRESSIVE' = 'BAND_MATCH'
  ): { distanceChargeUgx: number; appliedBandLabel: string } {
    const cleanDist = Math.max(0, Number(distanceKm) || 0);
    if (cleanDist === 0 || !bands || bands.length === 0) {
      return { distanceChargeUgx: 0, appliedBandLabel: '0 km' };
    }

    const sorted = [...bands].sort((a, b) => a.minKm - b.minKm);

    if (mode === 'PROGRESSIVE') {
      let total = 0;
      const labels: string[] = [];
      for (const band of sorted) {
        if (cleanDist <= band.minKm) break;
        const upper = band.maxKm !== null ? Math.min(cleanDist, band.maxKm) : cleanDist;
        const sliceKm = Math.max(0, upper - band.minKm);
        if (sliceKm > 0) {
          total += sliceKm * band.ratePerKmUgx;
          labels.push(`${sliceKm.toFixed(1)}km @ ${band.ratePerKmUgx}/km`);
        }
      }
      return {
        distanceChargeUgx: Math.round(total),
        appliedBandLabel: labels.join(' + ') || 'Progressive Distance',
      };
    }

    // Default: BAND_MATCH (selects the band into which the total distance falls)
    let matched = sorted[sorted.length - 1];
    for (const band of sorted) {
      const aboveMin = cleanDist >= band.minKm;
      const belowMax = band.maxKm === null || cleanDist <= band.maxKm;
      if (aboveMin && belowMax) {
        matched = band;
        break;
      }
    }

    return {
      distanceChargeUgx: Math.round(cleanDist * matched.ratePerKmUgx),
      appliedBandLabel: `${matched.label || `${matched.minKm}-${matched.maxKm ?? '∞'} km`} (${matched.ratePerKmUgx.toLocaleString()} UGX/km)`,
    };
  }

  // ---------------------------------------------------------------------------
  // Catalogue Vehicles CRUD & Service-Specific Eligibility Filtering
  // ---------------------------------------------------------------------------
  public static getAllCatalogueVehicles(options?: {
    service?: ServiceAssignmentKey | string;
    includeInactive?: boolean;
  }): CatalogueVehicle[] {
    if (!this.isInitialized && localStore.catalogue_vehicles.size === 0) {
      const defaults = this.getDefaultCatalogueVehicles();
      for (const v of defaults) {
        localStore.catalogue_vehicles.set(v.id, v);
      }
    }

    let list = Array.from(localStore.catalogue_vehicles.values()) as CatalogueVehicle[];

    if (!options?.includeInactive) {
      list = list.filter((v) => v.is_active !== false && v.is_available !== false);
    }

    if (options?.service) {
      const targetService = String(options.service).toLowerCase().trim() as ServiceAssignmentKey;
      list = list.filter(
        (v) => Array.isArray(v.assigned_services) && v.assigned_services.includes(targetService)
      );
    }

    list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return list;
  }

  public static getCatalogueVehicleByIdOrCode(idOrCode: string): CatalogueVehicle | null {
    if (!idOrCode) return null;
    const direct = localStore.catalogue_vehicles.get(idOrCode);
    if (direct) return direct;

    const norm = String(idOrCode).toLowerCase().trim();
    const alias = norm === 'economy' ? 'go' : norm === 'safari_4x4' || norm === 'safari' ? 'safari4x4' : norm === 'tourvan' ? 'tour_van' : norm;

    for (const v of localStore.catalogue_vehicles.values()) {
      const vCode = String(v.code || '').toLowerCase().trim();
      const vId = String(v.id || '').toLowerCase().trim();
      if (vCode === norm || vCode === alias || vId === norm || vId === `veh_${norm}`) {
        return v;
      }
    }
    return null;
  }

  public static async upsertCatalogueVehicle(data: Partial<CatalogueVehicle> & { name: string }): Promise<CatalogueVehicle> {
    const id = data.id || `veh_${(data.code || data.name).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 24)}_${uuidv4().slice(0, 4)}`;
    const existing = localStore.catalogue_vehicles.get(id);

    const code = (data.code || existing?.code || id.replace(/^veh_/, '')).trim();
    const validServices: ServiceAssignmentKey[] = ['ride_hailing', 'airport_shuttle', 'tours', 'express_delivery'];
    const assignedServices: ServiceAssignmentKey[] = Array.isArray(data.assigned_services)
      ? (data.assigned_services.filter((s) => validServices.includes(s as ServiceAssignmentKey)) as ServiceAssignmentKey[])
      : existing?.assigned_services || [];

    const servicePricing = {
      ...(existing?.service_pricing || {}),
      ...(data.service_pricing || {}),
    };

    if (servicePricing.ride_hailing?.distanceBands) {
      servicePricing.ride_hailing.distanceBands = this.validateDistanceBands(servicePricing.ride_hailing.distanceBands);
    }
    if (servicePricing.express_delivery?.distanceBands) {
      servicePricing.express_delivery.distanceBands = this.validateDistanceBands(servicePricing.express_delivery.distanceBands);
    }

    const now = new Date().toISOString();
    const vehicle: CatalogueVehicle = {
      id,
      code,
      name: String(data.name || existing?.name || 'Safari Vehicle').trim(),
      category: String(data.category || existing?.category || 'Sedan / Economy').trim(),
      make: String(data.make ?? existing?.make ?? '').trim(),
      model: String(data.model ?? existing?.model ?? '').trim(),
      description: String(data.description ?? existing?.description ?? '').trim(),
      image_url: String(data.image_url ?? (data as any).imageUrl ?? existing?.image_url ?? '').trim(),
      icon_name: String(data.icon_name ?? (data as any).iconName ?? existing?.icon_name ?? 'directions_car').trim(),
      passenger_capacity: Math.max(1, Number(data.passenger_capacity ?? (data as any).passengerCapacity ?? existing?.passenger_capacity ?? 4)),
      luggage_capacity: Math.max(0, Number(data.luggage_capacity ?? (data as any).luggageCapacity ?? existing?.luggage_capacity ?? 2)),
      max_weight_kg: Math.max(0, Number(data.max_weight_kg ?? (data as any).maxWeightKg ?? existing?.max_weight_kg ?? 50)),
      eta_minutes: Math.max(1, Number(data.eta_minutes ?? (data as any).etaMinutes ?? existing?.eta_minutes ?? 5)),
      is_available: data.is_available !== undefined ? Boolean(data.is_available) : (existing ? existing.is_available : true),
      is_active: data.is_active !== undefined ? Boolean(data.is_active) : (existing ? existing.is_active : true),
      display_order: Number(data.display_order ?? (data as any).displayOrder ?? existing?.display_order ?? localStore.catalogue_vehicles.size + 1),
      assigned_services: assignedServices,
      service_pricing: servicePricing,
      pricing_version: Number(existing?.pricing_version || 0) + 1,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    await db.persistCatalogueVehicle(vehicle);
    broadcastConfigUpdate({ type: 'CATALOGUE_VEHICLES_UPDATED', vehicleId: vehicle.id, pricingVersion: vehicle.pricing_version });
    return vehicle;
  }

  public static async deleteCatalogueVehicle(id: string): Promise<{ deleted: boolean; id: string }> {
    if (!localStore.catalogue_vehicles.has(id)) {
      throw new Error(`Vehicle '${id}' not found in centralized catalogue.`);
    }
    await db.deleteCatalogueVehicle(id);
    broadcastConfigUpdate({ type: 'CATALOGUE_VEHICLES_DELETED', vehicleId: id });
    return { deleted: true, id };
  }

  // ---------------------------------------------------------------------------
  // Service Pricing Rules Management
  // ---------------------------------------------------------------------------
  public static getAllServicePricingRules(): Record<string, any> {
    const defaults = this.getDefaultServicePricingRules();
    const out: Record<string, any> = { ...defaults };
    for (const [key, entry] of localStore.service_pricing_rules.entries()) {
      out[key] = {
        ...(defaults[key] || {}),
        ...(entry.config || {}),
        pricingVersion: entry.pricing_version || 1,
        updatedAt: entry.updated_at,
      };
    }
    return out;
  }

  public static async updateServicePricingRule(
    serviceKey: string,
    config: Record<string, any>,
    adminId = 'ADMIN'
  ): Promise<any> {
    const existing = localStore.service_pricing_rules.get(serviceKey);
    const nextVersion = Number(existing?.pricing_version || 0) + 1;
    const mergedConfig = {
      ...(existing?.config || {}),
      ...config,
    };

    const record = {
      service_key: serviceKey,
      config: mergedConfig,
      pricing_version: nextVersion,
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    };

    await db.persistServicePricingRule(record);
    broadcastConfigUpdate({ type: 'SERVICE_PRICING_UPDATED', serviceKey, pricingVersion: nextVersion });
    return record;
  }

  // ---------------------------------------------------------------------------
  // Centralized Server-Side Quotation Engine (Phase 11)
  // ---------------------------------------------------------------------------
  public static async calculateQuote(params: {
    serviceType: QuoteServiceType | string;
    vehicleId?: string;
    vehicleTier?: string;
    destinationId?: string;
    packageId?: string;
    guideId?: string;
    guestCount?: number;
    durationDays?: number;
    distanceKm?: number;
    durationMinutes?: number;
    waitingMinutes?: number;
    weightKg?: number;
    packageCategory?: string;
    packageSize?: string;
    isExpressPriority?: boolean;
    stopsCount?: number;
    routeCode?: string;
    isRoundTrip?: boolean;
    extraLuggageCount?: number;
    selectedAdditionalChargeIds?: string[];
  }): Promise<PriceQuotationResult> {
    await this.init();

    const rawType = String(params.serviceType || 'RIDE').toUpperCase().trim();
    const serviceType: QuoteServiceType =
      rawType === 'AIRPORT_SHUTTLE' || rawType === 'AIRPORT_PICKUP' || rawType === 'SHUTTLE'
        ? 'AIRPORT_SHUTTLE'
        : rawType === 'TOUR' || rawType === 'SAFARI' || rawType === 'TOURISM'
        ? 'TOUR'
        : rawType === 'DELIVERY' || rawType === 'EXPRESS_DELIVERY'
        ? 'DELIVERY'
        : 'RIDE';

    const guestCount = Math.max(1, Math.floor(Number(params.guestCount || 1)));
    const distanceKm = Math.max(0, Number(params.distanceKm || 0));
    const weightKg = Math.max(0, Number(params.weightKg || 0));
    let durationDays = Math.max(1, Math.floor(Number(params.durationDays || 1)));

    const breakdown: QuoteBreakdownItem[] = [];
    let basePriceUgx = 0;
    let distancePriceUgx = 0;
    let vehicleChargeUgx = 0;
    let touristCountChargeUgx = 0;
    let tourGuideFeeUgx = 0;
    let additionalChargesUgx = 0;
    let discountsUgx = 0;
    const taxesUgx = 0;

    let resolvedVehicle: CatalogueVehicle | null = null;
    const vehicleLookup = params.vehicleId || params.vehicleTier || '';
    if (vehicleLookup) {
      resolvedVehicle = this.getCatalogueVehicleByIdOrCode(vehicleLookup);
    }

    let pricingVersion = 1;

    // =========================================================================
    // 1. RIDE-HAILING QUOTATION
    // =========================================================================
    if (serviceType === 'RIDE') {
      const eligibleRideVehicles = this.getAllCatalogueVehicles({ service: 'ride_hailing' });
      if (!resolvedVehicle) {
        resolvedVehicle = eligibleRideVehicles[0] || this.getCatalogueVehicleByIdOrCode('go');
      }
      if (!resolvedVehicle) {
        throw new Error('No active vehicle available for Ride-Hailing.');
      }
      if (!resolvedVehicle.assigned_services.includes('ride_hailing') || !resolvedVehicle.is_active || !resolvedVehicle.is_available) {
        throw new Error(`Vehicle '${resolvedVehicle.name}' is not assigned or available for Ride-Hailing service.`);
      }

      pricingVersion = resolvedVehicle.pricing_version || 1;
      const rhConfig = resolvedVehicle.service_pricing?.ride_hailing || {
        baseFareUgx: 4000,
        minimumFareUgx: 6000,
        perMinuteUgx: 150,
        waitingFeePerMinUgx: 200,
        bookingFeeUgx: 0,
        cancellationFeeUgx: 2000,
        nightSurchargeUgx: 0,
        peakMultiplier: 1.0,
        calculationMode: 'BAND_MATCH' as const,
        distanceBands: [
          { minKm: 0, maxKm: 5, ratePerKmUgx: 2200 },
          { minKm: 5, maxKm: 15, ratePerKmUgx: 1900 },
          { minKm: 15, maxKm: null, ratePerKmUgx: 1700 },
        ],
      };

      basePriceUgx = Math.round(Number(rhConfig.baseFareUgx || 0));
      breakdown.push({
        code: 'BASE_FARE',
        label: `${resolvedVehicle.name} Base Fare`,
        amountUgx: basePriceUgx,
      });

      const effDistKm = distanceKm > 0 ? distanceKm : 3.0;
      const { distanceChargeUgx, appliedBandLabel } = this.calculateDistanceBandCharge(
        effDistKm,
        rhConfig.distanceBands || [],
        rhConfig.calculationMode || 'BAND_MATCH'
      );
      distancePriceUgx = distanceChargeUgx;
      breakdown.push({
        code: 'DISTANCE_CHARGE',
        label: `Distance Charge (${effDistKm.toFixed(1)} km)`,
        amountUgx: distancePriceUgx,
        details: appliedBandLabel,
      });

      if (params.durationMinutes && params.durationMinutes > 0 && rhConfig.perMinuteUgx > 0) {
        const timeFee = Math.round(params.durationMinutes * rhConfig.perMinuteUgx);
        additionalChargesUgx += timeFee;
        breakdown.push({
          code: 'DURATION_FEE',
          label: `Duration (${params.durationMinutes} mins)`,
          amountUgx: timeFee,
        });
      }

      if (params.waitingMinutes && params.waitingMinutes > 0 && rhConfig.waitingFeePerMinUgx > 0) {
        const waitFee = Math.round(params.waitingMinutes * rhConfig.waitingFeePerMinUgx);
        additionalChargesUgx += waitFee;
        breakdown.push({
          code: 'WAITING_FEE',
          label: `Waiting Time (${params.waitingMinutes} mins)`,
          amountUgx: waitFee,
        });
      }

      if (rhConfig.bookingFeeUgx && rhConfig.bookingFeeUgx > 0) {
        additionalChargesUgx += Math.round(rhConfig.bookingFeeUgx);
        breakdown.push({
          code: 'BOOKING_FEE',
          label: 'Platform Booking Fee',
          amountUgx: Math.round(rhConfig.bookingFeeUgx),
        });
      }

      let rawSubtotal = basePriceUgx + distancePriceUgx + additionalChargesUgx;
      if (rhConfig.peakMultiplier && rhConfig.peakMultiplier > 1.0) {
        const surgeFee = Math.round(rawSubtotal * (rhConfig.peakMultiplier - 1.0));
        additionalChargesUgx += surgeFee;
        rawSubtotal += surgeFee;
        breakdown.push({
          code: 'PEAK_SURCHARGE',
          label: `Peak Demand Multiplier (${rhConfig.peakMultiplier}x)`,
          amountUgx: surgeFee,
        });
      }

      if (rawSubtotal < (rhConfig.minimumFareUgx || 0)) {
        const minTopUp = Math.round(rhConfig.minimumFareUgx - rawSubtotal);
        basePriceUgx += minTopUp;
        breakdown.push({
          code: 'MINIMUM_FARE_ADJUSTMENT',
          label: 'Minimum Fare Guarantee Adjustment',
          amountUgx: minTopUp,
        });
      }
    }

    // =========================================================================
    // 2. AIRPORT SHUTTLE QUOTATION
    // =========================================================================
    else if (serviceType === 'AIRPORT_SHUTTLE') {
      const eligibleShuttleVehicles = this.getAllCatalogueVehicles({ service: 'airport_shuttle' });
      if (!resolvedVehicle) {
        resolvedVehicle = eligibleShuttleVehicles[0] || this.getCatalogueVehicleByIdOrCode('comfort');
      }
      if (!resolvedVehicle) {
        throw new Error('No active vehicle available for Airport Shuttle.');
      }
      if (!resolvedVehicle.assigned_services.includes('airport_shuttle') || !resolvedVehicle.is_active || !resolvedVehicle.is_available) {
        throw new Error(`Vehicle '${resolvedVehicle.name}' is not assigned or available for Airport Shuttle service.`);
      }

      pricingVersion = resolvedVehicle.pricing_version || 1;
      const asConfig = resolvedVehicle.service_pricing?.airport_shuttle || {
        baseFareUgx: 25000,
        minimumFareUgx: 95000,
        perKmUgx: 2500,
        extraPassengerFeeUgx: 0,
        extraLuggageFeeUgx: 5000,
        waitingFeePerMinUgx: 300,
        roundTripMultiplier: 1.85,
        fixedRoutes: { kampala_ebb: 110000 },
      };

      const routeKey = (params.routeCode || '').toLowerCase().trim();
      if (routeKey && asConfig.fixedRoutes && asConfig.fixedRoutes[routeKey]) {
        basePriceUgx = Math.round(Number(asConfig.fixedRoutes[routeKey]));
        breakdown.push({
          code: 'AIRPORT_FIXED_ROUTE',
          label: `Airport Shuttle Route (${routeKey.toUpperCase()}) • ${resolvedVehicle.name}`,
          amountUgx: basePriceUgx,
        });
      } else {
        basePriceUgx = Math.round(Number(asConfig.baseFareUgx || 25000));
        const effDist = distanceKm > 0 ? distanceKm : 40;
        distancePriceUgx = Math.round(effDist * Number(asConfig.perKmUgx || 2500));
        if (basePriceUgx + distancePriceUgx < (asConfig.minimumFareUgx || 0)) {
          basePriceUgx = Math.round(asConfig.minimumFareUgx - distancePriceUgx);
        }
        breakdown.push({
          code: 'SHUTTLE_BASE',
          label: `${resolvedVehicle.name} Airport Transfer Base`,
          amountUgx: basePriceUgx,
        });
        breakdown.push({
          code: 'SHUTTLE_DISTANCE',
          label: `Airport Corridor Distance (${effDist.toFixed(1)} km)`,
          amountUgx: distancePriceUgx,
        });
      }

      if (params.extraLuggageCount && params.extraLuggageCount > 0 && asConfig.extraLuggageFeeUgx > 0) {
        const lugFee = Math.round(params.extraLuggageCount * asConfig.extraLuggageFeeUgx);
        additionalChargesUgx += lugFee;
        breakdown.push({
          code: 'EXTRA_LUGGAGE',
          label: `Extra Luggage (${params.extraLuggageCount} bag(s))`,
          amountUgx: lugFee,
        });
      }

      if (params.isRoundTrip) {
        const mult = Number(asConfig.roundTripMultiplier || 1.85);
        const returnAddition = Math.round((basePriceUgx + distancePriceUgx) * (mult - 1.0));
        vehicleChargeUgx += returnAddition;
        breakdown.push({
          code: 'ROUND_TRIP',
          label: `Return Airport Transfer Included (${mult}x)`,
          amountUgx: returnAddition,
        });
      }
    }

    // =========================================================================
    // 3. EXPRESS DELIVERY QUOTATION
    // =========================================================================
    else if (serviceType === 'DELIVERY') {
      const eligibleDeliveryVehicles = this.getAllCatalogueVehicles({ service: 'express_delivery' });
      if (!resolvedVehicle) {
        resolvedVehicle =
          weightKg > 15
            ? eligibleDeliveryVehicles.find((v) => v.max_weight_kg >= weightKg) || eligibleDeliveryVehicles[0]
            : eligibleDeliveryVehicles[0];
      }
      if (!resolvedVehicle) {
        throw new Error('No active vehicle available for Express Delivery.');
      }
      if (!resolvedVehicle.assigned_services.includes('express_delivery') || !resolvedVehicle.is_active || !resolvedVehicle.is_available) {
        throw new Error(`Vehicle '${resolvedVehicle.name}' is not assigned or available for Express Delivery service.`);
      }
      if (weightKg > resolvedVehicle.max_weight_kg) {
        throw new Error(
          `Package weight (${weightKg} kg) exceeds maximum capacity (${resolvedVehicle.max_weight_kg} kg) for ${resolvedVehicle.name}.`
        );
      }

      pricingVersion = resolvedVehicle.pricing_version || 1;
      const delConfig = resolvedVehicle.service_pricing?.express_delivery || {
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

      const globalDelRules = this.getAllServicePricingRules().express_delivery || {};

      basePriceUgx = Math.round(Number(delConfig.baseFeeUgx || 3500));
      breakdown.push({
        code: 'DELIVERY_BASE',
        label: `${resolvedVehicle.name} Base Dispatch Fee`,
        amountUgx: basePriceUgx,
      });

      const effDistKm = distanceKm > 0 ? distanceKm : 5.0;
      const { distanceChargeUgx, appliedBandLabel } = this.calculateDistanceBandCharge(
        effDistKm,
        delConfig.distanceBands || [],
        delConfig.calculationMode || 'BAND_MATCH'
      );
      distancePriceUgx = distanceChargeUgx;
      breakdown.push({
        code: 'DELIVERY_DISTANCE',
        label: `Transit Distance (${effDistKm.toFixed(1)} km)`,
        amountUgx: distancePriceUgx,
        details: appliedBandLabel,
      });

      // Weight surcharge above freeWeightKg
      const billableWeight = Math.max(0, weightKg - Number(delConfig.freeWeightKg || 5));
      if (billableWeight > 0 && delConfig.perKgSurchargeUgx > 0) {
        const weightFee = Math.round(billableWeight * delConfig.perKgSurchargeUgx);
        additionalChargesUgx += weightFee;
        breakdown.push({
          code: 'WEIGHT_SURCHARGE',
          label: `Weight Surcharge (${billableWeight.toFixed(1)} kg over ${delConfig.freeWeightKg} kg)`,
          amountUgx: weightFee,
        });
      }

      // Category surcharge
      const catKey = String(params.packageCategory || 'DOCUMENTS').toUpperCase().trim();
      const catSurcharges = globalDelRules.categorySurchargesUgx || {};
      const catFee = Math.round(Number(catSurcharges[catKey] || 0));
      if (catFee > 0) {
        additionalChargesUgx += catFee;
        breakdown.push({
          code: 'CATEGORY_HANDLING',
          label: `${catKey.replace(/_/g, ' ')} Handling Fee`,
          amountUgx: catFee,
        });
      }

      // Multi-stop fee
      const extraStops = Math.max(0, Math.floor(Number(params.stopsCount || 1)) - 1);
      if (extraStops > 0 && delConfig.multiStopFeeUgx > 0) {
        const stopFee = Math.round(extraStops * delConfig.multiStopFeeUgx);
        additionalChargesUgx += stopFee;
        breakdown.push({
          code: 'MULTI_STOP',
          label: `Additional Drop-off Stops (${extraStops})`,
          amountUgx: stopFee,
        });
      }

      // Priority multiplier
      if (params.isExpressPriority) {
        const mult = Number(delConfig.expressPriorityMultiplier || 1.25);
        const prioFee = Math.round((basePriceUgx + distancePriceUgx) * (mult - 1.0));
        additionalChargesUgx += prioFee;
        breakdown.push({
          code: 'PRIORITY_EXPRESS',
          label: 'Express Priority Dispatch',
          amountUgx: prioFee,
        });
      }

      const rawTotal = basePriceUgx + distancePriceUgx + additionalChargesUgx;
      if (rawTotal < (delConfig.minimumFeeUgx || 0)) {
        const minAdj = Math.round(delConfig.minimumFeeUgx - rawTotal);
        basePriceUgx += minAdj;
      }
    }

    // =========================================================================
    // 4. TOUR & SAFARI PACKAGE / DESTINATION QUOTATION (Phases 4, 6 & 10)
    // =========================================================================
    else if (serviceType === 'TOUR') {
      const pkg = params.packageId ? localStore.tour_packages.get(params.packageId) : null;
      const destId = params.destinationId || pkg?.destination_id || '';
      const dest = destId ? localStore.destinations.get(destId) : null;

      if (!pkg && !dest) {
        throw new Error('A valid Tour Package or Destination is required to calculate a Safari Tour quotation.');
      }

      if (dest && dest.publication_status && dest.publication_status !== 'PUBLISHED' && dest.is_active === false) {
        throw new Error(`Destination '${dest.title || dest.name}' is not currently published for booking.`);
      }
      if (pkg && pkg.publication_status && pkg.publication_status !== 'PUBLISHED' && pkg.is_active === false) {
        throw new Error(`Tour package '${pkg.title}' is not currently published for booking.`);
      }

      durationDays = Math.max(1, Number(pkg?.duration_days || params.durationDays || 1));
      pricingVersion = Number(pkg?.content_version || dest?.content_version || 1);

      // A. Tourist-Count Pricing Tier Evaluation
      const rawTiers: TouristPricingTier[] =
        (Array.isArray(pkg?.tourist_pricing_tiers) && pkg.tourist_pricing_tiers.length > 0
          ? pkg.tourist_pricing_tiers
          : Array.isArray(dest?.tourist_pricing_tiers) && dest.tourist_pricing_tiers.length > 0
          ? dest.tourist_pricing_tiers
          : []);

      const fallbackPerPerson = Math.round(
        Number(pkg?.price_per_person_ugx || dest?.base_price_ugx || 450000)
      );

      if (rawTiers.length > 0) {
        const sortedTiers = [...rawTiers].sort((a, b) => Number(a.minTourists) - Number(b.minTourists));
        let matchedTier: TouristPricingTier | null = null;

        for (const t of sortedTiers) {
          const minT = Number(t.minTourists || 1);
          const maxT = t.maxTourists === null || t.maxTourists === undefined ? null : Number(t.maxTourists);
          if (guestCount >= minT && (maxT === null || guestCount <= maxT)) {
            matchedTier = t;
            break;
          }
        }

        if (matchedTier) {
          if (matchedTier.pricingMode === 'GROUP_TOTAL') {
            touristCountChargeUgx = Math.round(Number(matchedTier.priceUgx));
            if (matchedTier.extraPersonChargeUgx && guestCount > matchedTier.minTourists) {
              const extraGuests = guestCount - matchedTier.minTourists;
              touristCountChargeUgx += Math.round(extraGuests * Number(matchedTier.extraPersonChargeUgx));
            }
            breakdown.push({
              code: 'TOURIST_TIER_GROUP',
              label: `Safari Tier (${matchedTier.minTourists}–${matchedTier.maxTourists ?? '+'} Tourists Group Rate)`,
              amountUgx: touristCountChargeUgx,
              details: matchedTier.notes || `${guestCount} traveler(s)`,
            });
          } else {
            // PER_PERSON mode
            touristCountChargeUgx = Math.round(Number(matchedTier.priceUgx) * guestCount);
            breakdown.push({
              code: 'TOURIST_TIER_PER_PERSON',
              label: `Safari Tier (${guestCount} × ${Number(matchedTier.priceUgx).toLocaleString()} UGX)`,
              amountUgx: touristCountChargeUgx,
              details: matchedTier.notes || `Tier ${matchedTier.minTourists}–${matchedTier.maxTourists ?? '+'} guests`,
            });
          }
        } else {
          // Exceeds highest tier: use highest tier + extraPersonChargeUgx
          const highestTier = sortedTiers[sortedTiers.length - 1];
          const highestMax = Number(highestTier.maxTourists || highestTier.minTourists);
          if (guestCount > highestMax) {
            const extraGuests = guestCount - highestMax;
            const extraRate = Number(highestTier.extraPersonChargeUgx || highestTier.priceUgx);
            const basePart =
              highestTier.pricingMode === 'GROUP_TOTAL'
                ? Number(highestTier.priceUgx)
                : Number(highestTier.priceUgx) * highestMax;
            touristCountChargeUgx = Math.round(basePart + extraGuests * extraRate);
            breakdown.push({
              code: 'TOURIST_TIER_EXTENDED',
              label: `Extended Group Rate (${guestCount} Tourists)`,
              amountUgx: touristCountChargeUgx,
            });
          } else {
            touristCountChargeUgx = Math.round(fallbackPerPerson * guestCount);
            breakdown.push({
              code: 'TOUR_BASE_PER_PERSON',
              label: `Safari Package (${guestCount} × ${fallbackPerPerson.toLocaleString()} UGX)`,
              amountUgx: touristCountChargeUgx,
            });
          }
        }
      } else {
        touristCountChargeUgx = Math.round(fallbackPerPerson * guestCount);
        breakdown.push({
          code: 'TOUR_BASE_PER_PERSON',
          label: `${pkg?.title || dest?.title || 'Safari Expedition'} (${guestCount} × ${fallbackPerPerson.toLocaleString()} UGX)`,
          amountUgx: touristCountChargeUgx,
        });
      }

      basePriceUgx = touristCountChargeUgx;

      // B. Optional Safari Vehicle Assignment Charge (if vehicle explicitly selected)
      if (resolvedVehicle) {
        if (!resolvedVehicle.assigned_services.includes('tours') || !resolvedVehicle.is_active || !resolvedVehicle.is_available) {
          throw new Error(`Vehicle '${resolvedVehicle.name}' is not assigned to Tours & Safaris.`);
        }
        // Only add separate vehicle hire fee if not already bundled or if explicitly requested
        const tourVehPricing = resolvedVehicle.service_pricing?.tours;
        if (tourVehPricing && params.vehicleId && !pkg) {
          vehicleChargeUgx = Math.round(Number(tourVehPricing.dailyHireRateUgx || 0) * durationDays);
          if (vehicleChargeUgx > 0) {
            breakdown.push({
              code: 'SAFARI_VEHICLE_HIRE',
              label: `${resolvedVehicle.name} (${durationDays} day(s))`,
              amountUgx: vehicleChargeUgx,
            });
          }
        }
      }

      // C. Certified Tour Guide Fee
      if (params.guideId) {
        const guide = localStore.tour_guides.get(params.guideId);
        if (guide) {
          const dailyRate =
            durationDays > 1 && guide.multi_day_rate_ugx
              ? Number(guide.multi_day_rate_ugx)
              : Number(guide.daily_rate_ugx || 150000);
          const fixedFee = Number(guide.fixed_tour_fee_ugx || 0);
          tourGuideFeeUgx = Math.round(dailyRate * durationDays + fixedFee);

          if (guide.group_size_surcharge_ugx && guestCount > 6) {
            tourGuideFeeUgx += Math.round(Number(guide.group_size_surcharge_ugx) * (guestCount - 6));
          }

          breakdown.push({
            code: 'TOUR_GUIDE_FEE',
            label: `Certified Guide (${guide.full_name || 'UWA Guide'}) • ${durationDays} day(s)`,
            amountUgx: tourGuideFeeUgx,
          });
        }
      }

      // D. Mandatory & Selected Additional Charges on Destination / Package
      const chargesList: AdditionalChargeConfig[] = [
        ...(Array.isArray(dest?.additional_charges) ? dest.additional_charges : []),
        ...(Array.isArray(pkg?.additional_charges) ? pkg.additional_charges : []),
      ];
      const selectedIds = new Set(params.selectedAdditionalChargeIds || []);
      for (const chg of chargesList) {
        if (chg && (chg.isMandatory || selectedIds.has(chg.id))) {
          let amt = Math.round(Number(chg.amountUgx || 0));
          if (chg.chargeType === 'PER_PERSON') amt = amt * guestCount;
          if (chg.chargeType === 'PER_DAY') amt = amt * durationDays;
          if (amt > 0) {
            additionalChargesUgx += amt;
            breakdown.push({
              code: `ADDON_${chg.id}`,
              label: `${chg.name}${chg.isMandatory ? ' (Mandatory)' : ''}`,
              amountUgx: amt,
            });
          }
        }
      }
    }

    const totalPriceUgx = Math.max(
      500,
      Math.round(
        (serviceType === 'TOUR' ? touristCountChargeUgx : basePriceUgx) +
          distancePriceUgx +
          vehicleChargeUgx +
          tourGuideFeeUgx +
          additionalChargesUgx -
          discountsUgx +
          taxesUgx
      )
    );

    const quotationId = `qt_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes validity

    const guideRecord = params.guideId ? localStore.tour_guides.get(params.guideId) : null;

    const quoteResult: PriceQuotationResult = {
      quotationId,
      serviceType,
      referenceId: params.packageId || params.destinationId || null,
      vehicleId: resolvedVehicle?.id || null,
      vehicleName: resolvedVehicle?.name || null,
      guideId: params.guideId || null,
      guideName: guideRecord?.full_name || null,
      guestCount,
      distanceKm,
      weightKg,
      durationDays,
      basePriceUgx,
      distancePriceUgx,
      vehicleChargeUgx,
      touristCountChargeUgx,
      tourGuideFeeUgx,
      additionalChargesUgx,
      discountsUgx,
      taxesUgx,
      totalPriceUgx,
      currency: 'UGX',
      pricingVersion,
      breakdown,
      expiresAt,
      createdAt: nowIso,
    };

    await db.persistPriceQuotation({
      id: quotationId,
      service_type: serviceType,
      reference_id: quoteResult.referenceId,
      vehicle_id: quoteResult.vehicleId,
      guide_id: quoteResult.guideId,
      guest_count: guestCount,
      distance_km: distanceKm,
      weight_kg: weightKg,
      base_price_ugx: basePriceUgx,
      distance_price_ugx: distancePriceUgx,
      vehicle_charge_ugx: vehicleChargeUgx,
      tourist_count_charge_ugx: touristCountChargeUgx,
      tour_guide_fee_ugx: tourGuideFeeUgx,
      additional_charges_ugx: additionalChargesUgx,
      discounts_ugx: discountsUgx,
      taxes_ugx: taxesUgx,
      total_price_ugx: totalPriceUgx,
      currency: 'UGX',
      pricing_version: pricingVersion,
      breakdown,
      request_params: params,
      expires_at: expiresAt,
      created_at: nowIso,
    });

    return quoteResult;
  }

  public static getQuotationById(quotationId: string): any | null {
    if (!quotationId) return null;
    return localStore.price_quotations.get(quotationId) || null;
  }
}
