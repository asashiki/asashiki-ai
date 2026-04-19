# 04 API and MCP Surface

## 1. Core API 当前路由面

### Healthcheck

- `GET /health`
- `GET /api/runtime`

### Profile

- `GET /api/profile/summary`
- `PUT /api/profile/summary`

### Context

- `GET /api/context/recent`

### Journals

- `GET /api/journals`
- `POST /api/journals/drafts`
- `GET /api/journals/drafts/:id`

### Health

- `GET /api/health/summary`
- `GET /api/health/latest`

### Connectors

- `GET /api/connectors`
- `GET /api/connectors/summary`

### Remote MCP Registry

- `GET /api/remote-mcp/servers`
- `GET /api/remote-mcp/servers/:serverId/tools`
- `POST /api/remote-mcp/servers/:serverId/tools/:toolName/invoke`

### Supabase Time-log Pilot

- `GET /api/time-log/recent`
- `GET /api/time-log/lookup?at=...`

### Audit

- `GET /api/audit/recent`

### Public

- `GET /public/status`
- `GET /public/cards`
- `GET /public/widget-config`

## 2. Remote MCP Registry 的职责

这一层现在归 `core-api` 管，职责很明确：

- 读取环境变量里的远程 MCP 配置
- 在服务端主动连接上游 MCP
- 列出上游工具目录
- 提供控制台级的工具测试接口
- 把上游 MCP 汇总成连接中心里的一个连接来源

现阶段它不是：

- 任意第三方 MCP 的公网代理
- 任意工具的无边界转发层
- 一个自动把所有上游工具重新暴露给 `mcp-gateway` 的系统

当前目标只是先把“接得进来、看得见、测得通”这件事做稳。

## 3. Remote MCP 最小配置

当前用 `REMOTE_MCP_SERVERS_JSON` 配置远程 MCP：

```json
[
  {
    "id": "supabase",
    "name": "Supabase Remote MCP",
    "url": "https://mcp.supabase.com/mcp?project_ref=zwpopwhdfmqtamkdcwkb&read_only=true",
    "description": "只读 Supabase MCP",
    "bearerTokenEnv": "SUPABASE_MCP_ACCESS_TOKEN"
  }
]
```

当前支持的字段尽量保持最小：

- `id`
- `name`
- `url`
- `description`
- `bearerTokenEnv` 可选
- `headers` 可选

这个阶段仍然由 Codex 帮你登记配置，不要求你自己在控制台里手工新增。

## 4. 为什么 Supabase 要特殊说明

Supabase MCP 看起来只是一个 URL，但对“IDE 本机客户端”和“服务器侧项目后端”要分开理解：

- Codex / Claude Code
  - 它们自己就是 MCP 客户端
  - 可以走浏览器 OAuth 登录
- 你的 `core-api`
  - 也是一个 MCP 客户端，但运行在本地服务或 VPS 上
  - 不会自动复用你的 IDE 登录态

所以当前项目对 Supabase 的服务器侧推荐方式是：

- 仍然使用同一个 MCP URL
- 在服务端配置 Bearer Token
- Token 通过环境变量注入

这是为了让项目自己的后端能稳定连接，而不是依赖你本机 IDE 的登录状态。

## 5. MCP Gateway 当前工具面

当前 `mcp-gateway` 仍然只暴露项目自己的内部工具：

- `read_profile_summary`
- `get_recent_context`
- `create_journal_draft`
- `get_health_summary`
- `get_connector_status`
- `lookup_time_log_at`

辅助 HTTP 面：

- `GET /tools/catalog`
- `POST /tools/:toolId/test`

设计原则：

- 对 agent 暴露小而明确的工具面
- 对上游第三方 MCP 保持“先接入、先可测、再决定是否包装暴露”

## 6. 为什么没有直接做“任意 MCP 全代理”

因为这一步如果现在就做，很容易把边界打乱：

- 工具权限不可控
- 上游工具语义差异很大
- 前端很快会被复杂配置淹没
- 你的项目 MCP 会从“控制台后端”变成“第三方工具转发器”

当前更稳的路线是：

1. 先把上游 MCP 接入和测试做好
2. 再按真实需求挑一部分做业务包装
3. 最后才决定哪些要暴露给你自己的 MCP Gateway

## 7. 参考思路

这一轮实现主要参考了两类方案：

- 官方 MCP SDK 的客户端能力
  - `Client`
  - `StreamableHTTPClientTransport`
- MCPHub 这类“配置注册表 + 客户端管理 + 工具目录发现”的思路

参考链接：

- [Supabase MCP Docs](https://supabase.com/docs/guides/getting-started/mcp)
- [MCPHub](https://github.com/Cognitive-Stack/mcphub)
