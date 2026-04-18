# 06 Recommended Stack

## 1. First-phase recommendation

### Language
- TypeScript

理由：
- 对前后端共享 schema 友好
- 与多数现代 agent/frontend 项目生态一致
- 方便 Codex 在 monorepo 中统一处理

## 2. Repo model

- Monorepo
- package manager: `pnpm`

理由：
- 共享 schema / config / sdk 容易
- 后续 app 增加时不容易散

## 3. Frontend

### Public Web
保留 Cloudflare-first 静态托管思路。

### Admin
也建议前端化，但作为私有后台使用。

可选框架：
- Next.js
- React + Vite
- 任何你顺手的 TS 前端方案

第一阶段不在这里强行绑定，交给执行阶段确认。

## 4. Backend

### Core API
推荐：
- Node.js + TypeScript
- Fastify 或等价轻量方案

理由：
- 轻量
- 适合小 VPS
- 写 REST 接口和内部服务层舒服

### MCP Gateway
推荐：
- 单独一个小服务
- 只负责 tool 暴露与映射
- 不把核心业务塞在这里

## 5. Storage

### MVP recommendation
- SQLite first

理由：
- 最低运维成本
- 单 VPS / 单用户足够
- 适合快速跑通

### Upgrade path
- PostgreSQL later
- vector / graph later

## 6. Auth

### Public Web
- 无需复杂 auth

### Admin
第一阶段优先：
- 简单 app-level auth 或 Cloudflare Access

如果你想尽量省事并且已经在 Cloudflare 体系里，优先考虑 Cloudflare Access。

## 7. Deployment

第一阶段只需要明确思路：
- Public web: Cloudflare
- VPS services: `Docker Compose` first, `PM2` fallback
- 不做复杂编排
- 不做多机

### Milestone 6 conclusion
- 默认结论: `Docker Compose`
- 备用结论: `PM2`

理由：
- 当前只有两个常驻私有服务，Compose 足够轻且比 PM2 更容易表达服务关系、volume 与重启策略
- PM2 仍然保留，适合不想使用 Docker 的单机 Node 运维

## 8. Deferred dependencies

第一阶段不建议直接引入为硬依赖：

- Mem0
- Zep
- Letta
- n8n
- heavy vector DB
- browser automation stacks
- generalized connector platforms

## 9. Why not start with a memory platform

因为你现在最需要的是：
- 数据边界
- 统一写入口
- 统一摘要入口
- admin 可见性
- 连接状态

而不是先把“长期记忆”做得很酷。

## 10. Domain and edge recommendation

- Public site: Cloudflare Pages
- Public API hostname: `api.example.com`
- Private Core API hostname: `api-internal.example.com`
- Private MCP hostname: `mcp.example.com`
- Optional Admin hostname: `admin.example.com`

理由：
- 把公开与私有流量在域名层先切开，能降低第一阶段误暴露风险
- 仍然复用同一个 Core API 进程，不急着为公开读模型拆独立服务
