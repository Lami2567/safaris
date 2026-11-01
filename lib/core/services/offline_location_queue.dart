import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

/// Connection state indicator enum
enum TelemetryConnectionState {
  online,
  connecting,
  weakConnection,
  offline,
  syncing,
}

/// A single GPS telemetry coordinate with accuracy, speed, heading, and battery metadata
class LocationTelemetryPoint {
  final String id;
  final String? tripId;
  final String? safariLegId;
  final String? driverId;
  final double latitude;
  final double longitude;
  final double accuracy; // in meters
  final double speed; // in km/h or m/s
  final double heading; // 0.0 - 360.0 degrees
  final double? batteryLevel; // 0.0 - 100.0%
  final DateTime timestamp;
  final bool isOfflineQueued;

  LocationTelemetryPoint({
    String? id,
    this.tripId,
    this.safariLegId,
    this.driverId,
    required this.latitude,
    required this.longitude,
    this.accuracy = 5.0,
    this.speed = 0.0,
    this.heading = 0.0,
    this.batteryLevel,
    DateTime? timestamp,
    this.isOfflineQueued = false,
  })  : id = id ?? const Uuid().v4(),
        timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'tripId': tripId,
      'safariLegId': safariLegId,
      'driverId': driverId,
      'latitude': latitude,
      'longitude': longitude,
      'accuracy': accuracy,
      'speed': speed,
      'heading': heading,
      'batteryLevel': batteryLevel,
      'timestamp': timestamp.toIso8601String(),
      'isOfflineQueued': isOfflineQueued,
    };
  }

  factory LocationTelemetryPoint.fromJson(Map<String, dynamic> json) {
    return LocationTelemetryPoint(
      id: json['id'] as String? ?? const Uuid().v4(),
      tripId: json['tripId'] as String?,
      safariLegId: json['safariLegId'] as String?,
      driverId: json['driverId'] as String?,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      accuracy: (json['accuracy'] as num?)?.toDouble() ?? 5.0,
      speed: (json['speed'] as num?)?.toDouble() ?? 0.0,
      heading: (json['heading'] as num?)?.toDouble() ?? 0.0,
      batteryLevel: (json['batteryLevel'] as num?)?.toDouble(),
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'] as String) ?? DateTime.now()
          : DateTime.now(),
      isOfflineQueued: json['isOfflineQueued'] as bool? ?? false,
    );
  }
}

/// Offline Location Queue
/// Manages high-reliability GPS queuing and batch sync during safari expeditions
class OfflineLocationQueue extends ChangeNotifier {
  static final OfflineLocationQueue _instance = OfflineLocationQueue._internal();
  factory OfflineLocationQueue() => _instance;
  OfflineLocationQueue._internal();

  static const String _storageKey = 'mumwe_safaris_offline_telemetry_queue';
  static const int _maxQueueSize = 2000;
  static const int _batchSize = 50;

  final List<LocationTelemetryPoint> _queue = [];
  TelemetryConnectionState _connectionState = TelemetryConnectionState.online;
  bool _isSyncing = false;
  Timer? _syncTimer;

  List<LocationTelemetryPoint> get queue => List.unmodifiable(_queue);
  int get queuedCount => _queue.length;
  TelemetryConnectionState get connectionState => _connectionState;
  bool get isSyncing => _isSyncing;

  /// Initialize queue from local storage on app start
  Future<void> initialize() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final rawData = prefs.getString(_storageKey);
      if (rawData != null && rawData.isNotEmpty) {
        final List<dynamic> decoded = jsonDecode(rawData);
        _queue.clear();
        for (final item in decoded) {
          if (item is Map<String, dynamic>) {
            _queue.add(LocationTelemetryPoint.fromJson(item));
          }
        }
      }
      notifyListeners();
    } catch (e) {
      debugPrint('[OfflineLocationQueue] Error restoring queue: $e');
    }

    // Schedule periodic sync every 30 seconds if queue not empty
    _syncTimer?.cancel();
    _syncTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_queue.isNotEmpty && !_isSyncing) {
        syncPendingPoints();
      }
    });
  }

  /// Add a point to the queue (either live or offline)
  Future<void> enqueue(LocationTelemetryPoint point) async {
    // Prevent unlimited memory growth: FIFO trim if max queue size reached
    if (_queue.length >= _maxQueueSize) {
      _queue.removeAt(0);
    }
    _queue.add(point);
    await _persist();
    notifyListeners();
  }

  /// Update connection state
  void setConnectionState(TelemetryConnectionState state) {
    if (_connectionState != state) {
      _connectionState = state;
      notifyListeners();

      // If returning to online, trigger immediate batch sync
      if (state == TelemetryConnectionState.online && _queue.isNotEmpty && !_isSyncing) {
        syncPendingPoints();
      }
    }
  }

  /// Batch sync pending queued points to backend
  Future<bool> syncPendingPoints({
    String baseUrl = 'https://admin.mumwesafarisuganda.com',
    String? token,
  }) async {
    if (_isSyncing || _queue.isEmpty) return false;

    _isSyncing = true;
    final previousState = _connectionState;
    _connectionState = TelemetryConnectionState.syncing;
    notifyListeners();

    try {
      // Process in batches
      while (_queue.isNotEmpty) {
        final batch = _queue.take(_batchSize).toList();
        final pointsJson = batch.map((p) => p.toJson()).toList();

        final response = await http
            .post(
              Uri.parse('$baseUrl/api/v1/telemetry/batch'),
              headers: {
                'Content-Type': 'application/json',
                if (token != null) 'Authorization': 'Bearer $token',
              },
              body: jsonEncode({
                'batchId': const Uuid().v4(),
                'points': pointsJson,
                'clientSentAt': DateTime.now().toIso8601String(),
              }),
            )
            .timeout(const Duration(seconds: 15));

        if (response.statusCode >= 200 && response.statusCode < 300) {
          // Remove synced batch
          _queue.removeRange(0, batch.length);
          await _persist();
          notifyListeners();
        } else {
          // Sync failed, pause and resume later
          debugPrint('[OfflineLocationQueue] Batch sync HTTP ${response.statusCode}');
          break;
        }
      }

      _connectionState = _queue.isEmpty ? TelemetryConnectionState.online : previousState;
      return _queue.isEmpty;
    } catch (e) {
      debugPrint('[OfflineLocationQueue] Network sync error: $e');
      _connectionState = TelemetryConnectionState.offline;
      return false;
    } finally {
      _isSyncing = false;
      notifyListeners();
    }
  }

  /// Clear queue manually (e.g., after trip completion or user logout)
  Future<void> clearQueue() async {
    _queue.clear();
    await _persist();
    notifyListeners();
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonList = _queue.map((p) => p.toJson()).toList();
      await prefs.setString(_storageKey, jsonEncode(jsonList));
    } catch (e) {
      debugPrint('[OfflineLocationQueue] Persist failed: $e');
    }
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    super.dispose();
  }
}
