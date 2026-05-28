package com.asashiki.agent

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.max

class TrackingService : Service() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var settingsStore: SettingsStore
    private lateinit var locationTracker: LocationTracker
    private lateinit var voicePoller: VoiceMessagePoller

    private var trackingJob: Job? = null
    private var lastSentKey = ""
    private var lastSuccessfulReportAt = 0L
    private var lastNotificationText = ""
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        settingsStore = SettingsStore(this)
        locationTracker = LocationTracker(this, serviceScope)
        voicePoller = VoiceMessagePoller(this, serviceScope)
        createNotificationChannel()
        settingsStore.appendLog("服务已创建")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                settingsStore.setRunningEnabled(false)
                settingsStore.appendLog("收到停止指令")
                WatchdogWorker.cancel(this)
                stopTracking()
                return START_NOT_STICKY
            }

            ACTION_START, null -> {
                settingsStore.appendLog("收到启动指令")
                WatchdogWorker.enqueue(this)
                startTrackingIfNeeded()
                return START_STICKY
            }

            else -> return START_STICKY
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        val shouldRecover = settingsStore.load().isRunningEnabled
        stopTracking(cancelWatchdog = !shouldRecover)
        if (shouldRecover) {
            scheduleWatchdog(20_000)
            settingsStore.appendLog("服务被销毁，已安排自动恢复")
        }
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (settingsStore.load().isRunningEnabled) {
            scheduleWatchdog(15_000)
            settingsStore.appendLog("任务被系统移除，已安排自动恢复")
        }
        super.onTaskRemoved(rootIntent)
    }

    private fun startTrackingIfNeeded() {
        if (trackingJob?.isActive == true) return

        // FGS type combines DATA_SYNC + LOCATION when location permission is granted.
        // LOCATION type gives the strongest background guarantees on MIUI/HyperOS.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification("正在准备监听"),
                effectiveServiceType())
        } else {
            startForeground(NOTIFICATION_ID, buildNotification("正在准备监听"))
        }
        acquireWakeLock()
        scheduleWatchdog()
        if (BuildConfig.INCLUDE_CHAT) {
            voicePoller.start(
                getServerUrl = { settingsStore.load().serverUrl },
                getToken = { settingsStore.load().token }
            )
        }

        trackingJob = serviceScope.launch {
            while (isActive) {
                try {
                    runOneTick()
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (t: Throwable) {
                    // Log any unexpected throwable instead of letting it crash the service
                    // and trigger the watchdog restart loop.
                    val msg = "循环异常：${t.javaClass.simpleName}: ${t.message}"
                    settingsStore.appendLog(msg)
                    android.util.Log.e("TrackingService", msg, t)
                    delay(5_000)
                }
            }
        }
    }

    private suspend fun runOneTick() {
        val settings = settingsStore.load()
        scheduleWatchdog(calculateWatchdogDelay(settings))

        // Sync location tracker state with settings
        if (settings.locationTrackingEnabled && settings.isRunningEnabled) {
            locationTracker.start(settings.serverUrl, settings.token)
        } else {
            locationTracker.stop()
        }

        if (!settings.isRunningEnabled) {
            setServiceState("等待启动", "等待用户启动监听")
            delay(2_000)
            return
        }

        if (!settings.consentGiven || !settings.reportActivity) {
            setServiceState("需要先同意授权")
            delay(5_000)
            return
        }

        if (!UsageTracker.hasUsageStatsPermission(this@TrackingService)) {
            setServiceState("未授予使用情况访问权限")
            delay(5_000)
            return
        }

        val appInfo = UsageTracker.currentForegroundApp(this@TrackingService)
        if (appInfo == null) {
            setServiceState("等待前台应用")
            delay(settings.heartbeatSeconds * 1_000L)
            return
        }

        val customRule = settings.customRules.firstOrNull {
            it.packageName.equals(appInfo.packageName, ignoreCase = true)
        }
        val effectiveAppInfo = if (customRule != null) {
            appInfo.copy(appName = customRule.customAppName)
        } else {
            appInfo
        }

        val extras = DeviceContextProvider.readExtras(
            context = this@TrackingService,
            customAppName = customRule?.customAppName,
            customDescription = customRule?.customDescription,
        )
        val musicKey = extras.music
            ?.let { "${it.app.orEmpty()}|${it.title}|${it.artist.orEmpty()}" }
            ?: ""
        val timeBucket = effectiveAppInfo.timestampMs / 10_000L
        val dedupKey = "${effectiveAppInfo.packageName}:$timeBucket:$musicKey:${customRule?.customDescription.orEmpty()}"
        val now = System.currentTimeMillis()
        val forceHeartbeat = now - lastSuccessfulReportAt >= FORCE_REPORT_INTERVAL_MS

        if (dedupKey != lastSentKey || forceHeartbeat) {
            val sent = ApiReporter.postReport(settings, effectiveAppInfo, extras)
            if (sent) {
                lastSentKey = dedupKey
                lastSuccessfulReportAt = now
                setServiceState(
                    text = buildReportStatus(effectiveAppInfo, extras),
                    logText = "上报成功：${effectiveAppInfo.appName}${formatMusicSuffix(extras.music)}"
                )
            } else {
                setServiceState("上报失败，正在重试")
            }
        }

        delay(settings.heartbeatSeconds * 1_000L)
    }

    private fun stopTracking(cancelWatchdog: Boolean = true) {
        locationTracker.stop()
        if (BuildConfig.INCLUDE_CHAT) voicePoller.stop()
        trackingJob?.cancel()
        trackingJob = null
        lastSentKey = ""
        lastSuccessfulReportAt = 0L
        lastNotificationText = ""
        releaseWakeLock()
        if (cancelWatchdog) {
            cancelWatchdog()
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(PowerManager::class.java)
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Asashiki:TrackingWakeLock").apply {
            setReferenceCounted(false)
            // Long timeout (24h) as safety net; we release on stop
            acquire(24 * 60 * 60 * 1000L)
        }
    }

    private fun releaseWakeLock() {
        runCatching {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        }
        wakeLock = null
    }

    private fun setServiceState(text: String, logText: String = text) {
        if (text == lastNotificationText) return
        lastNotificationText = text
        updateNotificationNow(text)
        settingsStore.appendLog(logText)
    }

    private fun buildReportStatus(appInfo: ForegroundAppInfo, extras: DeviceExtras): String {
        val music = extras.music ?: return "正在上报：${appInfo.appName}"
        return "正在上报：${appInfo.appName} · ♪ ${music.title}"
    }

    private fun formatMusicSuffix(music: MusicInfo?): String {
        if (music == null) return ""
        val artist = music.artist?.takeIf { it.isNotBlank() }
        return if (artist != null) {
            "（音乐：${artist} - ${music.title}）"
        } else {
            "（音乐：${music.title}）"
        }
    }

    private fun createWatchdogIntent(): PendingIntent {
        val intent = Intent(this, ServiceWatchdogReceiver::class.java).apply {
            action = ServiceWatchdogReceiver.ACTION_WATCHDOG
        }
        return PendingIntent.getBroadcast(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun scheduleWatchdog(delayMs: Long = DEFAULT_WATCHDOG_DELAY_MS) {
        val alarmManager = getSystemService(AlarmManager::class.java)
        val triggerAt = System.currentTimeMillis() + delayMs
        // setAlarmClock bypasses Doze and MIUI/HyperOS battery restrictions
        alarmManager.setAlarmClock(
            AlarmManager.AlarmClockInfo(triggerAt, null),
            createWatchdogIntent(),
        )
    }

    private fun cancelWatchdog() {
        val alarmManager = getSystemService(AlarmManager::class.java)
        alarmManager.cancel(createWatchdogIntent())
    }

    private fun calculateWatchdogDelay(settings: AgentSettings): Long {
        return max(90_000L, settings.heartbeatSeconds * 3_000L)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Asashiki 状态监听",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "持续上报手机前台应用状态到 Asashiki"
        }

        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(text: String): Notification {
        // Tap on notification reopens MainActivity
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPi = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notif = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Asashiki 状态监听")
            .setContentText(text)
            .setOngoing(true)               // marks as ongoing (not user-dismissable while service active)
            .setOnlyAlertOnce(true)         // no sound/vibration on update
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openPi)
            .setShowWhen(false)
            .build()
        // Belt-and-braces: explicitly set FLAG_NO_CLEAR + FLAG_ONGOING_EVENT
        // so MIUI is less likely to allow user-swipe-dismiss.
        notif.flags = notif.flags or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
        return notif
    }

    private fun effectiveServiceType(): Int {
        // specialUse instead of dataSync. dataSync has a 6h/24h runtime cap on Android 15+
        // (ForegroundServiceDidNotStopInTimeException, then ForegroundServiceStartNotAllowed)
        // which guarantees we hit a crash loop after about a day. specialUse has no such cap.
        // Location is sampled via one-shot getCurrentLocation(), so no LOCATION type either —
        // keeps MIUI's location indicator from staying lit.
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        } else {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        }
    }

    private fun updateNotificationNow(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    companion object {
        const val ACTION_START = "com.asashiki.agent.action.START"
        const val ACTION_STOP = "com.asashiki.agent.action.STOP"

        private const val CHANNEL_ID = "live_dashboard_agent_channel"
        private const val NOTIFICATION_ID = 11031
        private const val DEFAULT_WATCHDOG_DELAY_MS = 120_000L
        private const val FORCE_REPORT_INTERVAL_MS = 50_000L
    }
}
