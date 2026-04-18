# Prompt.md

## Project

Asashiki Personal AI Foundation

## Goal

构建一个**个人 AI 基础设施底座**，让不同 agent（例如 Claude、Hermes、OpenClaw、Kelivo、Operit 等）能通过统一接口接入你的数据与能力，而不需要每换一个 agent 就重新“认识你”一次。

第一期不追求“完整 AI 伙伴”，只追求一个能跑通的最小系统。

## What this project is

这是一个带有以下特点的系统：

- 你拥有数据源和能力的主导权
- 公开网站与私密后台分离
- agent 通过 MCP 接入统一工具层
- 你的资料、日记、状态、连接器与审计有统一存放位置
- 后续可以平滑扩展记忆层、自动化、更多连接器

## What this project is not

- 不是某一个特定 agent 的全量替代品
- 不是第一期就做语音、摄像头、自动浏览器、全量记忆、全量 OAuth 编排
- 不是第一期就做复杂 RAG / graph memory / vector search 平台
- 不是“把所有第三方项目都接进来”的超级总线

## First release target

做出一个可以本地跑通、之后能部署到 VPS 的 MVP，包含：

1. Public Web
   - 公开网页依旧适合走 Cloudflare 静态托管
   - 公开页面可读取少量公开状态数据

2. Admin Dashboard
   - 私有登录页
   - 查看系统健康状态、连接状态、最近操作
   - 管理 Journal、Profile、Connectors、Health Snapshot

3. Core API
   - 统一数据模型与业务逻辑
   - 提供 profile / journal / health / connector status / audit log API

4. MCP Gateway
   - 对外暴露极少量、经过筛选的工具
   - 第一阶段只暴露：
     - `read_profile_summary`
     - `get_recent_context`
     - `create_journal_draft`
     - `get_health_summary`
     - `get_connector_status`

5. Storage
   - 第一阶段优先轻量、可迁移
   - 先不强依赖复杂向量库

## Non-goals for MVP

- 多 agent 自动发现与注册
- 远程动态代理任意第三方 MCP
- 自动记忆提炼流水线
- 常驻浏览器自动化
- 多租户
- 完整 RBAC
- 实时语音 companion
- 多端同步复杂冲突解决

## User-facing effect we want after MVP

一个 agent 连接到你的 MCP 之后，至少能做到：

- 读到你的简要资料与当前偏好摘要
- 读到近期上下文摘要
- 查询最近健康概况
- 查询哪些连接器在线
- 帮你生成一篇“日记草稿”，然后由后端统一保存

这意味着：
- agent 不需要直接操作文件夹
- agent 不需要直接知道数据库结构
- agent 不需要知道你网站、后台和存储怎么实现

## Data classification

### Public
适合公开页面展示的数据，例如：
- 系统是否在线
- 公开状态卡片
- 非敏感聚合指标

### Private operational
仅后台可见：
- 连接器状态
- agent 最近心跳
- 系统日志
- 审计日志

### Private personal
强隐私：
- 日记原文
- 个人偏好细节
- 健康明细
- 账户连接 secrets

### MCP-exposed
允许被 agent 调用的摘要型数据：
- profile summary
- recent context summary
- connector status summary
- health summary
- journal draft write action

## Suggested technical direction

- Monorepo
- TypeScript
- 公共前端与后台前端共享 schema / client
- Core API 与 MCP Gateway 分离
- 轻量数据库优先
- 所有复杂能力通过接口留扩展位

## Done when

第一期完成时，应满足：

- 本地一键启动
- 能打开 Admin Dashboard
- 能从 Public Web 成功读取公开状态数据
- 能通过 MCP 列出并调用 5 个最小工具
- 能创建一篇 Journal Draft 并在后台可见
- 能看到至少一个连接器状态与一个健康快照
- 有基础运行手册和调试手册
