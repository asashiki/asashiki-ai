import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServiceHealth, serviceManifestSchema } from "@asashiki/schemas";
import { parseServiceEnv } from "@asashiki/config";
import { z } from "zod";
import { createCoreApiClient } from "./core-api-client.js";
import {
  createMcpGatewayServer,
  mcpToolCatalog,
  mcpToolIdSchema,
  skillMeta
} from "./mcp.js";
import { runMcpToolSmokeTest } from "./smoke.js";
import { AuthStore } from "./auth/store.js";
import { registerOAuthRoutes } from "./auth/routes.js";
import { parseBearer } from "./auth/tokens.js";
import { registerConsoleRoutes } from "./console/console.js";
import { registerConsoleApi } from "./console/api.js";
import { registerConsoleSpa } from "./console/spa.js";

export const mcpGatewayEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4200),
  MCP_CORE_API_BASE_URL: z.string().url().default("http://127.0.0.1:4100"),
  MCP_CORE_API_ADMIN_TOKEN: z.string().optional(),
  // OAuth (optional — when MCP_PUBLIC_URL is unset, auth routes are not mounted).
  MCP_PUBLIC_URL: z.string().url().optional(),
  MCP_AUTH_DB_PATH: z.string().min(1).default("./data/mcp-auth.sqlite"),
  MCP_OAUTH_SCOPE: z.string().min(1).default("tools:read tools:write x:search"),
  // Console SPA (decoupled frontend) CORS allowlist, comma-separated origins.
  MCP_CONSOLE_CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000")
});

export type McpGatewayEnv = z.infer<typeof mcpGatewayEnvSchema>;

export function loadMcpGatewayEnv(source: NodeJS.ProcessEnv): McpGatewayEnv {
  const normalizedSource: NodeJS.ProcessEnv = {
    ...source,
    HOST: source.MCP_GATEWAY_HOST ?? source.HOST,
    PORT: source.MCP_GATEWAY_PORT ?? source.PORT,
    MCP_CORE_API_BASE_URL:
      source.MCP_CORE_API_BASE_URL ?? "http://127.0.0.1:4100"
  };

  return mcpGatewayEnvSchema.parse(
    parseServiceEnv("mcp-gateway", normalizedSource, {
      PORT: z.coerce.number().int().positive().default(4200),
      MCP_CORE_API_BASE_URL: z.string().url().default("http://127.0.0.1:4100"),
      MCP_CORE_API_ADMIN_TOKEN: z.string().optional(),
      MCP_PUBLIC_URL: z.string().url().optional(),
      MCP_AUTH_DB_PATH: z.string().min(1).default("./data/mcp-auth.sqlite"),
      MCP_OAUTH_SCOPE: z.string().min(1).default("tools:read tools:write x:search"),
      MCP_CONSOLE_CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000")
    })
  );
}

