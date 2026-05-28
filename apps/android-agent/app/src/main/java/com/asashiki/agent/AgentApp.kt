package com.asashiki.agent

import android.app.Application

class AgentApp : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashCapture.install(this)
    }
}
