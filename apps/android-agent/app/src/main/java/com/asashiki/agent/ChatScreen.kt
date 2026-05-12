package com.asashiki.agent

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val AVATAR_PALETTE = listOf(
    Color(0xFFE67E22), // Claude orange
    Color(0xFF8E44AD), // Codex purple
    Color(0xFF16A085), // ChatGPT green
    Color(0xFF2980B9), // Gemini blue
    Color(0xFFD35400), // amber
    Color(0xFFC0392B), // red
    Color(0xFF7F8C8D), // gray
)

private fun colorForSender(name: String): Color {
    val idx = (name.hashCode().toLong() and 0x7fffffffL).rem(AVATAR_PALETTE.size).toInt()
    return AVATAR_PALETTE[idx]
}

private fun initialFor(name: String): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return "AI"
    // Take first char (handles CJK + ASCII)
    val ch = trimmed[0]
    return ch.uppercaseChar().toString()
}

private val timeFmt = SimpleDateFormat("HH:mm", Locale.getDefault())
private val dateFmt = SimpleDateFormat("MM-dd HH:mm", Locale.getDefault())

@Composable
fun ChatScreen(onOpenSettings: () -> Unit) {
    val context = LocalContext.current
    val store = remember { VoiceMessageStore(context) }
    var messages by remember { mutableStateOf(store.all()) }

    // Refresh every 3s so new messages from the poller show up automatically
    LaunchedEffect(Unit) {
        while (true) {
            messages = store.all()
            delay(3_000)
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(Color(0xFFF7F7F4))) {
        // Top bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text("Asashiki", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(
                    "${messages.size} 条 AI 语音消息",
                    fontSize = 12.sp,
                    color = Color.Gray,
                )
            }
            Button(
                onClick = onOpenSettings,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEEEEEE), contentColor = Color.Black),
            ) { Text("⚙ 设置", fontSize = 13.sp) }
        }

        if (messages.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🎙️", fontSize = 48.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("还没有 AI 语音消息", color = Color.Gray)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "AI 调用 send_voice_message 时会到这里",
                        fontSize = 11.sp,
                        color = Color.LightGray,
                    )
                }
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(messages, key = { it.id }) { msg ->
                    VoiceMessageRow(msg) { onPlay(context, msg) }
                }
            }
        }
    }
}

@Composable
private fun VoiceMessageRow(msg: StoredVoiceMessage, onPlay: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        // Avatar
        AvatarCircle(name = msg.senderName)
        Spacer(Modifier.width(10.dp))

        Column(modifier = Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(msg.senderName, fontSize = 13.sp, color = Color(0xFF555555), fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(8.dp))
                Text(
                    formatTime(msg.receivedAt),
                    fontSize = 10.sp,
                    color = Color.LightGray,
                )
                if (!msg.played) {
                    Spacer(Modifier.width(6.dp))
                    Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(Color(0xFFE74C3C)))
                }
            }
            Spacer(Modifier.height(4.dp))
            // Voice bubble - big tappable pill
            VoiceBubble(
                senderColor = colorForSender(msg.senderName),
                played = msg.played,
                onClick = onPlay,
            )
            if (msg.text.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(msg.text, fontSize = 12.sp, color = Color(0xFF777777), fontFamily = FontFamily.Default)
            }
        }
    }
}

@Composable
private fun AvatarCircle(name: String) {
    val color = colorForSender(name)
    Box(
        modifier = Modifier
            .size(42.dp)
            .clip(CircleShape)
            .background(color),
        contentAlignment = Alignment.Center,
    ) {
        Text(initialFor(name), fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
    }
}

@Composable
private fun VoiceBubble(senderColor: Color, played: Boolean, onClick: () -> Unit) {
    val bg = if (played) Color(0xFFEEEEEE) else senderColor.copy(alpha = 0.15f)
    val fg = if (played) Color(0xFF777777) else senderColor
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(bg)
            .border(1.dp, fg.copy(alpha = 0.3f), RoundedCornerShape(20.dp))
            .clickable { onClick() }
            .padding(horizontal = 18.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Play icon
        Text("▶", fontSize = 22.sp, color = fg, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(12.dp))
        // Fake waveform — just decorative bars
        repeat(8) { i ->
            val h = listOf(8, 14, 22, 16, 10, 18, 12, 20)[i].dp
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(h)
                    .clip(RoundedCornerShape(2.dp))
                    .background(fg.copy(alpha = 0.7f))
            )
            if (i < 7) Spacer(Modifier.width(3.dp))
        }
        Spacer(Modifier.width(12.dp))
        Text(if (played) "已播放" else "点击播放", fontSize = 13.sp, color = fg, fontWeight = FontWeight.Medium)
    }
}

private fun formatTime(ts: Long): String {
    val now = System.currentTimeMillis()
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date(now))
    val msgDay = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date(ts))
    return if (today == msgDay) timeFmt.format(Date(ts)) else dateFmt.format(Date(ts))
}

private fun onPlay(context: android.content.Context, msg: StoredVoiceMessage) {
    val intent = Intent(context, VoicePlaybackService::class.java).apply {
        action = VoicePlaybackService.ACTION_PLAY
        putExtra(VoicePlaybackService.EXTRA_MESSAGE_ID, msg.id)
        putExtra(VoicePlaybackService.EXTRA_AUDIO_PATH, msg.audioPath)
        putExtra(VoicePlaybackService.EXTRA_NOTIFICATION_ID, -1) // no notification to dismiss
    }
    context.startService(intent)
}
