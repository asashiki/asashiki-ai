package com.asashiki.agent

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

class LocationTracker(
    private val context: Context,
    private val scope: CoroutineScope
) {
    private val TAG = "LocationTracker"

    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private val buffer = ArrayDeque<JSONObject>()
    private var running = false
    private var serverUrl = ""
    private var token = ""
    private var flushJob: Job? = null

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { addToBuffer(it) }
        }
    }

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    fun start(serverUrl: String, token: String) {
        if (!hasPermission()) {
            Log.w(TAG, "No location permission")
            return
        }
        if (running) {
            this.serverUrl = serverUrl
            this.token = token
            return
        }
        this.serverUrl = serverUrl
        this.token = token
        this.running = true

        // Balanced accuracy uses network + cell + GPS as needed — much cheaper than HIGH_ACCURACY
        val request = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            INTERVAL_NORMAL_MS
        )
            .setMinUpdateDistanceMeters(MIN_DISTANCE_M)
            .setWaitForAccurateLocation(false)
            .build()

        fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        Log.i(TAG, "Location tracking started")

        flushJob = scope.launch {
            while (isActive) {
                delay(FLUSH_INTERVAL_MS)
                flush()
            }
        }
    }

    fun stop() {
        if (!running) return
        running = false
        fusedClient.removeLocationUpdates(locationCallback)
        flushJob?.cancel()
        flushJob = null
        scope.launch { flush() }
        Log.i(TAG, "Location tracking stopped")
    }

    fun updateConfig(serverUrl: String, token: String) {
        this.serverUrl = serverUrl
        this.token = token
    }

    @Synchronized
    private fun addToBuffer(location: Location) {
        val obj = JSONObject().apply {
            put("lat", location.latitude)
            put("lon", location.longitude)
            if (location.hasAccuracy()) put("accuracyM", location.accuracy)
            if (location.hasAltitude()) put("altitudeM", location.altitude)
            if (location.hasSpeed()) put("speedMps", location.speed)
            if (location.hasBearing()) put("bearingDeg", location.bearing)
            // Coarse activity guess from speed: <0.5 m/s still, <2 walking, <8 cycling, else vehicle
            if (location.hasSpeed()) {
                val speed = location.speed
                val activity = when {
                    speed < 0.5f -> "still"
                    speed < 2.0f -> "on_foot"
                    speed < 8.0f -> "on_foot"
                    else -> "in_vehicle"
                }
                put("activity", activity)
            }
            put("recordedAt", Instant.ofEpochMilli(location.time).toString())
        }
        buffer.addLast(obj)
        // Keep buffer bounded
        while (buffer.size > BUFFER_MAX) buffer.removeFirst()

        if (buffer.size >= FLUSH_AT_SIZE) {
            scope.launch { flush() }
        }
    }

    @Synchronized
    private fun drainBuffer(): JSONArray {
        val arr = JSONArray()
        while (buffer.isNotEmpty()) arr.put(buffer.removeFirst())
        return arr
    }

    private fun flush() {
        val points = drainBuffer()
        if (points.length() == 0 || serverUrl.isBlank() || token.isBlank()) return
        val baseUrl = ApiReporter.normalizeBaseUrl(serverUrl) ?: return
        val ok = ApiReporter.postLocationBatch(baseUrl, token, points)
        if (ok) {
            Log.i(TAG, "Uploaded ${points.length()} location points")
        } else {
            Log.w(TAG, "Location upload failed, re-queuing")
            synchronized(this) {
                // Re-add up to buffer limit (newer points already added during failed attempt)
                for (i in 0 until minOf(points.length(), BUFFER_MAX - buffer.size)) {
                    buffer.addFirst(points.getJSONObject(points.length() - 1 - i))
                }
            }
        }
    }

    companion object {
        private const val INTERVAL_NORMAL_MS = 10 * 60 * 1000L  // 10 min
        private const val MIN_DISTANCE_M = 100f                  // ignore <100m moves
        private const val FLUSH_INTERVAL_MS = 5 * 60 * 1000L    // flush every 5 min
        private const val FLUSH_AT_SIZE = 20                     // or when 20 points queued
        private const val BUFFER_MAX = 100
    }
}
