import { Request, Response } from 'express';
import { db, localStore } from '../../config/database';
import { emitToTrip, broadcastDriverSnapshot } from '../../realtime/socket_server';
import { sendSuccess, sendError } from '../../shared/response';

export class TelemetryController {
  /**
   * Process a batch of location telemetry points uploaded by mobile client
   * (e.g. flushed from OfflineLocationQueue)
   */
  public static async batchUpload(req: Request, res: Response) {
    try {
      const caller = (req as any).user;
      if (!caller || !caller.userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required for telemetry upload.', 401);
      }

      // Restrict telemetry submission to approved drivers or admins
      if (caller.role !== 'driver' && caller.role !== 'admin') {
        return sendError(res, 'FORBIDDEN', 'Only approved driver accounts or operational admins can submit telemetry.', 403);
      }

      // Server-derived driver identity: drivers cannot spoof other driver accounts
      const driverId = caller.role === 'admin' && req.body.driverId ? String(req.body.driverId) : caller.userId;

      // Verify driver account is active and approved
      const drv = localStore.drivers.get(driverId);
      if (!drv || drv.is_approved !== true || drv.approval_status !== 'APPROVED') {
        return sendError(res, 'DRIVER_NOT_APPROVED', 'Driver account must be verified and approved to submit telemetry.', 403);
      }

      const { batchId, points } = req.body;
      if (!Array.isArray(points) || points.length === 0) {
        return sendError(res, 'INVALID_BATCH', 'Points array is required and must contain at least 1 record.', 400);
      }

      // Limit batch size to protect memory and database throughput
      if (points.length > 100) {
        return sendError(res, 'BATCH_TOO_LARGE', 'Maximum 100 telemetry points per batch upload.', 400);
      }

      const now = Date.now();
      const maxFutureSkewMs = 5 * 60 * 1000; // 5 minutes max clock skew
      const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days max offline age

      let insertedCount = 0;
      let latestLivePoint: any = null;
      let driverCurrentTimestamp = drv.updated_at ? new Date(drv.updated_at).getTime() : 0;

      for (const pt of points) {
        const id = pt.id || `loc_${now}_${Math.random().toString(36).substring(2, 7)}`;
        const rawTripId = pt.tripId || pt.trip_id || req.body.tripId || req.body.trip_id || null;
        const safariLegId = pt.safariLegId || pt.safari_leg_id || req.body.safariLegId || req.body.safari_leg_id || null;

        const lat = parseFloat(pt.latitude ?? pt.lat);
        const lng = parseFloat(pt.longitude ?? pt.lng);
        const speed = Math.max(0, parseFloat(pt.speed || '0.0'));
        const heading = parseFloat(pt.heading || '0.0');
        const accuracy = Math.max(0, parseFloat(pt.accuracy || '5.0'));
        const batteryLevel = pt.batteryLevel != null ? parseFloat(pt.batteryLevel) : (pt.battery_level != null ? parseFloat(pt.battery_level) : null);
        const isOfflineQueued = pt.isOfflineQueued === true || pt.is_offline_sync === true;

        // Coordinate bounding checks: Uganda coordinates range [-1.5 to 4.5 lat, 29.5 to 35.0 lng], global bounds [-90, 90], [-180, 180]
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          continue;
        }

        // Speed & Accuracy sanity limits
        if (!Number.isFinite(speed) || speed > 250 || !Number.isFinite(accuracy) || accuracy > 500) {
          continue;
        }

        // Timestamp validation & clock skew protection
        let recordedAt: Date;
        if (pt.recorded_at || pt.recordedAt || pt.timestamp) {
          const parsed = new Date(pt.recorded_at || pt.recordedAt || pt.timestamp);
          if (isNaN(parsed.getTime())) continue;
          recordedAt = parsed;
        } else {
          recordedAt = new Date();
        }

        const pointTime = recordedAt.getTime();
        if (pointTime > now + maxFutureSkewMs || pointTime < now - maxAgeMs) {
          continue; // Discard invalid or excessively skewed points
        }

        // Trip Assignment Validation: Reject cross-trip telemetry injection
        let validTripId: string | null = null;
        if (rawTripId) {
          const trip = localStore.trips.get(rawTripId);
          if (trip) {
            if (trip.driver_id === driverId || caller.role === 'admin') {
              validTripId = rawTripId;
            }
          }
        }

        // 1. Deduplicate & save to localStore fallback
        if (!localStore.location_points.has(id)) {
          const record = {
            id,
            driver_id: driverId,
            trip_id: validTripId,
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

          // Only allow this point to update driver live position if it is strictly newer than current position
          if (pointTime >= driverCurrentTimestamp) {
            driverCurrentTimestamp = pointTime;
            latestLivePoint = record;
          }
        }

        // 2. Persist to PostgreSQL if connected
        if (db.isPostgresConnected) {
          await db.query(
            `INSERT INTO location_points 
              (id, driver_id, trip_id, safari_leg_id, lat, lng, speed, heading, accuracy, battery_level, is_offline_queued, recorded_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (id) DO NOTHING`,
            [id, driverId, validTripId, safariLegId, lat, lng, speed, heading, accuracy, batteryLevel, isOfflineQueued, recordedAt]
          );
        }
      }

      // Update driver's live position in memory & db using latest verified point
      if (latestLivePoint) {
        const driver = localStore.drivers.get(driverId);
        if (driver) {
          driver.current_lat = latestLivePoint.lat;
          driver.current_lng = latestLivePoint.lng;
          driver.heading = latestLivePoint.heading;
          driver.speed = latestLivePoint.speed;
          driver.battery_level = latestLivePoint.battery_level;
          driver.updated_at = latestLivePoint.recorded_at;
          await db.persistDriver(driver);
        }

        // Broadcast latest telemetry to trip room if assigned
        if (latestLivePoint.trip_id) {
          emitToTrip(latestLivePoint.trip_id, 'trip:driver_location', {
            tripId: latestLivePoint.trip_id,
            driverId: latestLivePoint.driver_id,
            lat: latestLivePoint.lat,
            lng: latestLivePoint.lng,
            heading: latestLivePoint.heading,
            speed: latestLivePoint.speed,
            timestamp: Date.now(),
          });
        }

        // Broadcast to admin fleet stream
        broadcastDriverSnapshot(driverId, 'fleet:telemetry_update');
      }

      return sendSuccess(res, {
        batchId: batchId || null,
        processed: insertedCount,
        driverId,
        message: `Synced ${insertedCount} location points successfully`,
      });
    } catch (err: any) {
      console.error('[TelemetryController.batchUpload error]', err);
      return sendError(res, 'TELEMETRY_SYNC_FAILED', err.message || 'Failed to process telemetry batch', 500);
    }
  }

