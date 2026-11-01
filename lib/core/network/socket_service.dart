import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/environment_config.dart';

class RealtimeSocketService {
  static final RealtimeSocketService _instance = RealtimeSocketService._internal();
  factory RealtimeSocketService() => _instance;
  RealtimeSocketService._internal();

  io.Socket? _socket;
  bool _isConnected = false;

  bool get isConnected => _isConnected;

  void connect({required String userId, String role = 'customer'}) {
    if (_socket != null && _isConnected) return;
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
          .disableAutoConnect()
          .setQuery({'userId': userId, 'role': role})
          .build(),
    );

    _socket?.onConnect((_) {
      _isConnected = true;
      debugPrint('[Socket] Connected successfully to real-time engine');
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
    _socket?.emit('join_room', room);
  }

  void leaveRoom(String room) {
    _socket?.emit('leave_room', room);
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
    emit('driver:location_update', {
      'driverId': driverId,
      'lat': lat,
      'lng': lng,
      'heading': heading,
      'speed': speed,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      if (tripId != null) 'tripId': tripId,
    });
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
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
  }
}
