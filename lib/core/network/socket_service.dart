import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/environment_config.dart';

class RealtimeSocketService {
  static final RealtimeSocketService _instance =
      RealtimeSocketService._internal();
  factory RealtimeSocketService() => _instance;
  RealtimeSocketService._internal();

  io.Socket? _socket;
  bool _isConnected = false;
  String? _userId;
  String _role = 'customer';
  final Set<String> _activeRooms = <String>{};

  bool get isConnected => _isConnected;

  void connect({required String userId, String role = 'customer'}) {
    if (_socket != null &&
        _isConnected &&
        _userId == userId &&
        _role == role) {
      return;
    }
    _userId = userId;
    _role = role;

    if (_socket != null) {
      try {
        _socket?.disconnect();
        _socket?.dispose();
      } catch (_) {}
      _socket = null;
    }

    final url = EnvironmentConfig.activeSocketUrl;
    debugPrint('[Socket] Connecting to $url with userId=$userId role=$role');

    _socket = io.io(
      url,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .enableReconnection()
          .setReconnectionDelay(1500)
          .setReconnectionDelayMax(8000)
          .disableAutoConnect()
          .setQuery({'userId': userId, 'role': role})
          .build(),
    );

    _socket?.onConnect((_) {
      _isConnected = true;
      debugPrint('[Socket] Connected successfully to real-time engine');
      if (_userId != null && _userId!.isNotEmpty) {
        _socket?.emit('join_room', '${_role}_$_userId');
      }
      for (final room in _activeRooms) {
        _socket?.emit('join_room', room);
      }
    });

    _socket?.onDisconnect((_) {
      _isConnected = false;
      debugPrint('[Socket] Disconnected from real-time engine');
    });

    _socket?.onConnectError((err) {
      _isConnected = false;
      debugPrint('[Socket] Connection error: $err');
    });

    _socket?.connect();
  }

  void joinRoom(String room) {
    _activeRooms.add(room);
    _socket?.emit('join_room', room);
  }

  void leaveRoom(String room) {
    _activeRooms.remove(room);
    _socket?.emit('leave_room', room);
  }

  void joinTripRoom(String tripId) {
    if (tripId.isEmpty) return;
    joinRoom('trip_$tripId');
  }

  void leaveTripRoom(String tripId) {
    if (tripId.isEmpty) return;
    leaveRoom('trip_$tripId');
  }

  void on(String event, Function(dynamic) handler) {
    _socket?.on(event, handler);
  }

  void off(String event) {
    _socket?.off(event);
  }

  void emit(String event, dynamic data) {
    _socket?.emit(event, data);
  }

  void sendLocationUpdate({
    required String driverId,
    required double lat,
    required double lng,
    double heading = 0.0,
    double speed = 0.0,
    String? tripId,
  }) {
    final payload = {
      'driverId': driverId,
      'lat': lat,
      'lng': lng,
      'latitude': lat,
      'longitude': lng,
      'heading': heading,
      'speed': speed,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      if (tripId != null && tripId.isNotEmpty) 'tripId': tripId,
    };
    emit('driver:location_update', payload);
    if (tripId != null && tripId.isNotEmpty) {
      emit('trip:driver_location', payload);
    }
  }

  void emitDriverLocation({
    required String driverId,
    required double latitude,
    required double longitude,
    double heading = 0.0,
    double speed = 0.0,
    String? tripId,
  }) {
    sendLocationUpdate(
      driverId: driverId,
      lat: latitude,
      lng: longitude,
      heading: heading,
      speed: speed,
      tripId: tripId,
    );
  }

  void sendChatMessage({
    String? tripId,
    required String senderId,
    required String recipientId,
    required String text,
  }) {
    emit('chat:send_message', {
      if (tripId != null) 'tripId': tripId,
      'senderId': senderId,
      'recipientId': recipientId,
      'text': text,
    });
  }

  void disconnect() {
    _activeRooms.clear();
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
  }
}
