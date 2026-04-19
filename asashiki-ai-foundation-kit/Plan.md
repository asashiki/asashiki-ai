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

---

## Milestone 7 — Post-MVP Stabilization + Public Web Preview

### Goal
把已跑通的 MVP 收敛成可重复部署、可重复 smoke、可本地预览的稳定基线，但不扩大公开发布面。

### Deliverables
- 基于真实 VPS 经验修订的部署/运维手册
- 可重复的 VPS + MCP + Claude smoke checklist
- `public-web` 本地 `dev/build/preview` 流程
- 明确的回滚 / 停服说明

### Acceptance criteria
- 新人按文档可重复完成 VPS 启动与 Claude MCP smoke
- NPM 反代模式下的 Compose 绑定规则已明确写清
- `public-web` 可在本地构建并 preview
- `asashiki.com` 主站仍不受影响

### Validation
- 文档 walkthrough
- 本地 `public-web` dev/build/preview 验证
- VPS smoke checklist review

---

## Milestone 8 — Admin-first Console + Connector Pilot

### Goal
把项目从“开发者能维护的系统”推进到“你能主要通过控制台使用和管理的系统”，并接入第一个真实外部数据源试点。

### Deliverables
- `admin-web` 优先改造为主控制台
- Profile / Journal 等核心文本数据的查看与编辑能力
- Connector Center：查看连接状态、说明、启用状态、测试结果
- MCP Test Center：列出当前工具并执行 smoke 测试
- 第一个真实外部连接器试点：Supabase 时间日志只读接入

### Acceptance criteria
- 你可以主要通过 `admin-web` 查看和修改核心文本数据，而不是频繁进终端
- 每个已接入 MCP / 连接器都能在控制台中看到状态与测试结果
- Supabase 时间日志可通过控制台验证，并可通过 MCP 回答典型查询
- `public-web` 不继续扩大范围，仍保持冻结/本地预览状态

### Validation
- `admin-web` 本地 smoke
- Connector / MCP 测试页验证
- Supabase 时间日志试点查询验证
- 代码完成后执行 `git push`
