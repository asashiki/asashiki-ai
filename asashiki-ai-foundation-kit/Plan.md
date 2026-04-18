# Plan.md

## Milestone 0 — Planning freeze

### Goal
冻结第一期范围，避免边做边改。

### Acceptance criteria
- `Prompt.md`、`AGENTS.md`、`docs/01-architecture.md`、`docs/03-module-boundaries.md` 已确认
- 明确 MVP 只做 6 个核心模块
- 明确不在第一期实现复杂记忆层与自动化编排

### Validation
- 人工 review 文档
- 列出所有“先不做”的项

---

## Milestone 1 — Repo scaffold + shared contracts

### Goal
创建项目骨架与共享类型定义。

### Deliverables
- Monorepo 目录结构
- 共享 schema 包
- 基础 env/config 模板
- 最基础 README / run scripts

### Acceptance criteria
- 本地能安装依赖
- 能启动空白 Public Web / Admin / Core API / MCP Gateway 四个进程或两个聚合进程
- schema 包可被多个 app 引用

### Validation
- install
- build
- typecheck

---

## Milestone 2 — Core API MVP

### Goal
实现最小数据模型与 API。

### Deliverables
- Profile summary
- Journal draft / entry
- Health snapshot
- Connector status
- Audit log（最小版）

### Acceptance criteria
- 本地数据库可初始化
- Admin 能读取上述数据
- Core API 有健康检查与 seed 数据

### Validation
- migrations / seed 成功
- API smoke test
- typecheck + tests

---

## Milestone 3 — Admin Dashboard MVP

### Goal
实现私有管理后台。

### Deliverables
- Overview 页面
- Journals 页面
- Connectors 页面
- Health 页面
- 最近操作/系统状态页面

### Acceptance criteria
- 能在页面看见 seed 数据
- 能创建 journal draft
- 能查看 connector / health 状态

### Validation
- 本地手动 smoke test
- build
- lint / typecheck

---

## Milestone 4 — Public Status API + Public Web integration

### Goal
让 Cloudflare 静态站可读取公开状态数据。

### Deliverables
- Public read-only API
- 一个最小前端页面组件示例

### Acceptance criteria
- 公开页面能展示非敏感状态
- 私密数据不会通过 public API 泄露

### Validation
- API response snapshot
- 手动检查前端页面渲染

---

## Milestone 5 — MCP Gateway MVP

### Goal
暴露最小 MCP 工具集。

### Deliverables
- `read_profile_summary`
- `get_recent_context`
- `create_journal_draft`
- `get_health_summary`
- `get_connector_status`

### Acceptance criteria
- MCP client 能列出工具
- 至少 3 个工具能成功调用
- 写入操作经过后端统一处理

### Validation
- MCP list tools
- MCP smoke calls
- audit log 记录成功

---

## Milestone 6 — Deployment basics + handbook sync

### Goal
准备部署和调试资料，但不引入复杂生产能力。

### Deliverables
- 基础部署说明
- PM2 / Docker 选型结论
- Cloudflare/域名子域规划
- 调试流程文档

### Acceptance criteria
- 文档足够支撑首轮部署
- 新人阅读后知道系统怎么跑、怎么查错、怎么加新能力

### Validation
- 文档 walkthrough
- 手工部署预演
