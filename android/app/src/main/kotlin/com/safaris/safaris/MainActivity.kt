package com.safaris.safaris

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.safaris.safaris/navigation_service"
    private val NOTIFICATION_PERMISSION_REQ_CODE = 25602
    private var pendingNotificationPermissionResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "startOrUpdateNavigation" -> {
                        val args = call.arguments as? Map<*, *>
                        val intent = Intent(this, SafarisNavigationService::class.java).apply {
                            action = SafarisNavigationService.ACTION_START_OR_UPDATE
                            putExtra(SafarisNavigationService.EXTRA_TRIP_ID, args?.get("tripId")?.toString() ?: "")
                            putExtra(SafarisNavigationService.EXTRA_STATUS_LABEL, args?.get("statusLabel")?.toString() ?: "Active Trip")
                            putExtra(SafarisNavigationService.EXTRA_INSTRUCTION, args?.get("instruction")?.toString() ?: "Continue on route")
                            putExtra(SafarisNavigationService.EXTRA_NEXT_STEP_DISTANCE, args?.get("nextStepDistance")?.toString() ?: "")
                            putExtra(SafarisNavigationService.EXTRA_REMAINING_DISTANCE, args?.get("remainingDistance")?.toString() ?: "")
                            putExtra(SafarisNavigationService.EXTRA_ETA_TEXT, args?.get("etaText")?.toString() ?: "")
                            putExtra(SafarisNavigationService.EXTRA_DESTINATION_NAME, args?.get("destinationName")?.toString() ?: "")
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            startForegroundService(intent)
                        } else {
                            startService(intent)
                        }
                        result.success(true)
                    }
                    "stopNavigation" -> {
                        val intent = Intent(this, SafarisNavigationService::class.java).apply {
                            action = SafarisNavigationService.ACTION_STOP
                        }
                        stopService(intent)
                        result.success(true)
                    }
                    "isServiceRunning" -> {
                        result.success(SafarisNavigationService.isRunning)
                    }
                    "checkNotificationPermission" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            val granted = ContextCompat.checkSelfPermission(
                                this,
                                Manifest.permission.POST_NOTIFICATIONS
                            ) == PackageManager.PERMISSION_GRANTED
                            result.success(granted)
                        } else {
                            result.success(true)
                        }
                    }
                    "requestNotificationPermission" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            val granted = ContextCompat.checkSelfPermission(
                                this,
                                Manifest.permission.POST_NOTIFICATIONS
                            ) == PackageManager.PERMISSION_GRANTED
                            if (granted) {
                                result.success(true)
                            } else {
                                pendingNotificationPermissionResult = result
                                ActivityCompat.requestPermissions(
                                    this,
                                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                                    NOTIFICATION_PERMISSION_REQ_CODE
                                )
                            }
                        } else {
                            result.success(true)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NOTIFICATION_PERMISSION_REQ_CODE) {
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            pendingNotificationPermissionResult?.success(granted)
            pendingNotificationPermissionResult = null
        }
    }
}
