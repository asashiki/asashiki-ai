import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuthStore } from "../auth/store.js";
import type { CoreApiClient } from "../core-api-client.js";
import { parseCookies } from "../auth/tokens.js";

// Server-rendered admin console for the Asashiki MCP gateway. Manages the skill
// registry, OAuth agents, and shows the audit log. Auth is a simple
// username/password account → session cookie (kept deliberately simple, per
// the project decision; separate from the MCP OAuth agent identities).

const COOKIE = "asmcp_console";
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export interface ConsoleConfig {
  /** Set Secure flag on the session cookie (true behind https). */
  secureCookie: boolean;
  /** Re-discover remote-MCP tools and seed them (called after add/remove). */
  rediscoverRemote?: () => Promise<{ seeded: number }>;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
  );
}

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: system-ui,-apple-system,"PingFang SC",sans-serif; margin:0; background:#f6f7f9; color:#1a1a1a; }
  @media (prefers-color-scheme: dark){ body{background:#16181c;color:#e8e8e8} .card,.bar{background:#22252b!important} input,td,th{border-color:#3a3d44!important} a{color:#7aa2ff} }
  header.bar { background:#fff; padding:.8rem 1.2rem; display:flex; gap:1rem; align-items:center; box-shadow:0 1px 4px rgba(0,0,0,.06); position:sticky; top:0; }
  header.bar a { text-decoration:none; color:inherit; font-weight:600; padding:.3rem .6rem; border-radius:8px; }
  header.bar a.active { background:rgba(47,109,246,.15); }
  .sp { flex:1 }
  main { max-width:860px; margin:1.4rem auto; padding:0 1rem; }
  .card { background:#fff; border-radius:12px; padding:1.2rem 1.4rem; box-shadow:0 4px 16px rgba(0,0,0,.06); margin-bottom:1.2rem; }
  h1{font-size:1.25rem;margin:.2rem 0 1rem} h2{font-size:1rem;margin:0 0 .8rem;color:#666}
  table{width:100%;border-collapse:collapse;font-size:.9rem} th,td{text-align:left;padding:.5rem .4rem;border-bottom:1px solid #e6e8ec}
  th{color:#888;font-weight:600;font-size:.8rem}
  button{cursor:pointer;border:none;border-radius:8px;padding:.4rem .8rem;font-size:.85rem;font-weight:600}
  .on{background:#2f6df6;color:#fff} .off{background:rgba(127,127,127,.25);color:inherit}
  .danger{background:#e0524d;color:#fff}
  input{padding:.55rem .65rem;border:1px solid #d8dade;border-radius:9px;font-size:.95rem;width:100%}
  form.inline{display:inline} .tag{font-size:.72rem;padding:.1rem .45rem;border-radius:6px;background:rgba(127,127,127,.18)}
  .secret{font-family:ui-monospace,monospace;background:#fff3cd;color:#664d03;padding:.7rem;border-radius:8px;word-break:break-all}
  .muted{color:#999;font-size:.82rem} .err{background:#ffe2e2;color:#a40000;padding:.6rem .8rem;border-radius:9px;margin-bottom:1rem}
`;

function page(title: string, active: string, body: string): string {
  const nav = (href: string, label: string) =>
    `<a href="${href}" class="${active === href ? "active" : ""}">${label}</a>`;
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Asashiki MCP</title>
<style>${STYLE}</style></head><body>
<header class="bar">
  <strong>Asashiki MCP</strong>
  ${nav("/console-legacy/skills", "技能")}
  ${nav("/console-legacy/remote", "Remote")}
  ${nav("/console-legacy/agents", "Agents")}
  ${nav("/console-legacy/audit", "审计")}
  <span class="sp"></span>
  <form class="inline" method="POST" action="/console-legacy/logout"><button class="off">登出</button></form>
</header>
<main>${body}</main></body></html>`;
}

function loginPage(error?: string): string {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · Asashiki MCP</title>
<style>${STYLE} main{max-width:340px;margin-top:12vh}</style></head><body><main>
<div class="card"><h1>Asashiki MCP 控制台</h1>
${error ? `<div class="err">${esc(error)}</div>` : ""}
<form method="POST" action="/console-legacy/login">
  <p><input name="username" placeholder="用户名" autocomplete="username" required></p>
  <p><input name="password" type="password" placeholder="密码" autocomplete="current-password" required></p>
  <button class="on" type="submit" style="width:100%">登录</button>
</form></div></main></body></html>`;
}

export function registerConsoleRoutes(server: FastifyInstance, store: AuthStore, client: CoreApiClient, config: ConsoleConfig) {
  // urlencoded parser is registered by the OAuth routes; ensure it exists.
  if (!server.hasContentTypeParser("application/x-www-form-urlencoded")) {
    server.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_r, body, done) => {
      try { done(null, Object.fromEntries(new URLSearchParams(body as string).entries())); }
      catch (e) { done(e as Error, undefined); }
    });
  }

  const sessionUser = (request: FastifyRequest): string | null => {
    const token = parseCookies(request.headers.cookie)[COOKIE];
    return token ? store.validateConsoleSession(token) : null;
  };
  const setCookie = (reply: FastifyReply, token: string) => {
    const flags = ["HttpOnly", "Path=/console-legacy", "SameSite=Lax", `Max-Age=${SESSION_TTL_SECONDS}`];
    if (config.secureCookie) flags.push("Secure");
    reply.header("Set-Cookie", `${COOKIE}=${token}; ${flags.join("; ")}`);
  };
  const clearCookie = (reply: FastifyReply) => {
    reply.header("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/console-legacy; Max-Age=0`);
  };
  /** Guard for pages: returns username or sends a redirect/sentinel. */
  const guard = (request: FastifyRequest, reply: FastifyReply): string | null => {
    const user = sessionUser(request);
    if (!user) { reply.redirect("/console-legacy/login"); return null; }
    return user;
  };

  // ── auth ──
  // Note: the device/health/weather "数据看板" was removed — that's business-layer
  // (api.asashiki.com) data for apps/widgets, not part of the AI control panel.
  server.get("/console-legacy", async (_req, reply) => reply.redirect("/console-legacy/skills"));

  server.get("/console-legacy/login", async (request, reply) => {
    if (sessionUser(request)) return reply.redirect("/console-legacy/skills");
    reply.type("text/html"); return loginPage();
  });

  server.post("/console-legacy/login", async (request, reply) => {
    const b = (request.body ?? {}) as Record<string, string>;
    if (!b.username || !b.password || !store.verifyConsoleAdmin(b.username, b.password)) {
      reply.code(401).type("text/html"); return loginPage("用户名或密码错误。");
    }
    const token = store.createConsoleSession(b.username, SESSION_TTL_SECONDS);
    setCookie(reply, token);
    store.audit({ action: "console_login", success: true, detail: b.username });
    return reply.redirect("/console-legacy/skills");
  });

  server.post("/console-legacy/logout", async (request, reply) => {
    const token = parseCookies(request.headers.cookie)[COOKIE];
    if (token) store.deleteConsoleSession(token);
    clearCookie(reply);
    return reply.redirect("/console-legacy/login");
  });

  // ── skills ──
  server.get("/console-legacy/skills", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const skills = store.listSkills();
    const byCat = new Map<string, typeof skills>();
    for (const s of skills) { const a = byCat.get(s.category) ?? []; a.push(s); byCat.set(s.category, a); }
    const sections = [...byCat.entries()].map(([cat, list]) => {
      const rows = list.map((s) => {
        // Remote write tools (readOnly===false) get an extra allow-write toggle.
        const writeToggle = (s.source === "remote-mcp" && s.readOnly === false)
          ? `<form class="inline" method="POST" action="/console-legacy/skills/${esc(s.skillId)}/allow-write">
               <input type="hidden" name="allow" value="${s.allowWrite ? "false" : "true"}">
               <button class="${s.allowWrite ? "danger" : "off"}">${s.allowWrite ? "✍ 已允许写入" : "✍ 允许写入"}</button>
             </form>`
          : "";
        const srcTag = `<span class="tag">${esc(s.source)}</span>` +
          (s.source === "remote-mcp" ? `<span class="tag">${s.readOnly === false ? "write" : "read-only"}</span>` : "");
        return `
        <tr><td>${esc(s.title)}<br><span class="muted">${esc(s.skillId)}</span></td>
        <td>${srcTag}</td>
        <td>${s.enabled ? "✅ 启用" : "⛔ 禁用"}</td>
        <td><form class="inline" method="POST" action="/console-legacy/skills/${esc(s.skillId)}">
          <input type="hidden" name="enabled" value="${s.enabled ? "false" : "true"}">
          <button class="${s.enabled ? "off" : "on"}">${s.enabled ? "禁用" : "启用"}</button>
        </form>${writeToggle}</td></tr>`;
      }).join("");
      return `<div class="card"><h2>${esc(cat)} · ${list.length}</h2><table>
        <tr><th>技能</th><th>来源</th><th>状态</th><th></th></tr>${rows}</table></div>`;
    }).join("");
    const enabled = skills.filter((s) => s.enabled).length;
    reply.type("text/html");
    return page("技能", "/console-legacy/skills",
      `<h1>技能注册表 <span class="muted">（${enabled}/${skills.length} 启用）</span></h1>
       <p class="muted">⚠️ 改开关后，已连接的 claude.ai / ChatGPT 需重连才会刷新工具列表。</p>${sections}`);
  });

  server.post("/console-legacy/skills/:id", async (request, reply) => {
    if (!sessionUser(request)) { reply.code(401); return { error: "unauthorized" }; }
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as Record<string, string>;
    store.setSkillEnabled(id, b.enabled === "true");
    store.audit({ action: "skill_toggle", success: true, detail: `${id}=${b.enabled}` });
    return reply.redirect("/console-legacy/skills");
  });

  server.post("/console-legacy/skills/:id/allow-write", async (request, reply) => {
    if (!sessionUser(request)) { reply.code(401); return { error: "unauthorized" }; }
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as Record<string, string>;
    store.setSkillAllowWrite(id, b.allow === "true");
    store.audit({ action: "skill_allow_write", success: true, detail: `${id}=${b.allow}` });
    return reply.redirect("/console-legacy/skills");
  });

  // ── agents ──
  const agentsBody = (extra = "") => {
    const agents = store.listAgents();
    const rows = agents.map((a) => `
      <tr><td>${esc(a.displayName)}<br><span class="muted">${esc(a.agentId)}</span></td>
      <td>${a.enabled ? "✅" : "⛔"}</td>
      <td class="muted">${esc(a.lastUsedAt ?? "—")}</td>
      <td>
        <form class="inline" method="POST" action="/console-legacy/agents/${esc(a.agentId)}/toggle">
          <input type="hidden" name="enabled" value="${a.enabled ? "false" : "true"}">
          <button class="${a.enabled ? "off" : "on"}">${a.enabled ? "禁用" : "启用"}</button></form>
        <form class="inline" method="POST" action="/console-legacy/agents/${esc(a.agentId)}/regen">
          <button class="off">轮换密钥</button></form>
        <a href="/console-legacy/agents/${esc(a.agentId)}/visibility"><button type="button" class="off">工具可见性${store.agentHasAllowlist(a.agentId) ? " ●" : ""}</button></a>
      </td></tr>`).join("");
    return `<h1>OAuth Agents</h1>${extra}
      <div class="card"><table><tr><th>Agent</th><th>启用</th><th>最近使用</th><th></th></tr>${rows}</table></div>
      <div class="card"><h2>新增 Agent</h2>
      <form method="POST" action="/console-legacy/agents">
        <p><input name="agent_id" placeholder="agent_id，如 cursor-ai" required></p>
        <p><input name="display_name" placeholder="显示名，如 Cursor"></p>
        <button class="on">创建</button></form></div>`;
  };
  const secretCard = (agentId: string, secret: string) =>
    `<div class="card"><h2>✅ ${esc(agentId)} 的密钥（只显示这一次，请立即保存）</h2>
     <div class="secret">${esc(secret)}</div></div>`;

  server.get("/console-legacy/agents", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    reply.type("text/html"); return page("Agents", "/console-legacy/agents", agentsBody());
  });

  server.post("/console-legacy/agents", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const b = (request.body ?? {}) as Record<string, string>;
    const id = (b.agent_id ?? "").trim();
    if (!id) { reply.type("text/html"); return page("Agents", "/console-legacy/agents", agentsBody(`<div class="err">agent_id 必填</div>`)); }
    const res = store.upsertAgent(id, (b.display_name ?? "").trim() || id);
    store.audit({ agentId: id, action: "agent_create", success: true });
    reply.type("text/html");
    return page("Agents", "/console-legacy/agents",
      (res.secret ? secretCard(id, res.secret) : `<div class="err">${esc(id)} 已存在（未改动；用"轮换密钥"重置）。</div>`) + agentsBody());
  });

  server.post("/console-legacy/agents/:id/regen", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = request.params as { id: string };
    const secret = store.regenerateSecret(id);
    store.audit({ agentId: id, action: "agent_regen", success: !!secret });
    reply.type("text/html");
    return page("Agents", "/console-legacy/agents",
      (secret ? secretCard(id, secret) : `<div class="err">未找到 agent: ${esc(id)}</div>`) + agentsBody());
  });

  server.post("/console-legacy/agents/:id/toggle", async (request, reply) => {
    if (!sessionUser(request)) { reply.code(401); return { error: "unauthorized" }; }
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as Record<string, string>;
    store.setAgentEnabled(id, b.enabled === "true");
    store.audit({ agentId: id, action: "agent_toggle", success: true, detail: b.enabled });
    return reply.redirect("/console-legacy/agents");
  });

  // ── per-agent tool visibility (allowlist) ──
  server.get("/console-legacy/agents/:id/visibility", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = request.params as { id: string };
    if (!store.getAgent(id)) { reply.code(404).type("text/html"); return page("Agents", "/console-legacy/agents", `<div class="err">未找到 agent: ${esc(id)}</div>`); }
    const allow = store.getAgentAllowlist(id);
    const restricted = store.agentHasAllowlist(id);
    const enabledSkills = store.listSkills().filter((s) => s.enabled);
    // Checkbox name `s:<skillId>` avoids urlencoded duplicate-key collapse.
    const rows = enabledSkills.map((s) => `
      <label style="display:flex;gap:.6rem;align-items:center;padding:.35rem 0;border-bottom:1px solid #e6e8ec">
        <input type="checkbox" name="s:${esc(s.skillId)}" value="1" ${restricted ? (allow.has(s.skillId) ? "checked" : "") : "checked"} style="width:auto">
        <span>${esc(s.title)} <span class="muted">${esc(s.skillId)}</span></span>
        <span class="sp" style="flex:1"></span><span class="tag">${esc(s.category)}</span>
      </label>`).join("");
    reply.type("text/html");
    return page("Agents", "/console-legacy/agents",
      `<h1>${esc(id)} · 工具可见性</h1>
       <p class="muted">当前模式：<b>${restricted ? "白名单（仅勾选可见）" : "默认开放（看到所有启用工具）"}</b>。
       全不勾选并保存 = 退回默认开放。勾选则进入白名单模式。仍受全局开关约束。<br>
       ⚠️ 改后该 agent 需重连才会刷新工具列表。</p>
       <form method="POST" action="/console-legacy/agents/${esc(id)}/visibility">
         <div class="card">${rows}</div>
         <button class="on" type="submit">保存</button>
         <a href="/console-legacy/agents"><button type="button" class="off">返回</button></a>
       </form>`);
  });

  server.post("/console-legacy/agents/:id/visibility", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = request.params as { id: string };
    if (!store.getAgent(id)) { reply.code(404); return { error: `unknown agent: ${id}` }; }
    const body = (request.body ?? {}) as Record<string, string>;
    const checked = Object.keys(body).filter((k) => k.startsWith("s:")).map((k) => k.slice(2));
    store.setAgentAllowlist(id, checked);
    store.audit({ agentId: id, action: "agent_visibility", success: true, detail: `${checked.length} skills` });
    return reply.redirect("/console-legacy/agents");
  });

  // ── audit ──
  server.get("/console-legacy/audit", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const rows = store.recentAudit(150).map((r) => `
      <tr><td class="muted">${esc(r.created_at)}</td><td>${esc(r.action)}</td>
      <td>${esc(r.agent_id ?? "")}</td><td>${Number(r.success) === 1 ? "✓" : "✗"}</td>
      <td class="muted">${esc(r.detail ?? "")}</td></tr>`).join("");
    reply.type("text/html");
    return page("审计", "/console-legacy/audit",
      `<h1>审计日志 <span class="muted">（最近 150）</span></h1>
       <div class="card"><table><tr><th>时间</th><th>动作</th><th>agent</th><th>ok</th><th>详情</th></tr>${rows}</table></div>`);
  });

  // ── remote MCP servers (接管别的 MCP 服务) ──
  server.get("/console-legacy/remote", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const flash = (request.query as Record<string, string>)?.msg;
    let serversHtml = `<p class="muted">加载远程服务器失败或暂无。</p>`;
    try {
      const servers = await client.listRemoteMcpServers();
      serversHtml = servers.length
        ? servers.map((s) => `
          <div class="card"><h2>${esc(s.name)} <span class="tag">${esc(s.status)}</span> <span class="muted">${esc(s.id)}</span></h2>
          <div class="muted">${esc(s.url)}</div>
          ${s.lastError ? `<div class="err">${esc(s.lastError)}</div>` : ""}
          <p>${esc(s.toolCount)} 个工具：${(s.tools ?? []).map((t) => `<span class="tag">${esc(t.name)}${t.readOnlyHint ? "" : " ✍"}</span>`).join(" ") || "—"}</p>
          <form class="inline" method="POST" action="/console-legacy/remote/${esc(s.id)}/delete" onsubmit="return confirm('删除远程服务器 ${esc(s.id)}？其工具会从注册表移除。')">
            <button class="danger">删除</button></form></div>`).join("")
        : `<p class="muted">还没有远程 MCP 服务器。在下方添加。</p>`;
    } catch (e) {
      serversHtml = `<div class="err">${esc(e instanceof Error ? e.message : "load failed")}</div>`;
    }
    reply.type("text/html");
    return page("Remote", "/console-legacy/remote",
      `<h1>远程 MCP 服务器 <span class="muted">（中枢转路）</span></h1>
       ${flash ? `<div class="card">${esc(flash)}</div>` : ""}
       <p class="muted">添加后点「重新发现」拉取其工具（默认禁用，去技能页启用 + 按 agent 分配）。客户端需重连刷新。</p>
       <form class="inline" method="POST" action="/console-legacy/remote/rediscover"><button class="on">🔄 重新发现</button></form>
       ${serversHtml}
       <div class="card"><h2>添加远程服务器</h2>
       <form method="POST" action="/console-legacy/remote">
         <p><input name="id" placeholder="id（小写/数字/连字符，如 acme）" required></p>
         <p><input name="name" placeholder="显示名" required></p>
         <p><input name="url" placeholder="https://acme.example.com/mcp" required></p>
         <p><input name="description" placeholder="描述" required></p>
         <p><input name="bearerToken" placeholder="Bearer token（可选，需鉴权时填）"></p>
         <button class="on">添加</button></form></div>`);
  });

  server.post("/console-legacy/remote", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const b = (request.body ?? {}) as Record<string, string>;
    try {
      await client.addRemoteServer({
        id: (b.id ?? "").trim(), name: (b.name ?? "").trim(), url: (b.url ?? "").trim(),
        description: (b.description ?? "").trim() || (b.name ?? "").trim(),
        bearerToken: b.bearerToken?.trim() || undefined, enabled: true
      });
      if (config.rediscoverRemote) await config.rediscoverRemote();
      store.audit({ action: "remote_server_add", success: true, detail: b.id });
      return reply.redirect("/console-legacy/remote?msg=" + encodeURIComponent(`已添加 ${b.id} 并重新发现`));
    } catch (e) {
      return reply.redirect("/console-legacy/remote?msg=" + encodeURIComponent(`添加失败：${e instanceof Error ? e.message : e}`));
    }
  });

  server.post("/console-legacy/remote/rediscover", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const r = config.rediscoverRemote ? await config.rediscoverRemote() : { seeded: 0 };
    store.audit({ action: "remote_rediscover", success: true, detail: `${r.seeded} tools` });
    return reply.redirect("/console-legacy/remote?msg=" + encodeURIComponent(`重新发现完成：${r.seeded} 个工具`));
  });

  server.post("/console-legacy/remote/:id/delete", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = request.params as { id: string };
    try {
      await client.deleteRemoteServer(id);
      store.pruneRemoteSkillsForServer(id);
      if (config.rediscoverRemote) await config.rediscoverRemote();
      store.audit({ action: "remote_server_delete", success: true, detail: id });
      return reply.redirect("/console-legacy/remote?msg=" + encodeURIComponent(`已删除 ${id}`));
    } catch (e) {
      return reply.redirect("/console-legacy/remote?msg=" + encodeURIComponent(`删除失败：${e instanceof Error ? e.message : e}`));
    }
  });
}
