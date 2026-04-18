# Asashiki AI Foundation Kit

这是一套给你和 Codex 使用的项目文档包，目标不是直接开工做完整系统，而是先把**边界、MVP、执行方式、调试方式**敲定，让第一步尽量稳。

## 这套文档的用途

- 让 Codex 在开工前有统一的项目说明，而不是凭感觉乱搭。
- 让你自己能快速判断某个新想法应该放在哪个模块。
- 让后续新增能力、排查问题、迁移 agent 时，有可追溯的依据。
- 让“第一期先跑通什么”非常明确，避免工程量膨胀。

## 你当前的现实约束

- 域名：`asashiki.com`
- 前端：优先继续使用 Cloudflare 的静态托管/边缘能力
- VPS：洛杉矶，2 vCPU / 2.5 GB RAM
- 目标：构建“个人 AI 基础设施”，而不是绑定单一 agent 的配置仓库
- 当前阶段：**规划阶段**，暂不直接执行复杂落地

## 这套文档里最重要的文件

- `Prompt.md`：项目规格说明。告诉 Codex“要做什么、不要做什么”。
- `Plan.md`：里程碑与验收标准。
- `Implement.md`：Codex 的执行守则。
- `AGENTS.md`：仓库级规则，Codex 启动时优先读取。
- `Documentation.md`：执行过程中的状态日志与决策记录。
- `docs/01-architecture.md`：整体架构与第一期推荐方案。
- `docs/02-market-survey.md`：调研后的项目判断。
- `docs/03-module-boundaries.md`：模块边界与数据边界。
- `docs/04-api-and-mcp-surface.md`：第一期 API / MCP 面。
- `docs/05-ops-handbook.md`：运行、调试、加能力时的手册。
- `docs/06-recommended-stack.md`：建议栈与为何这样选。

## 你下一步怎么用

1. 先自己通读 `Prompt.md`、`Plan.md`、`docs/01-architecture.md`。
2. 确认第一期目标没有跑偏。
3. 把整个文件夹交给 Codex。
4. 让 Codex严格按 `Implement.md` 和 `AGENTS.md` 工作。
5. 第一轮只允许做 `Plan.md` 里的 Milestone 1。

## 第一期开工建议

不要先做“全能 AI 伙伴系统”。  
先做一个**个人 AI 控制平面 MVP**，只包含：

- Core API
- MCP Gateway
- Admin Dashboard
- Public Read-only Status API
- Journal Drafts / Entries
- Connector Registry / Health Snapshot

记忆层、自动工作流、浏览器自动化、多 agent 协同，都放到第二期以后。
