package com.asashiki.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        // Accept all boot-like actions: normal boot, locked boot (Android N+),
        // MIUI/HTC quick boot, and self-update (MY_PACKAGE_REPLACED)
        val action = intent?.action ?: return
        val accepted = action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON" ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        if (!accepted) return

        val settings = SettingsStore(context).load()
        val shouldStart = settings.autoStartOnBoot &&
            settings.isRunningEnabled &&
            settings.consentGiven &&
            settings.reportActivity

        if (!shouldStart) return

        val serviceIntent = Intent(context, TrackingService::class.java).apply {
            this.action = TrackingService.ACTION_START
        }
        runCatching { ContextCompat.startForegroundService(context, serviceIntent) }
    }
}
