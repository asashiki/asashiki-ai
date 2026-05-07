package com.asashiki.agent

// Based on live-dashboard ApiReporter.
// Key changes vs original:
//   - Endpoint: /api/devices/report (was /api/report)
//   - Field names: camelCase to match Asashiki Core API schema
//     app_id → appId, window_title → windowTitle, timestamp → occurredAt
//   - Removed /api/consent (not used in Asashiki)
//   - User-Agent updated

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URI
import java.time.Instant
import java.util.concurrent.TimeUnit

object ApiReporter {
    private const val TAG = "ApiReporter"
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    fun postReport(
        settings: AgentSettings,
        appInfo: ForegroundAppInfo,
        extras: DeviceExtras
    ): Boolean {
        val baseUrl = normalizeBaseUrl(settings.serverUrl) ?: return false
        if (settings.token.isBlank() || !settings.reportActivity) return false

        val extraJson = JSONObject()
        if (settings.reportBattery) {
            extras.batteryPercent?.let { extraJson.put("battery_percent", it) }
            extras.batteryCharging?.let { extraJson.put("battery_charging", it) }
        }
        extraJson.put("network_type", extras.networkType)
        extras.customAppName?.takeIf { it.isNotBlank() }
            ?.let { extraJson.put("custom_app_name", it.take(64)) }
        extras.customDescription?.takeIf { it.isNotBlank() }
            ?.let { extraJson.put("custom_description", it.take(256)) }
        extras.music?.let { music ->
            val musicJson = JSONObject().put("title", music.title.take(256))
            music.artist?.takeIf { it.isNotBlank() }?.let { musicJson.put("artist", it.take(256)) }
            music.app?.takeIf { it.isNotBlank() }?.let { musicJson.put("app", it.take(64)) }
            extraJson.put("music", musicJson)
        }

        // Asashiki Core API schema: camelCase fields
        val body = JSONObject()
            .put("appId", appInfo.packageName)
            .put("windowTitle", appInfo.appName)
            .put("occurredAt", Instant.ofEpochMilli(appInfo.timestampMs).toString())
            .put("extra", extraJson)

        val request = Request.Builder()
            .url("$baseUrl/api/devices/report")
            .addHeader("Authorization", "Bearer ${settings.token}")
            .addHeader("User-Agent", "asashiki-android-agent/1.0.0")
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()

        return execute(request)
    }

    fun postHealthBatch(baseUrl: String, token: String, records: List<JSONObject>): Boolean {
        val normalized = normalizeBaseUrl(baseUrl) ?: return false
        if (token.isBlank() || records.isEmpty()) return false

        val arr = org.json.JSONArray()
        records.forEach { arr.put(it) }
        val body = JSONObject().put("records", arr)

        val request = Request.Builder()
            .url("$normalized/api/devices/health")
            .addHeader("Authorization", "Bearer $token")
            .addHeader("User-Agent", "asashiki-android-agent/1.0.0")
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()

        return execute(request)
    }

    private fun execute(request: Request): Boolean {
        return try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) Log.w(TAG, "Request failed: ${response.code}")
                response.isSuccessful
            }
        } catch (e: Exception) {
            Log.w(TAG, "Request error: ${e.message}")
            false
        }
    }

    fun normalizeBaseUrl(raw: String): String? {
        val candidate = raw.trim().trimEnd('/')
        if (candidate.isBlank()) return null
        return try {
            val uri = URI(candidate)
            val scheme = uri.scheme?.lowercase() ?: return null
            val host = uri.host?.lowercase() ?: return null
            if ((scheme != "https" && scheme != "http") || host.isBlank()) return null
            candidate
        } catch (_: Exception) {
            null
        }
    }
}
