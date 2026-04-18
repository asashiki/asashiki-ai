# 05 Ops Handbook

## 1. What this handbook is for

这个手册给未来的你和 Codex 用，主要解决三类事：

- 系统怎么启动
- 出问题时先看哪里
- 新增能力时怎么判断该改哪些地方

## 2. Operational checklist for MVP

### Before local run
- env 模板存在
- seed 数据存在
- 数据库初始化脚本存在
- README 的 run 命令已更新

### Local bootstrap commands
```bash
pnpm install
pnpm db:init
pnpm db:seed
pnpm dev:services
pnpm dev:web
```

当前 Core API 的本地数据库默认位于 `apps/core-api/data/core-api.sqlite`。

### Before deployment
- public / private 域名划分明确
- secrets 不在仓库
- public API 已确认不会泄露 private data
- admin 保护策略已选定
- VPS 上的启动方式已定（默认 `Docker Compose`，备用 `PM2`）
- `api-internal` 与 `mcp` 的 Access 规则已配置

### Deployment asset map
- Docker Compose: `infra/docker/compose.yaml`
- Dockerfile: `infra/docker/Dockerfile`
- PM2 config: `infra/pm2/ecosystem.config.cjs`
- Tunnel config example: `infra/cloudflare/tunnel.config.example.yml`
- Deployment runbook: `docs/09-deployment-basics.md`

## 3. Troubleshooting map

### Public page has no data
先查：
1. public API 是否在线
2. CORS / fetch 地址是否正确
3. 前端请求的字段是否属于 public 区
4. `public-status.config.ts` 里的 endpoint / polling 配置是否正确
5. Pages 环境变量里的 `VITE_CORE_API_BASE_URL` 是否仍指向本地地址

### Admin page cannot load
先查：
1. Core API 是否在线
2. CORS 是否允许 `3001` 和 `3000` 的开发请求
3. auth/Access 是否拦截
4. schema 是否变更但前端没同步
5. Admin 生产环境变量是否指向 `api-internal` / `mcp`

### Admin MVP smoke checklist
1. `pnpm dev:services` 与 `pnpm dev:web` 均可启动
2. `http://127.0.0.1:3001` 可返回页面
3. Overview 能看到 seed 数据
4. Journals 页面能创建一条 draft
5. Connectors / Health / Activity 页面均有内容

### MCP tools not visible
先查：
1. MCP Gateway 是否在线
2. tool list 是否成功注册
3. Core API 依赖是否导致 MCP 启动失败
4. `/mcp` 是否可被 MCP client 正常初始化
5. `MCP_CORE_API_BASE_URL` 是否仍指向容器内或宿主机错误地址

### MCP tool call fails
先查：
1. 该工具是否映射到了正确的 Core API
2. payload schema 是否匹配
3. 是否有审计记录
4. 是否属于被禁止的数据区

### MCP MVP smoke checklist
1. `pnpm dev:services` 能启动 Core API 与 MCP Gateway
2. MCP client 能连接 `http://127.0.0.1:4200/mcp`
3. `listTools` 至少返回 5 个工具
4. `read_profile_summary`、`get_health_summary`、`create_journal_draft` 至少 3 个工具调用成功
5. `create_journal_draft` 后 Admin 中可看到新 draft

### Journal draft not saved
先查：
1. Core API 日记写入是否成功
2. 数据库记录是否创建
3. audit 是否记录
4. Admin 是否读的是同一数据源

### Tunnel / Access deployment checklist
1. `cloudflared` 所在主机能访问本机 `4100` 与 `4200`
2. Tunnel ingress hostname 与实际子域一致
3. `api-internal` 与 `mcp` 有 Access 规则
4. public 域名未错误复用 private hostname

### Docker Compose checks
1. `.env.production` 存在
2. `docker compose -f infra/docker/compose.yaml up -d --build` 成功
3. `docker compose -f infra/docker/compose.yaml ps` 中两个服务均为 `healthy` 或 `running`
4. `docker compose -f infra/docker/compose.yaml logs` 中无循环崩溃

### PM2 checks
1. `pnpm build` 已执行
2. `pm2 start infra/pm2/ecosystem.config.cjs --env production` 成功
3. `pm2 save` 已执行
4. `pm2 startup` 已执行并完成系统注册

## 4. When adding a new feature

新增能力时必须过一遍：

- 这是哪个模块？
- 属于哪个数据区？
- 需要几个 UI 面？
- 是 API 还是 MCP，还是两者都要？
- 是否需要审计？
- 是否应该出现在 public？
- 是否真的属于第一阶段？

## 5. Change checklist by feature type

### New connector
必须更新：
- connector model
- connector status summary
- admin connectors page
- ops handbook
- documentation log

### New MCP tool
必须更新：
- docs/04-api-and-mcp-surface.md
- tool schema
- gateway mapping
- audit behavior
- documentation log
- deployment docs（如新增公网/私网入口）

### New private data type
必须更新：
- docs/03-module-boundaries.md
- data model
- access rules
- admin visibility
- public exclusion check

## 6. Recommended release ritual

每次较大改动后：

1. 更新文档
2. 跑验证
3. 记录变更点
4. 记录已知问题
5. 再进入下一 milestone
