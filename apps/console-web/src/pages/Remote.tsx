import { useEffect, useState } from "react";
import { Remote } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import type { RemoteServer } from "@/types/api";
import PageHead from "@/components/PageHead";

// 接入表单对齐 claude.ai 连接器：Name + URL 必填；OAuth Client ID/Secret 可选。
// 三种鉴权自动适配：①开放服务器直连 ②OAuth 动态注册（DCR）→ 跳转授权
// ③OAuth 预注册客户端（填 ID/Secret）→ 跳转授权。另保留静态 Bearer Token（高级）。
export default function RemotePage() {
  const q = useAsync(() => Remote.list(), []);
  const [form, setForm] = useState({ name: "", url: "", clientId: "", clientSecret: "", bearerToken: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // OAuth 授权完成后外部跳回 /console/remote?oauth=ok|err
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const oauth = p.get("oauth");
    if (!oauth) return;
    if (oauth === "ok") setMsg(`授权完成 ✓ 已重新发现「${p.get("server") ?? ""}」的工具，去技能页启用它们。`);
    else setMsg(`授权失败：${p.get("msg") ?? "未知错误"}`);
    window.history.replaceState(null, "", window.location.pathname);
    q.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authorize = async (id: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await Remote.oauthStart(id);
      if (r.status === "redirect" && r.authorizeUrl) {
        window.location.href = r.authorizeUrl; // 跳外部授权页，回来落在 ?oauth=ok
        return;
      }
      setMsg("已有有效授权 ✓");
      q.reload();
    } catch (e: any) {
      setMsg(`发起授权失败：${e?.message ?? "未知错误"}`);
    } finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await Remote.add({
        name: form.name.trim(), url: form.url.trim(),
        clientId: form.clientId.trim() || undefined,
        clientSecret: form.clientSecret.trim() || undefined,
        bearerToken: form.bearerToken.trim() || undefined,
      });
      setForm({ name: "", url: "", clientId: "", clientSecret: "", bearerToken: "" });
      if (r.needsAuth) {
        setMsg("已添加，该服务器要求 OAuth 授权，正在跳转…");
        await authorize(r.id);
        return;
      }
      setMsg(`已添加 · 发现 ${r.discovered} 个工具`);
      q.reload();
    } catch (e: any) {
      setMsg(e?.message ?? "添加失败");
    } finally { setBusy(false); }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`删除远程服务器「${name}」？这会同时清理其孤儿技能。`)) return;
    await Remote.remove(id);
    q.reload();
  };

  const rediscover = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await Remote.rediscover();
      setMsg(`重新发现完成 · 共 ${r.seeded} 个工具`);
      q.reload();
    } catch (e: any) { setMsg(e?.message ?? "重新发现失败"); }
    finally { setBusy(false); }
  };

  const servers = q.data?.servers ?? [];

  return (
    <div className="frame">
      <PageHead
        eyebrow="REMOTE · 遠端"
        title="远程 MCP 接入"
        lede={<>把第三方 MCP 服务器并入本中枢做纯中转。它们的工具会以 <code style={{ background: "var(--bg-tint)", padding: "1px 5px", borderRadius: "var(--radius-s)" }}>rmcp__&lt;server&gt;__&lt;tool&gt;</code> 出现在技能页（默认按服务器自动成组）。</>}
        actions={<>
          <button className="btn ghost" onClick={rediscover} disabled={busy}>↻ 重新发现</button>
        </>}
      />

      {msg && <div className="hint-box" style={{ marginBottom: 14 }}>{msg}</div>}

      {q.loading && <div className="card"><div className="card-body" style={{ color: "var(--text-3)" }}>载入中…</div></div>}

      {servers.length === 0 && !q.loading && (
        <div className="card"><div className="card-body" style={{
          color: "var(--text-3)", textAlign: "center", padding: 32,
        }}>尚未接入任何远程服务器。在下面填写后点「添加并发现」。</div></div>
      )}

      {servers.map(s => (
        <article key={s.id} className="rcard">
          <div>
            <div className="rh">
              <span className="nm">{s.name}</span>
              <span className="id">{s.id}</span>
              <span className={`tag ${s.status === "online" || s.status === "ok" ? "ok" : s.needsAuth ? "warn" : "err"}`}>
                {s.status === "online" || s.status === "ok" ? "ONLINE" : s.needsAuth ? "待授权" : s.status.toUpperCase()}
              </span>
              <span className="tag line">{authModeLabel(s)}</span>
            </div>
            <div className="url">{s.url}</div>
            <div className="meta">
              <span><span className="k">工具数</span>{s.toolCount}</span>
            </div>
            {s.lastError && !s.needsAuth && (
              <div className="err"><strong>错误：</strong>{s.lastError}</div>
            )}
          </div>
          <div className="ops">
            {(s.needsAuth || (s.authMode === "oauth" && !s.oauthAuthorized)) && (
              <button className="btn primary sm" disabled={busy} onClick={() => authorize(s.id)}>去授权 →</button>
            )}
            {s.authMode === "oauth" && s.oauthAuthorized && !s.needsAuth && (
              <button className="btn ghost sm" disabled={busy} onClick={() => authorize(s.id)} title="刷新/重新授权">重新授权</button>
            )}
            <button className="btn danger sm" onClick={() => remove(s.id, s.name)}>删除</button>
          </div>
        </article>
      ))}

      {/* 添加表单 —— 字段对齐 claude.ai 自定义连接器 */}
      <section className="add-remote">
        <h3>添加远程服务器</h3>
        <div className="form-grid">
          <div className="field">
            <label>名称 *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例：Notion MCP" />
          </div>
          <div className="field">
            <label>Remote MCP server URL *</label>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://.../mcp" />
          </div>
          <div className="field">
            <label>OAuth Client ID（可选）</label>
            <input value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} placeholder="服务器不支持动态注册时填" />
          </div>
          <div className="field">
            <label>OAuth Client Secret（可选 · 不会回显）</label>
            <input type="password" value={form.clientSecret} onChange={e => setForm(f => ({ ...f, clientSecret: e.target.value }))} placeholder="配合 Client ID 使用" />
          </div>
          <div className="field full">
            <label>Bearer Token（可选 · 静态 token 服务器用 · 不会回显）</label>
            <input type="password" value={form.bearerToken} onChange={e => setForm(f => ({ ...f, bearerToken: e.target.value }))} placeholder="sk-..." />
          </div>
        </div>
        <div className="form-actions">
          <span style={{ color: "var(--text-3)", fontSize: 12.5, marginRight: "auto" }}>
            开放服务器直接连；要求 OAuth 的服务器添加后会自动跳转授权登录。
          </span>
          <button className="btn primary" disabled={busy || !form.name.trim() || !form.url.trim()} onClick={submit}>
            {busy ? "处理中…" : "添加并发现"}
          </button>
        </div>
      </section>
    </div>
  );
}

function authModeLabel(s: RemoteServer): string {
  switch (s.authMode) {
    case "oauth": return s.oauthAuthorized ? "OAuth · 已授权" : "OAuth";
    case "bearer": return "Bearer";
    case "bearer-env": return "Bearer(env)";
    default: return s.needsAuth ? "OAuth" : "开放";
  }
}
