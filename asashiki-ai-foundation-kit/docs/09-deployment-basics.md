# 09 Deployment Basics

## 1. 当前推荐部署方式

当前仓库的推荐首发方式仍然是：

- VPS 上运行 `core-api` + `mcp-gateway`
- 使用 `Docker Compose`
- 使用 NPM 或同类反代
- 域名继续走 Cloudflare
- 生产状态查看先使用 `core-api` 的 `/console`
- `admin-web` / `public-web` 暂时保留为实验页面，不做正式发布

## 2. 为什么现在这样最稳

因为当前真正需要长期在线的只有两个私有服务：

- `core-api`
- `mcp-gateway`

而且它们之间依赖关系非常明确：

- `mcp-gateway` 依赖 `core-api`
- `core-api` 需要 SQLite 持久化
- 当前又新增了远程 MCP 环境变量
- 当前还需要把 VPS 的 `/opt/asashiki/Asashiki_Archive` 只读挂载给 `core-api`

这种情况下，`Docker Compose` 比临时手工起服务更容易维护。

## 3. 生产环境变量

先复制模板：

```bash
cp .env.production.example .env.production
```

### 3.1 NPM 反代模式必须注意的绑定地址

如果你要让 NPM 通过宿主机 IP 转发，必须保持：

```dotenv
CORE_API_BIND_HOST=0.0.0.0
MCP_GATEWAY_BIND_HOST=0.0.0.0
```

如果 `docker compose ps` 里仍显示：

- `127.0.0.1:4100->4100/tcp`
- `127.0.0.1:4200->4200/tcp`

那就先查：

1. `.env.production` 里的 bind host
2. 启动命令有没有带 `--env-file .env.production`

不要先查 Cloudflare 或 NPM。

### 3.2 Archive 配置

VPS 宿主机上的个人资料目录：

```dotenv
ASASHIKI_ARCHIVE_HOST_PATH=/opt/asashiki/Asashiki_Archive
```

容器内读取路径：

```dotenv
ASASHIKI_ARCHIVE_ROOT=/archive
```

日记目录默认自动查找：

- `/archive/Obsidian_Asashiki/日记`
- `/archive/日记`

如果以后你的实际目录不同，再显式设置：

```dotenv
ASASHIKI_DIARY_DIR=/archive/Obsidian_Asashiki/日记
```

这个挂载是只读的。当前 MCP 只允许读取 Archive 和日记，不给 agent 任意文件写权限。

### 3.3 极简文字状态页

`core-api` 提供：

```text
https://api.asashiki.com/console
```

生产环境建议设置：

```dotenv
ADMIN_PANEL_TOKEN=替换成你的长随机密码
```

访问 `/console` 时使用 Basic Auth：

- 用户名：`admin`
- 密码：`ADMIN_PANEL_TOKEN`

这个页面只用于查看必要状态，不作为长期复杂控制台。

### 3.4 远程 MCP 配置

当前 `core-api` 支持通过环境变量接入上游远程 MCP：

```dotenv
REMOTE_MCP_SERVERS_JSON=[{"id":"supabase","name":"Supabase Remote MCP","url":"https://mcp.supabase.com/mcp?project_ref=zwpopwhdfmqtamkdcwkb&read_only=true","description":"只读 Supabase MCP（用于浏览工具与测试查询）","bearerTokenEnv":"SUPABASE_MCP_ACCESS_TOKEN"}]
SUPABASE_MCP_ACCESS_TOKEN=替换成你的真实 token
```

说明：

- `REMOTE_MCP_SERVERS_JSON` 是上游 MCP 注册表
- `bearerTokenEnv` 表示这个 MCP 要去哪个环境变量里取 Bearer Token
- token 不放前端，也不写死在仓库
- 不配置这一段时，远程 MCP 功能视为未启用，但不会阻断主系统启动

### 3.5 旧的时间日志试点变量

当前仓库仍保留专用时间日志试点：

