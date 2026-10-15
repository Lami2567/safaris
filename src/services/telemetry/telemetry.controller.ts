import { Request, Response } from 'express';
import { db, localStore } from '../../config/database';
import { emitToTrip, broadcastToFleet } from '../../realtime/socket_server';
import { sendSuccess, sendError } from '../../shared/response';

export class TelemetryController {
  /**
   * Process a batch of location telemetry points uploaded by mobile client
   * (e.g. flushed from OfflineLocationQueue)
   */
  static async batchUpload(req: Request, res: Response) {
    try {
      const { batchId, points } = req.body;
      if (!Array.isArray(points) || points.length === 0) {
        return res.status(400).json({ error: 'Points array is required' });
      }

      let insertedCount = 0;
      let latestPoint: any = null;

      for (const pt of points) {
        const id = pt.id || `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const driverId = pt.driverId || pt.driver_id || req.body.driverId || req.body.driver_id || (req as any).user?.id || 'driver-001';
        const tripId = pt.tripId || pt.trip_id || req.body.tripId || req.body.trip_id || null;
        const safariLegId = pt.safariLegId || pt.safari_leg_id || req.body.safariLegId || req.body.safari_leg_id || null;
        const lat = parseFloat(pt.latitude || pt.lat);
        const lng = parseFloat(pt.longitude || pt.lng);
        const speed = parseFloat(pt.speed || '0.0');
        const heading = parseFloat(pt.heading || '0.0');
        const accuracy = parseFloat(pt.accuracy || '5.0');
        const batteryLevel = pt.batteryLevel != null ? parseFloat(pt.batteryLevel) : (pt.battery_level != null ? parseFloat(pt.battery_level) : null);
        const isOfflineQueued = pt.isOfflineQueued === true || pt.is_offline_sync === true;
        const recordedAt = pt.recorded_at ? new Date(pt.recorded_at) : (pt.recordedAt ? new Date(pt.recordedAt) : (pt.timestamp ? new Date(pt.timestamp) : new Date()));

        // 1. Deduplicate & save to localStore fallback
        if (!localStore.location_points.has(id)) {
          const record = {
            id,
            driver_id: driverId,
            trip_id: tripId,
            safari_leg_id: safariLegId,
            lat,
            lng,
            speed,
            heading,
            accuracy,
            battery_level: batteryLevel,
            is_offline_queued: isOfflineQueued,
            recorded_at: recordedAt.toISOString(),
            created_at: new Date().toISOString(),
          };
          localStore.location_points.set(id, record);
          insertedCount++;
          latestPoint = record;
        }

        // 2. Persist to PostgreSQL if connected
        if (db.isPostgresConnected) {
          await db.query(
            `INSERT INTO location_points 
              (id, driver_id, trip_id, safari_leg_id, lat, lng, speed, heading, accuracy, battery_level, is_offline_queued, recorded_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (id) DO NOTHING`,
            [id, driverId, tripId, safariLegId, lat, lng, speed, heading, accuracy, batteryLevel, isOfflineQueued, recordedAt]
          );
        }
      }

      // Update driver's live position in memory & db using latest point in batch
      if (latestPoint) {
        const driver = localStore.drivers.get(latestPoint.driver_id);
        if (driver) {
          driver.current_lat = latestPoint.lat;
          driver.current_lng = latestPoint.lng;
          driver.heading = latestPoint.heading;
          driver.speed = latestPoint.speed;
          driver.battery_level = latestPoint.battery_level;
          driver.updated_at = new Date().toISOString();
        }

        if (db.isPostgresConnected) {
          await db.query(
            `UPDATE drivers SET current_lat = $1, current_lng = $2, heading = $3, updated_at = NOW() WHERE id = $4`,
            [latestPoint.lat, latestPoint.lng, latestPoint.heading, latestPoint.driver_id]
          );
        }

        // Broadcast latest telemetry to trip room and admin fleet stream
        if (latestPoint.trip_id) {
          emitToTrip(latestPoint.trip_id, 'trip:driver_location', {
            driverId: latestPoint.driver_id,
            lat: latestPoint.lat,
            lng: latestPoint.lng,
            heading: latestPoint.heading,
            speed: latestPoint.speed,
            timestamp: Date.now(),
          });
        }

        broadcastToFleet({
          driverId: latestPoint.driver_id,
          lat: latestPoint.lat,
          lng: latestPoint.lng,
          heading: latestPoint.heading,
          speed: latestPoint.speed,
          accuracy: latestPoint.accuracy,
          batteryLevel: latestPoint.battery_level,
          tripId: latestPoint.trip_id,
          safariLegId: latestPoint.safari_leg_id,
          updatedAt: new Date().toISOString(),
        });
      }

      return sendSuccess(res, {
        batchId: batchId || null,
        processed: insertedCount,
        message: `Synced ${insertedCount} location points successfully`,
      });
    } catch (err: any) {
      console.error('[TelemetryController.batchUpload error]', err);
      return sendError(res, 'TELEMETRY_SYNC_FAILED', err.message || 'Failed to process telemetry batch', 500);
    }
  }

  /**
   * Get chronological location breadcrumbs for a driver on a specific date for route playback
   */
  static async getDriverHistory(req: Request, res: Response) {
    try {
      const { driverId } = req.params;
      const { date, limit = 500 } = req.query;

      if (db.isPostgresConnected) {
        let queryText = `
          SELECT id, driver_id, trip_id, safari_leg_id, lat, lng, speed, heading, accuracy, battery_level, is_offline_queued, recorded_at
          FROM location_points
          WHERE driver_id = $1
        `;
        const params: any[] = [driverId];

        if (date) {
          params.push(date);
          queryText += ` AND DATE(recorded_at) = $${params.length}`;
        }

        params.push(Math.min(parseInt(limit as string) || 500, 2000));
        queryText += ` ORDER BY recorded_at ASC LIMIT $${params.length}`;

        const result = await db.query(queryText, params);
        return sendSuccess(res, {
          driverId,
          date: date || 'all',
          points: result.rows,
        });
      }

      // Memory store fallback
      let points = Array.from(localStore.location_points.values()).filter(
        (p: any) => p.driver_id === driverId
      );

      if (date) {
        points = points.filter((p: any) => p.recorded_at.startsWith(date as string));
      }

      points.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

      return sendSuccess(res, {
        driverId,
        date: date || 'today',
        points: points.slice(0, 500),
      });
    } catch (err: any) {
      console.error('[TelemetryController.getDriverHistory error]', err);
      return sendError(res, 'HISTORY_FETCH_FAILED', err.message || 'Failed to retrieve driver movement history', 500);
    }
  }

  /**
   * Get location trail for a specific trip
   */
  static async getTripHistory(req: Request, res: Response) {
    try {
      const { tripId } = req.params;

      if (db.isPostgresConnected) {
        const result = await db.query(
          `SELECT id, driver_id, trip_id, safari_leg_id, lat, lng, speed, heading, accuracy, battery_level, recorded_at
           FROM location_points
           WHERE trip_id = $1
           ORDER BY recorded_at ASC`,
          [tripId]
        );
        return sendSuccess(res, { tripId, points: result.rows });
      }

      const points = Array.from(localStore.location_points.values())
        .filter((p: any) => p.trip_id === tripId)
        .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

      return sendSuccess(res, { tripId, points });
    } catch (err: any) {
      console.error('[TelemetryController.getTripHistory error]', err);
      return sendError(res, 'TRIP_HISTORY_FETCH_FAILED', err.message || 'Failed to retrieve trip history', 500);
    }
  }
}