export async function createMcpGatewayApp(options?: {
  env?: McpGatewayEnv;
  logger?: boolean;
  startedAt?: Date;
}) {
  const env = options?.env ?? loadMcpGatewayEnv(process.env);
  const startedAt = options?.startedAt ?? new Date();
  const client = createCoreApiClient(env.MCP_CORE_API_BASE_URL, env.MCP_CORE_API_ADMIN_TOKEN);

  const manifest = serviceManifestSchema.parse({
    id: "mcp-gateway",
    name: "MCP Gateway",
    port: env.PORT,
    exposure: "mcp-exposed",
    description: "Thin tool facade over the Core API"
  });

  const server = Fastify({
    logger: options?.logger ?? true
  });

  server.get("/health", async () =>
    createServiceHealth(manifest, env.NODE_ENV, startedAt)
  );

  server.get("/tools", async () => ({
    upstream: env.MCP_CORE_API_BASE_URL,
    tools: mcpToolCatalog.map((tool) => tool.id)
  }));

  server.get("/tools/catalog", async () => ({
    upstream: env.MCP_CORE_API_BASE_URL,
    tools: mcpToolCatalog
  }));

  server.post("/tools/:toolId/test", async (request) => {
    const params = z.object({ toolId: mcpToolIdSchema }).parse(request.params);
    return runMcpToolSmokeTest(client, params.toolId);
  });

  // Declared before handleMcp so the per-request closure can read the registry.
  let authStore: AuthStore | null = null;

  async function handleMcp(request: FastifyRequest, reply: FastifyReply, agentId?: string) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    // Filter tools/list: globally-enabled skills, narrowed to the agent's
    // allowlist when it has one. No registry (dev/test) → expose everything.
    const enabledSkills = authStore
      ? (agentId ? authStore.getVisibleSkillIdsForAgent(agentId) : authStore.getEnabledSkillIds())
      : undefined;
    // Remote-mcp proxied tools that are enabled + visible for this agent.
    const remoteTools = authStore && enabledSkills ? authStore.getRemoteDescriptors(enabledSkills) : [];
    const store = authStore;
    // UI resources (MCP Apps widgets) for the servers whose tools are exposed,
    // so remote tool UIs render through the gateway.
    const remoteServerIds = new Set(remoteTools.map((t) => t.serverId));
    const remoteResources = store ? store.getRemoteResourcesForServers(remoteServerIds) : [];
    const mcpServer = createMcpGatewayServer(client, {
      enabledSkills,
      remoteTools,
      remoteResources,
      readRemoteResource: (serverId, uri) => client.readRemoteResource(serverId, uri),
      // Console skill groups → tools/list title prefix, so the grouping shows
      // up in claude.ai / ChatGPT / Grok after the client refreshes its tools.
      groupNames: store ? store.getSkillGroupNameMap() : undefined,
      onToolCall: store
        ? (toolName, success, latencyMs) =>
            store.audit({ agentId: agentId ?? null, toolName, action: "tool_call", success, latencyMs })
        : undefined
    });

    reply.raw.on("close", () => {
      transport.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
    return reply;
  }

  // ── OAuth (optional, mounted only when a public URL is configured) ─────────
  if (env.MCP_PUBLIC_URL) {
    authStore = new AuthStore(env.MCP_AUTH_DB_PATH);
    const store = authStore;

    // Seed the skill registry from the tool catalog (idempotent; never resets
    // an existing row's `enabled`, so console toggles survive restarts).
    for (const t of mcpToolCatalog) {
      const meta = skillMeta[t.id as keyof typeof skillMeta];
      store.seedSkill({
        skillId: t.id,
        title: t.title,
        category: "local",
        source: "local",
        enabled: meta?.initialEnabled ?? true,
        description: t.description
      });
    }
    // Drop local skills that no longer exist in the catalog (self-heal).
    store.reconcileLocalSkills(new Set(mcpToolCatalog.map((t) => t.id)));

    // Discover remote-MCP tools and seed them ENABLED (added a server = you want
    // its tools usable; writes are still gated by allow_write per tool). seedSkill
    // never resets enabled on existing rows, so a console toggle-off survives
    // re-discovery. Non-fatal: a down/misconfigured remote server won't block startup.
    const discoverRemoteSkills = async (): Promise<{ seeded: number }> => {
      let seeded = 0;
      try {
        const servers = await client.listRemoteMcpServers();
        for (const s of servers) {
          for (const tool of s.tools ?? []) {
            store.seedSkill({
              skillId: `rmcp__${s.id}__${tool.name}`,
              title: `${s.name}: ${tool.title ?? tool.name}`,
              category: "remote",
              source: "remote-mcp",
              enabled: true,
              description: tool.description ?? null,
              remoteMeta: { serverId: s.id, serverName: s.name, toolName: tool.name, inputSchema: tool.inputSchema ?? {}, readOnly: tool.readOnlyHint, toolMeta: tool.meta ?? null }
            });
            seeded += 1;
          }
          // Store the server's UI resources (MCP Apps widgets) for passthrough.
          store.setRemoteResourcesForServer(s.id, s.resources ?? []);
        }
      } catch (e) {
        server.log.warn(`remote-mcp discovery skipped: ${e instanceof Error ? e.message : e}`);
      }
      return { seeded };
    };
    await discoverRemoteSkills();

    registerOAuthRoutes(server, store, {
      issuer: env.MCP_PUBLIC_URL,
      defaultScope: env.MCP_OAUTH_SCOPE,
      accessTtlSeconds: 3600,
      refreshTtlSeconds: 30 * 24 * 3600,
      codeTtlSeconds: 300,
      pendingTtlSeconds: 600
    });

    const wwwAuth = `Bearer resource_metadata="${env.MCP_PUBLIC_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource"`;

    // Canonical MCP entrypoint — Bearer required when OAuth is enabled.
    // /mcp-oauth is kept as an alias so existing clients that connected during
    // the rollout window (when /mcp-oauth was the protected route) don't break.
    const protectedMcp = async (request: FastifyRequest, reply: FastifyReply) => {
      const token = parseBearer(request.headers.authorization);
      const ctx = token ? store.validateAccessToken(token) : null;
      if (!ctx) {
        reply.header("WWW-Authenticate", wwwAuth);
        reply.code(401);
        store.audit({ action: "mcp_unauthorized", success: false });
        return { error: "unauthorized" };
      }
      store.audit({ agentId: ctx.agentId, clientId: ctx.clientId, action: "mcp_request", success: true });
      return handleMcp(request, reply, ctx.agentId);
    };
    server.post("/mcp", protectedMcp);
    server.post("/mcp-oauth", protectedMcp);

    // ── Admin: skill registry management (for the console) ──────────────────
    // Server-rendered admin console (login → session cookie). This is the only
    // admin surface — skill toggles etc. go through session-protected /console/*
    // routes. (The old admin-token /admin/skills API was removed: redundant.)
    registerConsoleRoutes(server, store, client, {
      secureCookie: env.NODE_ENV === "production",
      rediscoverRemote: discoverRemoteSkills
    });

    // Decoupled JSON API for a standalone console frontend (e.g. Cowork-built).
    registerConsoleApi(server, store, client, {
      corsOrigins: env.MCP_CONSOLE_CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
      sessionTtlSeconds: 7 * 24 * 3600,
      rediscoverRemote: discoverRemoteSkills,
      startedAt,
      publicUrl: env.MCP_PUBLIC_URL
    });

    // Standalone console SPA at /console (built separately; see console-web).
    // Missing dist dir → routes simply not mounted (dev environments).
    const spaDir = process.env.MCP_CONSOLE_WEB_DIR ?? "console-web-dist";
    if (registerConsoleSpa(server, spaDir)) {
      server.log.info(`console SPA mounted at /console from ${spaDir}`);
    }

    server.addHook("onClose", async () => {
      store.close();
    });
  } else {
    // OAuth disabled (dev / local) — keep anonymous /mcp.
    server.post("/mcp", async (request, reply) => handleMcp(request, reply));
  }

  return {
    env,
    server,
    authStore
  };
}
