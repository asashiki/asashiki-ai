# Asashiki Mac Agent

每 N 秒采样 macOS 当前前台 App + 窗口标题 + 电池，POST 给 core-api 的 `/api/devices/report`，落到和 Windows / Android 共享的 `device_states` / `device_activities` 表里。`device_status` / `device_timeline` / `device_activity_summary` MCP 工具自动覆盖 Mac。

设计意图：和 `apps/windows-agent` **一比一对照**，行为一致。

## 一次性准备

**1. 在 core-api 里给 Mac 发一个 device token**

编辑 VPS 上的 `.env.production`，在 `DEVICE_TOKENS_JSON` 里添加：

```json
[
  {"token":"...","deviceId":"mac-laptop","deviceName":"MacBook","platform":"macos"}
]
```

> token 自己生成一个长随机字符串（`openssl rand -hex 32`）。`deviceId` 用 kebab-case，建议 `mac-laptop` / `mac-mini` 之类，避免和 `ios-phone` 撞。

然后重启 core-api：

```bash
docker compose --env-file .env.production -f infra/docker/compose.yaml up -d --build core-api
```

**2. 在 Mac 上装 Python 依赖**

```bash
cd apps/mac-agent
pip3 install -r requirements.txt
```

**3. 给 Terminal / iTerm 开 Accessibility 权限**

System Settings → Privacy & Security → **Accessibility** → 加入 Terminal（或你跑 python 的终端）。

不开这个 AppleScript 拿不到窗口标题。

**4. 写 config.json**

```bash
cp config.example.json config.json
# 编辑 serverUrl + token
```

## 跑起来（前台调试）

```bash
python3 agent.py
```

应该看到一行行：

```
2026-05-23 18:00:01 [INFO] Asashiki Mac Agent up — server=...
2026-05-23 18:00:11 [INFO] → com.apple.Safari  GitHub - Asashiki
2026-05-23 18:00:21 [INFO] → com.microsoft.VSCode  agent.py
```

Ctrl-C 退出。

服务器端验证：

```bash
curl -s https://api.asashiki.com/api/devices/current | jq '.devices[] | select(.platform=="macos")'
```

应能看到 `appId` / `windowTitle` / `extra.battery_percent` 等。

## 后台 daemon（launchd）

```bash
cp com.asashiki.agent.plist.example ~/Library/LaunchAgents/com.asashiki.agent.plist
# 编辑 plist 里两个 REPLACE_ME 路径为 agent.py 的绝对路径
launchctl load -w ~/Library/LaunchAgents/com.asashiki.agent.plist
```

之后开机自启、退出自动重启。日志在 `/tmp/asashiki-mac-agent.{out,err}.log` 以及 `apps/mac-agent/agent.log`（带每日 rotation）。

卸载：

```bash
launchctl unload -w ~/Library/LaunchAgents/com.asashiki.agent.plist
rm ~/Library/LaunchAgents/com.asashiki.agent.plist
```

## 字段对照

| 字段 | 值 | 备注 |
|---|---|---|
| `appId` | bundle ID（如 `com.apple.Safari`） | 优先 bundle ID，拿不到时退回 process name |
| `windowTitle` | 前台窗口标题 | 截到 256 字符 |
| `occurredAt` | UTC ISO | 服务器端转上海展示 |
| `extra.battery_percent` | 0-100 | 来自 `psutil.sensors_battery()` |
| `extra.battery_charging` | bool | 同上 |
| `extra.custom_app_name` | 字符串 | `customApps` 规则命中时出现 |
| `extra.custom_description` | 字符串 | `customApps` 规则命中时出现 |

AFK（idle ≥ `afkThresholdSeconds`）时 `appId="macos.afk"`，无前台时 `appId="macos.idle"`，拿不到 process name 时 `appId="macos.unknown"`。

## 和 Windows agent 的差别

| 项 | Windows | Mac |
|---|---|---|
| 前台检测 | Win32 `GetForegroundWindow` | AppleScript via `osascript` |
| 空闲检测 | Win32 `GetLastInputInfo` | `ioreg HIDIdleTime` |
| 电池 | 配置项写死 `network_type=ethernet`，没有电池 | `psutil.sensors_battery()` |
| 自启 | 注册表 `HKCU\...\Run` | launchd `~/Library/LaunchAgents` |
| UI | WinForms 系统托盘 + 设置窗口 | 暂无（MVP）；编辑 `config.json` 后重启 daemon |

## 添加 customApps 映射

`config.json` 里 `customApps` 数组按 Windows agent 同样的格式工作，但 Mac 这边 `appId` 是 bundle ID（不是 process name）。`{title}` / `{appId}` / `{app}` 占位符都可用。

要查某个 Mac App 的 bundle ID：

```bash
osascript -e 'id of app "Safari"'
# → com.apple.Safari
```

## 限制

- AppleScript 偶尔超时（5 秒上限）会导致一次采样丢失，agent 下一轮恢复
- 拿不到 Accessibility 权限时，window_title 会全空，但 app_id 仍然有
- 暂无系统托盘 UI，所有交互通过 config.json + launchd
