package com.asashiki.agent

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Read-only snapshot of system signals that affect background survival.
 * Used to power the in-app diagnostics panel so the user can see *why* the service
 * may be getting killed, rather than guessing.
 */
data class RuntimeDiagnosticsSnapshot(
    val batteryUnrestricted: Boolean,
    val standbyBucket: String,
    val serviceRunning: Boolean,
    val recentExits: List<ExitEntry>,
    val capturedCrashes: List<CrashCapture.Entry>,
) {
    data class ExitEntry(
        val timestamp: String,
        val reason: String,
        val importance: String,
        val description: String?,
        // First ~30 lines of the crash/ANR trace, if available.
        val traceExcerpt: String?,
    )
}

object RuntimeDiagnostics {

    fun snapshot(context: Context): RuntimeDiagnosticsSnapshot {
        return RuntimeDiagnosticsSnapshot(
            batteryUnrestricted = readBatteryUnrestricted(context),
            standbyBucket = readStandbyBucket(context),
            serviceRunning = isTrackingServiceRunning(context),
            recentExits = readRecentExits(context),
            capturedCrashes = CrashCapture.loadHistory(context),
        )
    }

    private fun readBatteryUnrestricted(context: Context): Boolean {
        val pm = context.getSystemService(PowerManager::class.java) ?: return false
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    private fun readStandbyBucket(context: Context): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return "n/a (<API 28)"
        val usm = context.getSystemService(UsageStatsManager::class.java) ?: return "unknown"
        return when (usm.appStandbyBucket) {
            UsageStatsManager.STANDBY_BUCKET_ACTIVE -> "ACTIVE"
            UsageStatsManager.STANDBY_BUCKET_WORKING_SET -> "WORKING_SET"
            UsageStatsManager.STANDBY_BUCKET_FREQUENT -> "FREQUENT"
            UsageStatsManager.STANDBY_BUCKET_RARE -> "RARE"
            UsageStatsManager.STANDBY_BUCKET_RESTRICTED -> "RESTRICTED"
            else -> "unknown"
        }
    }

    @Suppress("DEPRECATION")
    private fun isTrackingServiceRunning(context: Context): Boolean {
        // getRunningServices is deprecated for third-party use but still returns the
        // caller's own services, which is exactly what we want here.
        val am = context.getSystemService(ActivityManager::class.java) ?: return false
        return runCatching {
            am.getRunningServices(Int.MAX_VALUE)
                .any { it.service.className == TrackingService::class.java.name }
        }.getOrDefault(false)
    }

    private fun readRecentExits(context: Context): List<RuntimeDiagnosticsSnapshot.ExitEntry> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return emptyList()
        val am = context.getSystemService(ActivityManager::class.java) ?: return emptyList()
        val fmt = SimpleDateFormat("MM-dd HH:mm:ss", Locale.getDefault())
        return runCatching {
            am.getHistoricalProcessExitReasons(context.packageName, 0, 10).map { info ->
                RuntimeDiagnosticsSnapshot.ExitEntry(
                    timestamp = fmt.format(Date(info.timestamp)),
                    reason = reasonName(info.reason),
                    importance = importanceName(info.importance),
                    description = info.description,
                    traceExcerpt = readTrace(info),
                )
            }
        }.getOrDefault(emptyList())
    }

    private fun readTrace(info: ApplicationExitInfo): String? {
        // Trace is only populated for CRASH / CRASH_NATIVE / ANR reasons.
        val hasTrace = info.reason == ApplicationExitInfo.REASON_CRASH ||
            info.reason == ApplicationExitInfo.REASON_CRASH_NATIVE ||
            info.reason == ApplicationExitInfo.REASON_ANR
        if (!hasTrace) return null
        return runCatching {
            info.traceInputStream?.bufferedReader()?.use { reader ->
                val lines = mutableListOf<String>()
                var line = reader.readLine()
                while (line != null && lines.size < 60) {
                    lines += line
                    line = reader.readLine()
                }
                lines.joinToString("\n")
            }
        }.getOrNull()?.takeIf { it.isNotBlank() }
    }

    private fun reasonName(reason: Int): String = when (reason) {
        ApplicationExitInfo.REASON_UNKNOWN -> "UNKNOWN"
        ApplicationExitInfo.REASON_EXIT_SELF -> "EXIT_SELF"
        ApplicationExitInfo.REASON_SIGNALED -> "SIGNALED"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "LOW_MEMORY"
        ApplicationExitInfo.REASON_CRASH -> "CRASH"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "CRASH_NATIVE"
        ApplicationExitInfo.REASON_ANR -> "ANR"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "INIT_FAIL"
        ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "PERM_CHANGE"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "EXCESSIVE_RES"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "USER_REQUESTED"
        ApplicationExitInfo.REASON_USER_STOPPED -> "USER_STOPPED"
        ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "DEPENDENCY_DIED"
        ApplicationExitInfo.REASON_OTHER -> "OTHER"
        else -> "REASON_$reason"
    }

    private fun importanceName(importance: Int): String = when (importance) {
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND -> "FG"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND_SERVICE -> "FGS"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_TOP_SLEEPING -> "TOP_SLEEP"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE -> "VISIBLE"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_PERCEPTIBLE -> "PERCEPTIBLE"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_SERVICE -> "SERVICE"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_CACHED -> "CACHED"
        ActivityManager.RunningAppProcessInfo.IMPORTANCE_GONE -> "GONE"
        else -> "I_$importance"
    }
}
