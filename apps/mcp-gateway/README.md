# mcp-gateway

对外 MCP 入口（`POST /mcp`）。所有 agent 可调用工具都在这里注册。

业务逻辑不在这里实现——本服务只做协议转译，调用全部经过 `core-api-client.ts` 转发到 `core-api`。

## 工具命名规范

`<domain>_<action>`，全部小写下划线。**不要**用动词开头。

| 旧（已废弃） | 新 |
|---|---|
| `get_okx_balance` | `okx_balance` |
| `read_diary_entry` | `diary_read` |
| `list_archive_files` | `archive_list` |
| `send_voice_message` | `voice_send` |

域前缀（同一域内归一管理）：

`profile_` `context_` `journal_` `connector_` `archive_` `diary_`
`time_log_` `device_` `health_` `location_` `weather_`
`okx_` `steam_` `voice_`

新增工具如果归不进现有域，先在这里追加一行。**不要** 创建只装一个工具的孤儿域。

只用下划线，不用点号——OpenAI function name 历史上不允许 `.`，将来 GPT 适配能直接复用同一组工具名。

## 添加新工具的步骤

1. **schema** 放在 `packages/schemas/src/index.ts`，导出 input/output 两个 zod schema。
   - input 字段用 `.describe()` 写边界（取值范围、举例、踩坑），而不是塞到 description 里。
2. **client method** 加在 `apps/mcp-gateway/src/core-api-client.ts`，只做 HTTP 转发，不实现业务。
   - 业务（数据库、外部 API、文件 IO）必须在 `core-api` 里实现，gateway 永远是薄壳。
3. **catalog 条目**：在 `mcp.ts` 的 `mcpToolIds` 数组和 `mcpToolCatalog` 里各加一条。
   - `description` 控制在 **30–60 字符**，一句话讲清能力。举例放 input schema。
4. **registerTool 调用**：在 `mcp.ts` 的对应域注释块里加一条。
   - 用 `tool("xxx_yyy").title/description` 读 catalog，不要重复字符串。
   - **必须** 设置 `annotations`，见下方矩阵。
5. **smoke test 分支**：在 `runMcpToolSmokeTest` 的 switch 里加一个 case。
   - 只读工具：跑一次最便宜的调用，回 ok。
   - 写工具：写 `return mcpToolTestResultSchema.parse({ ok: true, summary: "xxx 跳过（避免改动真实文件）" })`，不要真的写。
6. **核心测试**：`apps/mcp-gateway/src/mcp-gateway.test.ts` 至少把新工具列入 `listTools` 长度断言（已用 `>= 9` 的下界，不需要每次更新）。需要回归的工具单独加 `callTool` 断言。
7. **README 工具列表**：根目录 `README.md` 的「当前 MCP 工具」清单加一行（按域分组）。

## annotations 矩阵

| 工具类型 | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|---|---|---|---|---|
| 纯读取本地数据（profile、diary_read、device_status …） | true | — | — | false |
| 读取外部 API（okx_*、steam_*、weather_*、location_*） | true | — | — | **true** |
| 创建新资源（journal_create_draft） | false | false | false | false |
| 覆盖/更新文件（archive_write、diary_write、diary_update） | false | **true** | false | false |
| 删除（archive_delete、diary_delete） | false | **true** | **true** | false |
| 副作用 / 外部投递（voice_send） | false | false | false | **true** |

`openWorldHint=true` 表示工具触达 gateway / core-api 之外的世界（第三方 API、推送通道）。客户端可据此做更严格的二次确认。

## 工具数量预算

当前 30 个。Anthropic / OpenAI 的实测经验：

- **<50 个**：全量注入到 system prompt 仍然是最稳的策略，不要做语义路由。
- **50–80**：考虑按域拆 server，或在客户端启用 tool_search（Claude Code 已自动启用）。
- **>80**：必须有 router（embedding 召回或基于 description 的关键词匹配）。

每次新增工具时复盘一下：能不能合并到已有工具（多一个可选参数）而不是新开一个？

## 不要做的事

- 不要在 handler 里直接读数据库 / 调外部 API。所有数据走 `core-api`。
- 不要在 description 里塞例子和长说明，移到 input schema 的 `.describe()`。
- 不要给一个工具同时承担读和写（例如「读取并删除」）——拆成两个。
- 不要省略 `outputSchema`。GPT structured output 适配需要它。
- 不要用 `get_/read_/list_` 等动词作为前缀。
