import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuthStore } from "../auth/store.js";
import type { CoreApiClient } from "../core-api-client.js";
import { parseBearer } from "../auth/tokens.js";

// Decoupled JSON API for the console frontend (built separately, e.g. by Cowork).
// Auth: POST /api/console/login → { token }; send it as `Authorization: Bearer`.
// CORS: configurable origin allowlist so a locally-served SPA can call production.
// The server-rendered /console/* pages stay as a fallback; this is the API a
// standalone frontend consumes.

export interface ConsoleApiConfig {
  /** Allowed browser origins for the console SPA (CORS). */
  corsOrigins: string[];
  sessionTtlSeconds: number;
  /** Re-discover remote-MCP tools (called after add/remove). */
  rediscoverRemote?: () => Promise<{ seeded: number }>;
}

export function registerConsoleApi(
  server: FastifyInstance,
  store: AuthStore,
  client: CoreApiClient,
  config: ConsoleApiConfig
) {
  if (!server.hasContentTypeParser("application/json")) {
    // default json parser exists; no-op guard
  }
  const allow = new Set(config.corsOrigins);

  // ── CORS (manual, scoped to /api/console/*) ──
  server.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/console")) return;
    const origin = request.headers.origin;
    if (origin && allow.has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
      reply.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Authorization,Content-Type");
      reply.header("Access-Control-Max-Age", "600");
    }
    if (request.method === "OPTIONS") {
      reply.code(204).send();
    }
  });

  const auth = (request: FastifyRequest, reply: FastifyReply): string | null => {
    const token = parseBearer(request.headers.authorization);
    const user = token ? store.validateConsoleSession(token) : null;
    if (!user) { reply.code(401).send({ error: "unauthorized" }); return null; }
    return user;
  };

  // ── auth ──
  server.post("/api/console/login", async (request, reply) => {
    const b = (request.body ?? {}) as { username?: string; password?: string };
    if (!b.username || !b.password || !store.verifyConsoleAdmin(b.username, b.password)) {
      reply.code(401); return { error: "invalid credentials" };
    }
    const token = store.createConsoleSession(b.username, config.sessionTtlSeconds);
    store.audit({ action: "console_api_login", success: true, detail: b.username });
    return { token, username: b.username, expiresInSeconds: config.sessionTtlSeconds };
  });

  server.get("/api/console/me", async (request, reply) => {
    const user = auth(request, reply); if (!user) return reply;
    return { username: user };
  });

  server.post("/api/console/logout", async (request, reply) => {
    const token = parseBearer(request.headers.authorization);
    if (token) store.deleteConsoleSession(token);
    return { ok: true };
  });

  // ── skills ──
  server.get("/api/console/skills", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    return { skills: store.listSkills() };
  });

  server.post("/api/console/skills/:id/enabled", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as { enabled?: unknown };
    if (typeof b.enabled !== "boolean") { reply.code(400); return { error: "enabled (boolean) required" }; }
    const ok = store.setSkillEnabled(id, b.enabled);
    if (!ok) { reply.code(404); return { error: `unknown skill: ${id}` }; }
    store.audit({ action: "skill_toggle", success: true, detail: `${id}=${b.enabled}` });
    return { skillId: id, enabled: b.enabled };
  });

  server.post("/api/console/skills/:id/allow-write", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as { allow?: unknown };
    if (typeof b.allow !== "boolean") { reply.code(400); return { error: "allow (boolean) required" }; }
    const ok = store.setSkillAllowWrite(id, b.allow);
    if (!ok) { reply.code(404); return { error: `unknown skill: ${id}` }; }
    store.audit({ action: "skill_allow_write", success: true, detail: `${id}=${b.allow}` });
    return { skillId: id, allowWrite: b.allow };
  });

  // ── agents ──
  server.get("/api/console/agents", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    return { agents: store.listAgents() };
  });

  server.post("/api/console/agents", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const b = (request.body ?? {}) as { agentId?: string; displayName?: string };
    const id = (b.agentId ?? "").trim();
    if (!id) { reply.code(400); return { error: "agentId required" }; }
    const res = store.upsertAgent(id, (b.displayName ?? "").trim() || id);
    store.audit({ agentId: id, action: "agent_create", success: true });
    // secret is null when the agent already existed (use /regen to rotate)
    return { agentId: id, secret: res.secret };
  });

  server.post("/api/console/agents/:id/regen", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const { id } = request.params as { id: string };
    const secret = store.regenerateSecret(id);
    if (!secret) { reply.code(404); return { error: `unknown agent: ${id}` }; }
    store.audit({ agentId: id, action: "agent_regen", success: true });
    return { agentId: id, secret };
  });

  server.post("/api/console/agents/:id/enabled", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as { enabled?: unknown };
    if (typeof b.enabled !== "boolean") { reply.code(400); return { error: "enabled (boolean) required" }; }
    const ok = store.setAgentEnabled(id, b.enabled);
    if (!ok) { reply.code(404); return { error: `unknown agent: ${id}` }; }
    store.audit({ agentId: id, action: "agent_toggle", success: true, detail: String(b.enabled) });
    return { agentId: id, enabled: b.enabled };
  });

  // Per-agent tool visibility (allowlist). Empty list → inherit (all enabled).
  server.get("/api/console/agents/:id/visibility", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const { id } = request.params as { id: string };
    if (!store.getAgent(id)) { reply.code(404); return { error: `unknown agent: ${id}` }; }
    const allowlist = [...store.getAgentAllowlist(id)];
    return {
      agentId: id,
      restricted: store.agentHasAllowlist(id),
      allowlist,
      enabledSkills: store.listSkills().filter((s) => s.enabled).map((s) => s.skillId)
    };
  });

  server.post("/api/console/agents/:id/visibility", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const { id } = request.params as { id: string };
    if (!store.getAgent(id)) { reply.code(404); return { error: `unknown agent: ${id}` }; }
    const b = (request.body ?? {}) as { skillIds?: unknown };
    const skillIds = Array.isArray(b.skillIds) ? b.skillIds.filter((x): x is string => typeof x === "string") : [];
    store.setAgentAllowlist(id, skillIds);
    store.audit({ agentId: id, action: "agent_visibility", success: true, detail: `${skillIds.length} skills` });
    return { agentId: id, restricted: skillIds.length > 0, allowlist: skillIds };
  });

  // ── audit ──
  server.get("/api/console/audit", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const q = (request.query ?? {}) as { limit?: string };
    const limit = q.limit ? Number(q.limit) : 150;
    return { entries: store.recentAudit(Number.isFinite(limit) ? limit : 150) };
  });

  // ── remote MCP servers ──
  server.get("/api/console/remote", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    try {
      return { servers: await client.listRemoteMcpServers() };
    } catch (e) {
      reply.code(502); return { error: e instanceof Error ? e.message : "failed to list remote servers" };
    }
  });

  server.post("/api/console/remote", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const b = (request.body ?? {}) as Record<string, unknown>;
    try {
      await client.addRemoteServer({
        id: String(b.id ?? "").trim(),
        name: String(b.name ?? "").trim(),
        url: String(b.url ?? "").trim(),
        description: String(b.description ?? "").trim() || String(b.name ?? "").trim(),
        bearerToken: b.bearerToken ? String(b.bearerToken) : undefined,
        enabled: true
      });
      const r = config.rediscoverRemote ? await config.rediscoverRemote() : { seeded: 0 };
      store.audit({ action: "remote_server_add", success: true, detail: String(b.id ?? "") });
      return { ok: true, id: b.id, discovered: r.seeded };
    } catch (e) {
      reply.code(400); return { error: e instanceof Error ? e.message : "add failed" };
    }
  });

  server.post("/api/console/remote/rediscover", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const r = config.rediscoverRemote ? await config.rediscoverRemote() : { seeded: 0 };
    store.audit({ action: "remote_rediscover", success: true, detail: `${r.seeded} tools` });
    return { ok: true, seeded: r.seeded };
  });

  server.delete("/api/console/remote/:id", async (request, reply) => {
    if (!auth(request, reply)) return reply;
    const { id } = request.params as { id: string };
    try {
      await client.deleteRemoteServer(id);
      store.pruneRemoteSkillsForServer(id);
      if (config.rediscoverRemote) await config.rediscoverRemote();
      store.audit({ action: "remote_server_delete", success: true, detail: id });
      return { ok: true, deleted: id };
    } catch (e) {
      reply.code(400); return { error: e instanceof Error ? e.message : "delete failed" };
    }
  });
}
