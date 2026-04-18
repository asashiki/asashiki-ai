# 03 Module Boundaries

## 1. Core rule

模块边界的核心问题不是“代码怎么分”，而是“事实归谁管”。

## 2. The modules

### Public Web
负责：
- 展示公开内容
- 读取 Public Status API
- 不展示强隐私数据

### Admin Dashboard
负责：
- 查看系统整体状态
- 管理 Journals / Connectors / Health / Profile
- 触发安全的后台操作

### Core API
负责：
- 数据模型
- 业务逻辑
- 写入规则
- 审计记录
- 数据权限边界

### MCP Gateway
负责：
- 对外列出工具
- 把工具请求转成 Core API 调用
- 不保存业务真相
- 不直接持有所有复杂逻辑

## 3. Data zones

### Zone A — Public
例子：
- 系统在线状态
- 非敏感公开统计
- 某些聚合卡片

### Zone B — Private Operational
例子：
- 连接器状态
- agent 心跳
- 后台日志
- 部署状态

### Zone C — Private Personal
例子：
- 日记原文
- 详细健康数据
- 个人偏好细节
- 私人摘要

### Zone D — Secrets
例子：
- API keys
- OAuth tokens
- service tokens
- tunnel credentials

## 4. Capability placement

### Belongs in Core API
- create journal draft
- promote draft to entry
- read profile summary
- compute recent context summary
- read health summary
- read connector status summary

### Belongs in MCP Gateway
- 暴露上述能力给 agent 的包装接口

### Belongs in Admin only
- 管理 secrets
- 配置 connector
- 查看详细日志
- 审批敏感写操作（以后）

### Belongs in Public only
- 只读公共摘要页面
- 公共状态组件配置（仅 endpoint / polling / theme 等公开展示信息）

## 5. Journal rule

agent 不应直接写 Markdown 文件。  
正确做法：

1. agent 调 `create_journal_draft`
2. MCP Gateway 调 Core API
3. Core API 决定：
   - 存储位置
   - 文件名或数据库记录
   - 元数据
   - 审计记录

## 6. Connector rule

连接器本身不是 agent，也不是记忆。

连接器要单独建模：
- name
- kind
- status
- last_seen_at
- last_success_at
- last_error
- capabilities
- exposure_level

## 7. Health rule

第一阶段只保留健康“快照”和“摘要”。

不要第一期就做：
- 原始时间序列全量可视化
- 复杂生理指标关联分析
- 多源冲突合并系统

## 8. Memory rule

第一阶段暂不做复杂 memory layer。

先用：
- profile summary
- recent context summary
- journal entries
- audit trail

等 MVP 稳定后，再做：
- memory extraction
- memory ranking
- vector retrieval
- graph relationships

## 9. Future-safe interface rule

所有 future-heavy 模块都要通过接口抽象出来，但先用最简单实现。

例如：
- `ContextService`
- `JournalService`
- `ConnectorRegistryService`
- `HealthService`
- `McpToolFacade`
