# 09 Deployment Basics

## 1. Scope of Milestone 6

这一轮只解决三件事：

- 首轮怎么部署
- 域名怎么分
- 出问题时先查哪里

第一阶段仍然保持简单：

- Public Web 走 Cloudflare Pages
- Core API 与 MCP Gateway 走单台 VPS
- 不做 k8s
- 不做多机
- 不做复杂 secret manager

## 2. Deployment decision

### Recommendation
- `Docker Compose` 作为 VPS 默认部署方式
- `PM2` 作为备用方案，仅在你明确希望直接用宿主机 Node 进程时启用

### Why Docker Compose first
- 这里只有两个常驻私有服务，Compose 足够轻
- 服务依赖关系清晰，`mcp-gateway` 明确依赖 `core-api`
- SQLite volume、端口映射、重启策略都能放在一个文件里
- 新人更容易一眼看懂服务拓扑和环境变量入口

### When PM2 is still reasonable
- 你明确不想装 Docker
- 你更想直接看宿主机文件和日志
- 你需要最快的“Node 进程常驻”调试路径

## 3. Recommended first topology

### Public side
- `example.com` 或 `www.example.com` -> Public Web on Cloudflare Pages
- `api.example.com` -> 只暴露 `public/*` 读接口的公共入口

### Private side
- `api-internal.example.com` -> Core API private origin
- `mcp.example.com` -> MCP Gateway private origin

### Admin side
- 第一阶段建议保留两种策略之一：
- 远程管理优先: `admin.example.com` 作为单独静态前端，再加 Cloudflare Access
- 极简上线优先: 先不公开部署 Admin，只保留本地开发访问

⚠️ 不确定因素: 你的 Admin 是否必须在第一天就远程可用。
- 假设: 当前首轮目标是先跑通 Public + Core services + MCP
- 决策: 把 `admin.example.com` 定义为可选位，不阻塞首轮部署
- 备选: 如你确认需要远程 Admin，可在 Cloudflare 侧为该子域增加 Access 保护

## 4. Repo assets added for deployment

- Docker runtime image: `infra/docker/Dockerfile`
- Compose stack: `infra/docker/compose.yaml`
- PM2 fallback config: `infra/pm2/ecosystem.config.cjs`
- Cloudflare Tunnel example: `infra/cloudflare/tunnel.config.example.yml`
- VPS env template: `.env.production.example`
- Static frontend env templates:
  - `apps/public-web/.env.production.example`
  - `apps/admin-web/.env.production.example`

## 5. First deployment walkthrough

### 5.1 Public Web on Cloudflare Pages

构建目录：
- `apps/public-web/dist`

建议的 Pages build 设置：
- Root directory: repository root
- Build command: `pnpm install --frozen-lockfile && pnpm --filter @asashiki/public-web build`
- Build output directory: `apps/public-web/dist`

前端运行时变量：
- `VITE_CORE_API_BASE_URL=https://api.example.com`

### 5.2 VPS services with Docker Compose

1. 复制生产环境模板

```bash
cp .env.production.example .env.production
```

2. 构建并启动服务

```bash
docker compose -f infra/docker/compose.yaml up -d --build
```

3. 初始化数据库

```bash
docker compose -f infra/docker/compose.yaml run --rm core-api pnpm --filter @asashiki/core-api db:init
docker compose -f infra/docker/compose.yaml run --rm core-api pnpm --filter @asashiki/core-api db:seed
```

4. 检查健康状态

```bash
curl http://127.0.0.1:4100/health
curl http://127.0.0.1:4200/health
```

### 5.3 VPS services with PM2

1. 安装依赖并构建

```bash
pnpm install --frozen-lockfile
pnpm build
```

2. 初始化数据库

```bash
pnpm --filter @asashiki/core-api db:init
pnpm --filter @asashiki/core-api db:seed
```

3. 启动服务

```bash
pm2 start infra/pm2/ecosystem.config.cjs --env production
pm2 save
```

4. 开机自启

```bash
pm2 startup
```

## 6. Cloudflare plan

### DNS and access split
- `example.com` / `www` -> Pages public site
- `api.example.com` -> Tunnel 到 `127.0.0.1:4100`，只用于 public API
- `api-internal.example.com` -> Tunnel 到 `127.0.0.1:4100`，必须加 Access
- `mcp.example.com` -> Tunnel 到 `127.0.0.1:4200`，必须加 Access

### Why two API hostnames
- 公开读接口和私有运维接口共享同一个 Core API 进程，但访问策略不同
- 先通过域名策略分区，比过早拆服务更省事
- 后面若需要更严格隔离，再把 public read model 独立出去

### Tunnel file usage
将 `infra/cloudflare/tunnel.config.example.yml` 改成实际 tunnel id 与域名后，再让 `cloudflared` 读取。

当前样例默认只映射私有服务；如果你要把 `api.example.com` 也走 Tunnel，可以在同一个文件里补一个公开 hostname。

## 7. Debug flow

### Symptom: Public site loads but cards are empty
先查：
1. `VITE_CORE_API_BASE_URL` 是否指向公开可读入口
2. `GET /public/status` 与 `GET /public/cards` 是否返回 `200`
3. Public 域名是否误指向了 private host

### Symptom: MCP client cannot list tools
先查：
1. `mcp.example.com` 是否能打到 `4200`
2. MCP Gateway 的 `MCP_CORE_API_BASE_URL` 是否仍指向可达的 Core API
3. `GET /health` 与 `GET /tools` 是否先成功

### Symptom: Admin can open but write fails
先查：
1. Admin 前端的 `VITE_CORE_API_BASE_URL` 是否指到 private Core API
2. Core API 是否能写入 SQLite 文件
3. audit recent 是否出现失败记录

### Symptom: Docker stack starts but service keeps restarting
先查：
1. `docker compose -f infra/docker/compose.yaml logs core-api`
2. `docker compose -f infra/docker/compose.yaml logs mcp-gateway`
3. `.env.production` 是否遗漏 `MCP_CORE_API_BASE_URL`
4. volume 中的 SQLite 路径是否与 `CORE_API_DB_PATH` 一致

### Symptom: PM2 starts but reboot后服务没回来
先查：
1. 是否执行过 `pm2 save`
2. 是否执行过 `pm2 startup`
3. Node 升级后是否重新生成 startup script

## 8. First deployment checklist

- `.env.production` 已创建
- Public Web 已在 Pages 构建成功
- `core-api` 与 `mcp-gateway` 健康检查通过
- Tunnel / DNS 指向正确
- `api-internal` 与 `mcp` 已加 Access
- public 域名只暴露 `public/*`

## 9. Next upgrade boundary

以下任一条件出现时，再考虑从 Milestone 6 升级部署复杂度：

- SQLite 开始变成并发瓶颈
- 需要多环境一致的容器镜像发布流程
- 需要把 public read model 从 Core API 中独立出去
- 需要远程 Admin 成为正式生产入口
