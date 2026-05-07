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
        reply
          .code(401)
          .header("WWW-Authenticate", 'Basic realm="Asashiki Console"');
        return "Authentication required.";
      }
    }

    const [profile, connectorSummary, archiveStatus, remoteServers, deviceCurrent, recentHealth] =
      await Promise.all([
        Promise.resolve(repository.getProfileSummary()),
        Promise.resolve(repository.getConnectorSummary()),
        Promise.resolve(archive.getStatus()),
        remoteMcpRegistry.listServers(),
        Promise.resolve(repository.getDeviceCurrent()),
        Promise.resolve(repository.getHealthRecords({ limit: 10 }))
      ]);
    const svcHealth = createServiceHealth(manifest, env.NODE_ENV, startedAt);
    const today = new Date().toISOString().slice(0, 10);
    const activitySummary = repository.getDeviceActivitySummary(today);

    function deviceRows() {
      if (deviceCurrent.devices.length === 0) {
        return `<tr><td colspan="2" class="muted">暂无设备上报记录。</td></tr>`;
      }
      return deviceCurrent.devices.map((d) => {
        const statusClass = d.isOnline ? "ok" : "muted";
        const extra = d.extra ? ` · ${escapeHtml(JSON.stringify(d.extra))}` : "";
        return `<tr><th>${escapeHtml(d.deviceName)} <span class="muted">(${escapeHtml(d.platform)})</span></th><td class="${statusClass}">${d.isOnline ? "online" : "offline"} · ${escapeHtml(d.appId ?? "—")}${escapeHtml(d.windowTitle ? ` / ${d.windowTitle}` : "")}${extra} <span class="muted">${escapeHtml(d.lastSeenAt)}</span></td></tr>`;
      }).join("\n        ");
    }

    function activityRows() {
      if (activitySummary.perApp.length === 0) {
        return `<tr><td colspan="2" class="muted">今日暂无活动记录。</td></tr>`;
      }
      return activitySummary.perApp.slice(0, 10).map((a) => {
        const mins = Math.round(a.totalSeconds / 60);
        return `<tr><th>${escapeHtml(a.appId)}</th><td>${escapeHtml(String(mins))} 分钟 · ${escapeHtml(String(a.count))} 次</td></tr>`;
      }).join("\n        ");
    }

    function healthRows() {
      if (recentHealth.records.length === 0) {
        return `<tr><td colspan="2" class="muted">暂无健康数据上报记录。</td></tr>`;
      }
      return recentHealth.records.map((r) => {
        const val = r.valueJson
          ? escapeHtml(JSON.stringify(r.valueJson))
          : `${escapeHtml(String(r.value ?? "—"))}${r.unit ? " " + escapeHtml(r.unit) : ""}`;
        return `<tr><th>${escapeHtml(r.type)}</th><td>${val} <span class="muted">${escapeHtml(r.recordedAt)} · ${escapeHtml(r.deviceId)}</span></td></tr>`;
      }).join("\n        ");
    }

    const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Asashiki MCP Console</title>
    <style>
      body { margin: 0; font: 15px/1.7 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #222; background: #f7f7f4; }
      main { max-width: 920px; margin: 0 auto; padding: 32px 20px 56px; }
      h1 { font-size: 24px; margin: 0 0 4px; }
      h2 { font-size: 16px; margin: 28px 0 8px; }
      p { margin: 0 0 10px; color: #555; }
      code { background: #ecebe6; padding: 2px 5px; border-radius: 4px; }
      table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e3e0d8; }
      th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eeeae2; vertical-align: top; }
      th { width: 220px; color: #5b5b51; font-weight: 600; background: #fbfaf7; }
      .ok { color: #23724d; }
      .warn { color: #9a6a14; }
      .bad { color: #a13a31; }
      .muted { color: #777; }
    </style>
  </head>
  <body>
    <main>
      <h1>Asashiki MCP Console</h1>
      <p>VPS 上的最小文字状态页。正式操作仍以 MCP、Core API 和 Archive 文件夹为主。</p>

      <h2>服务</h2>
      <table>
        <tr><th>Core API</th><td class="ok">online · uptime ${escapeHtml(svcHealth.uptimeSeconds)}s</td></tr>
        <tr><th>数据库</th><td><code>${escapeHtml(databasePath)}</code></td></tr>
        <tr><th>环境</th><td>${escapeHtml(env.NODE_ENV)}</td></tr>
      </table>

      <h2>档案</h2>
      <table>
        <tr><th>名称</th><td>${escapeHtml(profile.displayName)}</td></tr>
        <tr><th>摘要</th><td>${escapeHtml(profile.summary)}</td></tr>
      </table>

      <h2>连接</h2>
      <table>
        <tr><th>连接器</th><td>${escapeHtml(connectorSummary.online)}/${escapeHtml(connectorSummary.total)} online</td></tr>
        <tr><th>上游 MCP</th><td>${escapeHtml(remoteServers.length)} registered</td></tr>
        <tr><th>Archive</th><td class="${archiveStatus.status === "online" ? "ok" : archiveStatus.status === "degraded" ? "warn" : "bad"}">${escapeHtml(archiveStatus.status)} · ${escapeHtml(archiveStatus.fileCount)} diary files</td></tr>
        <tr><th>Archive root</th><td><code>${escapeHtml(archiveStatus.rootPath)}</code></td></tr>
        <tr><th>Diary path</th><td><code>${escapeHtml(archiveStatus.diaryPath ?? "not found")}</code></td></tr>
      </table>

      <h2>设备 (${escapeHtml(deviceCurrent.devices.length)} 台)</h2>
      <table>
        ${deviceRows()}
      </table>

      <h2>今日应用活动 (${escapeHtml(today)})</h2>
      <table>
        ${activityRows()}
      </table>

      <h2>最近健康数据 (最新 10 条)</h2>
      <table>
        ${healthRows()}
      </table>

      <h2>常用检查</h2>
      <table>
        <tr><th>健康检查</th><td><code>/health</code></td></tr>
        <tr><th>MCP 入口</th><td><code>https://mcp.asashiki.com/mcp</code></td></tr>
        <tr><th>日记列表 API</th><td><code>/api/archive/diary</code></td></tr>
        <tr><th>设备状态 API</th><td><code>/api/devices/current</code></td></tr>
        <tr><th>健康记录 API</th><td><code>/api/devices/health</code></td></tr>
      </table>

      <p class="muted">更新时间：${escapeHtml(new Date().toISOString())}</p>
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
    const input = deviceTimelineInputSchema.parse(request.query);
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    return repository.getDeviceTimeline(date);
  });

  // Health records detailed query (expose existing repository method)
  server.get("/api/devices/health-records", async (request) => {
    const input = healthRecordsQueryInputSchema.parse(request.query);
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

  server.get("/api/audit/recent", async () => repository.listRecentAudit());
  server.get("/public/cards", async () => repository.getPublicCards());
  server.get("/public/status", async () => repository.getPublicStatus());
  server.get("/public/widget-config", async () => repository.getPublicWidgetConfig());

  return {
    env,
    databasePath,
    repository,
    server
  };
}