```dotenv
SUPABASE_TIME_LOG_URL=
SUPABASE_TIME_LOG_BEARER_TOKEN=
SUPABASE_TIME_LOG_NAME=Supabase 时间日志
```

这条链路继续用于“某个时间点我在做什么”的业务查询。

启用判定：

- `SUPABASE_TIME_LOG_URL` 有值：time-log integration 启用
- `SUPABASE_TIME_LOG_URL` 为空：time-log integration 未启用

重要原则：

- 未配置的可选集成不能阻断整个 app 启动
- 所以即使 `SUPABASE_TIME_LOG_URL` 和 `SUPABASE_TIME_LOG_BEARER_TOKEN` 都留空，只要主系统配置没问题，`core-api` 也必须能启动

## 4. 首轮部署命令

```bash
docker compose --env-file .env.production -f infra/docker/compose.yaml up -d --build
docker compose --env-file .env.production -f infra/docker/compose.yaml run --rm core-api pnpm --filter @asashiki/core-api db:init
docker compose --env-file .env.production -f infra/docker/compose.yaml run --rm core-api pnpm --filter @asashiki/core-api db:seed
docker compose --env-file .env.production -f infra/docker/compose.yaml ps
curl http://127.0.0.1:4100/health
curl http://127.0.0.1:4200/health
curl http://127.0.0.1:4100/api/archive/status
curl https://api.asashiki.com/health
curl https://mcp.asashiki.com/health
```

## 5. VPS 更新到最新版的固定流程

你的 VPS 路径现在是：

```bash
/root/apps/asashiki-ai/asashiki-ai
```

以后每次更新，建议固定按这套来：

```bash
cd /root/apps/asashiki-ai/asashiki-ai
git pull origin main
docker compose --env-file .env.production -f infra/docker/compose.yaml down
docker compose --env-file .env.production -f infra/docker/compose.yaml up -d --build
docker compose --env-file .env.production -f infra/docker/compose.yaml ps
curl http://127.0.0.1:4100/health
curl http://127.0.0.1:4200/health
curl http://127.0.0.1:4100/api/archive/status
curl http://127.0.0.1:4100/api/archive/diary
curl https://api.asashiki.com/health
curl https://mcp.asashiki.com/health
```

### 什么时候需要再跑数据库初始化

只有在出现数据库结构变更时，才额外跑：

```bash
docker compose --env-file .env.production -f infra/docker/compose.yaml run --rm core-api pnpm --filter @asashiki/core-api db:init
```

当前这一轮“远程 MCP 注册表”更新本身不需要重新 `db:seed`。

## 6. 停服 / 回滚

停服：

```bash
docker compose --env-file .env.production -f infra/docker/compose.yaml down
```

重建：

```bash
docker compose --env-file .env.production -f infra/docker/compose.yaml up -d --build
```

如果 `git pull` 后出现问题：

1. 回到上一个已验证 commit
2. 重新执行 `docker compose ... up -d --build`

## 7. 验收清单

至少确认以下 10 项：

1. `docker compose --env-file .env.production -f infra/docker/compose.yaml ps`
2. `curl http://127.0.0.1:4100/health`
3. `curl http://127.0.0.1:4200/health`
4. `curl https://api.asashiki.com/health`
5. `curl https://mcp.asashiki.com/health`
6. `curl http://127.0.0.1:4100/api/archive/status`
7. `curl http://127.0.0.1:4100/api/archive/diary`
8. 浏览器能打开 `https://api.asashiki.com/console`
9. Claude 或其他 MCP client 能连 `https://mcp.asashiki.com/mcp`
10. `listTools` 能看到 Archive 相关工具

## 8. 当前已知限制

- `core-api` 仍使用 Node 24 的 `node:sqlite`，运行测试和 smoke 时会有 experimental warning
- 远程 MCP 当前仍是 Codex 协助登记配置，控制台先负责查看和测试，不负责完整自助配置
- `admin-web` / `public-web` 还不是现在的正式上线目标
