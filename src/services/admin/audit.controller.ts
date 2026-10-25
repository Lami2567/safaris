import { Request, Response } from 'express';
import { db, localStore } from '../../config/database';
import { sendSuccess, sendError } from '../../shared/response';
import { FleetMovementEngine } from '../driver/fleet_movement_engine';

export class AdminAuditController {
  /**
   * Record administrative access to sensitive telemetry & driver locations
   */
  static async recordAudit(req: Request, res: Response) {
    try {
      const adminId = (req as any).user?.id || 'admin_mumwe_01';
      const { action, resourceType, resourceId, details = {} } = req.body;

      if (!action || !resourceType || !resourceId) {
        return sendError(res, 'INVALID_INPUT', 'action, resourceType, and resourceId are required', 400);
      }

      const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

      if (db.isPostgresConnected) {
        await db.query(
          `INSERT INTO admin_audit_logs (id, admin_id, action, resource_type, resource_id, details, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, adminId, action, resourceType, resourceId, JSON.stringify(details), ipAddress]
        );
      } else {
        localStore.admin_audit_logs.set(id, {
          id,
          admin_id: adminId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          details,
          ip_address: ipAddress,
          created_at: new Date().toISOString(),
        });
      }

      return sendSuccess(res, { id }, 201);
    } catch (err: any) {
      console.error('[AdminAuditController.recordAudit error]', err);
      return sendError(res, 'AUDIT_LOG_FAILED', err.message || 'Failed to record audit log', 500);
    }
  }

  /**
   * Retrieve audit logs for compliance
   */
  static async getAuditLogs(req: Request, res: Response) {
    try {
      const { limit = 100, resourceType } = req.query;

      if (db.isPostgresConnected) {
        let sql = `SELECT * FROM admin_audit_logs`;
        const params: any[] = [];
        if (resourceType) {
          params.push(resourceType);
          sql += ` WHERE resource_type = $1`;
        }
        params.push(Math.min(parseInt(limit as string) || 100, 500));
        sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

        const result = await db.query(sql, params);
        return sendSuccess(res, result.rows);
      }

      let logs = Array.from(localStore.admin_audit_logs.values());
      if (resourceType) {
        logs = logs.filter((l: any) => l.resource_type === resourceType);
      }
      logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return sendSuccess(res, logs.slice(0, 100));
    } catch (err: any) {
      console.error('[AdminAuditController.getAuditLogs error]', err);
      return sendError(res, 'FETCH_AUDIT_LOGS_FAILED', err.message || 'Failed to fetch audit logs', 500);
    }
  }

  /**
   * Live fleet status overview for Admin Operations Page
   */
  static async getLiveFleet(req: Request, res: Response) {
    try {
      if (db.isPostgresConnected) {
        const query = `
          SELECT 
            u.id, 
            u.full_name, 
            u.phone, 
            u.role, 
            u.rating, 
            d.is_online, 
            d.is_available, 
            d.is_approved,
            d.approval_status,
            d.current_lat, 
            d.current_lng, 
            d.heading, 
            d.speed,
            d.battery_level,
            d.today_earnings_ugx, 
            d.updated_at as last_ping,
            (EXTRACT(EPOCH FROM (NOW() - d.updated_at)) > 900) as is_stale,
            v.make, 
            v.model, 
            v.registration_plate, 
            v.tier,
            COALESCE(t.id, '') as active_trip_id,
            COALESCE(t.pickup_title, '') as active_trip_pickup,
            COALESCE(t.dest_title, '') as active_trip_dest,
            COALESCE(t.status::text, '') as active_trip_status
          FROM users u
          JOIN drivers d ON u.id = d.id
          LEFT JOIN vehicles v ON d.vehicle_id = v.id
          LEFT JOIN trips t ON (t.driver_id = d.id AND t.status IN ('DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED'))
          WHERE u.role IN ('driver', 'tour_guide') AND d.is_approved = true AND d.approval_status = 'APPROVED'
          ORDER BY d.is_online DESC, d.updated_at DESC
        `;
        const result = await db.query(query);
        const normalizedRows = (result.rows || []).map((r: any) => ({
          ...r,
          rating: Number(r.rating ?? 5.0),
          is_online: r.is_online === true,
          is_available: r.is_available === true,
          is_approved: r.is_approved === true,
          current_lat: Number(r.current_lat ?? 0.3136),
          current_lng: Number(r.current_lng ?? 32.5811),
          heading: Number(r.heading ?? 0),
          speed: Number(r.speed ?? 0),
          battery_level: Number(r.battery_level ?? 95),
          today_earnings_ugx: Number(r.today_earnings_ugx ?? 0),
          is_stale: r.is_stale === true,
        }));
        return sendSuccess(res, normalizedRows);
      }

      // Memory & disk persistent store: return genuine approved drivers only
      const activeDrivers: any[] = [];
      const now = Date.now();

      for (const d of localStore.drivers.values()) {
        if (d.is_approved !== true || d.approval_status !== 'APPROVED') {
          continue;
        }

        const user = localStore.users.get(d.id);
        const vehicle = d.vehicle_id ? localStore.vehicles.get(d.vehicle_id) : null;
        const lastPingTime = d.updated_at ? new Date(d.updated_at).getTime() : (now - 60000);
        const isStale = (now - lastPingTime) > 15 * 60 * 1000;

        let activeTrip: any = null;
        for (const t of localStore.trips.values()) {
          if (t.driver_id === d.id && ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(t.status)) {
            activeTrip = t;
            break;
          }
        }

        activeDrivers.push({
          id: d.id,
          full_name: user?.full_name || 'Safaris Driver',
          phone: user?.phone || '',
          role: user?.role || 'driver',
          rating: user?.rating || 4.95,
          is_online: d.is_online === true,
          is_available: d.is_available === true,
          is_approved: d.is_approved === true,
          approval_status: d.approval_status,
          current_lat: d.current_lat ?? 0.3136,
          current_lng: d.current_lng ?? 32.5811,
          heading: d.heading ?? 0,
          speed: d.speed ?? 0,
          accuracy: 5.0,
          battery_level: d.battery_level ?? 90,
          today_earnings_ugx: d.today_earnings_ugx ?? 0,
          last_ping: d.updated_at || new Date(lastPingTime).toISOString(),
          is_stale: isStale,
          make: vehicle?.make || 'Toyota',
          model: vehicle?.model || 'Corolla',
          registration_plate: vehicle?.registration_plate || 'UBM 714K',
          tier: vehicle?.tier || 'go',
          active_trip_id: activeTrip?.id || '',
          active_trip_pickup: activeTrip?.pickup_title || '',
          active_trip_dest: activeTrip?.dest_title || '',
          active_trip_status: activeTrip?.status || '',
        });
      }

      // Sort: online first, then latest ping
      activeDrivers.sort((a, b) => {
        if (a.is_online === b.is_online) {
          return new Date(b.last_ping).getTime() - new Date(a.last_ping).getTime();
        }
        return a.is_online ? -1 : 1;
      });

      return sendSuccess(res, activeDrivers);
    } catch (err: any) {
      console.error('[AdminAuditController.getLiveFleet error]', err);
      return sendError(res, 'FETCH_LIVE_FLEET_FAILED', err.message || 'Failed to fetch live fleet', 500);
    }
  }

  /**
   * Real-time Server-Sent Events (SSE) stream for Admin Live Fleet Map
   * Pushes single-driver telemetry and status updates immediately without polling or refresh.
   */
  static async streamLiveFleet(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const { registerSseClient } = await import('../../realtime/socket_server');
    const unsubscribe = registerSseClient('admin:fleet', res);

    // Send initial connection confirmation
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        event: 'connected',
        channel: 'admin:fleet',
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch (_) {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }

  /**
   * Real-time Server-Sent Events (SSE) stream for authenticated Driver, Tour Guide, or Customer
   */
  static async streamUserEvents(req: Request, res: Response) {
    const user = (req as any).user;
    if (!user?.userId) {
      return sendError(res, 'UNAUTHORIZED', 'Authentication required for real-time stream.', 401);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const { registerSseClient } = await import('../../realtime/socket_server');
    const unsubUser = registerSseClient(`user:${user.userId}`, res);
    const unsubAll = registerSseClient('all_users', res);
    let unsubTrip = () => {};
    if (typeof req.query.tripId === 'string' && req.query.tripId) {
      const tripId = req.query.tripId;
      const trip = localStore.trips.get(tripId);
      // Strictly authorize trip telemetry streaming
      if (trip && (trip.customer_id === user.userId || trip.driver_id === user.userId || user.role === 'admin')) {
        unsubTrip = registerSseClient(`trip:${tripId}`, res);
      }
    }

    res.write(
      `event: connected\ndata: ${JSON.stringify({
        event: 'connected',
        userId: user.userId,
        role: user.role,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch (_) {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubUser();
      unsubAll();
      unsubTrip();
    });
  }
}
