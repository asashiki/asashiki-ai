package com.asashiki.agent

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Local persistence for received voice messages so the user can review
 * playback history even after dismissing the notification.
 *
 * Stored as a single JSON file in the app's internal files dir.
 */
class VoiceMessageStore(context: Context) {
    private val file = File(context.filesDir, "voice_messages.json")

    @Synchronized
    fun all(): List<StoredVoiceMessage> {
        if (!file.exists()) return emptyList()
        return try {
            val arr = JSONArray(file.readText())
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    add(StoredVoiceMessage(
                        id = o.getLong("id"),
                        senderName = o.optString("senderName", "AI"),
                        senderAvatarUrl = o.optString("senderAvatarUrl").takeIf { it.isNotEmpty() && it != "null" },
                        text = o.optString("text", ""),
                        audioPath = o.optString("audioPath", ""),
                        receivedAt = o.optLong("receivedAt", System.currentTimeMillis()),
                        played = o.optBoolean("played", false)
                    ))
                }
            }
        } catch (_: Exception) { emptyList() }
    }

    @Synchronized
    fun upsert(msg: StoredVoiceMessage) {
        val current = all().toMutableList()
        val idx = current.indexOfFirst { it.id == msg.id }
        if (idx >= 0) current[idx] = msg else current.add(0, msg)
        save(current)
    }

    @Synchronized
    fun markPlayed(id: Long) {
        val current = all().toMutableList()
        val idx = current.indexOfFirst { it.id == id }
        if (idx < 0) return
        current[idx] = current[idx].copy(played = true)
        save(current)
    }

    @Synchronized
    fun clear() { file.delete() }

    private fun save(list: List<StoredVoiceMessage>) {
        val arr = JSONArray()
        // Keep newest first; cap at 200 to bound storage
        list.sortedByDescending { it.receivedAt }.take(200).forEach {
            val o = JSONObject()
                .put("id", it.id)
                .put("senderName", it.senderName)
                .put("text", it.text)
                .put("audioPath", it.audioPath)
                .put("receivedAt", it.receivedAt)
                .put("played", it.played)
            if (it.senderAvatarUrl != null) o.put("senderAvatarUrl", it.senderAvatarUrl)
            arr.put(o)
        }
        file.writeText(arr.toString())
    }
}

data class StoredVoiceMessage(
    val id: Long,
    val senderName: String,
    val senderAvatarUrl: String?,
    val text: String,
    val audioPath: String,
    val receivedAt: Long,
    val played: Boolean
)
