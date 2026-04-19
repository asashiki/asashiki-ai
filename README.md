# Asashiki AI Foundation

当前仓库已完成 Milestone 7，下一步进入 Milestone 8：重点从“部署跑稳”转向“让 `admin-web` 成为主控制台”，并接入第一个真实外部数据源试点。

## 当前结构

```text
apps/
  admin-web/
  core-api/
  mcp-gateway/
  public-web/
packages/
  config/
  schemas/
asashiki-ai-foundation-kit/
  Prompt.md
  Plan.md
  Documentation.md
```

`asashiki-ai-foundation-kit/` 保留为规划与决策文档区；实际代码从仓库根目录的 `apps/` 与 `packages/` 开始。

## 快速开始

1. 安装依赖

   ```bash
   pnpm install
   ```

2. 为 Node 服务复制根环境变量模板

   ```powershell
   Copy-Item ".env.example" ".env"
   ```

3. 如需覆盖前端默认 API 地址，可分别复制：

   ```powershell
   Copy-Item "apps/public-web/.env.example" "apps/public-web/.env"
   Copy-Item "apps/admin-web/.env.example" "apps/admin-web/.env"
   ```

4. 启动前端聚合进程

   ```bash
   pnpm dev:web
   ```

5. 启动服务聚合进程

   ```bash
   pnpm dev:services
   ```

也可以直接运行 `pnpm dev` 一次启动四个进程。

## 默认端口

- Public Web: `3000`
- Admin Web: `3001`
- Core API: `4100`
- MCP Gateway: `4200`

## Admin Dashboard 当前能力

- `Overview`: 查看系统总览、数据流完整度和最近注意事项
- `Profile`: 直接在控制台编辑 profile summary 与 top preferences
- `Journals`: 查看 drafts / entries，并通过表单创建新的 journal draft
- `Connectors`: 查看连接器状态、能力、暴露等级与最近错误
- `MCP Tools`: 读取工具目录并逐个执行 smoke test
- `Activity`: 查看 Core API / MCP Gateway 运行状态、审计事件和数据面完整度

当前 `admin-web` 已支持“局部失败可见”：当服务抽风、某几项数据取不到时，控制台仍会保留页面结构，并明确提示哪些数据面不可用。

## Public Status 复用入口

- 当前静态组件配置文件: [apps/public-web/src/public-status.config.ts](/C:/Users/Hey/Desktop/asashiki-ai-foundation/apps/public-web/src/public-status.config.ts)
- 当前可复用组件包: [packages/public-status-widget](/C:/Users/Hey/Desktop/asashiki-ai-foundation/packages/public-status-widget)
- 当前 API snapshot: [apps/core-api/snapshots/public-status.snapshot.json](/C:/Users/Hey/Desktop/asashiki-ai-foundation/apps/core-api/snapshots/public-status.snapshot.json)
- 静态前端接入说明: [08-public-status-widget.md](/C:/Users/Hey/Desktop/asashiki-ai-foundation/asashiki-ai-foundation-kit/docs/08-public-status-widget.md)

## MCP Gateway 当前能力

- `read_profile_summary`
- `get_recent_context`
- `create_journal_draft`
- `get_health_summary`
- `get_connector_status`

当前真实 MCP 服务入口位于 `http://127.0.0.1:4200/mcp`，本地可通过 Streamable HTTP MCP client 连接。
同时也提供了控制台专用的 HTTP 辅助入口：

- `GET /tools/catalog`
- `POST /tools/:toolId/test`

## 部署资产

- Docker Compose 样例: [infra/docker/compose.yaml](/C:/Users/Hey/Desktop/asashiki-ai-foundation/infra/docker/compose.yaml)
- Docker runtime image: [infra/docker/Dockerfile](/C:/Users/Hey/Desktop/asashiki-ai-foundation/infra/docker/Dockerfile)
- PM2 样例: [infra/pm2/ecosystem.config.cjs](/C:/Users/Hey/Desktop/asashiki-ai-foundation/infra/pm2/ecosystem.config.cjs)
- Cloudflare Tunnel 样例: [infra/cloudflare/tunnel.config.example.yml](/C:/Users/Hey/Desktop/asashiki-ai-foundation/infra/cloudflare/tunnel.config.example.yml)
- 部署手册: [09-deployment-basics.md](/C:/Users/Hey/Desktop/asashiki-ai-foundation/asashiki-ai-foundation-kit/docs/09-deployment-basics.md)
- 生产环境模板:
  - [.env.production.example](/C:/Users/Hey/Desktop/asashiki-ai-foundation/.env.production.example)
  - [apps/public-web/.env.production.example](/C:/Users/Hey/Desktop/asashiki-ai-foundation/apps/public-web/.env.production.example)
  - [apps/admin-web/.env.production.example](/C:/Users/Hey/Desktop/asashiki-ai-foundation/apps/admin-web/.env.production.example)

当前服务容器默认仅绑定到 `127.0.0.1`；如需配合 NPM 等反代场景对外监听，可在 `.env.production` 中改写 `CORE_API_BIND_HOST` / `MCP_GATEWAY_BIND_HOST` 为 `0.0.0.0`，并使用 `docker compose --env-file .env.production -f infra/docker/compose.yaml up -d --build` 让 Compose 同时读取端口映射和容器环境变量。

## 当前发布边界

- 已验证并允许：VPS 上的 `core-api` / `mcp-gateway`、NPM 反代、Cloudflare 域名路由、Claude 远程 MCP smoke
- 只做本地预览：`public-web`
- 当前不做：`asashiki.com` 主站替换、Public Web 正式 Cloudflare Pages 发布、Admin Dashboard 正式公网发布

## 下一阶段方向

- `admin-web` 优先：把核心文本数据与连接器状态尽量搬到控制台里管理
- `public-web` 冻结：当前不继续扩展公开页面
- MCP / 连接器先由 Codex 接入：控制台先负责查看、启用/禁用、测试
- 第一个真实外部数据源试点：Supabase 时间日志只读接入

具体执行方案见：
- [10-admin-first-execution-plan.md](/C:/Users/Hey/Desktop/asashiki-ai-foundation/asashiki-ai-foundation-kit/docs/10-admin-first-execution-plan.md)

## 数据初始化

```bash
pnpm db:init
pnpm db:seed
```

## 验证命令

```bash
pnpm install
pnpm db:init
pnpm db:seed
pnpm build
pnpm --filter @asashiki/public-web dev
pnpm --filter @asashiki/public-web preview
pnpm typecheck
pnpm test
pnpm smoke
pnpm public:snapshot
```
