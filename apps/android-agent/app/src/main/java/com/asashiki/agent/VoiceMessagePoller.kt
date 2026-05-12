package com.asashiki.agent

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.util.concurrent.atomic.AtomicInteger

/**
 * Polls Core API every POLL_INTERVAL_MS for pending voice messages.
 * For each one: download MP3 → cache locally → show MessagingStyle notification
 * whose tap-action launches VoicePlaybackService (no Activity ever opens).
 */
class VoiceMessagePoller(
    private val context: Context,
    private val scope: CoroutineScope
) {
    private var job: Job? = null
    private val notifIdSeq = AtomicInteger(20000)
    private val seenIds = mutableSetOf<Long>()

    fun start(getServerUrl: () -> String, getToken: () -> String) {
        if (job?.isActive == true) return
        ensureChannel()
        job = scope.launch {
            while (isActive) {
                try {
                    val url = getServerUrl()
                    val token = getToken()
                    if (url.isNotBlank() && token.isNotBlank()) {
                        val msgs = ApiReporter.pollPendingVoiceMessages(url, token)
                        for (m in msgs) {
                            if (seenIds.contains(m.id)) continue
                            // Only mark as seen if handleMessage actually succeeds (audio
                            // downloaded + notification shown). Otherwise leave it pending
                            // so the next poll retries — important when the audioUrl is
                            // temporarily unreachable.
                            if (handleMessage(m, url, token)) {
                                seenIds.add(m.id)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "poll error: ${e.message}")
                }
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    fun stop() { job?.cancel(); job = null }

    private fun handleMessage(msg: VoiceMessage, baseUrl: String, token: String): Boolean {
        // Download audio and cache
        val bytes = ApiReporter.downloadAudio(msg.audioUrl) ?: run {
            Log.w(TAG, "download failed for msg ${msg.id} url=${msg.audioUrl}")
            SettingsStore(context).appendLog("语音 #${msg.id} 下载失败")
            return false
        }
        val cacheFile = File(VoicePlaybackService.cacheDir(context), "msg-${msg.id}.mp3")
        cacheFile.writeBytes(bytes)

        // ACK delivered
        ApiReporter.markVoiceMessageAck(baseUrl, token, msg.id, "delivered")

        showNotification(msg, cacheFile)
        SettingsStore(context).appendLog("收到 ${msg.senderName} 的语音 #${msg.id}：${msg.text.take(40)}")
        return true
    }

    private fun showNotification(msg: VoiceMessage, audioFile: File) {
        val notifId = notifIdSeq.incrementAndGet()

        // PendingIntent → start VoicePlaybackService (NOT Activity)
        val playIntent = Intent(context, VoicePlaybackService::class.java).apply {
            action = VoicePlaybackService.ACTION_PLAY
            putExtra(VoicePlaybackService.EXTRA_MESSAGE_ID, msg.id)
            putExtra(VoicePlaybackService.EXTRA_AUDIO_PATH, audioFile.absolutePath)
            putExtra(VoicePlaybackService.EXTRA_NOTIFICATION_ID, notifId)
        }
        val playPi = PendingIntent.getService(
            context, notifId, playIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Use MessagingStyle so the notification looks like a chat bubble.
        // Building Person with an icon (default if no avatar URL provided).
        val personBuilder = Person.Builder().setName(msg.senderName)
        msg.senderAvatarUrl?.let { /* future: download + setIcon. v1 uses default. */ }
        // Always set a default speech-bubble icon for the sender so it doesn't look empty
        personBuilder.setIcon(IconCompat.createWithResource(context, android.R.drawable.sym_action_chat))
        val sender = personBuilder.build()
        val style = NotificationCompat.MessagingStyle(Person.Builder().setName("我").build())
            .setConversationTitle("🎙️ ${msg.senderName} 给你说了一句")
            .addMessage(msg.text, System.currentTimeMillis(), sender)

        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setStyle(style)
            .setContentTitle("🎙️ ${msg.senderName}")
            .setContentText(msg.text)
            .setContentIntent(playPi)        // tap → play
            .setAutoCancel(false)            // we cancel ourselves on play-complete
            .setOngoing(false)               // user can swipe away if not interested
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_LIGHTS or NotificationCompat.DEFAULT_VIBRATE)
            .addAction(
                android.R.drawable.ic_media_play,
                "▶ 点击播放",
                playPi
            )
            .build()

        val nm = context.getSystemService(NotificationManager::class.java)
        nm.notify(notifId, notif)
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val ch = NotificationChannel(
            CHANNEL_ID,
            "AI 语音消息",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "AI 助手发来的语音气泡，点击直接播放"
            enableVibration(true)
            enableLights(true)
        }
        nm.createNotificationChannel(ch)
    }

    companion object {
        private const val TAG = "VoiceMessagePoller"
        private const val CHANNEL_ID = "voice_message_channel"
        private const val POLL_INTERVAL_MS = 10_000L
    }
}
