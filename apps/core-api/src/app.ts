import Fastify from "fastify";
import cors from "@fastify/cors";
import { getOptionalEnvValue, parseServiceEnv } from "@asashiki/config";
import {
  archiveDiaryReadInputSchema,
  archiveFileDeleteInputSchema,
  archiveFileListInputSchema,
  archiveFileReadInputSchema,
  archiveFileWriteInputSchema,
  archiveSearchInputSchema,
  archiveStatusSchema,
  connectorSchema,
  connectorSummarySchema,
  createServiceHealth,
  deviceReportInputSchema,
  deviceTimelineInputSchema,
  diaryDeleteResultSchema,
  diaryUpdateInputSchema,
  diaryWriteInputSchema,
  healthRecordsBatchInputSchema,
  healthRecordsQueryInputSchema,
  locationBatchInputSchema,
  locationHistoryQueryInputSchema,
  recentContextSchema,
  remoteMcpServerSchema,
  remoteMcpToolInvokeInputSchema,
  remoteMcpToolInvokeResultSchema,
  remoteMcpToolSchema,
  serviceManifestSchema,
  timeLogLookupInputSchema
} from "@asashiki/schemas";
import type { Connector } from "@asashiki/schemas";
import { z } from "zod";
import { apiRuntimeSchema } from "./contracts.js";
import { initializeDatabase, resolveDatabasePath } from "./db.js";
import {
  createRemoteMcpRegistry,
  parseRemoteMcpServerConfigs
} from "./connectors/remote-mcp.js";
import { createArchiveClient } from "./connectors/archive.js";
import { createSupabaseTimeLogClient } from "./connectors/supabase-time-log.js";
import { createDeviceAuth, parseDeviceTokens } from "./device-auth.js";
import { createOkxConnector, parseOkxEnv } from "./connectors/okx.js";
import { createSteamConnector, parseSteamEnv } from "./connectors/steam.js";
import { fetchWeather, parseWeatherConfig } from "./connectors/weather.js";
import { createRepository } from "./repository.js";

export const coreApiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4100),
  CORE_API_DB_PATH: z.string().min(1).default("./data/core-api.sqlite"),
  ASASHIKI_ARCHIVE_ROOT: z.string().min(1).default("/archive"),
  ASASHIKI_DIARY_DIR: z.string().min(1).optional(),
  ADMIN_PANEL_TOKEN: z.string().min(8).optional(),
  REMOTE_MCP_SERVERS_JSON: z.string().optional(),
  SUPABASE_TIME_LOG_URL: z.string().url().optional(),
  SUPABASE_TIME_LOG_BEARER_TOKEN: z.string().min(1).optional(),
  SUPABASE_TIME_LOG_NAME: z.string().min(1).default("Supabase 时间日志"),
  DEVICE_TOKENS_JSON: z.string().optional()
});

export type CoreApiEnv = z.infer<typeof coreApiEnvSchema>;

export function loadCoreApiEnv(source: NodeJS.ProcessEnv): CoreApiEnv {
  const normalizedSource: NodeJS.ProcessEnv = {
    ...source,
    HOST: source.CORE_API_HOST ?? source.HOST,
    PORT: source.CORE_API_PORT ?? source.PORT,
    CORE_API_DB_PATH: source.CORE_API_DB_PATH ?? "./data/core-api.sqlite",
    ASASHIKI_ARCHIVE_ROOT:
      getOptionalEnvValue(source, "ASASHIKI_ARCHIVE_ROOT") ?? "/archive",
    ASASHIKI_DIARY_DIR: getOptionalEnvValue(source, "ASASHIKI_DIARY_DIR"),
    ADMIN_PANEL_TOKEN: getOptionalEnvValue(source, "ADMIN_PANEL_TOKEN"),
    REMOTE_MCP_SERVERS_JSON: getOptionalEnvValue(source, "REMOTE_MCP_SERVERS_JSON"),
    SUPABASE_TIME_LOG_URL: getOptionalEnvValue(source, "SUPABASE_TIME_LOG_URL"),
    SUPABASE_TIME_LOG_BEARER_TOKEN: getOptionalEnvValue(
      source,
      "SUPABASE_TIME_LOG_BEARER_TOKEN"
    ),
    SUPABASE_TIME_LOG_NAME:
      getOptionalEnvValue(source, "SUPABASE_TIME_LOG_NAME") ??
      "Supabase 时间日志",
    DEVICE_TOKENS_JSON: getOptionalEnvValue(source, "DEVICE_TOKENS_JSON")
  };

  return coreApiEnvSchema.parse(
    parseServiceEnv("core-api", normalizedSource, {
      PORT: z.coerce.number().int().positive().default(4100),
      CORE_API_DB_PATH: z.string().min(1).default("./data/core-api.sqlite"),
      ASASHIKI_ARCHIVE_ROOT: z.string().min(1).default("/archive"),
      ASASHIKI_DIARY_DIR: z.string().min(1).optional(),
      ADMIN_PANEL_TOKEN: z.string().min(8).optional(),
      REMOTE_MCP_SERVERS_JSON: z.string().optional(),
      SUPABASE_TIME_LOG_URL: z.string().url().optional(),
      SUPABASE_TIME_LOG_BEARER_TOKEN: z.string().min(1).optional(),
      SUPABASE_TIME_LOG_NAME: z.string().min(1).default("Supabase 时间日志"),
      DEVICE_TOKENS_JSON: z.string().optional()
    })
  );
}

