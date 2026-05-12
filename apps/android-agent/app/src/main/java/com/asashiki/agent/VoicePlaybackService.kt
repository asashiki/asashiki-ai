package com.asashiki.agent

import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File

/**
 * Background-only service that plays a downloaded voice MP3 when the user taps
 * a notification, then dismisses the notification + ACKs the server.
 *
 * No UI — the user never sees the app launch. The whole flow is just:
 *   notification appears → tap → audio plays → notification disappears.
 */
class VoicePlaybackService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var ackJob: Job? = null
    private val activePlayers = mutableMapOf<Int, MediaPlayer>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action != ACTION_PLAY) return START_NOT_STICKY
        val msgId = intent.getLongExtra(EXTRA_MESSAGE_ID, -1L)
        val audioPath = intent.getStringExtra(EXTRA_AUDIO_PATH) ?: return START_NOT_STICKY
        val notifId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
        if (msgId < 0 || notifId < 0) return START_NOT_STICKY

        playAudio(msgId, notifId, audioPath)
        return START_NOT_STICKY
    }

    private fun playAudio(msgId: Long, notifId: Int, path: String) {
        // If user double-taps, cancel the in-flight player for this notification
        activePlayers[notifId]?.let { runCatching { it.release() } }

        val player = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
        }
        activePlayers[notifId] = player
        try {
            player.setDataSource(path)
            player.setOnCompletionListener {
                runCatching { it.release() }
                activePlayers.remove(notifId)
                dismissNotification(notifId)
                ackPlayed(msgId)
            }
            player.setOnErrorListener { _, what, extra ->
                Log.w(TAG, "MediaPlayer error what=$what extra=$extra")
                runCatching { player.release() }
                activePlayers.remove(notifId)
                dismissNotification(notifId)
                true
            }
            player.prepare()
            player.start()
            // Append the appended log via SettingsStore for visibility in the UI log panel
            SettingsStore(this).appendLog("播放语音 #$msgId")
        } catch (e: Exception) {
            Log.e(TAG, "play failed: ${e.message}", e)
            runCatching { player.release() }
            activePlayers.remove(notifId)
            dismissNotification(notifId)
        }
    }

    private fun dismissNotification(notifId: Int) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.cancel(notifId)
    }

    private fun ackPlayed(msgId: Long) {
        val store = SettingsStore(this)
        val s = store.load()
        ackJob = scope.launch {
            ApiReporter.markVoiceMessageAck(s.serverUrl, s.token, msgId, "played")
        }
    }

    override fun onDestroy() {
        scope.cancel()
        activePlayers.values.forEach { runCatching { it.release() } }
        activePlayers.clear()
        super.onDestroy()
    }

    companion object {
        const val ACTION_PLAY = "com.asashiki.agent.action.PLAY_VOICE"
        const val EXTRA_MESSAGE_ID = "msgId"
        const val EXTRA_AUDIO_PATH = "audioPath"
        const val EXTRA_NOTIFICATION_ID = "notifId"

        fun cacheDir(ctx: android.content.Context): File {
            val dir = File(ctx.cacheDir, "voice")
            if (!dir.exists()) dir.mkdirs()
            return dir
        }

        const val TAG = "VoicePlaybackService"
    }
}
