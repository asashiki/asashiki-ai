# AGENTS.md

## 当前项目定位

这是一个部署在 VPS 上的个人 MCP 应用，不是博客、官网或普通前端项目。

目标是提供一个属于 Asashiki 的个人 AI 中枢：

- Claude、ChatGPT、Codex、Claude Code 和其他支持 MCP 的 agent 通过 `mcp-gateway` 连接。
- `core-api` 负责数据、状态、连接器、Archive 文件读取和审计。
- VPS 上的 `/opt/asashiki/Asashiki_Archive` 是长期个人资料与日记的主要文件入口。
- Web 页面目前只作为状态查看辅助，不是项目核心。

## 当前优先级

1. 先保证 `core-api` 和 `mcp-gateway` 在 VPS 上稳定运行。
2. 先做好 MCP 工具、Archive 读取、日记查询、连接器接入。
3. 旧的 `admin-web` / `public-web` 暂时视为本地实验页面，不作为生产主入口。
4. 生产上优先使用 `core-api` 的极简文字状态页 `/console`。
5. 所有新增功能先通过 API / MCP 跑通，再考虑是否做成漂亮网页。

## VPS Archive 约定

宿主机路径：

- `/opt/asashiki/Asashiki_Archive`

容器内只读挂载路径：

- `/archive`

日记目录自动查找顺序：

1. `ASASHIKI_DIARY_DIR` 指定的目录
2. `/archive/Obsidian_Asashiki/日记`
3. `/archive/日记`

默认只读。不要让 agent 获得任意文件系统写权限。

## 核心服务

- `apps/core-api`
  - 数据库、Profile、Journal、Connector、Archive、Remote MCP Registry
  - 生产文字状态页：`GET /console`
- `apps/mcp-gateway`
  - 对外 MCP 入口：`POST /mcp`
  - 暴露 agent 可调用工具
- `apps/admin-web`
  - 暂时保留，不作为当前生产重点
- `apps/public-web`
  - 暂时冻结，不替换 `asashiki.com` 主站

## 开发与部署原则

- 改代码前先看根目录 `README.md`。
- 需要部署到 VPS 的改动必须同步更新 `.env.production.example` 或部署说明。
- 可选集成不能阻断主服务启动。
- 私密数据默认不公开。
- 新增 MCP 工具优先只读；写入工具必须有清晰名称、用途和审计路径。
- 每次代码修改后运行必要测试，提交并 `git push`。

## 常用验证

```bash
pnpm typecheck
pnpm test
pnpm smoke
pnpm build
```

VPS 生产更新固定使用：

```bash
docker compose --env-file .env.production -f infra/docker/compose.yaml up -d --build
```