  /**
   * Get chronological location breadcrumbs for a driver for playback.
   * Access restricted to the driver themselves or authorized administrators.
   */
  public static async getDriverHistory(req: Request, res: Response) {
    try {
      const caller = (req as any).user;
      if (!caller || !caller.userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const { driverId } = req.params;

      // Ownership authorization: driver can only inspect their own history unless caller is admin
      if (caller.role !== 'admin' && caller.userId !== driverId) {
        return sendError(res, 'FORBIDDEN', "Access denied. You cannot view another driver's telemetry history.", 403);
      }

      const { date, limit = 500 } = req.query;

      // Validate date format if provided (YYYY-MM-DD)
      if (date && typeof date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return sendError(res, 'INVALID_DATE', 'Date must be formatted as YYYY-MM-DD.', 400);
      }

      const safeLimit = Math.min(Math.max(1, parseInt(limit as string) || 500), 1000);

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

        params.push(safeLimit);
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
        points: points.slice(0, safeLimit),
      });
    } catch (err: any) {
      console.error('[TelemetryController.getDriverHistory error]', err);
      return sendError(res, 'HISTORY_FETCH_FAILED', err.message || 'Failed to retrieve driver movement history', 500);
    }
  }

  /**
   * Get location trail for a specific trip.
   * Access restricted to authorized trip participants (customer, assigned driver) and administrators.
   */
  public static async getTripHistory(req: Request, res: Response) {
    try {
      const caller = (req as any).user;
      if (!caller || !caller.userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const { tripId } = req.params;
      const trip = localStore.trips.get(tripId);

      if (!trip) {
        return sendError(res, 'TRIP_NOT_FOUND', `Trip '${tripId}' not found.`, 404);
      }

      // Ownership authorization
      if (caller.role !== 'admin' && trip.customer_id !== caller.userId && trip.driver_id !== caller.userId) {
        return sendError(res, 'FORBIDDEN', 'Access denied to this trip location history.', 403);
      }

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
