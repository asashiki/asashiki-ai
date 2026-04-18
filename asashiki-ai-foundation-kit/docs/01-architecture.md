# 01 Architecture

## 1. What we are actually building

你要做的不是某个 agent 的“私有脑袋”，而是一套**个人 AI 控制平面**。

它的本体应该分成四层：

1. Public Web  
   用于公开展示，Cloudflare-first。

2. Admin Dashboard  
   用于你自己查看和操作系统。

3. Core API  
   系统中枢。所有业务逻辑、数据边界、写入规则都在这里。

4. MCP Gateway  
   对外工具层。agent 通过它接入系统能力。

## 2. Why this shape

这个结构能解决你最核心的问题：

- 你换 agent，不用重建个人资料和数据
- 公开页面不碰隐私数据
- 私密数据不直接暴露给 agent
- MCP 只是出口，不是数据库本体
- 后续新增能力时，不会每个 agent 都各配一遍

## 3. Recommended MVP topology

### Public
- `asashiki.com`
- Cloudflare Pages / Cloudflare-first static hosting
- 调用只读公开 API 展示非敏感数据

### Private
- `api.asashiki.com`
- `mcp.asashiki.com`
- `admin.asashiki.com`

第一期推荐：

- `admin.asashiki.com`：私有后台
- `api.asashiki.com`：Core API
- `mcp.asashiki.com`：MCP Gateway

## 4. Recommended first-phase runtime layout

### Cloudflare side
- Public web hosting
- 可选边缘 fetch / proxy
- 可选 Access 保护 admin

### VPS side
- Core API
- MCP Gateway
- lightweight DB
- background sync jobs（极少）

## 5. Minimal module list

### Must-have
- profile
- journal
- connector registry
- health snapshot
- audit log
- public status
- admin UI
- MCP gateway

### Should-not-have-yet
- full memory graph
- vector DB
- browser worker farm
- generalized workflow engine
- dynamic external MCP router
- multi-agent registry
- full auth/RBAC platform

## 6. What “agent connected successfully” should mean

在第一期里，“一个 agent 连接了你的 MCP”应该只意味着：

- 它能发现少量工具
- 它能读到你统一整理过的摘要
- 它能调用统一的写入入口创建 Journal Draft
- 它能查看连接状态和健康状态概况

而不是：

- 它自动完全理解你的一切
- 它自动拥有所有记忆
- 它自动能接管所有账户和设备

## 7. Key design principle

**事实源在 Core API。**  
**MCP 只暴露经过筛选的能力。**  
**UI 只是查看和操作这些能力。**

## 8. Suggested directory model for the eventual repo

```text
asashiki-ai-foundation/
  apps/
    public-web/
    admin-web/
    core-api/
    mcp-gateway/
  packages/
    config/
    schemas/
    sdk/
    ui/
  docs/
  infra/
  scripts/
```

## 9. Suggested development order

1. repo scaffold
2. shared schemas
3. core API
4. admin dashboard
5. public status API
6. MCP gateway
7. deployment notes
