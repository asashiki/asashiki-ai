package com.asashiki.agent

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.PowerManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {

    private val hcPermissions = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(OxygenSaturationRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(BloodPressureRecord::class),
        HealthPermission.getReadPermission(BodyTemperatureRecord::class),
        HealthPermission.getReadPermission(RespiratoryRateRecord::class),
        HealthPermission.getReadPermission(BloodGlucoseRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(HeightRecord::class),
    )

    private var hcGrantedState = mutableStateOf(false)

    private val hcPermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        hcGrantedState.value = granted.containsAll(hcPermissions)
    }

    private val usageSettingsLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { /* result ignored; permission state re-read in UI */ }

    private val locationPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* result re-read in UI refresh loop */ }

    private val bgLocationPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* result re-read in UI refresh loop */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        autoStartTrackingIfNeeded()
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    var showSettings by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
                    if (showSettings) {
                        AgentScreen(
                            hcGranted = hcGrantedState.value,
                            onRequestHcPermissions = { hcPermissionLauncher.launch(hcPermissions) },
                            onOpenUsageSettings = {
                                usageSettingsLauncher.launch(
                                    Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                                )
                            },
                            onRefreshHcState = { checkHcPermissions() },
                            onRequestForegroundLocation = {
                                locationPermLauncher.launch(arrayOf(
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                ))
                            },
                            onRequestBackgroundLocation = {
                                bgLocationPermLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                            },
                            onRequestBatteryOptimizationIgnore = {
                                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                    data = Uri.parse("package:$packageName")
                                })
                            },
                            onBack = { showSettings = false }
                        )
                    } else {
                        ChatScreen(onOpenSettings = { showSettings = true })
                    }
                }
            }
        }
        checkHcPermissions()
    }

    /**
     * If user previously enabled tracking but the service is dead (killed by MIUI / reboot),
     * silently start it back up the next time MainActivity opens.
     * Without this, after MIUI kills the app the user has to manually click 停止→启动 again.
     */
    private fun autoStartTrackingIfNeeded() {
        val settings = SettingsStore(this).load()
        val shouldRun = settings.isRunningEnabled &&
            settings.consentGiven &&
            settings.reportActivity &&
            settings.serverUrl.isNotBlank() &&
            settings.token.isNotBlank()
        if (!shouldRun) return
        runCatching {
            val intent = Intent(this, TrackingService::class.java).apply {
                action = TrackingService.ACTION_START
            }
            ContextCompat.startForegroundService(this, intent)
        }
    }

    private fun checkHcPermissions() {
        val sdkStatus = HealthConnectClient.getSdkStatus(this)
        if (sdkStatus != HealthConnectClient.SDK_AVAILABLE) {
            hcGrantedState.value = false
            return
        }
        val client = HealthConnectClient.getOrCreate(this)
        lifecycleScope.launch {
            val granted = client.permissionController.getGrantedPermissions()
            hcGrantedState.value = granted.containsAll(hcPermissions)
        }
    }
}

