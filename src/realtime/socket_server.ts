import { Server as HttpServer } from 'http';
import { Response } from 'express';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { db, localStore } from '../config/database';

let ioInstance: Server | null = null;

// Map user ID to set of socket IDs
const userSockets = new Map<string, Set<string>>();

// Map room/channel name to set of active SSE response streams
const sseChannels = new Map<string, Set<Response>>();

// Track last location timestamp per driver to prevent out-of-order stale overwrites
const driverLastTimestamp = new Map<string, number>();

export function registerSseClient(channel: string, res: Response): () => void {
  if (!sseChannels.has(channel)) {
    sseChannels.set(channel, new Set());
  }
  sseChannels.get(channel)!.add(res);

  return () => {
    const set = sseChannels.get(channel);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        sseChannels.delete(channel);
      }
    }
  };
}

function emitToSseChannel(channel: string, event: string, payload: any) {
  const clients = sseChannels.get(channel);
  if (!clients || clients.size === 0) return;
  const serialized = JSON.stringify(payload);
  const frame = `event: ${event}\ndata: ${serialized}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch (_) {
      clients.delete(res);
    }
  }
}

export function buildLiveDriverSnapshot(driverId: string): any | null {
  const d = localStore.drivers.get(driverId);
  if (!d) return null;
  if (d.is_approved !== true || d.approval_status !== 'APPROVED') {
    return null;
  }

  const user = localStore.users.get(d.id);
  const vehicle = d.vehicle_id ? localStore.vehicles.get(d.vehicle_id) : null;
  const now = Date.now();
  const lastPingTime = d.updated_at ? new Date(d.updated_at).getTime() : now;
  const isStale = now - lastPingTime > 15 * 60 * 1000;

  let activeTrip: any = null;
  for (const t of localStore.trips.values()) {
    if (
      t.driver_id === d.id &&
      ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(t.status)
    ) {
      activeTrip = t;
      break;
    }
  }

  return {
    id: d.id,
    driverId: d.id,
    full_name: user?.full_name || 'Safaris Driver',
    phone: user?.phone || '',
    role: user?.role || 'driver',
    rating: Number(user?.rating ?? 4.95),
    is_online: d.is_online === true,
    is_available: d.is_online === true && !activeTrip && d.is_available !== false,
    is_approved: d.is_approved === true,
    approval_status: d.approval_status,
    current_lat: Number(d.current_lat ?? 0.3136),
    current_lng: Number(d.current_lng ?? 32.5811),
    lat: Number(d.current_lat ?? 0.3136),
    lng: Number(d.current_lng ?? 32.5811),
    heading: Number(d.heading ?? 0),
    speed: Number(d.speed ?? 0),
    accuracy: Number(d.accuracy ?? 5.0),
    battery_level: d.battery_level ?? 95,
    today_earnings_ugx: Number(d.today_earnings_ugx ?? 0),
    last_ping: d.updated_at || new Date(lastPingTime).toISOString(),
    updatedAt: d.updated_at || new Date(lastPingTime).toISOString(),
    is_stale: isStale,
    make: vehicle?.make || 'Safari',
    model: vehicle?.model || 'Vehicle',
    registration_plate: vehicle?.registration_plate || '',
    tier: vehicle?.tier || 'go',
    active_trip_id: activeTrip?.id || '',
    active_trip_pickup: activeTrip?.pickup_title || '',
    active_trip_dest: activeTrip?.dest_title || '',
    active_trip_status: activeTrip?.status || '',
  };
}

export function broadcastDriverSnapshot(driverId: string, eventType: 'fleet:telemetry_update' | 'fleet:status_update' = 'fleet:telemetry_update') {
  const snapshot = buildLiveDriverSnapshot(driverId);
  if (!snapshot) return null;
  if (ioInstance) {
    ioInstance.to('admin:fleet').emit('fleet:telemetry_update', snapshot);
    if (eventType !== 'fleet:telemetry_update') {
      ioInstance.to('admin:fleet').emit(eventType, snapshot);
    }
  }
  emitToSseChannel('admin:fleet', 'fleet:telemetry_update', snapshot);
  if (eventType !== 'fleet:telemetry_update') {
    emitToSseChannel('admin:fleet', eventType, snapshot);
  }
  return snapshot;
}

export function initSocketServer(httpServer: HttpServer): Server {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  ioInstance.on('connection', (socket: Socket) => {
    let userId = (socket.handshake.query.userId as string) || '';
    let role = (socket.handshake.query.role as string) || '';
    const token =
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.query?.token as string);

    if (token) {
      try {
        const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
        if (decoded?.userId) userId = decoded.userId;
        if (decoded?.role) role = decoded.role;
      } catch (err: any) {
        if (err?.name === 'TokenExpiredError') {
          try {
            const decoded = jwt.verify(token, ENV.JWT_SECRET, { ignoreExpiration: true }) as any;
            if (decoded?.role !== 'admin') {
              if (decoded?.userId) userId = decoded.userId;
              if (decoded?.role) role = decoded.role;
            }
          } catch (_) {}
        }
      }
    }

    if (userId) {
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)!.add(socket.id);
      socket.join(`user:${userId}`);
      socket.join('all_users');
      if (role === 'admin') {
        socket.join('admin:fleet');
        socket.join('admin:payments');
        socket.join('admin:financials');
      }
      console.log(`[Socket] Connected: user=${userId} (${role || 'customer'}) socket=${socket.id}`);
    } else {
      console.log(`[Socket] Anonymous connection: socket=${socket.id}`);
    }

    // Join room for a trip, delivery, or admin fleet
    socket.on('join_room', (room: string) => {
      socket.join(room);
      console.log(`[Socket] Socket ${socket.id} joined ${room}`);
    });

    socket.on('leave_room', (room: string) => {
      socket.leave(room);
      console.log(`[Socket] Socket ${socket.id} left ${room}`);
    });

    // Driver live location ping via WebSocket
    socket.on(
      'driver:location_update',
      (data: {
        driverId?: string;
        lat: number;
        lng: number;
        heading?: number;
        speed?: number;
        accuracy?: number;
        batteryLevel?: number;
        tripId?: string;
        safariLegId?: string;
        timestamp?: number;
      }) => {
        const effectiveDriverId = data?.driverId || userId;
        const lat = Number(data?.lat);
        const lng = Number(data?.lng);
        const heading = Number(data?.heading ?? 0);
        const speed = Number(data?.speed ?? 0);
        const accuracy = Number(data?.accuracy ?? 5);
        const batteryLevel = data?.batteryLevel !== undefined ? Number(data.batteryLevel) : undefined;
        const packetTs = data?.timestamp ? Number(data.timestamp) : Date.now();

        if (!effectiveDriverId || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          socket.emit('driver:location_error', { message: 'Invalid driverId or GPS coordinates.' });
          return;
        }

        const driver = localStore.drivers.get(effectiveDriverId);
        if (!driver || driver.is_approved !== true || driver.approval_status !== 'APPROVED') {
          socket.emit('driver:location_error', {
            message: 'Driver account is not approved for live location broadcasting.',
          });
          return;
        }

        // Prevent out-of-order older packets from overwriting newer state
        const prevTs = driverLastTimestamp.get(effectiveDriverId) || 0;
        if (packetTs < prevTs) {
          return;
        }
        driverLastTimestamp.set(effectiveDriverId, packetTs);

        const nowIso = new Date().toISOString();
        driver.current_lat = lat;
        driver.current_lng = lng;
        driver.heading = heading;
        driver.speed = speed;
        if (batteryLevel !== undefined) {
          driver.battery_level = batteryLevel;
        }
        driver.updated_at = nowIso;

        // Persist to PostgreSQL and disk
        db.persistDriver(driver).catch((err) =>
          console.error('[Socket driver:location_update persistDriver error]', err)
        );

        // Find active trip if not explicitly passed
        let activeTrip: any = null;
        for (const t of localStore.trips.values()) {
          if (
            t.driver_id === effectiveDriverId &&
            ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(t.status)
          ) {
            activeTrip = t;
            break;
          }
        }
        const effectiveTripId = data?.tripId || activeTrip?.id || null;

        // Record breadcrumb point
        const ptId = `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const pointRecord = {
          id: ptId,
          driver_id: effectiveDriverId,
          trip_id: effectiveTripId,
          safari_leg_id: data?.safariLegId || null,
          lat,
          lng,
          speed,
          heading,
          accuracy,
          battery_level: batteryLevel ?? null,
          is_offline_queued: false,
          recorded_at: nowIso,
          created_at: nowIso,
        };
        localStore.location_points.set(ptId, pointRecord);
        if (db.isPostgresConnected) {
          db.query(
            `INSERT INTO location_points (id, driver_id, trip_id, safari_leg_id, lat, lng, speed, heading, accuracy, battery_level, is_offline_queued, recorded_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11)
             ON CONFLICT (id) DO NOTHING`,
            [ptId, effectiveDriverId, effectiveTripId, data?.safariLegId || null, lat, lng, speed, heading, accuracy, batteryLevel ?? null, nowIso]
          ).catch(() => {});
        }

        // If active trip, broadcast directly to trip room and customer
        if (effectiveTripId) {
          const locPayload = {
            tripId: effectiveTripId,
            driverId: effectiveDriverId,
            lat,
            lng,
            heading,
            speed,
            timestamp: packetTs,
          };
          emitToTrip(effectiveTripId, 'trip:driver_location', locPayload);
          if (activeTrip?.customer_id) {
            emitToUser(activeTrip.customer_id, 'trip:driver_location', locPayload);
          }
        }

        // Broadcast full enriched snapshot to Admin Fleet Stream (Socket.IO + SSE)
        broadcastDriverSnapshot(effectiveDriverId, 'fleet:telemetry_update');

        // Broadcast to nearby listeners
        socket.broadcast.emit('driver:nearby_location', {
          driverId: effectiveDriverId,
          lat,
          lng,
          heading,
        });
      }
    );

    // In-app live chat event
    socket.on(
      'chat:send_message',
      (data: { tripId?: string; senderId: string; recipientId: string; text: string }) => {
        const messagePayload = {
          id: `msg_${Date.now()}`,
          tripId: data.tripId,
          senderId: data.senderId,
          recipientId: data.recipientId,
          text: data.text,
          timestamp: new Date().toISOString(),
        };

        if (data.tripId) {
          emitToTrip(data.tripId, 'chat:new_message', messagePayload);
        }
        emitToUser(data.recipientId, 'chat:new_message', messagePayload);
      }
    );

    // Cleanup on disconnect
    socket.on('disconnect', () => {
      if (userId && userSockets.has(userId)) {
        const set = userSockets.get(userId)!;
        set.delete(socket.id);
        if (set.size === 0) {
          userSockets.delete(userId);
        }
      }
      console.log(`[Socket] Disconnected: socket=${socket.id}`);
    });
  });

  return ioInstance;
}

