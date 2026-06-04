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
  ${nav("/console/dashboard", "看板")}
  ${nav("/console/skills", "技能")}
  ${nav("/console/remote", "Remote")}
  ${nav("/console/agents", "Agents")}
  ${nav("/console/audit", "审计")}
  <span class="sp"></span>
  <form class="inline" method="POST" action="/console/logout"><button class="off">登出</button></form>
</header>
<main>${body}</main></body></html>`;
}

function loginPage(error?: string): string {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · Asashiki MCP</title>
<style>${STYLE} main{max-width:340px;margin-top:12vh}</style></head><body><main>
<div class="card"><h1>Asashiki MCP 控制台</h1>
${error ? `<div class="err">${esc(error)}</div>` : ""}
<form method="POST" action="/console/login">
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
    const flags = ["HttpOnly", "Path=/console", "SameSite=Lax", `Max-Age=${SESSION_TTL_SECONDS}`];
    if (config.secureCookie) flags.push("Secure");
    reply.header("Set-Cookie", `${COOKIE}=${token}; ${flags.join("; ")}`);
  };
  const clearCookie = (reply: FastifyReply) => {
    reply.header("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/console; Max-Age=0`);
  };
  /** Guard for pages: returns username or sends a redirect/sentinel. */
  const guard = (request: FastifyRequest, reply: FastifyReply): string | null => {
    const user = sessionUser(request);
    if (!user) { reply.redirect("/console/login"); return null; }
    return user;
  };

  // ── auth ──
  server.get("/console", async (_req, reply) => reply.redirect("/console/dashboard"));

  // ── dashboard (business-layer data, pulled server-side from core-api) ──
  server.get("/console/dashboard", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const [dev, health, loc, weather, conn, timeline] = await Promise.allSettled([
      client.getDeviceCurrent(),
      client.getHealthSummary(),
      client.getLocationCurrent(),
      client.getWeather(),
      client.getConnectorStatus(),
      client.getDeviceTimeline({})
    ]);
    const val = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);
    const sh = (iso: unknown) => {
      if (typeof iso !== "string") return "—";
      const d = new Date(iso); return isNaN(d.getTime()) ? "—" :
        d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    };

    const d = val(dev) as { devices?: Array<Record<string, unknown>> } | null;
    const devCard = (() => {
      const list = d?.devices ?? [];
      if (!list.length) return `<p class="muted">暂无设备上报。</p>`;
      return `<table><tr><th>设备</th><th>状态</th><th>当前应用</th><th>电量</th><th>最近</th></tr>` +
        list.map((x) => {
          const extra = (x.extra ?? {}) as Record<string, unknown>;
          const bat = extra.battery_percent;
          return `<tr><td>${esc(x.deviceName)}<br><span class="muted">${esc(x.platform)}</span></td>
          <td>${x.isOnline ? "🟢 在线" : "⚪ 离线"}</td><td>${esc(x.appId ?? "—")}</td>
          <td>${bat != null ? esc(bat) + "%" : "—"}</td><td class="muted">${sh(x.lastSeenAt)}</td></tr>`;
        }).join("") + `</table>`;
    })();

    const h = val(health) as { restingHeartRate?: number | null; sleepHours?: number | null; stepCount?: number | null; capturedAt?: string } | null;
    const healthCard = h
      ? `静息心率 <b>${h.restingHeartRate ?? "—"}</b> bpm · 睡眠 <b>${h.sleepHours ?? "—"}</b> h · 步数 <b>${h.stepCount ?? "—"}</b><br><span class="muted">${sh(h.capturedAt)}</span>`
      : `<span class="muted">暂无健康数据。</span>`;

    const l = val(loc) as { devices?: Array<Record<string, unknown>> } | null;
    const locCard = (l?.devices?.length)
      ? l.devices.map((p) => `${esc(p.deviceId)}: ${esc((p.lat as number)?.toFixed?.(4))}, ${esc((p.lon as number)?.toFixed?.(4))} <span class="muted">@ ${sh(p.recordedAt)}</span>`).join("<br>")
      : `<span class="muted">暂无位置数据。</span>`;

    const w = val(weather) as { location?: string; current?: Record<string, unknown> } | null;
    const wCard = w?.current
      ? `${esc(w.location)} <b>${esc(w.current.temperatureC)}°C</b>（体感 ${esc(w.current.feelsLikeC)}°C）${esc(w.current.description)} · 湿度 ${esc(w.current.humidity)}%`
      : `<span class="muted">天气获取失败。</span>`;

    const c = val(conn) as { summary?: { online?: number; total?: number }; connectors?: Array<Record<string, unknown>> } | null;
    const connCard = c?.connectors?.length
      ? `在线 <b>${c.summary?.online ?? "?"}/${c.summary?.total ?? "?"}</b><br>` +
        c.connectors.map((x) => `<span class="tag">${esc(x.status)}</span> ${esc(x.name)}`).join(" ")
      : `<span class="muted">无连接器。</span>`;

    const t = val(timeline) as { date?: string; activities?: Array<Record<string, unknown>> } | null;
    const tlCard = (() => {
      const acts = t?.activities ?? [];
      if (!acts.length) return `<span class="muted">今日暂无活动记录。</span>`;
      return acts.slice(0, 15).map((a) => {
        const mins = a.endedAt ? Math.max(1, Math.round((Date.parse(a.endedAt as string) - Date.parse(a.startedAt as string)) / 60000)) : null;
        return `<span class="muted">${sh(a.startedAt)}</span> ${esc(a.appId)}${mins != null ? ` <span class="muted">(${mins}m)</span>` : ""}`;
      }).join("<br>");
    })();

    reply.type("text/html");
    return page("看板", "/console/dashboard",
      `<h1>数据看板 <span class="muted">（来自 core-api，实时拉取）</span></h1>
       <div class="card"><h2>设备状态</h2>${devCard}</div>
       <div class="card"><h2>今日时间线</h2>${tlCard}</div>
       <div class="card"><h2>健康</h2>${healthCard}</div>
       <div class="card"><h2>位置</h2>${locCard}</div>
       <div class="card"><h2>天气</h2>${wCard}</div>
       <div class="card"><h2>连接器</h2>${connCard}</div>`);
  });

  server.get("/console/login", async (request, reply) => {
    if (sessionUser(request)) return reply.redirect("/console/dashboard");
    reply.type("text/html"); return loginPage();
  });

  server.post("/console/login", async (request, reply) => {
    const b = (request.body ?? {}) as Record<string, string>;
    if (!b.username || !b.password || !store.verifyConsoleAdmin(b.username, b.password)) {
      reply.code(401).type("text/html"); return loginPage("用户名或密码错误。");
    }
    const token = store.createConsoleSession(b.username, SESSION_TTL_SECONDS);
    setCookie(reply, token);
    store.audit({ action: "console_login", success: true, detail: b.username });
    return reply.redirect("/console/dashboard");
  });

  server.post("/console/logout", async (request, reply) => {
    const token = parseCookies(request.headers.cookie)[COOKIE];
    if (token) store.deleteConsoleSession(token);
    clearCookie(reply);
    return reply.redirect("/console/login");
  });

  // ── skills ──
  server.get("/console/skills", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const skills = store.listSkills();
    const byCat = new Map<string, typeof skills>();
    for (const s of skills) { const a = byCat.get(s.category) ?? []; a.push(s); byCat.set(s.category, a); }
    const sections = [...byCat.entries()].map(([cat, list]) => {
      const rows = list.map((s) => {
        // Remote write tools (readOnly===false) get an extra allow-write toggle.
        const writeToggle = (s.source === "remote-mcp" && s.readOnly === false)
          ? `<form class="inline" method="POST" action="/console/skills/${esc(s.skillId)}/allow-write">
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
        <td><form class="inline" method="POST" action="/console/skills/${esc(s.skillId)}">
          <input type="hidden" name="enabled" value="${s.enabled ? "false" : "true"}">
          <button class="${s.enabled ? "off" : "on"}">${s.enabled ? "禁用" : "启用"}</button>
        </form>${writeToggle}</td></tr>`;
      }).join("");
      return `<div class="card"><h2>${esc(cat)} · ${list.length}</h2><table>
        <tr><th>技能</th><th>来源</th><th>状态</th><th></th></tr>${rows}</table></div>`;
    }).join("");
    const enabled = skills.filter((s) => s.enabled).length;
    reply.type("text/html");
    return page("技能", "/console/skills",
      `<h1>技能注册表 <span class="muted">（${enabled}/${skills.length} 启用）</span></h1>
       <p class="muted">⚠️ 改开关后，已连接的 claude.ai / ChatGPT 需重连才会刷新工具列表。</p>${sections}`);
  });

  server.post("/console/skills/:id", async (request, reply) => {
    if (!sessionUser(request)) { reply.code(401); return { error: "unauthorized" }; }
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as Record<string, string>;
    store.setSkillEnabled(id, b.enabled === "true");
    store.audit({ action: "skill_toggle", success: true, detail: `${id}=${b.enabled}` });
    return reply.redirect("/console/skills");
  });

  server.post("/console/skills/:id/allow-write", async (request, reply) => {
    if (!sessionUser(request)) { reply.code(401); return { error: "unauthorized" }; }
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as Record<string, string>;
    store.setSkillAllowWrite(id, b.allow === "true");
    store.audit({ action: "skill_allow_write", success: true, detail: `${id}=${b.allow}` });
    return reply.redirect("/console/skills");
  });

  // ── agents ──
  const agentsBody = (extra = "") => {
    const agents = store.listAgents();
    const rows = agents.map((a) => `
      <tr><td>${esc(a.displayName)}<br><span class="muted">${esc(a.agentId)}</span></td>
      <td>${a.enabled ? "✅" : "⛔"}</td>
      <td class="muted">${esc(a.lastUsedAt ?? "—")}</td>
      <td>
        <form class="inline" method="POST" action="/console/agents/${esc(a.agentId)}/toggle">
          <input type="hidden" name="enabled" value="${a.enabled ? "false" : "true"}">
          <button class="${a.enabled ? "off" : "on"}">${a.enabled ? "禁用" : "启用"}</button></form>
        <form class="inline" method="POST" action="/console/agents/${esc(a.agentId)}/regen">
          <button class="off">轮换密钥</button></form>
        <a href="/console/agents/${esc(a.agentId)}/visibility"><button type="button" class="off">工具可见性${store.agentHasAllowlist(a.agentId) ? " ●" : ""}</button></a>
      </td></tr>`).join("");
    return `<h1>OAuth Agents</h1>${extra}
      <div class="card"><table><tr><th>Agent</th><th>启用</th><th>最近使用</th><th></th></tr>${rows}</table></div>
      <div class="card"><h2>新增 Agent</h2>
      <form method="POST" action="/console/agents">
        <p><input name="agent_id" placeholder="agent_id，如 cursor-ai" required></p>
        <p><input name="display_name" placeholder="显示名，如 Cursor"></p>
        <button class="on">创建</button></form></div>`;
  };
  const secretCard = (agentId: string, secret: string) =>
    `<div class="card"><h2>✅ ${esc(agentId)} 的密钥（只显示这一次，请立即保存）</h2>
     <div class="secret">${esc(secret)}</div></div>`;

  server.get("/console/agents", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    reply.type("text/html"); return page("Agents", "/console/agents", agentsBody());
  });

  server.post("/console/agents", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const b = (request.body ?? {}) as Record<string, string>;
    const id = (b.agent_id ?? "").trim();
    if (!id) { reply.type("text/html"); return page("Agents", "/console/agents", agentsBody(`<div class="err">agent_id 必填</div>`)); }
    const res = store.upsertAgent(id, (b.display_name ?? "").trim() || id);
    store.audit({ agentId: id, action: "agent_create", success: true });
    reply.type("text/html");
    return page("Agents", "/console/agents",
      (res.secret ? secretCard(id, res.secret) : `<div class="err">${esc(id)} 已存在（未改动；用"轮换密钥"重置）。</div>`) + agentsBody());
  });

  server.post("/console/agents/:id/regen", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = request.params as { id: string };
    const secret = store.regenerateSecret(id);
    store.audit({ agentId: id, action: "agent_regen", success: !!secret });
    reply.type("text/html");
    return page("Agents", "/console/agents",
      (secret ? secretCard(id, secret) : `<div class="err">未找到 agent: ${esc(id)}</div>`) + agentsBody());
  });

  server.post("/console/agents/:id/toggle", async (request, reply) => {
    if (!sessionUser(request)) { reply.code(401); return { error: "unauthorized" }; }
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as Record<string, string>;
    store.setAgentEnabled(id, b.enabled === "true");
    store.audit({ agentId: id, action: "agent_toggle", success: true, detail: b.enabled });
    return reply.redirect("/console/agents");
  });

  // ── per-agent tool visibility (allowlist) ──
  server.get("/console/agents/:id/visibility", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = request.params as { id: string };
    if (!store.getAgent(id)) { reply.code(404).type("text/html"); return page("Agents", "/console/agents", `<div class="err">未找到 agent: ${esc(id)}</div>`); }
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
    return page("Agents", "/console/agents",
      `<h1>${esc(id)} · 工具可见性</h1>
       <p class="muted">当前模式：<b>${restricted ? "白名单（仅勾选可见）" : "默认开放（看到所有启用工具）"}</b>。
       全不勾选并保存 = 退回默认开放。勾选则进入白名单模式。仍受全局开关约束。<br>
       ⚠️ 改后该 agent 需重连才会刷新工具列表。</p>
       <form method="POST" action="/console/agents/${esc(id)}/visibility">
         <div class="card">${rows}</div>
         <button class="on" type="submit">保存</button>
         <a href="/console/agents"><button type="button" class="off">返回</button></a>
       </form>`);
  });

  server.post("/console/agents/:id/visibility", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = request.params as { id: string };
    if (!store.getAgent(id)) { reply.code(404); return { error: `unknown agent: ${id}` }; }
    const body = (request.body ?? {}) as Record<string, string>;
    const checked = Object.keys(body).filter((k) => k.startsWith("s:")).map((k) => k.slice(2));
    store.setAgentAllowlist(id, checked);
    store.audit({ agentId: id, action: "agent_visibility", success: true, detail: `${checked.length} skills` });
    return reply.redirect("/console/agents");
  });

  // ── audit ──
  server.get("/console/audit", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const rows = store.recentAudit(150).map((r) => `
      <tr><td class="muted">${esc(r.created_at)}</td><td>${esc(r.action)}</td>
      <td>${esc(r.agent_id ?? "")}</td><td>${Number(r.success) === 1 ? "✓" : "✗"}</td>
      <td class="muted">${esc(r.detail ?? "")}</td></tr>`).join("");
    reply.type("text/html");
    return page("审计", "/console/audit",
      `<h1>审计日志 <span class="muted">（最近 150）</span></h1>
       <div class="card"><table><tr><th>时间</th><th>动作</th><th>agent</th><th>ok</th><th>详情</th></tr>${rows}</table></div>`);
  });

  // ── remote MCP servers (接管别的 MCP 服务) ──
  server.get("/console/remote", async (request, reply) => {
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
          <form class="inline" method="POST" action="/console/remote/${esc(s.id)}/delete" onsubmit="return confirm('删除远程服务器 ${esc(s.id)}？其工具会从注册表移除。')">
            <button class="danger">删除</button></form></div>`).join("")
        : `<p class="muted">还没有远程 MCP 服务器。在下方添加。</p>`;
    } catch (e) {
      serversHtml = `<div class="err">${esc(e instanceof Error ? e.message : "load failed")}</div>`;
    }
    reply.type("text/html");
    return page("Remote", "/console/remote",
      `<h1>远程 MCP 服务器 <span class="muted">（中枢转路）</span></h1>
       ${flash ? `<div class="card">${esc(flash)}</div>` : ""}
       <p class="muted">添加后点「重新发现」拉取其工具（默认禁用，去技能页启用 + 按 agent 分配）。客户端需重连刷新。</p>
       <form class="inline" method="POST" action="/console/remote/rediscover"><button class="on">🔄 重新发现</button></form>
       ${serversHtml}
       <div class="card"><h2>添加远程服务器</h2>
       <form method="POST" action="/console/remote">
         <p><input name="id" placeholder="id（小写/数字/连字符，如 acme）" required></p>
         <p><input name="name" placeholder="显示名" required></p>
         <p><input name="url" placeholder="https://acme.example.com/mcp" required></p>
         <p><input name="description" placeholder="描述" required></p>
         <p><input name="bearerToken" placeholder="Bearer token（可选，需鉴权时填）"></p>
         <button class="on">添加</button></form></div>`);
  });

  server.post("/console/remote", async (request, reply) => {
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
      return reply.redirect("/console/remote?msg=" + encodeURIComponent(`已添加 ${b.id} 并重新发现`));
    } catch (e) {
      return reply.redirect("/console/remote?msg=" + encodeURIComponent(`添加失败：${e instanceof Error ? e.message : e}`));
    }
  });

  server.post("/console/remote/rediscover", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const r = config.rediscoverRemote ? await config.rediscoverRemote() : { seeded: 0 };
    store.audit({ action: "remote_rediscover", success: true, detail: `${r.seeded} tools` });
    return reply.redirect("/console/remote?msg=" + encodeURIComponent(`重新发现完成：${r.seeded} 个工具`));
  });

  server.post("/console/remote/:id/delete", async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = request.params as { id: string };
    try {
      await client.deleteRemoteServer(id);
      store.pruneRemoteSkillsForServer(id);
      if (config.rediscoverRemote) await config.rediscoverRemote();
      store.audit({ action: "remote_server_delete", success: true, detail: id });
      return reply.redirect("/console/remote?msg=" + encodeURIComponent(`已删除 ${id}`));
    } catch (e) {
      return reply.redirect("/console/remote?msg=" + encodeURIComponent(`删除失败：${e instanceof Error ? e.message : e}`));
    }
  });
}
