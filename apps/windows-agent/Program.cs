// Asashiki Windows Agent
// Based on live-dashboard windows-agent (https://github.com/nmb1337/live-dashboard)
// Key changes:
//   - Endpoint: /api/devices/report (was /api/report)
//   - Fields: camelCase — appId, windowTitle, occurredAt (was app_id, window_title, timestamp)
//   - Removed /api/consent
//   - User-Agent: asashiki-windows-agent/1.0.0

using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AsashikiWindowsAgent;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new AgentApplicationContext());
    }
}

// ── Win32 ──────────────────────────────────────────────────────────────────

static class NativeMethods
{
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    public static uint GetIdleSeconds()
    {
        var info = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
        GetLastInputInfo(ref info);
        return (uint)((Environment.TickCount64 - info.dwTime) / 1000);
    }
}

// ── Config ─────────────────────────────────────────────────────────────────

record CustomAppRule(string AppId, string CustomAppName, string? CustomDescription);

class AgentConfig
{
    public string ServerUrl { get; set; } = "";
    public string Token { get; set; } = "";
    public int ReportIntervalSeconds { get; set; } = 10;
    public int HeartbeatIntervalSeconds { get; set; } = 60;
    public int AfkThresholdSeconds { get; set; } = 300;
    public List<CustomAppRule> CustomApps { get; set; } = [];
}

static class ConfigStore
{
    static readonly string ConfigPath = Path.Combine(
        AppContext.BaseDirectory, "appsettings.json");

    public static AgentConfig Load()
    {
        if (!File.Exists(ConfigPath)) return new AgentConfig();
        try
        {
            var json = File.ReadAllText(ConfigPath);
            return JsonSerializer.Deserialize<AgentConfig>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new AgentConfig();
        }
        catch { return new AgentConfig(); }
    }

    public static void Save(AgentConfig config)
    {
        var json = JsonSerializer.Serialize(config,
            new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(ConfigPath, json);
    }
}

// ── Reporter ───────────────────────────────────────────────────────────────

class AgentReporter : IDisposable
{
    readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(15) };
    AgentConfig _config;
    string _lastKey = "";
    DateTime _lastSentAt = DateTime.MinValue;
    readonly Action<string> _log;

    public AgentReporter(AgentConfig config, Action<string> log)
    {
        _config = config;
        _log = log;
    }

    public void UpdateConfig(AgentConfig config) => _config = config;