@Composable
fun AgentScreen(
    hcGranted: Boolean,
    onRequestHcPermissions: () -> Unit,
    onOpenUsageSettings: () -> Unit,
    onRefreshHcState: () -> Unit,
    onRequestForegroundLocation: () -> Unit = {},
    onRequestBackgroundLocation: () -> Unit = {},
    onRequestBatteryOptimizationIgnore: () -> Unit = {},
    onBack: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember { SettingsStore(context) }

    var settings by remember { mutableStateOf(store.load()) }
    var logs by remember { mutableStateOf(listOf<String>()) }
    var hasUsagePerm by remember { mutableStateOf(false) }
    var hasForegroundLocation by remember { mutableStateOf(false) }
    var hasBackgroundLocation by remember { mutableStateOf(false) }
    var isBatteryOptimizationIgnored by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        while (true) {
            settings = store.load()
            logs = store.loadLogs(60)
            hasUsagePerm = UsageTracker.hasUsageStatsPermission(context)
            hasForegroundLocation = ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            hasBackgroundLocation = ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            val pm = context.getSystemService(PowerManager::class.java)
            isBatteryOptimizationIgnored = pm.isIgnoringBatteryOptimizations(context.packageName)
            onRefreshHcState()
            delay(3_000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Asashiki Agent · 设置", fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Button(onClick = onBack, colors = ButtonDefaults.buttonColors(containerColor = Color.Gray)) {
                Text("返回对话", fontSize = 13.sp)
            }
        }

        Spacer(Modifier.height(4.dp))

        // ── Server settings ──────────────────────────────────────────────
        SectionHeader("服务器设置")

        OutlinedTextField(
            value = settings.serverUrl,
            onValueChange = {
                settings = settings.copy(serverUrl = it)
                store.save(settings)
            },
            label = { Text("Server URL") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        OutlinedTextField(
            value = settings.token,
            onValueChange = {
                settings = settings.copy(token = it)
                store.save(settings)
            },
            label = { Text("Device Token") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )

        Spacer(Modifier.height(4.dp))

        // ── Tracking controls ────────────────────────────────────────────
        SectionHeader("设备追踪")

        LabeledCheckbox(
            label = "同意上传设备使用数据",
            checked = settings.consentGiven,
            onCheckedChange = {
                settings = settings.copy(consentGiven = it)
                store.save(settings)
            }
        )

        LabeledCheckbox(
            label = "上报前台应用",
            checked = settings.reportActivity,
            onCheckedChange = {
                settings = settings.copy(reportActivity = it)
                store.save(settings)
            }
        )

        LabeledCheckbox(
            label = "上报电池状态",
            checked = settings.reportBattery,
            onCheckedChange = {
                settings = settings.copy(reportBattery = it)
                store.save(settings)
            }
        )

        LabeledCheckbox(
            label = "开机自动启动",
            checked = settings.autoStartOnBoot,
            onCheckedChange = {
                settings = settings.copy(autoStartOnBoot = it)
                store.save(settings)
            }
        )

        if (!hasUsagePerm) {
            Button(
                onClick = onOpenUsageSettings,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF57C00)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("授予「使用情况访问」权限")
            }
        }

        if (!isBatteryOptimizationIgnored) {
            Button(
                onClick = onRequestBatteryOptimizationIgnore,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD32F2F)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("加入电池优化白名单（防止后台被杀）")
            }
        } else {
            Text("✓ 已加入电池优化白名单", color = Color(0xFF388E3C), fontSize = 13.sp)
        }

        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = {
                    settings = settings.copy(isRunningEnabled = true)
                    store.save(settings)
                    context.startForegroundService(
                        Intent(context, TrackingService::class.java).apply {
                            action = TrackingService.ACTION_START
                        }
                    )
                },
                modifier = Modifier.weight(1f),
                enabled = !settings.isRunningEnabled,
            ) {
                Text("启动追踪")
            }
            Button(
                onClick = {
                    settings = settings.copy(isRunningEnabled = false)
                    store.save(settings)
                    context.startService(
                        Intent(context, TrackingService::class.java).apply {
                            action = TrackingService.ACTION_STOP
                        }
                    )
                },
                modifier = Modifier.weight(1f),
                enabled = settings.isRunningEnabled,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            ) {
                Text("停止追踪")
            }
        }

        Spacer(Modifier.height(4.dp))

        // ── HealthConnect sync ───────────────────────────────────────────
        SectionHeader("健康数据同步 (HealthConnect)")

        val hcSdkStatus = HealthConnectClient.getSdkStatus(context)
        if (hcSdkStatus != HealthConnectClient.SDK_AVAILABLE) {
            Text(
                "HealthConnect 不可用（状态码 $hcSdkStatus）",
                color = Color.Gray, fontSize = 13.sp
            )
            Button(
                onClick = {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata"))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("安装 Health Connect")
            }
        } else {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("启用健康数据同步")
                Switch(
                    checked = settings.hcSyncEnabled,
                    onCheckedChange = {
                        settings = settings.copy(hcSyncEnabled = it)
                        store.save(settings)
                        if (it) {
                            HealthSyncScheduler.schedule(context, settings.hcSyncIntervalMinutes)
                        } else {
                            HealthSyncScheduler.cancel(context)
                        }
                    }
                )
            }

            if (!hcGranted) {
                Button(
                    onClick = onRequestHcPermissions,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF57C00)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("授予 HealthConnect 权限")
                }
            } else {
                Text("✓ HealthConnect 权限已授予", color = Color(0xFF388E3C), fontSize = 13.sp)
            }

            if (settings.hcSyncEnabled) {
                Button(
                    onClick = {
                        scope.launch {
                            withContext(Dispatchers.IO) {
                                HealthSyncScheduler.runNow(context)
                                store.appendLog("HC: 触发立即同步")
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("立即同步健康数据")
                }
            }
        }

        Spacer(Modifier.height(4.dp))

        // ── Location tracking ────────────────────────────────────────────
        SectionHeader("位置追踪")

        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("启用位置追踪")
            Switch(
                checked = settings.locationTrackingEnabled,
                onCheckedChange = {
                    settings = settings.copy(locationTrackingEnabled = it)
                    store.save(settings)
                },
                enabled = hasForegroundLocation
            )
        }

        if (!hasForegroundLocation) {
            Button(
                onClick = onRequestForegroundLocation,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF57C00)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("授予「位置权限」（前台）")
            }
        } else if (!hasBackgroundLocation) {
            Button(
                onClick = onRequestBackgroundLocation,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1565C0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("授予「后台位置权限」（允许始终访问）")
            }
            Text(
                "建议授予「始终允许」以便在屏幕关闭时记录通勤路径",
                fontSize = 11.sp, color = Color.Gray
            )
        } else {
            Text("✓ 位置权限已授予（前台 + 后台）", color = Color(0xFF388E3C), fontSize = 13.sp)
        }

        if (settings.locationTrackingEnabled) {
            Text(
                "每 10 分钟或移动 100m 记录一次位置，每 5 分钟上传",
                fontSize = 11.sp, color = Color.Gray
            )
        }

        Spacer(Modifier.height(4.dp))

        // ── Logs ─────────────────────────────────────────────────────────
        SectionHeader("日志")

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Button(
                onClick = { scope.launch { withContext(Dispatchers.IO) { store.clearLogs() } } },
                colors = ButtonDefaults.buttonColors(containerColor = Color.Gray),
            ) {
                Text("清除", fontSize = 12.sp)
            }
        }

        logs.reversed().forEach { line ->
            Text(
                text = line,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
                lineHeight = 15.sp,
            )
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    HorizontalDivider()
    Text(title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp))
}

@Composable
private fun LabeledCheckbox(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth()
    ) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(label, modifier = Modifier.padding(start = 4.dp))
    }
}
