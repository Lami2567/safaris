import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { localStore } from '../config/database';

let ioInstance: Server | null = null;

// Map user ID to set of socket IDs
const userSockets = new Map<string, Set<string>>();

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
    const userId = socket.handshake.query.userId as string;
    const role = socket.handshake.query.role as string;

    if (userId) {
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)!.add(socket.id);
      socket.join(`user:${userId}`);
      console.log(`[Socket] Connected: user=${userId} (${role || 'customer'}) socket=${socket.id}`);
    } else {
      console.log(`[Socket] Anonymous connection: socket=${socket.id}`);
    }

    // Join room for a trip or delivery
    socket.on('join_room', (room: string) => {
      socket.join(room);
      console.log(`[Socket] Socket ${socket.id} joined ${room}`);
    });

    socket.on('leave_room', (room: string) => {
      socket.leave(room);
      console.log(`[Socket] Socket ${socket.id} left ${room}`);
    });

    // Driver live location ping
    socket.on('driver:location_update', (data: { driverId: string; lat: number; lng: number; heading?: number; tripId?: string }) => {
      const { driverId, lat, lng, heading = 0, tripId } = data;
      
      // Update local driver model
      const driver = localStore.drivers.get(driverId);
      if (driver) {
        driver.current_lat = lat;
        driver.current_lng = lng;
      }

      // If active trip, broadcast directly to trip room
      if (tripId) {
        ioInstance?.to(`trip:${tripId}`).emit('trip:driver_location', {
          driverId,
          lat,
          lng,
          heading,
          timestamp: Date.now(),
        });
      }

      // Broadcast to nearby listeners
      socket.broadcast.emit('driver:nearby_location', {
        driverId,
        lat,
        lng,
        heading,
      });
    });

    // In-app live chat event
    socket.on('chat:send_message', (data: { tripId?: string; senderId: string; recipientId: string; text: string }) => {
      const messagePayload = {
        id: `msg_${Date.now()}`,
        tripId: data.tripId,
        senderId: data.senderId,
        recipientId: data.recipientId,
        text: data.text,
        timestamp: new Date().toISOString(),
      };

      if (data.tripId) {
        ioInstance?.to(`trip:${data.tripId}`).emit('chat:new_message', messagePayload);
      }
      emitToUser(data.recipientId, 'chat:new_message', messagePayload);
    });

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
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, payload);
  }
}

export function emitToRoom(room: string, event: string, payload: any) {
  if (ioInstance) {
    ioInstance.to(room).emit(event, payload);
  }
}

export function broadcast(event: string, payload: any) {
  if (ioInstance) {
    ioInstance.emit(event, payload);
  }
}
