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

  // Enforce mandatory JWT authentication during handshake
  ioInstance.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') as string) ||
      (socket.handshake.query?.token as string);

    if (!token) {
      return next(new Error('Authentication error: Missing token.'));
    }

    try {
      const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
      if (decoded?.scope && decoded.scope !== 'access') {
        return next(new Error('Authentication error: Invalid token scope.'));
      }
      if (!decoded?.userId) {
        return next(new Error('Authentication error: Missing userId in token.'));
      }
      const liveUser = localStore.users.get(decoded.userId);
      if (liveUser && liveUser.approval_status === 'SUSPENDED') {
        return next(new Error('Authentication error: Account suspended.'));
      }
      const tokenVer = Number(decoded.tokenVersion ?? 1);
      const userVer = Number(liveUser?.token_version ?? 1);
      if (tokenVer < userVer) {
        return next(new Error('Authentication error: Session revoked.'));
      }
      (socket as any).userId = decoded.userId;
      (socket as any).role = liveUser?.role || decoded.role || 'customer';
      next();
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        return next(new Error('Authentication error: Token expired.'));
      }
      return next(new Error('Authentication error: Invalid token.'));
    }
  });

  ioInstance.on('connection', (socket: Socket) => {
    // Identity strictly derived from verified JWT payload
    const userId = (socket as any).userId;
    const role = (socket as any).role;

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
      console.log(`[Socket] Authenticated: user=${userId} (${role}) socket=${socket.id}`);
    }

    // Guarded join_room with role & ownership checks
    socket.on('join_room', (room: string) => {
      if (!room || typeof room !== 'string') return;

      const ALLOWED_ROOM_PREFIXES = ['admin:', 'user:', 'trip:', 'delivery:', 'safari:', 'chat:'];
      const hasValidPrefix = ALLOWED_ROOM_PREFIXES.some((prefix) => room.startsWith(prefix));
      if (!hasValidPrefix) {
        socket.emit('error', { message: 'Invalid or unauthorized room channel name.' });
        return;
      }

      // Admin telemetry & financial streams
      if (room.startsWith('admin:')) {
        if (role !== 'admin') {
          socket.emit('error', { message: 'Unauthorized room access: admin privileges required.' });
          return;
        }
      }

      // User personal channels
      if (room.startsWith('user:')) {
        const targetUserId = room.split(':')[1];
        if (targetUserId !== userId && role !== 'admin') {
          socket.emit('error', { message: 'Unauthorized room access: cannot subscribe to other user rooms.' });
          return;
        }
      }

      // Trip channels: only participants (customer/driver) or admin
      if (room.startsWith('trip:')) {
        const tripId = room.split(':')[1];
        const trip = localStore.trips.get(tripId);
        if (!trip) {
          socket.emit('error', { message: 'Trip not found or unauthorized.' });
          return;
        }
        const isParticipant = trip.customer_id === userId || trip.driver_id === userId || role === 'admin';
        if (!isParticipant) {
          socket.emit('error', { message: 'Unauthorized room access: not a participant in this trip.' });
          return;
        }
      }

      // Delivery channels: only sender, courier, or admin
      if (room.startsWith('delivery:')) {
        const deliveryId = room.split(':')[1];
        const delivery = localStore.deliveries.get(deliveryId);
        if (!delivery) {
          socket.emit('error', { message: 'Delivery not found or unauthorized.' });
          return;
        }
        const isParticipant = delivery.sender_id === userId || delivery.courier_id === userId || role === 'admin';
        if (!isParticipant) {
          socket.emit('error', { message: 'Unauthorized room access: not a participant in this delivery.' });
          return;
        }
      }

      socket.join(room);
      console.log(`[Socket] Authorized join: socket=${socket.id} (${userId}/${role}) -> ${room}`);
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
        // Enforce server-derived driverId: client-supplied driverId is completely ignored
        const effectiveDriverId = userId;

        if (role !== 'driver' && role !== 'admin') {
          socket.emit('driver:location_error', { message: 'Only active drivers can broadcast location.' });
          return;
        }

        const lat = Number(data?.lat);
        const lng = Number(data?.lng);
        const heading = Number(data?.heading ?? 0);
        const speed = Number(data?.speed ?? 0);
        const accuracy = Number(data?.accuracy ?? 5);
        const batteryLevel = data?.batteryLevel !== undefined ? Number(data.batteryLevel) : undefined;
        const now = Date.now();
        let packetTs = data?.timestamp ? Number(data.timestamp) : now;
        if (!Number.isFinite(packetTs) || packetTs > now + 300000) {
          packetTs = now;
        }

        if (data?.tripId) {
          const trip = localStore.trips.get(data.tripId);
          if (!trip || trip.driver_id !== effectiveDriverId) {
            socket.emit('driver:location_error', { message: 'Driver is not assigned to this trip.' });
            return;
          }
        }

        if (!effectiveDriverId || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          socket.emit('driver:location_error', { message: 'Invalid GPS coordinates.' });
          return;
        }

        if (speed < 0 || speed > 250) {
          socket.emit('driver:location_error', { message: 'Unrealistic speed reading rejected.' });
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

        // Broadcast to nearby listeners with coarse location (3 decimals ~110m) if not actively on a private trip
        if (!effectiveTripId) {
          const coarseLat = Math.round(lat * 1000) / 1000;
          const coarseLng = Math.round(lng * 1000) / 1000;
          socket.broadcast.emit('driver:nearby_location', {
            driverId: effectiveDriverId,
            lat: coarseLat,
            lng: coarseLng,
            heading,
          });
        }
      }
    );

    // In-app live chat event: strictly enforce senderId from authenticated socket
    socket.on(
      'chat:send_message',
      (data: { tripId?: string; senderId?: string; recipientId: string; text: string }) => {
        const senderId = userId;
        const recipientId = data?.recipientId;
        const text = String(data?.text || '').trim();
        const tripId = data?.tripId;

        if (!recipientId || !text) return;

        if (tripId) {
          const trip = localStore.trips.get(tripId);
          if (trip && trip.customer_id !== senderId && trip.driver_id !== senderId && role !== 'admin') {
            socket.emit('chat:error', { message: 'Unauthorized chat participant.' });
            return;
          }
        }

        const messagePayload = {
          id: `msg_${Date.now()}`,
          tripId,
          senderId,
          recipientId,
          text,
          timestamp: new Date().toISOString(),
        };

        if (tripId) {
          emitToTrip(tripId, 'chat:new_message', messagePayload);
        }
        emitToUser(recipientId, 'chat:new_message', messagePayload);
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

export function broadcastConfigUpdate(payload: any, event = 'config:update') {
  broadcast(event, payload);
  emitToRoom('admin:pricing', event, payload);
}




export function disconnectUserSockets(userId: string, reason = 'SESSION_REVOKED'): void {
  const socketIds = userSockets.get(userId);
  if (socketIds && ioInstance) {
    for (const sid of Array.from(socketIds)) {
      const s = ioInstance.sockets.sockets.get(sid);
      if (s) {
        try {
          s.emit('force_disconnect', { reason });
          s.disconnect(true);
        } catch (_) {}
      }
    }
    userSockets.delete(userId);
  }
}
