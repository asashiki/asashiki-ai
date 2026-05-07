# Asashiki AI Foundation

这是一个准备长期部署在 VPS 上的个人 MCP 应用。

它的核心目标不是做一个漂亮网页，而是做一个属于 Asashiki 的个人 AI 中枢：Claude、ChatGPT、Codex、Claude Code 和其他支持 MCP 的 agent 可以连接这个 MCP 服务，读取安全摘要、写入日记草稿、查看连接器状态，并逐步接入更多个人数据源和常用 MCP。

## 当前生产入口

当前重点只看两个服务：

- `core-api`
  - 端口：`4100`
  - 负责数据、状态、Archive、连接器和远程 MCP 注册。
  - 极简文字状态页：`/console`
- `mcp-gateway`
  - 端口：`4200`
  - 对外 MCP 入口：`/mcp`
  - 给 Claude / ChatGPT / Codex 等 agent 使用。

`admin-web` 和 `public-web` 暂时保留，但不再是当前生产重点。后续如果要做网页，会重新按“状态查看面板”方向设计，不先投入到复杂前端。

## VPS Archive

VPS 上的个人资料目录：

```text
/opt/asashiki/Asashiki_Archive
```

Docker 中会只读挂载为：

```text
/archive
```

日记目录自动查找顺序：

1. `ASASHIKI_DIARY_DIR` 指定的目录
2. `/archive/Obsidian_Asashiki/日记`
3. `/archive/日记`

当前已经支持通过 Core API / MCP 读取历史日记：

- `GET /api/archive/status`
- `GET /api/archive/diary`
- `GET /api/archive/diary/:date`
- MCP 工具：`get_archive_status`
- MCP 工具：`list_diary_entries`
- MCP 工具：`read_diary_entry`

## 当前 MCP 工具

`mcp-gateway` 暴露给 agent 的工具包括：

- `read_profile_summary`
- `get_recent_context`
- `create_journal_draft`
- `get_health_summary`
- `get_connector_status`
- `get_archive_status`
- `list_diary_entries`
- `read_diary_entry`
- `lookup_time_log_at`

## 本地开发

```bash
pnpm install
pnpm db:init
pnpm db:seed
pnpm dev:services
```

本地检查：

```bash
curl http://127.0.0.1:4100/health
curl http://127.0.0.1:4200/health
curl http://127.0.0.1:4100/console
```

## VPS 更新

VPS 项目路径：

```bash
/opt/apps/asashiki-ai/asashiki-ai
```

标准更新流程：

```bash
cd /opt/apps/asashiki-ai/asashiki-ai
git pull origin main
docker compose --env-file .env.production -f infra/docker/compose.yaml down
docker compose --env-file .env.production -f infra/docker/compose.yaml up -d --build
docker compose --env-file .env.production -f infra/docker/compose.yaml ps
```

健康检查：

```bash
curl http://127.0.0.1:4100/health
curl http://127.0.0.1:4200/health
curl https://api.asashiki.com/health
curl https://mcp.asashiki.com/health
```

Archive 检查：

```bash
curl http://127.0.0.1:4100/api/archive/status
curl http://127.0.0.1:4100/api/archive/diary
```

## 生产环境变量重点

NPM 反代模式下必须使用：

```env
CORE_API_BIND_HOST=0.0.0.0
MCP_GATEWAY_BIND_HOST=0.0.0.0
```

Archive 相关：

```env
ASASHIKI_ARCHIVE_HOST_PATH=/opt/asashiki/Asashiki_Archive
ASASHIKI_ARCHIVE_ROOT=/archive
ASASHIKI_DIARY_DIR=
```

极简状态页登录：

```env
ADMIN_PANEL_TOKEN=replace-with-a-long-random-password
```

如果 `docker compose ps` 仍显示 `127.0.0.1:4100->4100/tcp` 或 `127.0.0.1:4200->4200/tcp`，先检查 `.env.production` 和 `--env-file` 是否生效。

## 文档说明

- `AGENTS.md` 是远程开发时 Codex / Claude Code 必须优先读取的文件。
- `asashiki-ai-foundation-kit/` 里的文档目前作为历史规划和参考资料保留。
- 当前新增功能以根目录 `README.md`、`AGENTS.md`、`.env.production.example` 和实际代码为准。
