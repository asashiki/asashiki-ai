package com.asashiki.agent

import android.content.Context
import android.content.SharedPreferences
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Installs a process-wide UncaughtExceptionHandler that persists the last crash
 * trace to SharedPreferences before delegating to the previous handler.
 *
 * Why bother when ApplicationExitInfo already exists: MIUI / HyperOS strip the
 * traceInputStream payload on CRASH reasons, so on the user's device the system
 * trace is empty. Capturing it ourselves on the way down is the only way to see
 * the stack when running on those ROMs.
 *
 * Stored entries are read back by RuntimeDiagnostics and surfaced in the in-app
 * diagnostics panel.
 */
object CrashCapture {

    private const val PREFS = "asashiki_crash"
    private const val KEY_LATEST = "latest"
    private const val KEY_HISTORY = "history"
    private const val MAX_HISTORY = 5

    fun install(context: Context) {
        val appContext = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        // Avoid double-install (TrackingService + MainActivity both call install()).
        if (previous is Handler) return
        Thread.setDefaultUncaughtExceptionHandler(Handler(appContext, previous))
    }

    fun loadLatest(context: Context): Entry? {
        val prefs = prefs(context)
        val text = prefs.getString(KEY_LATEST, null) ?: return null
        return parse(text)
    }

    fun loadHistory(context: Context): List<Entry> {
        val prefs = prefs(context)
        val raw = prefs.getString(KEY_HISTORY, null) ?: return emptyList()
        return raw.split(ENTRY_SEP).mapNotNull { parse(it) }
    }

    fun clear(context: Context) {
        prefs(context).edit().remove(KEY_LATEST).remove(KEY_HISTORY).apply()
    }

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun parse(text: String): Entry? {
        val newline = text.indexOf('\n').takeIf { it > 0 } ?: return null
        val header = text.substring(0, newline)
        val body = text.substring(newline + 1)
        val pipe = header.indexOf('|').takeIf { it > 0 } ?: return null
        val ts = header.substring(0, pipe)
        val short = header.substring(pipe + 1)
        return Entry(timestamp = ts, summary = short, trace = body)
    }

    data class Entry(val timestamp: String, val summary: String, val trace: String)

    private const val ENTRY_SEP = "\n----RECORD----\n"

    private class Handler(
        private val appContext: Context,
        private val previous: Thread.UncaughtExceptionHandler?,
    ) : Thread.UncaughtExceptionHandler {

        override fun uncaughtException(thread: Thread, throwable: Throwable) {
            runCatching { persist(thread, throwable) }
            previous?.uncaughtException(thread, throwable)
        }

        private fun persist(thread: Thread, throwable: Throwable) {
            val fmt = SimpleDateFormat("MM-dd HH:mm:ss", Locale.getDefault())
            val ts = fmt.format(Date())
            val summary = "[${thread.name}] ${throwable.javaClass.simpleName}: " +
                (throwable.message ?: "(no message)")
            val sw = StringWriter()
            throwable.printStackTrace(PrintWriter(sw))
            // Trim each line and cap total size so we don't blow up SharedPreferences.
            val trace = sw.toString().lineSequence()
                .take(80)
                .joinToString("\n")
                .take(8_000)

            val entry = "$ts|$summary\n$trace"
            val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val history = (prefs.getString(KEY_HISTORY, "") ?: "")
                .split(ENTRY_SEP)
                .filter { it.isNotBlank() }
            val updated = (listOf(entry) + history).take(MAX_HISTORY).joinToString(ENTRY_SEP)
            prefs.edit()
                .putString(KEY_LATEST, entry)
                .putString(KEY_HISTORY, updated)
                .commit()  // commit, not apply: the process is about to die
        }
    }
}
