package com.safaris.safaris

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Production Foreground Service for Mumwe Safaris live trip tracking & turn-by-turn navigation.
 * Keeps GPS collection active when the app is minimized or the screen is locked and renders
 * a Google Maps-style persistent live navigation notification.
 */
class SafarisNavigationService : Service() {

    companion object {
        const val CHANNEL_ID = "mumwe_safaris_live_navigation"
        const val CHANNEL_NAME = "Mumwe Safaris Live Navigation"
        const val NOTIFICATION_ID = 25601

        const val ACTION_START_OR_UPDATE = "com.safaris.safaris.ACTION_START_OR_UPDATE_NAV"
        const val ACTION_STOP = "com.safaris.safaris.ACTION_STOP_NAV"
        const val ACTION_OPEN_ACTIVE_TRIP = "com.safaris.safaris.ACTION_OPEN_ACTIVE_TRIP"

        const val EXTRA_TRIP_ID = "tripId"
        const val EXTRA_STATUS_LABEL = "statusLabel"
        const val EXTRA_INSTRUCTION = "instruction"
        const val EXTRA_NEXT_STEP_DISTANCE = "nextStepDistance"
        const val EXTRA_REMAINING_DISTANCE = "remainingDistance"
        const val EXTRA_ETA_TEXT = "etaText"
        const val EXTRA_DESTINATION_NAME = "destinationName"

        @Volatile
        var isRunning: Boolean = false
            private set
    }

    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopNavigationForeground()
            return START_NOT_STICKY
        }

        val statusLabel = intent?.getStringExtra(EXTRA_STATUS_LABEL) ?: "Mumwe Safaris • Active Trip"
        val instruction = intent?.getStringExtra(EXTRA_INSTRUCTION) ?: "Proceed along verified route"
        val nextStepDistance = intent?.getStringExtra(EXTRA_NEXT_STEP_DISTANCE) ?: ""
        val remainingDistance = intent?.getStringExtra(EXTRA_REMAINING_DISTANCE) ?: ""
        val etaText = intent?.getStringExtra(EXTRA_ETA_TEXT) ?: ""
        val destinationName = intent?.getStringExtra(EXTRA_DESTINATION_NAME) ?: "Destination"
        val tripId = intent?.getStringExtra(EXTRA_TRIP_ID) ?: ""

        val notification = buildNavigationNotification(
            tripId = tripId,
            statusLabel = statusLabel,
            instruction = instruction,
            nextStepDistance = nextStepDistance,
            remainingDistance = remainingDistance,
            etaText = etaText,
            destinationName = destinationName
        )

        if (!isRunning) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            isRunning = true
        } else {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, notification)
        }

        return START_STICKY
    }

    private fun stopNavigationForeground() {
        isRunning = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    override fun onDestroy() {
        isRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Displays real-time turn-by-turn navigation, distance, and ETA during active Mumwe Safaris trips."
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNavigationNotification(
        tripId: String,
        statusLabel: String,
        instruction: String,
        nextStepDistance: String,
        remainingDistance: String,
        etaText: String,
        destinationName: String
    ): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_OPEN_ACTIVE_TRIP
            putExtra(EXTRA_TRIP_ID, tripId)
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val contentPendingIntent = PendingIntent.getActivity(this, 1001, openIntent, pendingFlags)

        val titleText = if (nextStepDistance.isNotEmpty()) {
            "$nextStepDistance • $instruction"
        } else {
            instruction
        }

        val metricsParts = mutableListOf<String>()
        if (remainingDistance.isNotEmpty()) metricsParts.add(remainingDistance)
        if (etaText.isNotEmpty()) metricsParts.add("ETA $etaText")
        if (destinationName.isNotEmpty()) metricsParts.add("To $destinationName")
        val contentText = metricsParts.joinToString(" • ").ifEmpty { statusLabel }

        val bigText = buildString {
            appendLine(statusLabel)
            appendLine(titleText)
            if (metricsParts.isNotEmpty()) {
                append(metricsParts.joinToString(" • "))
            }
        }

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        builder
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(titleText)
            .setContentText(contentText)
            .setSubText("Mumwe Safaris • $statusLabel")
            .setStyle(Notification.BigTextStyle().bigText(bigText))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentPendingIntent)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setCategory(Notification.CATEGORY_NAVIGATION)
            builder.setVisibility(Notification.VISIBILITY_PUBLIC)
            builder.setColor(0xFFD4A853.toInt())
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val action = Notification.Action.Builder(
                null,
                "Return to Active Trip",
                contentPendingIntent
            ).build()
            builder.addAction(action)
        }

        return builder.build()
    }
}
