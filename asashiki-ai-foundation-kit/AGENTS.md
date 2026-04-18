# AGENTS.md

## Project overview

这是一个“个人 AI 基础设施”项目，不是单一聊天前端，不是完整 AI companion 成品，也不是某一个 agent 的私有配置目录。

第一期目标是做出一个能稳定运行的 **Personal AI Control Plane MVP**：

- 一个核心 API（Core API）
- 一个 MCP 网关（MCP Gateway）
- 一个管理后台（Admin Dashboard）
- 一个公开只读状态接口（Public Status API）
- 一个最小日记系统（Journal）
- 一个连接器状态系统（Connector Registry）
- 一个健康数据快照系统（Health Snapshot）

## Hard constraints

- 先本地开发，再部署到 VPS。
- 优先保持 Cloudflare 静态托管方案，不把整个前端搬去 VPS。
- VPS 只有 2 vCPU / 2.5 GB RAM，禁止第一期引入过重依赖。
- 第一阶段不要引入重量级长期记忆框架、复杂向量数据库、浏览器常驻自动化。
- 第一阶段不要为了“支持一切 agent”而写复杂适配层。
- 所有隐私数据与公开数据必须明确分层。
- 禁止让 agent 直接拥有任意文件系统写权限或任意数据库写权限。

## Mandatory workflow

- 先读 `Prompt.md`，把它当作规格源。
- 再读 `Plan.md`，只按当前 milestone 执行。
- 开始改动前，先检查 `Documentation.md` 的最新状态。
- 每完成一个 milestone，必须更新 `Documentation.md`。
- 如果需要改变架构边界，先更新文档，再写代码。
- 如果发现 scope 膨胀，必须停下来收敛到 MVP。

## Build philosophy

- 用最少模块跑通，不追求第一期就“很强”。
- 先保证数据边界清晰，再追求 agent 体验。
- MCP 只是对外统一工具层，不是全部系统本体。
- 所有可复用逻辑优先放在 Core API，不要散落在各个 agent 配置里。

## Documentation rules

- 新增模块时，同时更新：
  - `docs/01-architecture.md`
  - `docs/03-module-boundaries.md`
  - `docs/05-ops-handbook.md`
- 改变 API/MCP 面时，同时更新：
  - `docs/04-api-and-mcp-surface.md`
  - `Documentation.md`

## Security rules

- 默认最小权限。
- 所有私密数据接口默认不公开。
- 所有写入型工具默认需要显式调用，不允许“偷偷自动写”。
- 所有新增连接器必须记录：
  - 用途
  - 风险级别
  - 所需 secrets
  - 是否能写入
  - 是否需要人工确认
