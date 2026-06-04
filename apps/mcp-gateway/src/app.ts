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
  runMcpToolSmokeTest,
  skillMeta
} from "./mcp.js";
import { AuthStore } from "./auth/store.js";
import { registerOAuthRoutes } from "./auth/routes.js";
import { parseBearer } from "./auth/tokens.js";
import { registerConsoleRoutes } from "./console/console.js";

export const mcpGatewayEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4200),
  MCP_CORE_API_BASE_URL: z.string().url().default("http://127.0.0.1:4100"),
  MCP_CORE_API_ADMIN_TOKEN: z.string().optional(),
  // OAuth (optional — when MCP_PUBLIC_URL is unset, auth routes are not mounted).
  MCP_PUBLIC_URL: z.string().url().optional(),
  MCP_AUTH_DB_PATH: z.string().min(1).default("./data/mcp-auth.sqlite"),
  MCP_OAUTH_SCOPE: z.string().min(1).default("tools:read tools:write x:search")
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
      MCP_OAUTH_SCOPE: z.string().min(1).default("tools:read tools:write x:search")
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
    const mcpServer = createMcpGatewayServer(client, { enabledSkills, remoteTools });

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
        category: meta?.category ?? "meta",
        source: "local",
        enabled: meta?.initialEnabled ?? true,
        description: t.description
      });
    }

    // Discover remote-MCP tools and seed them DISABLED (opt-in). Reusable so the
    // console can re-run it after add/remove. Non-fatal: a down/misconfigured
    // remote server must not block startup.
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
              enabled: false,
              description: tool.description ?? null,
              remoteMeta: { serverId: s.id, toolName: tool.name, inputSchema: tool.inputSchema ?? {}, readOnly: tool.readOnlyHint }
            });
            seeded += 1;
          }
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
    // Slice 1 auth: gateway admin token. Slice 2 will move this behind an
    // OAuth-based admin session (see viking project doc console-plan.md).
    const adminToken = env.MCP_CORE_API_ADMIN_TOKEN;
    const requireAdmin = (request: FastifyRequest, reply: FastifyReply): boolean => {
      const bearer = parseBearer(request.headers.authorization);
      if (!adminToken || bearer !== adminToken) {
        reply.code(401);
        return false;
      }
      return true;
    };

    // Server-rendered admin console (login → session cookie).
    registerConsoleRoutes(server, store, client, {
      secureCookie: env.NODE_ENV === "production",
      rediscoverRemote: discoverRemoteSkills
    });

    server.get("/admin/skills", async (request, reply) => {
      if (!requireAdmin(request, reply)) return { error: "unauthorized" };
      return { skills: store.listSkills() };
    });

    server.post("/admin/skills/:id", async (request, reply) => {
      if (!requireAdmin(request, reply)) return { error: "unauthorized" };
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { enabled?: unknown };
      if (typeof body.enabled !== "boolean") {
        reply.code(400);
        return { error: "body.enabled (boolean) required" };
      }
      const ok = store.setSkillEnabled(id, body.enabled);
      if (!ok) { reply.code(404); return { error: `unknown skill: ${id}` }; }
      store.audit({ action: "skill_toggle", success: true, detail: `${id}=${body.enabled}` });
      return { skillId: id, enabled: body.enabled };
    });

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