export function emitToUser(userId: string, event: string, payload: any) {
  if (!userId) return;
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, payload);
  }
  emitToSseChannel(`user:${userId}`, event, payload);
}

export function emitToTrip(tripId: string, event: string, payload: any) {
  if (!tripId) return;
  if (ioInstance) {
    ioInstance.to(`trip:${tripId}`).emit(event, payload);
  }
  emitToSseChannel(`trip:${tripId}`, event, payload);
}

export function broadcastToFleet(payload: any, event = 'fleet:telemetry_update') {
  if (ioInstance) {
    ioInstance.to('admin:fleet').emit(event, payload);
  }
  emitToSseChannel('admin:fleet', event, payload);
}

export function emitToRoom(room: string, event: string, payload: any) {
  if (ioInstance) {
    ioInstance.to(room).emit(event, payload);
  }
  emitToSseChannel(room, event, payload);
}

export function broadcast(event: string, payload: any) {
  if (ioInstance) {
    ioInstance.emit(event, payload);
  }
  emitToSseChannel('all_users', event, payload);
}

export function broadcastPaymentStream(payment: any, event = 'payment:update') {
  emitToRoom('admin:payments', event, payment);
  if (payment?.user_id) {
    emitToUser(payment.user_id, 'wallet:payment_update', payment);
  }
}

export function broadcastFinancialOverview(overview: any, event = 'financial:kpis') {
  emitToRoom('admin:payments', event, overview);
  emitToRoom('admin:financials', event, overview);
}



