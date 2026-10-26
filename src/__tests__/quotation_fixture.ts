import { PricingEngineService } from '../services/pricing/pricing_engine.service';

/** Build a complete authenticated checkout fixture for legacy price comparisons. */
export function quoteForTest(input: Parameters<typeof PricingEngineService.calculateQuote>[0]) {
  const route = { pickupLat: 0, pickupLng: 0, destLat: 0,
    destLng: Number(input.distanceKm || 1) / (6371 * Math.PI / 180 * 1.35) };
  return PricingEngineService.calculateQuote({ customerId: 'cust_test_01', ...route, ...input });
}