function summarizeConnectors(connectors: Connector[]) {
  return connectorSummarySchema.parse({
    total: connectors.length,
    online: connectors.filter((row) => row.status === "online").length,
    degraded: connectors.filter((row) => row.status === "degraded").length,
    offline: connectors.filter((row) => row.status === "offline").length
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getBasicPassword(authorizationHeader: unknown) {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, encoded] = authorizationHeader.split(" ");

  if (scheme?.toLowerCase() !== "basic" || !encoded) {
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    return separator >= 0 ? decoded.slice(separator + 1) : null;
  } catch {
    return null;
  }
}

export async function createCoreApiApp(options?: {
  env?: CoreApiEnv;
  seed?: boolean;
  logger?: boolean;
  startedAt?: Date;
}) {
  const env = options?.env ?? loadCoreApiEnv(process.env);
  const startedAt = options?.startedAt ?? new Date();
  const databasePath = resolveDatabasePath(env.CORE_API_DB_PATH);
  const database = initializeDatabase(databasePath, { seed: options?.seed });
  const repository = createRepository(database);
  const archive = createArchiveClient({
    rootPath: env.ASASHIKI_ARCHIVE_ROOT,
    diaryPath: env.ASASHIKI_DIARY_DIR
  });
  const remoteMcpRegistry = createRemoteMcpRegistry({
    servers: parseRemoteMcpServerConfigs(env.REMOTE_MCP_SERVERS_JSON),
    envSource: process.env
  });
  const supabaseTimeLog = createSupabaseTimeLogClient({
    url: env.SUPABASE_TIME_LOG_URL,
    bearerToken: env.SUPABASE_TIME_LOG_BEARER_TOKEN,
    connectorName: env.SUPABASE_TIME_LOG_NAME
  });
  const deviceAuth = createDeviceAuth(parseDeviceTokens(env.DEVICE_TOKENS_JSON));
  const okxConfig = parseOkxEnv(process.env);
  const okx = okxConfig ? createOkxConnector(okxConfig) : null;
  const steamConfig = parseSteamEnv(process.env);
  const steam = steamConfig ? createSteamConnector(steamConfig) : null;
  const weatherConfig = parseWeatherConfig(process.env);

  const manifest = serviceManifestSchema.parse({
    id: "core-api",
    name: "Core API",
    port: env.PORT,
    exposure: "private-operational",
    description: "Personal AI Control Plane business core"
  });

  const server = Fastify({ logger: options?.logger ?? true });

  await server.register(cors, {
    origin: true
  });

  server.addHook("onClose", async () => {
    database.close();
  });

  server.get("/health", async () =>
    createServiceHealth(manifest, env.NODE_ENV, startedAt)
  );

  server.get("/console", async (request, reply) => {
    if (env.ADMIN_PANEL_TOKEN) {
      const password = getBasicPassword(request.headers.authorization);
      if (password !== env.ADMIN_PANEL_TOKEN) {
        reply.code(401).header("WWW-Authenticate", 'Basic realm="Asashiki Console"');
        return "Authentication required.";
      }
    }

    // ── App name + activity description mapping ─────────────────────────────
    const APP_LABELS: Record<string, { name: string; desc: string }> = {
      "com.anthropic.claude":              { name: "Claude",       desc: "正在和 Claude 聊天~" },
      "com.openai.chatgpt":               { name: "ChatGPT",      desc: "正在和 ChatGPT 聊天~" },
      "com.google.android.apps.bard":     { name: "Gemini",       desc: "正在和 Gemini 聊天~" },
      "com.twitter.android":              { name: "Twitter / X",  desc: "正在刷 Twitter~" },
      "com.tencent.mobileqq":            { name: "QQ",           desc: "正在和朋友聊 QQ~" },
      "com.tencent.mm":                  { name: "微信",          desc: "正在刷微信~" },
      "tv.danmaku.bili":                 { name: "哔哩哔哩",      desc: "正在刷 B站~" },
      "com.bilibili.app.blue":           { name: "哔哩哔哩",      desc: "正在刷 B站~" },
      "com.google.android.youtube":      { name: "YouTube",      desc: "正在看 YouTube~" },
      "com.zhihu.android":               { name: "知乎",          desc: "正在看知乎~" },
      "com.weibo.android":               { name: "微博",          desc: "正在刷微博~" },
      "com.ss.android.ugc.aweme":        { name: "抖音",          desc: "正在刷抖音~" },
      "com.instagram.android":           { name: "Instagram",    desc: "正在刷 INS~" },
      "com.discord":                     { name: "Discord",      desc: "正在摸鱼 Discord~" },
      "com.telegram.messenger":          { name: "Telegram",     desc: "正在看 Telegram~" },
      "org.telegram.messenger":          { name: "Telegram",     desc: "正在看 Telegram~" },
      "com.whatsapp":                    { name: "WhatsApp",     desc: "正在聊 WhatsApp~" },
      "com.netease.cloudmusic":          { name: "网易云音乐",    desc: "正在听网易云~" },
      "com.kugou.android":               { name: "酷狗音乐",      desc: "正在听酷狗~" },
      "com.tencent.qqmusic":             { name: "QQ音乐",        desc: "正在听 QQ音乐~" },
      "com.spotify.music":               { name: "Spotify",      desc: "正在听 Spotify~" },
      "com.netflix.mediaclient":         { name: "Netflix",      desc: "正在看 Netflix~" },
      "com.notion.id":                   { name: "Notion",       desc: "正在整理 Notion~" },
      "md.obsidian":                     { name: "Obsidian",     desc: "正在记笔记~" },
      "com.github.android":             { name: "GitHub",       desc: "正在逛 GitHub~" },
      "com.microsoft.outlook":           { name: "Outlook",      desc: "正在处理邮件~" },
      "com.google.android.gm":          { name: "Gmail",        desc: "正在看邮件~" },
      "com.autonavi.minimap":           { name: "高德地图",      desc: "正在导航~" },
      "com.baidu.BaiduMap":             { name: "百度地图",      desc: "正在导航~" },
      "com.google.android.apps.maps":   { name: "Google Maps",  desc: "正在导航~" },
      "com.miHoYo.GenshinImpact":       { name: "原神",          desc: "正在打原神~" },
      "com.miHoYo.bh3oversea":         { name: "崩坏3",         desc: "正在打崩3~" },
      "com.HoYoverse.hkrpgoversea":    { name: "星穹铁道",      desc: "正在开星铁~" },
      "com.android.settings":           { name: "系统设置",      desc: "正在改设置~" },
      "com.miui.home":                  { name: "桌面",          desc: "在桌面发呆~" },
      "com.android.camera2":            { name: "相机",          desc: "正在拍照~" },
    };

    function appLabel(appId: string | null | undefined): { name: string; desc: string } {
      if (!appId) return { name: "未知", desc: "发呆中~" };
      return APP_LABELS[appId] ?? { name: appId.split(".").pop() ?? appId, desc: `正在用 ${appId.split(".").pop() ?? appId}~` };
    }

    function fmtTime(iso: string): string {
      return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
    }
    function fmtDuration(s: number | null): string {
      if (!s || s < 60) return `${s ?? 0}秒`;
      const m = Math.round(s / 60);
      return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}分钟`;
    }

    // ── Fetch all data ──────────────────────────────────────────────────────
    const [archiveStatus, remoteServers, deviceCurrent, recentHealth] = await Promise.all([
      Promise.resolve(archive.getStatus()),
      remoteMcpRegistry.listServers(),
      Promise.resolve(repository.getDeviceCurrent()),
      Promise.resolve(repository.getHealthRecords({ limit: 6 }))
    ]);

    const today = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 10);
    const activitySummary = repository.getDeviceActivitySummary(today);
    const timeline = repository.getDeviceTimeline(today);
    const locationData = repository.getLocationCurrent();
    const svcHealth = createServiceHealth(manifest, env.NODE_ENV, startedAt);

    let weatherLine = "";
    try {
      const loc = locationData.devices[0];
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const wConfig = loc && loc.recordedAt > twoHoursAgo
        ? { ...weatherConfig, latitude: loc.lat, longitude: loc.lon, locationName: "当前位置" }
        : weatherConfig;
      const w = await fetchWeather(wConfig);
      weatherLine = `${escapeHtml(w.location)} ${escapeHtml(w.current.description)} ${w.current.temperatureC}°C 湿度${w.current.humidity}%`;
    } catch { weatherLine = "天气获取失败"; }

    // ── Live status block ───────────────────────────────────────────────────
    function liveStatus(): string {
      const d = deviceCurrent.devices[0];
      if (!d) return `<p class="muted">暂无设备在线。</p>`;
      const label = appLabel(d.appId);
      const music = (d.extra as any)?.music;
      const musicLine = music?.title ? ` ♪ ${escapeHtml(music.title)}${music.artist ? ` - ${escapeHtml(music.artist)}` : ""}` : "";
      const bat = (d.extra as any)?.battery_percent;
      const charging = (d.extra as any)?.battery_charging;
      const net = (d.extra as any)?.network_type;
      const onlineClass = d.isOnline ? "ok" : "muted";
      const seenAgo = Math.round((Date.now() - new Date(d.lastSeenAt).getTime()) / 1000);
      const seenStr = seenAgo < 120 ? `${seenAgo}秒前` : `${Math.round(seenAgo / 60)}分钟前`;
      return `
        <table>
          <tr><th>设备</th><td class="${onlineClass}">${escapeHtml(d.deviceName)} · ${d.isOnline ? "在线" : "离线"} · ${escapeHtml(seenStr)}</td></tr>
          <tr><th>正在做</th><td><strong>${escapeHtml(label.desc)}</strong>${escapeHtml(musicLine)}</td></tr>
          <tr><th>应用</th><td>${escapeHtml(label.name)} <span class="muted">${escapeHtml(d.appId ?? "")}</span></td></tr>
          ${bat != null ? `<tr><th>电量</th><td>${escapeHtml(String(bat))}%${charging ? " ⚡充电中" : ""} · ${escapeHtml(net ?? "")}</td></tr>` : ""}
          <tr><th>天气</th><td>${escapeHtml(weatherLine)}</td></tr>
        </table>`;
    }

    // ── Timeline ────────────────────────────────────────────────────────────
    function timelineRows(): string {
      const acts = timeline.activities.slice(-30).reverse();
      if (acts.length === 0) return `<tr><td class="muted">今日暂无活动记录。</td></tr>`;
      return acts.map((a) => {
        const label = appLabel(a.appId);
        const dur = a.durationSeconds ? ` · ${escapeHtml(fmtDuration(a.durationSeconds))}` : " · 进行中";
        return `<tr><td>${escapeHtml(fmtTime(a.startedAt))} <strong>${escapeHtml(label.name)}</strong>${escapeHtml(dur)}</td></tr>`;
      }).join("\n        ");
    }

    // ── Activity summary ────────────────────────────────────────────────────
    function activityRows(): string {
      if (activitySummary.perApp.length === 0) return `<tr><td colspan="2" class="muted">今日暂无数据。</td></tr>`;
      return activitySummary.perApp.slice(0, 12).map((a) => {
        const label = appLabel(a.appId);
        return `<tr><th>${escapeHtml(label.name)}</th><td>${escapeHtml(fmtDuration(a.totalSeconds))} · ${escapeHtml(String(a.count))}次 <span class="muted">${escapeHtml(a.appId)}</span></td></tr>`;
      }).join("\n        ");
    }

    // ── Health ──────────────────────────────────────────────────────────────
    function healthRows(): string {
      if (recentHealth.records.length === 0) return `<tr><td colspan="2" class="muted">暂无数据。</td></tr>`;
      return recentHealth.records.map((r) => {
        const val = r.valueJson ? escapeHtml(JSON.stringify(r.valueJson)) : `${escapeHtml(String(r.value ?? "—"))}${r.unit ? " " + escapeHtml(r.unit) : ""}`;
        return `<tr><th>${escapeHtml(r.type)}</th><td>${val} <span class="muted">${escapeHtml(fmtTime(r.recordedAt))}</span></td></tr>`;
      }).join("\n        ");
    }

    const updatedAt = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

    const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Asashiki Console</title>
    <style>
      body { margin: 0; font: 15px/1.7 ui-monospace, "Cascadia Code", "Fira Code", monospace; color: #222; background: #f7f7f4; }
      main { max-width: 800px; margin: 0 auto; padding: 28px 18px 56px; }
      h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: -0.5px; }
      h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin: 28px 0 6px; border-bottom: 1px solid #e0ddd5; padding-bottom: 4px; }
      p { margin: 0 0 8px; color: #555; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #eeeae2; vertical-align: top; font-size: 14px; }
      th { width: 130px; color: #777; font-weight: normal; }
      td strong { color: #111; }
      .ok { color: #23724d; }
      .warn { color: #9a6a14; }
      .bad { color: #a13a31; }
      .muted { color: #aaa; font-size: 12px; }
      .live-desc { font-size: 18px; font-weight: 600; color: #111; padding: 14px 10px 6px; }
    </style>
    <script>
      let countdown = 30;
      function tick() {
        const el = document.getElementById("cd");
        if (el) el.textContent = countdown + "s";
        if (--countdown <= 0) location.reload();
        else setTimeout(tick, 1000);
      }
      window.onload = tick;
    </script>
  </head>
  <body>
    <main>
      <h1>Asashiki Console</h1>
      <p class="muted">自动刷新 <span id="cd">30s</span> · 更新于 ${escapeHtml(updatedAt)}</p>

      <h2>现在</h2>
      ${liveStatus()}

      <h2>今日时间线 (${escapeHtml(today)}，最近30条)</h2>
      <table>${timelineRows()}</table>

      <h2>今日应用统计</h2>
      <table>${activityRows()}</table>

      <h2>最近健康数据</h2>
      <table>${healthRows()}</table>

      <h2>服务</h2>
      <table>
        <tr><th>Core API</th><td class="ok">online · uptime ${escapeHtml(String(svcHealth.uptimeSeconds))}s</td></tr>
        <tr><th>Archive</th><td class="${archiveStatus.status === "online" ? "ok" : "warn"}">${escapeHtml(archiveStatus.status)} · ${escapeHtml(String(archiveStatus.fileCount))} 篇日记 · 最新 ${escapeHtml(archiveStatus.latestDiaryDate ?? "—")}</td></tr>
        <tr><th>上游 MCP</th><td>${escapeHtml(String(remoteServers.length))} registered</td></tr>
      </table>
    </main>
  </body>
</html>`;

    reply.header("Content-Type", "text/html; charset=utf-8");
    return html;
  });

  server.get("/api/runtime", async () =>
    apiRuntimeSchema.parse({
      milestone: "Milestone 2",
      databasePath,
      sharedPackages: ["@asashiki/config", "@asashiki/schemas"]
    })
  );

  server.get("/api/profile/summary", async () => repository.getProfileSummary());
  server.put("/api/profile/summary", async (request) =>
    repository.updateProfileSummary(request.body)
  );
  server.get("/api/context/recent", async () => {
    const context = repository.getRecentContext();
    const timeLogConnector = await supabaseTimeLog.getConnector();
    const remoteServers = await remoteMcpRegistry.listServers();
    const archiveStatus = archive.getStatus();

    return recentContextSchema.parse({
      ...context,
      statusHints: [
        ...context.statusHints.slice(0, 4),
        `archive: ${archiveStatus.status}`,
        remoteServers.length > 0
          ? `remote-mcp: ${
              remoteServers.filter((server) => server.status === "online").length
            }/${remoteServers.length}`
          : `time-log: ${timeLogConnector.status}`
      ].slice(0, 5)
    });
  });
  server.get("/api/journals", async () => repository.listJournals());
  server.post("/api/journals/drafts", async (request, reply) => {
    const draft = repository.createJournalDraft(request.body);
    reply.code(201);
    return draft;
  });

  server.get("/api/journals/drafts/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const draft = repository.getJournalDraft(params.id);

    if (!draft) {
      reply.code(404);
      return {
        message: "Journal draft not found."
      };
    }

    return draft;
  });

  server.get("/api/health/summary", async () => repository.getHealthSummary());
  server.get("/api/health/latest", async () => repository.getLatestHealthSnapshot());
  server.get("/api/connectors", async () => {
    const baseConnectors = repository.listConnectors();
    const archiveConnector = await archive.getConnector();
    const timeLogConnector = await supabaseTimeLog.getConnector();
    const remoteMcpConnectors = await remoteMcpRegistry.toConnectors();

    return connectorSchema
      .array()
      .parse(
        [
          ...baseConnectors,
          archiveConnector,
          timeLogConnector,
          ...remoteMcpConnectors
        ].filter(
            (connector, index, list) =>
              list.findIndex((item) => item.id === connector.id) === index
          )
      );
  });
  server.get("/api/connectors/summary", async () => {
    const baseConnectors = repository.listConnectors();
    const archiveConnector = await archive.getConnector();
    const timeLogConnector = await supabaseTimeLog.getConnector();
    const remoteMcpConnectors = await remoteMcpRegistry.toConnectors();
    const merged = connectorSchema
      .array()
      .parse(
        [
          ...baseConnectors,
          archiveConnector,
          timeLogConnector,
          ...remoteMcpConnectors
        ].filter(
            (connector, index, list) =>
              list.findIndex((item) => item.id === connector.id) === index
          )
      );
    return summarizeConnectors(merged);
  });
  server.get("/api/archive/status", async () =>
    archiveStatusSchema.parse(archive.getStatus())
  );
  server.get("/api/archive/diary", async (request, reply) => {
    const query = z
      .object({
        limit: z.coerce.number().int().positive().max(100).default(20)
      })
      .parse(request.query);

    try {
      return archive.listDiaryEntries(query.limit);
    } catch (error) {
      reply.code(503);
      return {
        message:
          error instanceof Error ? error.message : "Archive diary is unavailable."
      };
    }
  });
  server.get("/api/archive/diary/:date", async (request, reply) => {
    const params = archiveDiaryReadInputSchema.parse(request.params);

    try {
      const entry = archive.readDiaryEntry(params.date);

      if (!entry) {
        reply.code(404);
        return {
          message: "Diary entry not found."
        };
      }

      return entry;
    } catch (error) {
      reply.code(503);
      return {
        message:
          error instanceof Error ? error.message : "Archive diary is unavailable."
      };
    }
  });
  server.get("/api/remote-mcp/servers", async () =>
    remoteMcpServerSchema.array().parse(await remoteMcpRegistry.listServers())
  );
  server.get("/api/remote-mcp/servers/:serverId/tools", async (request) => {
    const params = z.object({ serverId: z.string().min(1) }).parse(request.params);
    return remoteMcpToolSchema
      .array()
      .parse(await remoteMcpRegistry.listTools(params.serverId));
  });
  server.post(
    "/api/remote-mcp/servers/:serverId/tools/:toolName/invoke",
    async (request) => {
      const params = z
        .object({
          serverId: z.string().min(1),
          toolName: z.string().min(1)
        })
        .parse(request.params);
      const payload = remoteMcpToolInvokeInputSchema.parse(request.body ?? {});

      return remoteMcpToolInvokeResultSchema.parse(
        await remoteMcpRegistry.invokeTool(
          params.serverId,
          params.toolName,
          payload
        )
      );
    }
  );
  server.get("/api/time-log/recent", async (request, reply) => {
    const query = z
      .object({
        limit: z.coerce.number().int().positive().max(12).default(5)
      })
      .parse(request.query);

    try {
      return await supabaseTimeLog.getRecent(query.limit);
    } catch (error) {
      reply.code(503);
      return {
        message:
          error instanceof Error
            ? error.message
            : "Supabase 时间日志当前不可用。"
      };
    }
  });
  server.get("/api/time-log/lookup", async (request, reply) => {
    const query = timeLogLookupInputSchema.parse(request.query);

    try {
      return await supabaseTimeLog.lookupAt(query);
    } catch (error) {
      reply.code(503);
      return {
        message:
          error instanceof Error
            ? error.message
            : "Supabase 时间日志查询失败。"
      };
    }
  });
  server.post("/api/devices/report", async (request, reply) => {
    const identity = deviceAuth.resolve(request.headers.authorization);

    if (!identity) {
      reply.code(401);
      return { error: "Invalid or missing device token." };
    }

    const payload = deviceReportInputSchema.parse(request.body ?? {});
    return repository.recordDeviceReport(identity, payload);
  });

  server.post("/api/devices/health", async (request, reply) => {
    const identity = deviceAuth.resolve(request.headers.authorization);

    if (!identity) {
      reply.code(401);
      return { error: "Invalid or missing device token." };
    }

    const payload = healthRecordsBatchInputSchema.parse(request.body ?? {});
    return repository.recordHealthBatch(identity, payload);
  });

  server.get("/api/devices/current", async () => repository.getDeviceCurrent());

  server.get("/api/devices/timeline", async (request) => {
    const query = z
      .object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
      })
      .parse(request.query);
    const date = query.date ?? new Date().toISOString().slice(0, 10);
    return repository.getDeviceTimeline(date);
  });

  server.get("/api/devices/activity-summary", async (request) => {
    const query = z
      .object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
      })
      .parse(request.query);
    const date = query.date ?? new Date().toISOString().slice(0, 10);
    return repository.getDeviceActivitySummary(date);
  });

  server.get("/api/devices/health", async (request) =>
    repository.getHealthRecords(request.query)
  );

  server.post("/api/archive/diary", async (request, reply) => {
    const payload = diaryWriteInputSchema.parse(request.body ?? {});
    try {
      return archive.writeDiaryEntry(payload.date, payload.content, {
        overwrite: payload.overwrite ?? false
      });
    } catch (error) {
      reply.code(409);
      return {
        message:
          error instanceof Error ? error.message : "Diary write failed."
      };
    }
  });

  server.put("/api/archive/diary/:date", async (request, reply) => {
    const params = z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(request.params);
    const body = diaryUpdateInputSchema
      .omit({ date: true })
      .parse(request.body ?? {});

    try {
      return archive.updateDiaryEntry(params.date, body.content, body.mode);
    } catch (error) {
      reply.code(404);
      return {
        message:
          error instanceof Error ? error.message : "Diary update failed."
      };
    }
  });

  // DELETE diary entry
  server.delete("/api/archive/diary/:date", async (request, reply) => {
    const params = z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(request.params);
    try {
      return archive.deleteDiaryEntry(params.date);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Delete failed." };
    }
  });

  // Generic archive file access
  server.get("/api/archive/file", async (request, reply) => {
    const { path } = archiveFileReadInputSchema.parse(request.query);
    try {
      return archive.readArchiveFile(path);
    } catch (error) {
      reply.code(404);
      return { message: error instanceof Error ? error.message : "File not found." };
    }
  });

  server.post("/api/archive/file", async (request, reply) => {
    const payload = archiveFileWriteInputSchema.parse(request.body ?? {});
    try {
      return archive.writeArchiveFile(payload.path, payload.content, payload.overwrite ?? false);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Write failed." };
    }
  });

  server.get("/api/archive/files", async (request, reply) => {
    const { dir } = archiveFileListInputSchema.parse(request.query);
    try {
      return archive.listArchiveFiles(dir);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "List failed." };
    }
  });

  // Delete arbitrary archive file
  server.delete("/api/archive/file", async (request, reply) => {
    const { path } = archiveFileDeleteInputSchema.parse(request.query);
    try {
      return archive.deleteArchiveFile(path);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Delete failed." };
    }
  });

  // Full-text search across archive
  server.get("/api/archive/search", async (request, reply) => {
    const input = archiveSearchInputSchema.parse(request.query);
    try {
      return archive.searchArchive(input.query, input.dir, input.limit);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Search failed." };
    }
  });

  // Device timeline (expose existing repository method)
  server.get("/api/devices/timeline-query", async (request) => {
    const raw = request.query as Record<string, string>;
    const input = deviceTimelineInputSchema.parse({
      ...raw,
      limit: raw.limit !== undefined ? Number(raw.limit) : undefined
    });
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    return repository.getDeviceTimeline(date);
  });

  // Health records detailed query (expose existing repository method)
  server.get("/api/devices/health-records", async (request) => {
    const raw = request.query as Record<string, string>;
    const input = healthRecordsQueryInputSchema.parse({
      ...raw,
      limit: raw.limit !== undefined ? Number(raw.limit) : undefined
    });
    return repository.getHealthRecords(input);
  });

  // OKX read-only endpoints
  server.get("/api/okx/balance", async (_request, reply) => {
    if (!okx) { reply.code(503); return { message: "OKX not configured." }; }
    try { return await okx.getAccountBalance(); }
    catch (e) { reply.code(502); return { message: e instanceof Error ? e.message : "OKX error." }; }
  });

  server.get("/api/okx/positions", async (_request, reply) => {
    if (!okx) { reply.code(503); return { message: "OKX not configured." }; }
    try { return await okx.getPositions(); }
    catch (e) { reply.code(502); return { message: e instanceof Error ? e.message : "OKX error." }; }
  });

  server.get("/api/okx/assets", async (_request, reply) => {
    if (!okx) { reply.code(503); return { message: "OKX not configured." }; }
    try { return await okx.getAssetBalances(); }
    catch (e) { reply.code(502); return { message: e instanceof Error ? e.message : "OKX error." }; }
  });

  // Location tracking endpoints
  server.post("/api/devices/location", async (request, reply) => {
    const identity = deviceAuth.resolve(request.headers.authorization);
    if (!identity) { reply.code(401); return { message: "Unauthorized." }; }
    try {
      const result = repository.insertLocationBatch(identity.deviceId, request.body ?? {});
      return result;
    } catch (e) {
      reply.code(400);
      return { message: e instanceof Error ? e.message : "Bad request." };
    }
  });

  server.get("/api/devices/location/current", async () =>
    repository.getLocationCurrent()
  );

  server.get("/api/devices/location/history", async (request) => {
    const raw = request.query as Record<string, string>;
    const input = locationHistoryQueryInputSchema.parse({
      ...raw,
      limit: raw.limit !== undefined ? Number(raw.limit) : undefined
    });
    return repository.getLocationHistory(input);
  });

  // Weather endpoint
  server.get("/api/weather", async (_request, reply) => {
    try {
      // Use latest GPS location if available and fresh (within 2 hours)
      const locationData = repository.getLocationCurrent();
      const latest = locationData.devices[0];
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const config =
        latest && latest.recordedAt > twoHoursAgo
          ? { ...weatherConfig, latitude: latest.lat, longitude: latest.lon, locationName: "当前位置" }
          : weatherConfig;
      return await fetchWeather(config);
    } catch (e) {
      reply.code(502);
      return { message: e instanceof Error ? e.message : "Weather unavailable." };
    }
  });

  // Steam read-only endpoints
  server.get("/api/steam/recent-games", async (_request, reply) => {
    if (!steam) { reply.code(503); return { message: "Steam not configured." }; }
    try { return await steam.getRecentlyPlayedGames(); }
    catch (e) { reply.code(502); return { message: e instanceof Error ? e.message : "Steam error." }; }
  });

  server.get("/api/steam/profile", async (_request, reply) => {
    if (!steam) { reply.code(503); return { message: "Steam not configured." }; }
    try { return await steam.getPlayerSummary(); }
    catch (e) { reply.code(502); return { message: e instanceof Error ? e.message : "Steam error." }; }
  });

  server.get("/api/audit/recent", async () => repository.listRecentAudit());
  server.get("/public/cards", async () => repository.getPublicCards());
  server.get("/public/status", async () => repository.getPublicStatus());
  server.get("/public/widget-config", async () => repository.getPublicWidgetConfig());

  // ── Admin: SQLite backup ────────────────────────────────────────────────
  server.post("/api/admin/backup-db", async (request, reply) => {
    const password = getBasicPassword(request.headers.authorization);
    if (env.ADMIN_PANEL_TOKEN && password !== env.ADMIN_PANEL_TOKEN) {
      reply.code(401); return { error: "Unauthorized" };
    }
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const archiveRoot = env.ASASHIKI_ARCHIVE_ROOT ?? "/archive";
      const backupDir = path.join(archiveRoot, "备份", "db");
      fs.mkdirSync(backupDir, { recursive: true });
      const date = new Date().toISOString().slice(0, 10);
      const dest = path.join(backupDir, `core-api-${date}.sqlite`);
      // VACUUM INTO creates a clean compacted copy without locking the live db
      database.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
      const size = fs.statSync(dest).size;
      return { ok: true, path: dest, sizeBytes: size, backedUpAt: new Date().toISOString() };
    } catch (e) {
      reply.code(500);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ── Admin: Daily Markdown digest ────────────────────────────────────────
  server.post("/api/admin/daily-digest", async (request, reply) => {
    const password = getBasicPassword(request.headers.authorization);
    if (env.ADMIN_PANEL_TOKEN && password !== env.ADMIN_PANEL_TOKEN) {
      reply.code(401); return { error: "Unauthorized" };
    }
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");

      const rawDate = (request.query as Record<string, string>).date;
      const date = rawDate ?? new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 10);

      const actSummary = repository.getDeviceActivitySummary(date);
      const timeline = repository.getDeviceTimeline(date);
      const healthRecords = repository.getHealthRecords({ limit: 200 });
      const locationHistory = repository.getLocationHistory({ limit: 200 });

      // Filter health records to the date
      const dayHealthRecords = healthRecords.records.filter(r => r.recordedAt.startsWith(date));
      const dayLocationPoints = locationHistory.points.filter(p => p.recordedAt.startsWith(date));

      function fmtDur(s: number) {
        const m = Math.round(s / 60);
        return m >= 60 ? `${Math.floor(m/60)}h${m%60}m` : `${m}分钟`;
      }

      const APP_NAMES: Record<string, string> = {
        "com.anthropic.claude": "Claude", "com.openai.chatgpt": "ChatGPT",
        "com.twitter.android": "Twitter", "com.tencent.mobileqq": "QQ",
        "com.tencent.mm": "微信", "tv.danmaku.bili": "哔哩哔哩",
        "com.bilibili.app.blue": "哔哩哔哩", "com.google.android.youtube": "YouTube",
        "com.zhihu.android": "知乎", "com.ss.android.ugc.aweme": "抖音",
        "com.netease.cloudmusic": "网易云音乐", "com.spotify.music": "Spotify",
        "com.notion.id": "Notion", "md.obsidian": "Obsidian",
        "com.github.android": "GitHub", "com.miui.home": "桌面",
        "com.android.settings": "设置",
      };
      const appName = (id: string) => APP_NAMES[id] ?? id.split(".").pop() ?? id;

      // App usage section
      const appLines = actSummary.perApp.slice(0, 15).map(a =>
        `| ${appName(a.appId)} | ${fmtDur(a.totalSeconds)} | ${a.count}次 |`
      ).join("\n");

      // Health section
      const hrRecords = dayHealthRecords.filter(r => r.type === "heart_rate" && r.value);
      const hrVals = hrRecords.map(r => r.value!);
      const hrLine = hrVals.length > 0
        ? `- 心率：${Math.min(...hrVals).toFixed(0)}–${Math.max(...hrVals).toFixed(0)} bpm（${hrVals.length} 条记录）`
        : "";
      const stepsTotal = dayHealthRecords.filter(r => r.type === "steps").reduce((s, r) => s + (r.value ?? 0), 0);
      const stepsLine = stepsTotal > 0 ? `- 步数：${stepsTotal.toFixed(0)} 步` : "";
      const spo2Records = dayHealthRecords.filter(r => r.type === "oxygen_saturation" && r.value);
      const spo2Vals = spo2Records.map(r => r.value!);
      const spo2Line = spo2Vals.length > 0
        ? `- 血氧：${Math.min(...spo2Vals).toFixed(0)}–${Math.max(...spo2Vals).toFixed(0)}%（${spo2Vals.length} 条）`
        : "";
      const sleepMins = dayHealthRecords.filter(r => r.type === "sleep").reduce((s, r) => s + (r.value ?? 0), 0);
      const sleepLine = sleepMins > 0 ? `- 睡眠：${(sleepMins / 60).toFixed(1)} 小时` : "";
      const healthSection = [hrLine, stepsLine, spo2Line, sleepLine].filter(Boolean).join("\n") || "- 暂无数据";

      // Location section
      const locLine = dayLocationPoints.length > 0
        ? `- 记录 ${dayLocationPoints.length} 个位置点\n- 最后位置：${dayLocationPoints[0].lat.toFixed(4)}°N ${dayLocationPoints[0].lon.toFixed(4)}°E（精度 ${(dayLocationPoints[0].accuracyM ?? 0).toFixed(0)}m）`
        : "- 暂无位置记录";

      // Timeline section (last 20 activities)
      const tlLines = timeline.activities.slice(-20).reverse().map(a => {
        const t = new Date(a.startedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
        const dur = a.durationSeconds ? ` · ${fmtDur(a.durationSeconds)}` : " · 进行中";
        return `- ${t} ${appName(a.appId)}${dur}`;
      }).join("\n") || "- 暂无数据";

      const totalScreenMins = Math.round(actSummary.totalSeconds / 60);

      const markdown = `---
date: ${date}
type: data-digest
tags: [数据日志]
---

# ${date} 数据日志

## 应用使用（屏幕时间 ${totalScreenMins} 分钟）

| 应用 | 时长 | 次数 |
|------|------|------|
${appLines || "| 暂无数据 | — | — |"}

## 健康数据

${healthSection}

## 位置记录

${locLine}

## 活动时间线（最近 20 条）

${tlLines}

---
*由 Core API 自动生成于 ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}*
`;

      const archiveRoot = env.ASASHIKI_ARCHIVE_ROOT ?? "/archive";
      const digestDir = path.join(archiveRoot, "Obsidian_Asashiki", "数据日志");
      fs.mkdirSync(digestDir, { recursive: true });
      const destFile = path.join(digestDir, `${date}.md`);
      fs.writeFileSync(destFile, markdown, "utf-8");

      return { ok: true, date, path: destFile, writtenAt: new Date().toISOString() };
    } catch (e) {
      reply.code(500);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  return {
    env,
    databasePath,
    repository,
    server
  };
}
