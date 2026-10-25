import { Request, Response } from 'express';
import { PricingEngineService } from './pricing_engine.service';
import { sendSuccess, sendError } from '../../shared/response';

export class PricingEngineController {
  /**
   * GET /api/v1/catalogue/vehicles
   * Query params: ?service=ride_hailing|airport_shuttle|tours|express_delivery&includeInactive=true
   */
  public static async getCatalogueVehicles(req: Request, res: Response) {
    try {
      await PricingEngineService.init();
      const service = req.query.service as string | undefined;
      const includeInactive = req.query.includeInactive === 'true';
      const vehicles = PricingEngineService.getAllCatalogueVehicles({ service, includeInactive });
      return sendSuccess(res, vehicles);
    } catch (err: any) {
      return sendError(res, 'FETCH_CATALOGUE_VEHICLES_FAILED', err.message, 500);
    }
  }

  /**
   * POST /api/v1/admin/catalogue/vehicles
   * PUT /api/v1/admin/catalogue/vehicles/:id
   */
  public static async upsertCatalogueVehicle(req: Request, res: Response) {
    try {
      await PricingEngineService.init();
      const id = req.params.id || req.body.id;
      const vehicle = await PricingEngineService.upsertCatalogueVehicle({
        ...req.body,
        ...(id ? { id } : {}),
      });
      return sendSuccess(res, vehicle, req.params.id ? 200 : 201);
    } catch (err: any) {
      return sendError(res, 'UPSERT_CATALOGUE_VEHICLE_FAILED', err.message, 400);
    }
  }

  /**
   * DELETE /api/v1/admin/catalogue/vehicles/:id
   */
  public static async deleteCatalogueVehicle(req: Request, res: Response) {
    try {
      const result = await PricingEngineService.deleteCatalogueVehicle(req.params.id);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'DELETE_CATALOGUE_VEHICLE_FAILED', err.message, 404);
    }
  }

  /**
   * GET /api/v1/pricing/rules
   */
  public static async getServicePricingRules(req: Request, res: Response) {
    try {
      await PricingEngineService.init();
      const rules = PricingEngineService.getAllServicePricingRules();
      return sendSuccess(res, rules);
    } catch (err: any) {
      return sendError(res, 'FETCH_PRICING_RULES_FAILED', err.message, 500);
    }
  }

  /**
   * PUT /api/v1/admin/pricing/rules/:serviceKey
   */
  public static async updateServicePricingRule(req: Request, res: Response) {
    try {
      await PricingEngineService.init();
      const serviceKey = req.params.serviceKey;
      const adminId = (req as any).user?.userId || 'ADMIN';
      const updated = await PricingEngineService.updateServicePricingRule(serviceKey, req.body, adminId);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_PRICING_RULE_FAILED', err.message, 400);
    }
  }

  /**
   * POST /api/v1/pricing/quote
   * Standardized server-side quotation endpoint for RIDE, AIRPORT_SHUTTLE, TOUR, DELIVERY.
   */
  public static async calculateQuote(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const customerId = user ? user.id : (req.body?.customerId || undefined);
      const sessionId = (req.headers['x-checkout-session'] as string) || req.body?.sessionId || undefined;
      const quote = await PricingEngineService.calculateQuote({
        ...(req.body || {}),
        customerId,
        sessionId,
      });
      return sendSuccess(res, quote);
    } catch (err: any) {
      return sendError(res, 'QUOTE_CALCULATION_FAILED', err.message, 400);
    }
  }

  /**
   * GET /api/v1/pricing/quote/:quotationId
   */
  public static async getQuotation(req: Request, res: Response) {
    try {
      const quote = PricingEngineService.getQuotationById(req.params.quotationId);
      if (!quote) {
        return sendError(res, 'QUOTATION_NOT_FOUND', 'Quotation not found or expired.', 404);
      }
      return sendSuccess(res, quote);
    } catch (err: any) {
      return sendError(res, 'FETCH_QUOTATION_FAILED', err.message, 500);
    }
  }
}
