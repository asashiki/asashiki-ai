import Fastify from "fastify";
import cors from "@fastify/cors";
import { getOptionalEnvValue, parseServiceEnv } from "@asashiki/config";
import {
  archiveDiaryReadInputSchema,
  archiveStatusSchema,
  connectorSchema,
  connectorSummarySchema,
  createServiceHealth,
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
  SUPABASE_TIME_LOG_NAME: z.string().min(1).default("Supabase 时间日志")
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
      "Supabase 时间日志"
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
      SUPABASE_TIME_LOG_NAME: z.string().min(1).default("Supabase 时间日志")
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

    const [profile, connectorSummary, archiveStatus, remoteServers] =
      await Promise.all([
        Promise.resolve(repository.getProfileSummary()),
        Promise.resolve(repository.getConnectorSummary()),
        Promise.resolve(archive.getStatus()),
        remoteMcpRegistry.listServers()
      ]);
    const health = createServiceHealth(manifest, env.NODE_ENV, startedAt);
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
        <tr><th>Core API</th><td class="ok">online · uptime ${escapeHtml(health.uptimeSeconds)}s</td></tr>
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

      <h2>常用检查</h2>
      <table>
        <tr><th>健康检查</th><td><code>/health</code></td></tr>
        <tr><th>MCP 入口</th><td><code>https://mcp.asashiki.com/mcp</code></td></tr>
        <tr><th>日记列表 API</th><td><code>/api/archive/diary</code></td></tr>
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
