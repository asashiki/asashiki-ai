import type { FastifyInstance } from "fastify";
import { AuthStore } from "./store.js";
import { verifyPkceS256 } from "./tokens.js";

export interface OAuthConfig {
  /** Public origin, e.g. https://mcp.asashiki.com (no trailing slash). */
  issuer: string;
  /** Default scope granted at authorization time. */
  defaultScope: string;
  accessTtlSeconds: number;   // e.g. 3600
  refreshTtlSeconds: number;  // e.g. 30d
  codeTtlSeconds: number;     // e.g. 300
  pendingTtlSeconds: number;  // e.g. 600
}

function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
  );
}

function consentPage(opts: {
  pendingId: string;
  clientName: string;
  redirectHost: string;
  scope: string;
  agents: { agentId: string; displayName: string }[];
  error?: string;
}): string {
  const agentOptions = opts.agents
    .map((a) => `<option value="${htmlEscape(a.agentId)}">${htmlEscape(a.displayName)} (${htmlEscape(a.agentId)})</option>`)
    .join("");
  const scopes = opts.scope.split(/\s+/).filter(Boolean)
    .map((s) => `<code>${htmlEscape(s)}</code>`).join(" ");
  const errBlock = opts.error
    ? `<div class="err">${htmlEscape(opts.error)}</div>`
    : "";
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Asashiki MCP 授权</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "PingFang SC", sans-serif; margin: 0; padding: 2rem 1rem;
         background: #f6f7f9; color: #1a1a1a; display: flex; justify-content: center; }
  @media (prefers-color-scheme: dark) { body { background: #16181c; color: #e8e8e8; } .card { background: #22252b !important; } input, select { background: #1a1c20 !important; color: #e8e8e8 !important; border-color: #3a3d44 !important; } }
  .card { background: #fff; max-width: 420px; width: 100%; border-radius: 14px; padding: 1.6rem 1.6rem 1.8rem;
          box-shadow: 0 6px 24px rgba(0,0,0,.08); }
  h1 { font-size: 1.2rem; margin: 0 0 .3rem; }
  .sub { color: #888; font-size: .85rem; margin: 0 0 1.2rem; }
  .row { margin: 0 0 1rem; }
  .label { font-size: .8rem; color: #666; margin-bottom: .3rem; }
  .val { font-weight: 600; word-break: break-all; }
  code { background: rgba(127,127,127,.15); padding: .1rem .35rem; border-radius: 5px; font-size: .8rem; }
  label.field { display: block; font-size: .8rem; color: #666; margin: 0 0 .35rem; }
  input, select { width: 100%; box-sizing: border-box; padding: .6rem .65rem; border: 1px solid #d8dade;
                  border-radius: 9px; font-size: .95rem; }
  .actions { display: flex; gap: .6rem; margin-top: 1.4rem; }
  button { flex: 1; padding: .7rem; border: none; border-radius: 9px; font-size: .95rem; font-weight: 600; cursor: pointer; }
  .approve { background: #2f6df6; color: #fff; }
  .deny { background: rgba(127,127,127,.18); color: inherit; }
  .err { background: #ffe2e2; color: #a40000; padding: .6rem .7rem; border-radius: 9px; font-size: .85rem; margin-bottom: 1rem; }
</style>
</head>
<body>
  <div class="card">
    <h1>授权访问 Asashiki MCP</h1>
    <p class="sub">一个 MCP 客户端请求连接你的共享技能中枢。</p>
    ${errBlock}
    <div class="row"><div class="label">客户端</div><div class="val">${htmlEscape(opts.clientName)}</div></div>
    <div class="row"><div class="label">回调地址</div><div class="val">${htmlEscape(opts.redirectHost)}</div></div>
    <div class="row"><div class="label">请求权限</div><div>${scopes || "<code>tools</code>"}</div></div>
    <form method="POST" action="/oauth/approve">
      <input type="hidden" name="pending" value="${htmlEscape(opts.pendingId)}">
      <div class="row">
        <label class="field" for="agent_id">以哪个 Agent 身份接入</label>
        <select id="agent_id" name="agent_id" required>${agentOptions}</select>
      </div>
      <div class="row">
        <label class="field" for="agent_secret">Agent 密钥</label>
        <input id="agent_secret" name="agent_secret" type="password" autocomplete="off" required placeholder="amcp_sk_...">
      </div>
      <div class="actions">
        <button class="deny" type="submit" name="decision" value="deny">拒绝</button>
        <button class="approve" type="submit" name="decision" value="approve">授权</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

export function registerOAuthRoutes(server: FastifyInstance, store: AuthStore, config: OAuthConfig) {
  // OAuth uses application/x-www-form-urlencoded for /token and form POSTs.
  if (!server.hasContentTypeParser("application/x-www-form-urlencoded")) {
    server.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string" },
      (_req, body, done) => {
        try {
          const params = new URLSearchParams(body as string);
          done(null, Object.fromEntries(params.entries()));
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    );
  }

  const issuer = config.issuer.replace(/\/$/, "");

  // ── Discovery metadata ────────────────────────────────────────────────────

  server.get("/.well-known/oauth-protected-resource", async () => ({
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer]
  }));

  // Some clients append the resource path to the well-known prefix.
  server.get("/.well-known/oauth-protected-resource/mcp", async () => ({
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer]
  }));

  const authServerMeta = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    revocation_endpoint: `${issuer}/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"]
  };
  server.get("/.well-known/oauth-authorization-server", async () => authServerMeta);
  server.get("/.well-known/oauth-authorization-server/mcp", async () => authServerMeta);

  // ── Dynamic client registration ─────────────────────────────────────────

  server.post("/register", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const clientName =
      typeof body.client_name === "string" && body.client_name.trim()
        ? body.client_name.trim()
        : "Unknown MCP Client";
    const redirectUris = Array.isArray(body.redirect_uris)
      ? (body.redirect_uris as unknown[]).filter((u): u is string => typeof u === "string")
      : [];
    if (redirectUris.length === 0) {
      reply.code(400);
      return { error: "invalid_redirect_uri", error_description: "redirect_uris is required." };
    }
    const client = store.registerClient(clientName, redirectUris);
    store.audit({ clientId: client.clientId, action: "register", success: true, detail: clientName });
    reply.code(201);
    return {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    };
  });

  // ── Authorize ─────────────────────────────────────────────────────────────

  server.get("/authorize", async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, string>;
    const responseType = q.response_type;
    const clientId = q.client_id;
    const redirectUri = q.redirect_uri;
    const codeChallenge = q.code_challenge;
    const codeChallengeMethod = q.code_challenge_method ?? "S256";
    const scope = q.scope?.trim() || config.defaultScope;
    const state = q.state ?? null;

    if (responseType !== "code") {
      reply.code(400); return { error: "unsupported_response_type" };
    }
    if (!clientId || !redirectUri || !codeChallenge) {
      reply.code(400); return { error: "invalid_request", error_description: "missing client_id, redirect_uri or code_challenge" };
    }
    if (codeChallengeMethod !== "S256") {
      reply.code(400); return { error: "invalid_request", error_description: "only S256 PKCE is supported" };
    }
    const client = store.getClient(clientId);
    if (!client) { reply.code(400); return { error: "invalid_client" }; }
    if (!client.redirectUris.includes(redirectUri)) {
      reply.code(400); return { error: "invalid_request", error_description: "redirect_uri not registered for this client" };
    }

    const pending = store.createPending({
      clientId, clientName: client.clientName, redirectUri,
      codeChallenge, codeChallengeMethod, scope, state,
      ttlSeconds: config.pendingTtlSeconds
    });

    reply.redirect(`/oauth/consent?pending=${encodeURIComponent(pending.pendingId)}`);
  });

  // ── Consent page ────────────────────────────────────────────────────────

  server.get("/oauth/consent", async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, string>;
    const pending = q.pending ? store.getPending(q.pending) : null;
    if (!pending) {
      reply.code(400).type("text/html");
      return "<p>授权请求已过期或无效，请在客户端重新发起连接。</p>";
    }
    let redirectHost = pending.redirectUri;
    try { redirectHost = new URL(pending.redirectUri).host; } catch { /* keep raw */ }
    const agents = store.listAgents().filter((a) => a.enabled).map((a) => ({ agentId: a.agentId, displayName: a.displayName }));
    reply.type("text/html");
    return consentPage({
      pendingId: pending.pendingId,
      clientName: pending.clientName,
      redirectHost,
      scope: pending.scope,
      agents
    });
  });

  // ── Approve / Deny ────────────────────────────────────────────────────────

  server.post("/oauth/approve", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>;
    const pending = body.pending ? store.getPending(body.pending) : null;
    if (!pending) {
      reply.code(400).type("text/html");
      return "<p>授权请求已过期，请重新发起。</p>";
    }

    const buildRedirect = (params: Record<string, string>) => {
      const url = new URL(pending.redirectUri);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      if (pending.state) url.searchParams.set("state", pending.state);
      return url.toString();
    };

    if (body.decision !== "approve") {
      store.deletePending(pending.pendingId);
      store.audit({ clientId: pending.clientId, action: "authorize_denied", success: true });
      return reply.redirect(buildRedirect({ error: "access_denied" }));
    }

    const agentId = body.agent_id;
    const agentSecret = body.agent_secret ?? "";
    if (!agentId || !store.verifyAgentSecret(agentId, agentSecret)) {
      store.audit({ agentId: agentId ?? null, clientId: pending.clientId, action: "authorize_bad_secret", success: false });
      const agents = store.listAgents().filter((a) => a.enabled).map((a) => ({ agentId: a.agentId, displayName: a.displayName }));
      reply.code(403).type("text/html");
      return consentPage({
        pendingId: pending.pendingId,
        clientName: pending.clientName,
        redirectHost: (() => { try { return new URL(pending.redirectUri).host; } catch { return pending.redirectUri; } })(),
        scope: pending.scope,
        agents,
        error: "Agent 不存在、已禁用，或密钥不正确。"
      });
    }

    const code = store.issueCode({
      clientId: pending.clientId,
      agentId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
      scope: pending.scope,
      ttlSeconds: config.codeTtlSeconds
    });
    store.deletePending(pending.pendingId);
    store.audit({ agentId, clientId: pending.clientId, action: "authorize_approved", success: true });
    return reply.redirect(buildRedirect({ code }));
  });

  // ── Token ───────────────────────────────────────────────────────────────

  server.post("/token", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>;
    const grantType = body.grant_type;

    if (grantType === "authorization_code") {
      const code = body.code;
      const redirectUri = body.redirect_uri;
      const codeVerifier = body.code_verifier;
      if (!code || !redirectUri || !codeVerifier) {
        reply.code(400); return { error: "invalid_request", error_description: "missing code, redirect_uri or code_verifier" };
      }
      const record = store.consumeCode(code);
      if (!record) { reply.code(400); return { error: "invalid_grant", error_description: "code invalid, expired or already used" }; }
      if (record.redirectUri !== redirectUri) {
        reply.code(400); return { error: "invalid_grant", error_description: "redirect_uri mismatch" };
      }
      if (!verifyPkceS256(codeVerifier, record.codeChallenge)) {
        store.audit({ agentId: record.agentId, clientId: record.clientId, action: "token_pkce_fail", success: false });
        reply.code(400); return { error: "invalid_grant", error_description: "PKCE verification failed" };
      }
      const pair = store.issueTokenPair({
        clientId: record.clientId,
        agentId: record.agentId,
        scope: record.scope,
        accessTtlSeconds: config.accessTtlSeconds,
        refreshTtlSeconds: config.refreshTtlSeconds
      });
      store.audit({ agentId: record.agentId, clientId: record.clientId, action: "token_issued", success: true });
      return {
        access_token: pair.accessToken,
        token_type: "Bearer",
        expires_in: pair.expiresIn,
        refresh_token: pair.refreshToken,
        scope: record.scope
      };
    }

    if (grantType === "refresh_token") {
      const refreshToken = body.refresh_token;
      if (!refreshToken) { reply.code(400); return { error: "invalid_request", error_description: "missing refresh_token" }; }
      const result = store.rotateRefreshToken(refreshToken, {
        accessTtlSeconds: config.accessTtlSeconds,
        refreshTtlSeconds: config.refreshTtlSeconds
      });
      if ("error" in result) {
        store.audit({ action: "token_refresh_fail", success: false, detail: result.error });
        reply.code(400);
        return { error: "invalid_grant", error_description: result.error };
      }
      store.audit({ agentId: result.agentId, action: "token_refreshed", success: true });
      return {
        access_token: result.accessToken,
        token_type: "Bearer",
        expires_in: result.expiresIn,
        refresh_token: result.refreshToken,
        scope: result.scope
      };
    }

    reply.code(400);
    return { error: "unsupported_grant_type" };
  });

  // ── Revoke ──────────────────────────────────────────────────────────────

  server.post("/revoke", async (request) => {
    const body = (request.body ?? {}) as Record<string, string>;
    const token = body.token;
    if (token) {
      store.revokeToken(token);
      store.audit({ action: "token_revoked", success: true });
    }
    // RFC 7009: always 200, even for unknown tokens.
    return {};
  });
}
