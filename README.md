# Asashiki AI Foundation

当前仓库已经进入 Milestone 8 的控制台优先阶段。
现在的重点不是继续铺公开站，而是把 `admin-web` 做成你真正能长期使用的个人 AI 控制台，并把外部能力通过“可登记、可查看、可测试”的方式接进来。

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

`asashiki-ai-foundation-kit/` 保留为规划与文档区；实际运行代码在根目录的 `apps/` 与 `packages/`。

## 快速开始

1. 安装依赖

   ```bash
   pnpm install
   ```

2. 复制环境变量模板

   ```powershell
   Copy-Item ".env.example" ".env"
   ```

3. 启动后端服务

   ```bash
   pnpm dev:services
   ```

4. 启动控制台

   ```bash
   pnpm --filter @asashiki/admin-web dev
   ```

5. 打开控制台

   - [http://127.0.0.1:3001](http://127.0.0.1:3001)

如需初始化本地数据库：

```bash
pnpm db:init
pnpm db:seed
```

## 默认端口

- Public Web: `3000`
- Admin Web: `3001`
- Core API: `4100`
- MCP Gateway: `4200`

## 项目目前是什么

你可以把它理解成一个“个人 AI 控制台后台”：

- `core-api`
  - 管理档案、记录、健康摘要、连接器、审计日志
  - 现在还负责连接上游远程 MCP 服务器，并把它们整理成控制台可读的状态和工具目录
- `mcp-gateway`
  - 暴露你自己的项目 MCP 工具面
  - 当前仍然是小而明确的内部工具，不等于任意上游 MCP 直通代理
- `admin-web`
  - 你主要使用的控制台
  - 现在已支持档案编辑、记录写入、连接中心、工具测试、局部失败可见
- `public-web`
  - 目前只保留本地预览，不作为当前阶段重点

## Admin Dashboard 当前能力

- `总览`
  - 查看服务在线状态、数据面完整度和需要注意的异常
- `档案`
  - 直接编辑 `profile summary` 和 `top preferences`
- `记录`
  - 查看草稿 / 归档记录，并创建新的 journal draft
- `连接中心`
  - 查看系统连接器状态
  - 查看已接入的上游远程 MCP
  - 浏览上游 MCP 工具目录
  - 直接在控制台里测试单个上游工具
- `工具测试`
  - 查看 `mcp-gateway` 当前暴露的内部工具
  - 对每个内部工具做 smoke test
- `系统状态`
  - 查看 Core API / MCP Gateway 健康状态、审计事件和数据面完整度

当前控制台支持“局部失败可见”：当某些接口拿不到数据时，页面不会整页崩掉，而是保留结构并明确提示哪个数据面失联。

## 上游远程 MCP 接入

这一轮开始，项目不再只围绕某个 Supabase 特例入口，而是新增了“通用远程 MCP 注册表”。

当前 `core-api` 支持：

- 通过 `REMOTE_MCP_SERVERS_JSON` 登记多个远程 MCP
- 在服务端主动连接这些远程 MCP
- 读取它们的工具目录
- 在控制台里测试单个工具
- 把这些上游连接汇总进连接中心

### 配置方式

本地或 VPS `.env` / `.env.production` 中填写：

```env
REMOTE_MCP_SERVERS_JSON=[{"id":"supabase","name":"Supabase Remote MCP","url":"https://mcp.supabase.com/mcp?project_ref=zwpopwhdfmqtamkdcwkb&read_only=true","description":"只读 Supabase MCP","bearerTokenEnv":"SUPABASE_MCP_ACCESS_TOKEN"}]
SUPABASE_MCP_ACCESS_TOKEN=
```

字段说明尽量保持最小：

- `id`
- `name`
- `url`
- `description`
- `bearerTokenEnv` 可选，表示去哪个环境变量里取 Bearer Token

现阶段这类连接器仍由 Codex 帮你接入；控制台先负责“看状态、看工具、做测试”。

### 关于 Supabase MCP 的现实说明

如果你在 Codex / Claude Code 里配置过：

- `https://mcp.supabase.com/mcp?project_ref=...&read_only=true`

那说明“你的本机 MCP 客户端能连 Supabase MCP”。
但项目自己的后端在 VPS 上运行时，不会自动复用你本机 IDE 的登录态。

对于服务器侧 / CI 风格接入，Supabase 官方文档明确给出了 Bearer Token 方式，所以当前项目对 Supabase 远程 MCP 的推荐落地方式是：

- 项目后端使用同一个 MCP URL
- 通过 `Authorization: Bearer ...` 在服务端访问
- Token 存在环境变量里，不放到前端

参考：
- [Supabase MCP Docs](https://supabase.com/docs/guides/getting-started/mcp)

## Supabase 时间日志试点

项目里还保留了一个业务试点：

- `GET /api/time-log/recent`
- `GET /api/time-log/lookup?at=...`

它用来回答“某个时间点我在做什么”。
当前这条链路仍基于专用时间日志读取实现，方便先把业务体验跑通。

这意味着当前仓库里同时存在两层能力：

1. 通用远程 MCP 注册表
   - 用来接任意上游 MCP，并在控制台里查看和测试
2. 专用时间日志试点
   - 用来先把“时间点查询”这个具体功能跑通

后面如果要把时间日志完全切到 Supabase MCP 直连，会在现有通用层之上再做一层业务适配，而不是继续手搓新的特例架构。

## MCP Gateway 当前能力

当前项目自己的 MCP 工具面仍然保持“小而明确”：

- `read_profile_summary`
- `get_recent_context`
- `create_journal_draft`
- `get_health_summary`
- `get_connector_status`
- `lookup_time_log_at`

MCP 服务入口：

- `http://127.0.0.1:4200/mcp`

控制台辅助入口：

- `GET /tools/catalog`
- `POST /tools/:toolId/test`

## 生产部署提醒

VPS + Docker Compose + NPM 反代已经验证过。

如果是 NPM / 宿主机 IP 转发模式，记得：

- `.env.production` 里用 `CORE_API_BIND_HOST=0.0.0.0`
- `.env.production` 里用 `MCP_GATEWAY_BIND_HOST=0.0.0.0`
- 所有生产命令都带：

```bash
docker compose --env-file .env.production -f infra/docker/compose.yaml up -d --build
```

如果 `docker compose ps` 里仍显示：

- `127.0.0.1:4100->4100/tcp`
- `127.0.0.1:4200->4200/tcp`

那先查 bind host 和 Compose env loading，不要先查 Cloudflare / NPM。

## 当前发布边界

- 已验证并允许
  - VPS 上的 `core-api` / `mcp-gateway`
  - NPM 反代
  - Cloudflare 域名路由
  - Claude 远程 MCP smoke
- 只做本地预览
  - `public-web`
- 当前不做
  - `asashiki.com` 主站替换
  - Public Web 正式 Cloudflare Pages 发布
  - Admin Dashboard 正式公网发布

## 验证命令

```bash
pnpm install
pnpm db:init
pnpm db:seed
pnpm build
pnpm typecheck
pnpm test
pnpm smoke
pnpm --filter @asashiki/public-web dev
pnpm --filter @asashiki/public-web preview
pnpm public:snapshot
```

## 进一步阅读

- [asashiki-ai-foundation-kit/Documentation.md](/C:/Users/Hey/Desktop/asashiki-ai-foundation/asashiki-ai-foundation-kit/Documentation.md)
- [asashiki-ai-foundation-kit/docs/04-api-and-mcp-surface.md](/C:/Users/Hey/Desktop/asashiki-ai-foundation/asashiki-ai-foundation-kit/docs/04-api-and-mcp-surface.md)
- [asashiki-ai-foundation-kit/docs/09-deployment-basics.md](/C:/Users/Hey/Desktop/asashiki-ai-foundation/asashiki-ai-foundation-kit/docs/09-deployment-basics.md)
- [asashiki-ai-foundation-kit/docs/11-remote-mcp-registry.md](/C:/Users/Hey/Desktop/asashiki-ai-foundation/asashiki-ai-foundation-kit/docs/11-remote-mcp-registry.md)
