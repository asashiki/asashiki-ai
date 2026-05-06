# Documentation.md

## 当前状态

项目方向已经从“个人 AI 控制台网页”收敛为“VPS 上运行的个人 MCP 应用”。

当前生产核心是：

- `core-api`
  - 数据、连接器、Archive、日记、远程 MCP 注册和极简文字状态页。
- `mcp-gateway`
  - 对 Claude、ChatGPT、Codex、Claude Code 等 MCP 客户端暴露工具。

`admin-web` 和 `public-web` 暂时保留为历史/实验页面，不作为当前生产重点。

## 当前新增能力

- 根目录新增 `AGENTS.md`，远程 Codex / Claude Code 进入仓库后必须优先读取。
- VPS Archive 只读挂载：
  - 宿主机：`/opt/asashiki/Asashiki_Archive`
  - 容器内：`/archive`
- Archive 自动查找日记目录：
  - `ASASHIKI_DIARY_DIR`
  - `/archive/Obsidian_Asashiki/日记`
  - `/archive/日记`
- Core API 新增：
  - `GET /console`
  - `GET /api/archive/status`
  - `GET /api/archive/diary`
  - `GET /api/archive/diary/:date`
- MCP Gateway 新增：
  - `get_archive_status`
  - `list_diary_entries`
  - `read_diary_entry`

## 当前 MCP 工具面

- `read_profile_summary`
- `get_recent_context`
- `create_journal_draft`
- `get_health_summary`
- `get_connector_status`
- `get_archive_status`
- `list_diary_entries`
- `read_diary_entry`
- `lookup_time_log_at`

## 当前部署原则

- VPS 只部署 `core-api` 和 `mcp-gateway`。
- NPM 反代模式下，`.env.production` 必须设置：
  - `CORE_API_BIND_HOST=0.0.0.0`
  - `MCP_GATEWAY_BIND_HOST=0.0.0.0`
- 所有生产 compose 命令必须带：

```bash
docker compose --env-file .env.production -f infra/docker/compose.yaml ...
```

## 当前文档策略

历史 milestone 文档仍保留在 `asashiki-ai-foundation-kit/docs/`，但远程开发时优先看：

1. `AGENTS.md`
2. `README.md`
3. `.env.production.example`
4. `infra/docker/compose.yaml`
5. 本文件

后续不要继续堆大段 milestone 叙事。新的说明应直接围绕“怎么部署、怎么测、怎么扩展 MCP 工具”来写。
