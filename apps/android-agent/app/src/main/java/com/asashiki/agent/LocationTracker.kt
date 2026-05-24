package com.asashiki.agent

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import kotlin.coroutines.resume

/**
 * Polling-style location tracker.
 *
 * Why polling instead of requestLocationUpdates: on MIUI / HyperOS, a persistent location
 * subscription (even at PRIORITY_BALANCED with a 10-minute interval) lights up the green
 * indicator dot continuously. By using getCurrentLocation() for a single one-shot fix at
 * each tick, the indicator only blinks for a few seconds per sample.
 *
 * Trade-off: we may miss intermediate points if the user moves quickly between ticks.
 * Per user preference, real-time precision is not required.
 */
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
    private var pollJob: Job? = null
    private var flushJob: Job? = null
    private var lastLat: Double? = null
    private var lastLon: Double? = null

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED

    fun start(serverUrl: String, token: String) {
        if (!hasPermission()) {
            Log.w(TAG, "No location permission")
            return
        }
        this.serverUrl = serverUrl
        this.token = token
        if (running) return
        running = true

        pollJob = scope.launch {
            // Take an initial sample shortly after start so the user sees a point quickly,
            // but not instantly (avoids stacking with other startup work).
            delay(20_000)
            while (isActive) {
                sampleOnce()
                delay(POLL_INTERVAL_MS)
            }
        }

        flushJob = scope.launch {
            while (isActive) {
                delay(FLUSH_INTERVAL_MS)
                flush()
            }
        }

        Log.i(TAG, "Location polling started (every ${POLL_INTERVAL_MS / 60_000} min)")
    }

    fun stop() {
        if (!running) return
        running = false
        pollJob?.cancel()
        pollJob = null
        flushJob?.cancel()
        flushJob = null
        scope.launch { flush() }
        Log.i(TAG, "Location polling stopped")
    }

    fun updateConfig(serverUrl: String, token: String) {
        this.serverUrl = serverUrl
        this.token = token
    }

    @SuppressLint("MissingPermission")
    private suspend fun sampleOnce() {
        if (!hasPermission()) return
        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
            .setMaxUpdateAgeMillis(2 * 60 * 1000L)   // accept a cached fix up to 2 min old
            .setDurationMillis(30 * 1000L)            // give up after 30s
            .build()

        val location: Location? = try {
            withContext(Dispatchers.IO) {
                suspendCancellableCoroutine<Location?> { cont ->
                    val task = fusedClient.getCurrentLocation(request, null)
                    task.addOnSuccessListener { loc -> if (cont.isActive) cont.resume(loc) }
                    task.addOnFailureListener { e ->
                        Log.w(TAG, "getCurrentLocation failed: ${e.message}")
                        if (cont.isActive) cont.resume(null)
                    }
                    task.addOnCanceledListener { if (cont.isActive) cont.resume(null) }
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            Log.w(TAG, "sample error: ${e.message}")
            null
        }

        location?.let { addToBuffer(it) }
    }

    @Synchronized
    private fun addToBuffer(location: Location) {
        // Skip near-duplicates: if we haven't moved at least MIN_DISTANCE_M from the last
        // recorded point, don't record again. Saves storage and bandwidth.
        val lat = location.latitude
        val lon = location.longitude
        val prevLat = lastLat
        val prevLon = lastLon
        if (prevLat != null && prevLon != null) {
            val results = FloatArray(1)
            Location.distanceBetween(prevLat, prevLon, lat, lon, results)
            if (results[0] < MIN_DISTANCE_M) {
                Log.d(TAG, "Skipping near-duplicate point (moved ${results[0]}m)")
                return
            }
        }
        lastLat = lat
        lastLon = lon

        val obj = JSONObject().apply {
            put("lat", lat)
            put("lon", lon)
            if (location.hasAccuracy()) put("accuracyM", location.accuracy)
            if (location.hasAltitude()) put("altitudeM", location.altitude)
            if (location.hasSpeed()) put("speedMps", location.speed)
            if (location.hasBearing()) put("bearingDeg", location.bearing)
            if (location.hasSpeed()) {
                val speed = location.speed
                val activity = when {
                    speed < 0.5f -> "still"
                    speed < 8.0f -> "on_foot"
                    else -> "in_vehicle"
                }
                put("activity", activity)
            }
            put("recordedAt", Instant.ofEpochMilli(location.time).toString())
        }
        buffer.addLast(obj)
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
                for (i in 0 until minOf(points.length(), BUFFER_MAX - buffer.size)) {
                    buffer.addFirst(points.getJSONObject(points.length() - 1 - i))
                }
            }
        }
    }

    companion object {
        private const val POLL_INTERVAL_MS = 10 * 60 * 1000L     // sample every 10 min
        private const val MIN_DISTANCE_M = 80f                    // skip if moved <80m
        private const val FLUSH_INTERVAL_MS = 5 * 60 * 1000L     // upload every 5 min
        private const val FLUSH_AT_SIZE = 10
        private const val BUFFER_MAX = 100
    }
}
