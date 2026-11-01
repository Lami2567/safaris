import { Request, Response } from 'express';
import { MapsService, MapsError } from './maps.service';

export class MapsController {
  /**
   * GET /api/v1/maps/search
   * Multi-source Uganda destination & place search.
   */
  static async searchPlaces(req: Request, res: Response) {
    try {
      const query = String(req.query.q ?? req.query.query ?? '').trim();
      const requestId = String(req.query.requestId ?? `search_${Date.now()}`);
      const limit = req.query.limit ? Number(req.query.limit) : 10;

      const proximityLat =
        req.query.proximityLat !== undefined && req.query.proximityLat !== ''
          ? Number(req.query.proximityLat)
          : undefined;
      const proximityLng =
        req.query.proximityLng !== undefined && req.query.proximityLng !== ''
          ? Number(req.query.proximityLng)
          : undefined;

      if (!query) {
        return res.status(200).json({
          status: 'success',
          data: {
            requestId,
            query: '',
            count: 0,
            results: [],
          },
        });
      }

      const results = await MapsService.searchUgandaPlaces({
        query,
        proximityLat,
        proximityLng,
        limit,
      });

      return res.status(200).json({
        status: 'success',
        data: {
          requestId,
          query,
          count: results.length,
          results,
        },
      });
    } catch (error: any) {
      const status = error instanceof MapsError ? error.statusCode : 500;
      return res.status(status).json({
        status: 'error',
        error: {
          code: error instanceof MapsError ? error.code : 'SEARCH_ERROR',
          message: error?.message || 'Failed to search Uganda places.',
        },
      });
    }
  }

  /**
   * GET/POST /api/v1/maps/route
   * Computes a verified road route, road distance (m/km), duration, and turn-by-turn maneuvers.
   */
  static async getRoute(req: Request, res: Response) {
    try {
      const src = req.method === 'GET' ? req.query : req.body;
      const originLat = Number(src.originLat ?? src.pickupLat);
      const originLng = Number(src.originLng ?? src.pickupLng);
      const destLat = Number(src.destLat ?? src.destinationLat);
      const destLng = Number(src.destLng ?? src.destinationLng);
      const requestId = String(src.requestId ?? `route_${Date.now()}`);
      const bypassCache = src.bypassCache === true || src.bypassCache === 'true';

      if (
        !Number.isFinite(originLat) ||
        !Number.isFinite(originLng) ||
        !Number.isFinite(destLat) ||
        !Number.isFinite(destLng)
      ) {
        return res.status(400).json({
          status: 'error',
          error: {
            code: 'MISSING_ROUTE_COORDINATES',
            message: 'Complete pickup and destination coordinates (originLat, originLng, destLat, destLng) are required.',
          },
        });
      }

      const route = await MapsService.getVerifiedRoadRoute({
        originLat,
        originLng,
        destLat,
        destLng,
        requestId,
        bypassCache,
      });

      return res.status(200).json({
        status: 'success',
        data: route,
      });
    } catch (error: any) {
      const status = error instanceof MapsError ? error.statusCode : 503;
      return res.status(status).json({
        status: 'error',
        error: {
          code: error instanceof MapsError ? error.code : 'ROUTE_UNAVAILABLE',
          message: error?.message || 'Route temporarily unavailable.',
        },
      });
    }
  }
}