    public async Task TickAsync()
    {
        if (string.IsNullOrWhiteSpace(_config.ServerUrl) ||
            string.IsNullOrWhiteSpace(_config.Token)) return;

        var idleSec = NativeMethods.GetIdleSeconds();
        string appId, windowTitle;

        if (idleSec >= _config.AfkThresholdSeconds)
        {
            appId = "windows.afk";
            windowTitle = $"AFK ({idleSec}s)";
        }
        else
        {
            var hwnd = NativeMethods.GetForegroundWindow();
            if (hwnd == IntPtr.Zero) { appId = "windows.idle"; windowTitle = ""; }
            else
            {
                NativeMethods.GetWindowThreadProcessId(hwnd, out var pid);
                var titleBuf = new StringBuilder(256);
                NativeMethods.GetWindowText(hwnd, titleBuf, 256);
                windowTitle = titleBuf.ToString().Trim();
                try
                {
                    var proc = Process.GetProcessById((int)pid);
                    appId = proc.ProcessName.ToLowerInvariant();
                }
                catch { appId = "windows.unknown"; }
            }
        }

        var rule = _config.CustomApps.FirstOrDefault(r =>
            appId.Contains(r.AppId, StringComparison.OrdinalIgnoreCase));

        var effectiveApp = rule?.CustomAppName ?? appId;
        var description = rule?.CustomDescription
            ?.Replace("{title}", windowTitle)
            .Replace("{appId}", appId)
            .Replace("{app}", effectiveApp);

        var now = DateTime.UtcNow;
        var key = $"{appId}|{windowTitle}";
        var elapsed = (now - _lastSentAt).TotalSeconds;
        var forceHeartbeat = elapsed >= _config.HeartbeatIntervalSeconds;

        if (key == _lastKey && !forceHeartbeat) return;

        var extra = new Dictionary<string, object?> { ["network_type"] = "ethernet" };
        if (!string.IsNullOrEmpty(description)) extra["custom_description"] = description;
        if (rule != null) extra["custom_app_name"] = effectiveApp;

        var body = new
        {
            appId,
            windowTitle = windowTitle.Length > 256 ? windowTitle[..256] : windowTitle,
            occurredAt = now.ToString("o"),
            extra
        };

        var json = JsonSerializer.Serialize(body);
        using var req = new HttpRequestMessage(HttpMethod.Post,
            $"{_config.ServerUrl.TrimEnd('/')}/api/devices/report");
        req.Headers.Add("Authorization", $"Bearer {_config.Token}");
        req.Headers.Add("User-Agent", "asashiki-windows-agent/1.0.0");
        req.Content = new StringContent(json, Encoding.UTF8, "application/json");

        try
        {
            var resp = await _http.SendAsync(req);
            if (resp.IsSuccessStatusCode)
            {
                _lastKey = key;
                _lastSentAt = now;
                _log($"上报成功: {effectiveApp}");
            }
            else
            {
                _log($"上报失败: HTTP {(int)resp.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            _log($"上报错误: {ex.Message}");
        }
    }

    public void Dispose() => _http.Dispose();
}

// ── Settings Form ──────────────────────────────────────────────────────────

class SettingsForm : Form
{
    readonly TextBox _urlBox = new() { Width = 300 };
    readonly TextBox _tokenBox = new() { Width = 300 };
    readonly NumericUpDown _intervalBox = new() { Minimum = 5, Maximum = 300, Width = 80 };
    readonly NumericUpDown _afkBox = new() { Minimum = 30, Maximum = 3600, Width = 80 };
    public AgentConfig Config { get; private set; }

    public SettingsForm(AgentConfig config)
    {
        Config = config;
        Text = "Asashiki Agent 设置";
        AutoSize = true;
        Padding = new Padding(16);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;

        _urlBox.Text = config.ServerUrl;
        _tokenBox.Text = config.Token;
        _intervalBox.Value = config.ReportIntervalSeconds;
        _afkBox.Value = config.AfkThresholdSeconds;

        var layout = new TableLayoutPanel { AutoSize = true, ColumnCount = 2, RowCount = 5, Padding = new Padding(8) };
        layout.Controls.Add(new Label { Text = "Server URL:", AutoSize = true, TextAlign = System.Drawing.ContentAlignment.MiddleRight }, 0, 0);
        layout.Controls.Add(_urlBox, 1, 0);
        layout.Controls.Add(new Label { Text = "Device Token:", AutoSize = true, TextAlign = System.Drawing.ContentAlignment.MiddleRight }, 0, 1);
        layout.Controls.Add(_tokenBox, 1, 1);
        layout.Controls.Add(new Label { Text = "上报间隔(秒):", AutoSize = true, TextAlign = System.Drawing.ContentAlignment.MiddleRight }, 0, 2);
        layout.Controls.Add(_intervalBox, 1, 2);
        layout.Controls.Add(new Label { Text = "AFK 阈值(秒):", AutoSize = true, TextAlign = System.Drawing.ContentAlignment.MiddleRight }, 0, 3);
        layout.Controls.Add(_afkBox, 1, 3);

        var saveBtn = new Button { Text = "保存", Width = 80 };
        saveBtn.Click += (_, _) =>
        {
            Config = Config with
            {
                ServerUrl = _urlBox.Text.Trim(),
                Token = _tokenBox.Text.Trim(),
                ReportIntervalSeconds = (int)_intervalBox.Value,
                AfkThresholdSeconds = (int)_afkBox.Value
            };
            DialogResult = DialogResult.OK;
            Close();
        };
        layout.Controls.Add(saveBtn, 1, 4);

        Controls.Add(layout);
    }
}

// ── Application Context ────────────────────────────────────────────────────

class AgentApplicationContext : ApplicationContext
{
    readonly NotifyIcon _tray;
    readonly System.Windows.Forms.Timer _timer = new();
    AgentConfig _config;
    AgentReporter _reporter;
    readonly List<string> _logs = [];
    bool _running = true;

    public AgentApplicationContext()
    {
        _config = ConfigStore.Load();
        _reporter = new AgentReporter(_config, Log);

        var menu = new ContextMenuStrip();
        menu.Items.Add("设置", null, OnSettings);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("查看日志", null, OnShowLogs);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出", null, (_, _) => { _running = false; Application.Exit(); });

        _tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Asashiki Agent",
            ContextMenuStrip = menu,
            Visible = true
        };

        _timer.Interval = Math.Max(1000, _config.ReportIntervalSeconds * 1000);
        _timer.Tick += async (_, _) =>
        {
            if (_running) await _reporter.TickAsync();
        };
        _timer.Start();

        Log("Agent 已启动");
    }

    void Log(string msg)
    {
        var line = $"{DateTime.Now:MM-dd HH:mm:ss} {msg}";
        _logs.Add(line);
        if (_logs.Count > 200) _logs.RemoveAt(0);
    }

    void OnSettings(object? sender, EventArgs e)
    {
        using var form = new SettingsForm(_config);
        if (form.ShowDialog() == DialogResult.OK)
        {
            _config = form.Config;
            ConfigStore.Save(_config);
            _reporter.UpdateConfig(_config);
            _timer.Interval = Math.Max(1000, _config.ReportIntervalSeconds * 1000);
            Log("配置已更新");
        }
    }

    void OnShowLogs(object? sender, EventArgs e)
    {
        var text = string.Join("\n", _logs.TakeLast(50));
        MessageBox.Show(text, "Asashiki Agent 日志",
            MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { _tray.Dispose(); _timer.Dispose(); _reporter.Dispose(); }
        base.Dispose(disposing);
    }
}
