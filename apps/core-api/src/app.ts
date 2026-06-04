import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { getOptionalEnvValue, parseServiceEnv } from "@asashiki/config";
import {
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
  diaryWriteInputSchema,
  diaryWriteResultSchema,
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
  timeLogLookupInputSchema,
  timeLogRangeInputSchema,
  xSearchInputSchema
} from "@asashiki/schemas";
import type { Connector } from "@asashiki/schemas";
import { z } from "zod";
import { apiRuntimeSchema } from "./contracts.js";
import { initializeDatabase, migrateDatabase, resolveDatabasePath } from "./db.js";
import {
  createRemoteMcpRegistry,
  parseRemoteMcpServerConfigs
} from "./connectors/remote-mcp.js";
import { createArchiveClient } from "./connectors/archive.js";
import { createSupabaseTimeLogClient } from "./connectors/supabase-time-log.js";
import { createDeviceAuth, parseDeviceTokens } from "./device-auth.js";
import { createOkxConnector, parseOkxEnv } from "./connectors/okx.js";
import { createSteamConnector, parseSteamEnv } from "./connectors/steam.js";
import { createXSearchConnector, parseXSearchEnv } from "./connectors/x-search.js";
import { createVikingConnector, parseVikingEnv, VikingError } from "./connectors/viking.js";
import { fetchWeather, parseWeatherConfig } from "./connectors/weather.js";
import { parseMinimaxConfig, synthesizeVoice } from "./connectors/minimax.js";
import { createRepository } from "./repository.js";
import { appLabel, appName, liveDescription } from "./app-labels.js";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { randomUUID } from "node:crypto";

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
  DEVICE_TOKENS_JSON: z.string().optional(),
  IOS_PROBE_TOKEN: z.string().min(8).optional()
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
    DEVICE_TOKENS_JSON: getOptionalEnvValue(source, "DEVICE_TOKENS_JSON"),
    IOS_PROBE_TOKEN: getOptionalEnvValue(source, "IOS_PROBE_TOKEN")
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
      DEVICE_TOKENS_JSON: z.string().optional(),
      IOS_PROBE_TOKEN: z.string().min(8).optional()
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
  const envRemoteServers = parseRemoteMcpServerConfigs(env.REMOTE_MCP_SERVERS_JSON);
  const remoteMcpRegistry = createRemoteMcpRegistry({
    // Merge env-defined servers with console-managed DB rows (DB wins on id).
    getServers: () => {
      const dbServers = repository.listRemoteServerConfigs().filter((s) => s.enabled);
      const dbIds = new Set(dbServers.map((s) => s.id));
      return [...envRemoteServers.filter((s) => !dbIds.has(s.id)), ...dbServers];
    },
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
  const xSearchConfig = parseXSearchEnv(process.env);
  const xSearch = xSearchConfig ? createXSearchConnector(xSearchConfig) : null;
  const vikingConfig = parseVikingEnv(process.env);
  const viking = vikingConfig ? createVikingConnector(vikingConfig) : null;
  const weatherConfig = parseWeatherConfig(process.env);
  const minimaxConfig = parseMinimaxConfig(process.env);
  const voiceDir = nodePath.join(nodePath.dirname(databasePath), "voice");
  nodeFs.mkdirSync(voiceDir, { recursive: true });

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
    // App label mapping is imported from app-labels.ts

    function fmtTime(iso: string): string {
      return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
    }
    function fmtDuration(s: number | null): string {
      if (!s || s < 60) return `${s ?? 0}秒`;
      const m = Math.round(s / 60);
      return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}分钟`;
    }

    // ── Read query params ───────────────────────────────────────────────────
    const qs = request.query as Record<string, string>;
    const filterDevice = qs.device ?? "";

    // ── Fetch all data ──────────────────────────────────────────────────────
    const [archiveStatus, remoteServers, deviceCurrent, recentHealth] = await Promise.all([
      Promise.resolve(archive.getStatus()),
      remoteMcpRegistry.listServers(),
      Promise.resolve(repository.getDeviceCurrent()),
      Promise.resolve(repository.getHealthRecords({ limit: 6 }))
    ]);

    const today = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 10);
    const activitySummary = repository.getDeviceActivitySummary(today);
    const timeline = repository.getDeviceTimeline(today, filterDevice || null);
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

    // ── Live status block (per device) ──────────────────────────────────────
    function liveStatus(): string {
      if (deviceCurrent.devices.length === 0) return `<p class="muted">暂无设备在线。</p>`;
      // Sort: online first, then by lastSeenAt desc
      const sorted = [...deviceCurrent.devices].sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      });
      return sorted.map((d) => {
        const label = appLabel(d.appId);
        const desc = liveDescription({ appId: d.appId, windowTitle: d.windowTitle, who: "Asashiki" });
        const music = (d.extra as any)?.music;
        const musicLine = music?.title ? ` ♪ ${escapeHtml(music.title)}${music.artist ? ` - ${escapeHtml(music.artist)}` : ""}` : "";
        const bat = (d.extra as any)?.battery_percent;
        const charging = (d.extra as any)?.battery_charging;
        const net = (d.extra as any)?.network_type;
        const onlineClass = d.isOnline ? "ok" : "muted";
        const seenAgo = Math.round((Date.now() - new Date(d.lastSeenAt).getTime()) / 1000);
        const seenStr = seenAgo < 120 ? `${seenAgo}秒前` : seenAgo < 7200 ? `${Math.round(seenAgo / 60)}分钟前` : `${Math.round(seenAgo / 3600)}小时前`;
        const titleLine = d.windowTitle && d.windowTitle !== d.appId
          ? `<tr><th>窗口</th><td class="muted">${escapeHtml(d.windowTitle)}</td></tr>`
          : "";
        return `
        <h3 style="margin:18px 0 6px;font-size:14px;color:#444;">${escapeHtml(d.deviceName)} <span class="muted" style="font-weight:normal">(${escapeHtml(d.platform)})</span></h3>
        <table>
          <tr><th>状态</th><td class="${onlineClass}">${d.isOnline ? "在线" : "离线"} · ${escapeHtml(seenStr)}</td></tr>
          <tr><th>正在做</th><td><strong>${escapeHtml(desc)}</strong>${escapeHtml(musicLine)}</td></tr>
          <tr><th>应用</th><td>${escapeHtml(label.name)} <span class="muted">${escapeHtml(d.appId ?? "")}</span></td></tr>
          ${titleLine}
          ${bat != null ? `<tr><th>电量</th><td>${escapeHtml(String(bat))}%${charging ? " ⚡充电中" : ""} · ${escapeHtml(net ?? "")}</td></tr>` : ""}
        </table>`;
      }).join("\n") + `
        <table style="margin-top:12px;">
          <tr><th>天气</th><td>${escapeHtml(weatherLine)}</td></tr>
        </table>`;
    }

    // ── Timeline (with device filter UI) ────────────────────────────────────
    function deviceFilter(): string {
      const items: Array<{ id: string; label: string }> = [{ id: "", label: "全部" }];
      for (const d of deviceCurrent.devices) items.push({ id: d.deviceId, label: d.deviceName });
      return items.map(it => {
        const isActive = it.id === filterDevice;
        const href = it.id ? `?device=${encodeURIComponent(it.id)}` : "?";
        return `<a href="${href}" style="margin-right:12px;text-decoration:none;color:${isActive ? "#111" : "#888"};font-weight:${isActive ? "600" : "normal"};">${isActive ? "● " : "○ "}${escapeHtml(it.label)}</a>`;
      }).join("");
    }

    function timelineRows(): string {
      const acts = timeline.activities.slice(-50).reverse();
      if (acts.length === 0) return `<tr><td class="muted">今日暂无活动记录。</td></tr>`;
      return acts.map((a) => {
        const desc = liveDescription({ appId: a.appId, windowTitle: a.windowTitle, who: "" }).trim();
        const dur = a.durationSeconds ? ` · ${escapeHtml(fmtDuration(a.durationSeconds))}` : " · 进行中";
        return `<tr><td><span class="muted">${escapeHtml(fmtTime(a.startedAt))}</span> ${escapeHtml(desc)}<span class="muted">${escapeHtml(dur)}</span></td></tr>`;
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

      <h2>今日时间线 (${escapeHtml(today)})</h2>
      <p style="font-size:13px;margin:6px 0 8px;">${deviceFilter()}</p>
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
  server.get("/api/remote-mcp/servers", async () =>
    remoteMcpServerSchema.array().parse(await remoteMcpRegistry.listServers())
  );
  // Console-managed CRUD for remote server configs (admin token; gateway calls these).
  server.post("/api/remote-mcp/servers", async (request, reply) => {
    const password = getBasicPassword(request.headers.authorization);
    const bearer = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!(env.ADMIN_PANEL_TOKEN && (password === env.ADMIN_PANEL_TOKEN || bearer === env.ADMIN_PANEL_TOKEN))) {
      reply.code(401); return { error: "Unauthorized" };
    }
    const body = z.object({
      id: z.string().trim().min(1).regex(/^[a-z0-9-]+$/, "id: lowercase/digits/hyphen only"),
      name: z.string().trim().min(1),
      url: z.string().url(),
      description: z.string().trim().min(1),
      bearerTokenEnv: z.string().trim().min(1).optional(),
      bearerToken: z.string().trim().min(1).optional(),
      headers: z.record(z.string(), z.string()).optional(),
      enabled: z.boolean().optional()
    }).safeParse(request.body ?? {});
    if (!body.success) { reply.code(400); return { error: body.error.issues.map((i) => i.message).join("; ") }; }
    repository.upsertRemoteServerConfig(body.data);
    return { ok: true, id: body.data.id };
  });
  server.delete("/api/remote-mcp/servers/:serverId", async (request, reply) => {
    const password = getBasicPassword(request.headers.authorization);
    const bearer = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!(env.ADMIN_PANEL_TOKEN && (password === env.ADMIN_PANEL_TOKEN || bearer === env.ADMIN_PANEL_TOKEN))) {
      reply.code(401); return { error: "Unauthorized" };
    }
    const { serverId } = z.object({ serverId: z.string().min(1) }).parse(request.params);
    const deleted = repository.deleteRemoteServerConfig(serverId);
    return { ok: true, deleted };
  });
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
  // Full-result proxy (content + structuredContent), for the MCP gateway to
  // forward remote tool calls to agents. Internal route (core-api is 127.0.0.1).
  server.post(
    "/api/remote-mcp/servers/:serverId/tools/:toolName/proxy",
    async (request, reply) => {
      const params = z
        .object({ serverId: z.string().min(1), toolName: z.string().min(1) })
        .parse(request.params);
      try {
        return await remoteMcpRegistry.invokeToolRaw(
          params.serverId,
          params.toolName,
          request.body ?? {}
        );
      } catch (e) {
        reply.code(502);
        return { error: e instanceof Error ? e.message : "remote invoke failed" };
      }
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
  server.get("/api/time-log/range", async (request, reply) => {
    const query = timeLogRangeInputSchema.parse(request.query);

    try {
      return await supabaseTimeLog.lookupRange(query);
    } catch (error) {
      reply.code(503);
      return {
        message:
          error instanceof Error
            ? error.message
            : "Supabase 时间日志区间查询失败。"
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

  // Diary write → OpenViking (viking://resources/diary/YYYY-MM-DD.md).
  // Read/list/update/delete were removed in favor of agents using OpenViking
  // search/read/forget directly. "update" is folded into write via mode=append|replace.
  server.post("/api/diary", async (request, reply) => {
    if (!viking) { reply.code(503); return { message: "OpenViking not configured." }; }
    let payload;
    try {
      payload = diaryWriteInputSchema.parse(request.body ?? {});
    } catch (e) {
      reply.code(400);
      return { message: e instanceof Error ? e.message : "Invalid diary input." };
    }
    const uri = `viking://resources/diary/${payload.date}.md`;
    try {
      const result = await viking.writeContent(uri, payload.content, payload.mode);
      return diaryWriteResultSchema.parse({
        date: payload.date,
        uri: result.uri,
        bytesWritten: result.writtenBytes,
        mode: result.mode,
        semanticStatus: result.semanticStatus,
        vectorStatus: result.vectorStatus
      });
    } catch (e) {
      if (e instanceof VikingError) {
        if (e.code === "NOT_FOUND") { reply.code(404); return { message: e.message }; }
        if (e.code === "ALREADY_EXISTS") { reply.code(409); return { message: e.message }; }
        if (e.code === "INVALID_ARGUMENT") { reply.code(400); return { message: e.message }; }
        reply.code(502); return { message: e.message };
      }
      reply.code(502);
      return { message: e instanceof Error ? e.message : "Diary write failed." };
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

  // ── iOS shortcut endpoints (app-event + snapshot + debug probe) ───────────
  //
  // All three share IOS_PROBE_TOKEN and the synthetic device identity
  //   { deviceId: "ios-phone", deviceName: "iPhone", platform: "ios" }
  //
  // Data lands in the SHARED device tables so existing MCP tools
  // (device_status / device_timeline / device_activity_summary) and the
  // existing REST endpoints (/api/devices/current, /api/devices/timeline-query,
  // /api/devices/activity-summary) cover iOS automatically. No iOS-specific
  // tables, schemas, or MCP tools.
  const iosDevice = {
    deviceId: "ios-phone",
    deviceName: "iPhone",
    platform: "ios"
  };
  const iosProbeDir = nodePath.join(
    env.ASASHIKI_ARCHIVE_ROOT ?? "/archive",
    "Obsidian_Asashiki",
    "归档",
    "iOS探针"
  );
  const iosProbeRetentionDays = 14;

  function checkIosAuth(request: FastifyRequest, reply: FastifyReply): boolean {
    if (!env.IOS_PROBE_TOKEN) {
      reply.code(503).send({ message: "IOS_PROBE_TOKEN not configured on the server." });
      return false;
    }
    if (request.headers.authorization !== `Bearer ${env.IOS_PROBE_TOKEN}`) {
      reply.code(401).send({ message: "Unauthorized." });
      return false;
    }
    return true;
  }

  function pruneOldProbes() {
    try {
      if (!nodeFs.existsSync(iosProbeDir)) return;
      const cutoffMs = Date.now() - iosProbeRetentionDays * 24 * 60 * 60 * 1000;
      for (const name of nodeFs.readdirSync(iosProbeDir)) {
        if (!name.endsWith(".json")) continue;
        const full = nodePath.join(iosProbeDir, name);
        try {
          if (nodeFs.statSync(full).mtimeMs < cutoffMs) nodeFs.rmSync(full);
        } catch {
          // best-effort cleanup, ignore single-file failures
        }
      }
    } catch {
      // never block ingestion on cleanup failure
    }
  }

  // ── iOS app open/close event from Shortcuts personal automations ──────────
  // Body shape (matches the Shortcut as-configured):
  //   { app?: string, action: "open" | "close" }
  // Maps to the standard device-event model:
  //   "open X" → close any open device_activities row, insert new (app_id=X);
  //              update device_states (app_id=X, last_seen_at=now)
  //   "close"  → close any open device_activities row;
  //              update device_states (app_id=null = idle, last_seen_at=now)
  // Safety: any activity older than 2h with no end is force-closed (covers
  // missed close events from missed automations).
  server.post("/api/devices/ios/app-event", async (request, reply) => {
    if (!checkIosAuth(request, reply)) return;

    const body = (request.body ?? {}) as { app?: unknown; action?: unknown };
    const action = body.action;
    if (action !== "open" && action !== "close") {
      reply.code(400);
      return { message: "action must be 'open' or 'close'." };
    }
    const app = typeof body.app === "string" && body.app.trim().length > 0
      ? body.app.trim()
      : null;
    if (action === "open" && !app) {
      reply.code(400);
      return { message: "'open' events require an 'app' field." };
    }

    const now = new Date().toISOString();
    const maxActivityMs = 2 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - maxActivityMs).toISOString();

    // 1) Force-close any stale unfinished activities.
    database.prepare(
      `UPDATE device_activities
         SET ended_at = ?
       WHERE device_id = ? AND ended_at IS NULL AND started_at < ?`
    ).run(now, iosDevice.deviceId, cutoff);

    // 2) Close any currently-open activity for this device.
    database.prepare(
      `UPDATE device_activities
         SET ended_at = ?
       WHERE device_id = ? AND ended_at IS NULL`
    ).run(now, iosDevice.deviceId);

    // 3) On "open" insert a new activity.
    let activityId: number | null = null;
    if (action === "open" && app) {
      const result = database.prepare(
        `INSERT INTO device_activities
           (device_id, app_id, window_title, started_at, ended_at, extra_json, created_at)
         VALUES (?, ?, NULL, ?, NULL, NULL, ?)`
      ).run(iosDevice.deviceId, app, now, now);
      activityId = Number(result.lastInsertRowid);
    }

    // 4) Upsert device_states. On "close" app_id becomes null = idle/home screen.
    // We preserve any existing extra_json (battery/focus/location from the
    // hourly snapshot) by reading then re-writing it.
    const existing = database
      .prepare(`SELECT extra_json FROM device_states WHERE device_id = ?`)
      .get(iosDevice.deviceId) as { extra_json?: string } | undefined;
    const nextAppId = action === "open" ? app : null;
    database.prepare(
      `INSERT INTO device_states
         (device_id, device_name, platform, app_id, window_title, last_seen_at, extra_json, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         device_name  = excluded.device_name,
         platform     = excluded.platform,
         app_id       = excluded.app_id,
         window_title = excluded.window_title,
         last_seen_at = excluded.last_seen_at,
         extra_json   = excluded.extra_json,
         updated_at   = excluded.updated_at`
    ).run(
      iosDevice.deviceId,
      iosDevice.deviceName,
      iosDevice.platform,
      nextAppId,
      now,
      existing?.extra_json ?? null,
      now
    );

    request.log.info({ ...iosDevice, app, action, activityId }, "ios app-event");
    return { ok: true, ...iosDevice, app, action, activityId, receivedAt: now };
  });

  // ── iOS hourly snapshot from a Time-of-Day automation ─────────────────────
  // Body shape (matches the Shortcut as-configured):
  //   {
  //     batteryLevel?: number,         // 0-100
  //     isCharging?:  boolean,
  //     isUnlocked?:  boolean,
  //     focusMode?:   string,          // e.g. "勿扰模式"
  //     location?:    [lat, lon, altitudeM]
  //   }
  // Writes:
  //   - device_states.extra_json: battery / focus / charging / unlocked
  //     (preserves app_id maintained by /app-event)
  //   - device_location_points:   one row when location present
  server.post("/api/devices/ios/snapshot", async (request, reply) => {
    if (!checkIosAuth(request, reply)) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();

    const extra: Record<string, unknown> = {};
    if (typeof body.batteryLevel === "number") extra.battery_percent = body.batteryLevel;
    if (typeof body.isCharging === "boolean")  extra.battery_charging = body.isCharging;
    if (typeof body.isUnlocked === "boolean")  extra.is_unlocked = body.isUnlocked;
    if (typeof body.focusMode === "string" && body.focusMode.trim().length > 0) {
      extra.focus_mode = body.focusMode.trim();
    }

    // Merge into existing extra_json so /app-event's separate writes coexist.
    const existing = database
      .prepare(`SELECT app_id, window_title, extra_json FROM device_states WHERE device_id = ?`)
      .get(iosDevice.deviceId) as
      | { app_id?: string | null; window_title?: string | null; extra_json?: string | null }
      | undefined;
    const mergedExtra = {
      ...(existing?.extra_json ? (JSON.parse(existing.extra_json) as Record<string, unknown>) : {}),
      ...extra
    };

    database.prepare(
      `INSERT INTO device_states
         (device_id, device_name, platform, app_id, window_title, last_seen_at, extra_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         device_name  = excluded.device_name,
         platform     = excluded.platform,
         last_seen_at = excluded.last_seen_at,
         extra_json   = excluded.extra_json,
         updated_at   = excluded.updated_at`
    ).run(
      iosDevice.deviceId,
      iosDevice.deviceName,
      iosDevice.platform,
      existing?.app_id ?? null,
      existing?.window_title ?? null,
      now,
      JSON.stringify(mergedExtra),
      now
    );

    let locationInserted = false;
    const loc = body.location;
    if (Array.isArray(loc) && loc.length >= 2 && typeof loc[0] === "number" && typeof loc[1] === "number") {
      const [lat, lon, altitude] = loc;
      database.prepare(
        `INSERT INTO device_location_points
           (device_id, lat, lon, accuracy_m, altitude_m, speed_mps, bearing_deg, activity, recorded_at, created_at)
         VALUES (?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?)`
      ).run(
        iosDevice.deviceId,
        lat,
        lon,
        typeof altitude === "number" ? altitude : null,
        now,
        now
      );
      locationInserted = true;
    }

    request.log.info({ ...iosDevice, extra, locationInserted }, "ios snapshot");
    return { ok: true, ...iosDevice, extra: mergedExtra, locationInserted, receivedAt: now };
  });

  // ── iOS Shortcuts probe (long-lived debug endpoint) ───────────────────────
  // Accepts ANY JSON, dumps to Obsidian_Asashiki/归档/iOS探针/<timestamp>.json.
  // Useful when adding new Shortcut actions and you want to inspect the raw
  // body before writing a real endpoint. Files older than 14 days are pruned.
  server.post("/api/devices/ios/probe", async (request, reply) => {
    if (!checkIosAuth(request, reply)) return;

    const receivedAt = new Date().toISOString();
    const fileSafeStamp = receivedAt.replace(/[:.]/g, "-");
    nodeFs.mkdirSync(iosProbeDir, { recursive: true });
    const filePath = nodePath.join(iosProbeDir, `${fileSafeStamp}.json`);

    const payload = {
      receivedAt,
      remoteAddr: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      contentType: request.headers["content-type"] ?? null,
      body: request.body ?? null
    };
    const serialized = JSON.stringify(payload, null, 2);
    nodeFs.writeFileSync(filePath, serialized, "utf8");

    pruneOldProbes();

    const byteSize = Buffer.byteLength(serialized, "utf8");
    request.log.info({ filePath, byteSize }, "ios probe captured");

    return { ok: true, receivedAt, byteSize, savedTo: filePath };
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

  // X (Twitter) search — proxied to Hermes on LA VPS (POST /x-search Bearer auth).
  // Backend is slow (Hermes serializes calls, ~tens of seconds per query). Treat
  // this route as best-effort: it just forwards.
  server.post("/api/x-search", async (request, reply) => {
    if (!xSearch) { reply.code(503); return { message: "x-search not configured." }; }
    let input;
    try {
      input = xSearchInputSchema.parse(request.body);
    } catch (e) {
      reply.code(400);
      return { message: e instanceof Error ? e.message : "Invalid x-search input." };
    }
    try {
      return await xSearch.search(input);
    } catch (e) {
      reply.code(502);
      return { message: e instanceof Error ? e.message : "x-search error." };
    }
  });

  // ── Voice messages (AI → device push) ───────────────────────────────────
  // Static-serve generated MP3s. UUID filenames are unguessable.
  server.get("/voice/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (!/^[a-f0-9-]+\.mp3$/i.test(filename)) { reply.code(400); return { error: "bad filename" }; }
    const fullPath = nodePath.join(voiceDir, filename);
    if (!nodeFs.existsSync(fullPath)) { reply.code(404); return { error: "not found" }; }
    reply.header("Content-Type", "audio/mpeg");
    reply.header("Cache-Control", "public, max-age=86400");
    return nodeFs.createReadStream(fullPath);
  });

  // Enqueue a voice message: synthesize via MiniMax, persist file, insert row.
  // Auth: admin token (called by MCP gateway internally OR directly by ops).
  server.post("/api/voice-messages", async (request, reply) => {
    const password = getBasicPassword(request.headers.authorization);
    const bearer = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    const authed = (env.ADMIN_PANEL_TOKEN && password === env.ADMIN_PANEL_TOKEN) ||
                   (env.ADMIN_PANEL_TOKEN && bearer === env.ADMIN_PANEL_TOKEN);
    if (!authed) { reply.code(401); return { error: "Unauthorized" }; }
    if (!minimaxConfig) { reply.code(503); return { error: "MiniMax not configured" }; }

    try {
      const input = (await import("@asashiki/schemas")).voiceMessageInputSchema.parse(request.body ?? {});
      const audio = await synthesizeVoice(minimaxConfig, input.text);
      const filename = `${randomUUID()}.mp3`;
      nodeFs.writeFileSync(nodePath.join(voiceDir, filename), audio);
      const row = repository.insertVoiceMessage({
        deviceId: input.deviceId,
        senderName: input.senderName,
        senderAvatarUrl: input.senderAvatarUrl,
        text: input.text,
        audioFilename: filename,
        durationMs: undefined
      });
      return { ok: true, id: row.id, audioBytes: audio.length, createdAt: row.createdAt };
    } catch (e) {
      reply.code(500);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Voice bubble: synthesize Anna voice and return a public audio URL for an
  // in-chat playable bubble (claude.ai / ChatGPT via MCP Apps). Same MiniMax
  // path as the device push, but the file is served publicly instead of queued.
  server.post("/api/voice-bubble", async (request, reply) => {
    const password = getBasicPassword(request.headers.authorization);
    const bearer = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    const authed = (env.ADMIN_PANEL_TOKEN && password === env.ADMIN_PANEL_TOKEN) ||
                   (env.ADMIN_PANEL_TOKEN && bearer === env.ADMIN_PANEL_TOKEN);
    if (!authed) { reply.code(401); return { error: "Unauthorized" }; }
    if (!minimaxConfig) { reply.code(503); return { error: "MiniMax not configured" }; }

    let input;
    try {
      input = (await import("@asashiki/schemas")).voiceBubbleInputSchema.parse(request.body ?? {});
    } catch (e) {
      reply.code(400);
      return { error: e instanceof Error ? e.message : "Invalid voice-bubble input." };
    }

    try {
      const audio = await synthesizeVoice(minimaxConfig, input.text);
      const filename = `${randomUUID()}.mp3`;
      nodeFs.writeFileSync(nodePath.join(voiceDir, filename), audio);

      const publicBase = (process.env.PUBLIC_BASE_URL ?? "").trim().replace(/\/$/, "");
      const base = publicBase
        ? `${publicBase}/voice`
        : `${(request.headers["x-forwarded-proto"] as string) ?? "https"}://${(request.headers["x-forwarded-host"] as string) ?? request.headers.host ?? ""}/voice`;

      return {
        audioUrl: `${base}/${filename}`,
        mimeType: "audio/mpeg",
        text: input.text,
        senderName: input.senderName ?? "Anna",
        durationMs: null,
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      reply.code(500);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Device polls this to fetch unplayed voice messages addressed to it.
  server.get("/api/devices/voice-messages/pending", async (request, reply) => {
    const identity = deviceAuth.resolve(request.headers.authorization);
    if (!identity) { reply.code(401); return { error: "Invalid device token." }; }

    // Build the audio URL the phone will fetch. Priority:
    //  1. PUBLIC_BASE_URL env (most reliable — set this when behind a reverse proxy)
    //  2. X-Forwarded-Proto + X-Forwarded-Host (works if reverse proxy sets them)
    //  3. request.headers.host (only useful for direct / localhost calls)
    const publicBase = (process.env.PUBLIC_BASE_URL ?? "").trim().replace(/\/$/, "");
    let audioBaseUrl: string;
    if (publicBase) {
      audioBaseUrl = `${publicBase}/voice`;
    } else {
      const proto = (request.headers["x-forwarded-proto"] as string) ?? "https";
      const host = (request.headers["x-forwarded-host"] as string) ?? request.headers.host ?? "";
      audioBaseUrl = `${proto}://${host}/voice`;
    }

    const messages = repository.getPendingVoiceMessages(identity.deviceId, audioBaseUrl);
    return { fetchedAt: new Date().toISOString(), messages };
  });

  // Device acks: mark delivered (downloaded but not yet played)
  server.post("/api/devices/voice-messages/:id/delivered", async (request, reply) => {
    const identity = deviceAuth.resolve(request.headers.authorization);
    if (!identity) { reply.code(401); return { error: "Invalid device token." }; }
    const id = Number((request.params as { id: string }).id);
    if (!Number.isFinite(id)) { reply.code(400); return { error: "bad id" }; }
    repository.markVoiceMessageDelivered(id);
    return { ok: true };
  });

  // Device acks: mark played
  server.post("/api/devices/voice-messages/:id/played", async (request, reply) => {
    const identity = deviceAuth.resolve(request.headers.authorization);
    if (!identity) { reply.code(401); return { error: "Invalid device token." }; }
    const id = Number((request.params as { id: string }).id);
    if (!Number.isFinite(id)) { reply.code(400); return { error: "bad id" }; }
    repository.markVoiceMessagePlayed(id);
    return { ok: true };
  });

  server.get("/api/audit/recent", async () => repository.listRecentAudit());
  server.get("/public/cards", async () => repository.getPublicCards());
  server.get("/public/status", async () => repository.getPublicStatus());
  server.get("/public/widget-config", async () => repository.getPublicWidgetConfig());

  // ── Admin: re-run migrations (covers legacy DROP TABLEs / new indexes) ──
  server.post("/api/admin/run-migrations", async (request, reply) => {
    const password = getBasicPassword(request.headers.authorization);
    if (env.ADMIN_PANEL_TOKEN && password !== env.ADMIN_PANEL_TOKEN) {
      reply.code(401); return { error: "Unauthorized" };
    }
    try {
      migrateDatabase(database);
      const tables = database
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as { name: string }[];
      return {
        ok: true,
        tables: tables.map((t) => t.name),
        ranAt: new Date().toISOString()
      };
    } catch (e) {
      reply.code(500);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

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
      const backupDir = path.join(archiveRoot, "Obsidian_Asashiki", "归档", "数据库备份");
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

      // appName imported from app-labels.ts

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
      const lastLoc = dayLocationPoints[0];
      const locLine = lastLoc
        ? `- 记录 ${dayLocationPoints.length} 个位置点\n- 最后位置：${lastLoc.lat.toFixed(4)}°N ${lastLoc.lon.toFixed(4)}°E（精度 ${(lastLoc.accuracyM ?? 0).toFixed(0)}m）`
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
      const digestDir = path.join(archiveRoot, "Obsidian_Asashiki", "归档", "数据日志");
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
