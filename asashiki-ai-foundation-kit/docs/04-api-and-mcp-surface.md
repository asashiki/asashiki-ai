# 04 API and MCP Surface

## 1. Core API MVP surface

Milestone 2 已实现以下 Core API 路由，底层为 SQLite-first 本地数据库并带 seed 数据。

### Healthcheck
- `GET /health`

### Profile
- `GET /api/profile/summary`

### Context
- `GET /api/context/recent`

### Journals
- `GET /api/journals`
- `POST /api/journals/drafts`
- `GET /api/journals/drafts/:id`
- `POST /api/journals/drafts/:id/publish` (later; optional)

### Health
- `GET /api/health/summary`
- `GET /api/health/latest`

### Connectors
- `GET /api/connectors`
- `GET /api/connectors/summary`

### Public
- `GET /public/status`
- `GET /public/cards`
- `GET /public/widget-config`

### Audit
- `GET /api/audit/recent`

### Current implementation note
- `POST /api/journals/drafts/:id/publish` 仍保留到后续 milestone
- 当前已支持数据库初始化、seed、Admin 读取和 API smoke test
- Milestone 4 新增公开组件配置输出，便于静态前端复用同一公开读取方案

## 2. Suggested Core entities

### Profile
- id
- display_name
- summary
- preferences_json
- updated_at

### JournalDraft
- id
- title
- body
- source
- created_at
- updated_at
- status

### JournalEntry
- id
- title
- body
- created_at
- tags_json

### HealthSnapshot
- id
- captured_at
- resting_heart_rate
- sleep_hours
- step_count
- note

### Connector
- id
- name
- kind
- status
- last_seen_at
- last_success_at
- last_error
- capabilities_json

### AuditEvent
- id
- actor
- action
- target_type
- target_id
- metadata_json
- created_at

## 3. MVP MCP tools

Milestone 5 已在 `mcp-gateway` 中实现以下真实工具，并通过 Core API 完成读写。

### `read_profile_summary`
Returns:
- display name
- short stable summary
- top preferences snapshot

### `get_recent_context`
Returns:
- recent journal/context summary
- latest status hints
- very small payload

### `create_journal_draft`
Input:
- title?
- content
- source
- occurred_at?

Returns:
- draft id
- saved title
- saved timestamp

### `get_health_summary`
Returns:
- latest sleep / heart rate / step summary
- no sensitive raw history

### `get_connector_status`
Returns:
- important connector states
- online/offline/degraded summary

## 4. Deliberately excluded from first MCP surface

- arbitrary file read/write
- raw DB query
- secret management
- connector reconfiguration
- delete journal
- read all journal entries
- full health history dump
- add third-party MCP dynamically

## 5. Why the surface is intentionally small

因为第一期的目标不是“工具越多越厉害”，而是：

- 工具描述清楚
- 工具行为稳定
- 隐私边界不乱
- 便于不同 agent 理解

## 6. Current MCP implementation note

- MCP Gateway 当前通过 Streamable HTTP 暴露在 `/mcp`
- `create_journal_draft` 最终仍走 Core API 写入与 audit 记录
- Milestone 5 验证已覆盖 list tools 与至少 3 个真实工具调用
