# BACKEND TODOS — 前端给后端的接口补充清单

> 给 mcp-gateway 那边 Claude Code 看的文档。列出**当前 console-api.md 之外**前端新增需要的端点。
> 前端**已经给所有这些端点做了兜底**——404/501 → localStorage 或占位 UI，所以可以按优先级慢慢加，不会让前端崩。

---

## 优先级总览

| 端点 | 用途 | 优先级 | 工作量估计 | 兜底 |
|---|---|---|---|---|
| `GET/PUT /api/console/skill-groups` | 用户自定义场景分组 | **P1（必加）** | 1–2h | localStorage（per-user，跨设备不同步） |
| `GET /api/console/health` | 系统健康汇总卡 | **P2（强烈推荐）** | 2–3h | 占位 UI（友好提示「等待后端实现」） |
| `GET /api/console/stats?range=…` | 概览页所有图表 | P3（视情况） | 半天–1 天 | 占位 UI |
| 审计分页 | 审计页未来扩展 | P4（暂不急） | 1h | 当前用 `limit=150` 够用 |
| 一次性 secret 撤销端点 | 一次性 secret 误关页面找回 | P4（暂不急） | 已有 regen 兜底 | regen 即可 |

---

## P1 · 用户自定义场景分组（必加）

### 背景
- 后端 catalog 里的 `category` (realtime/action/finance/...) 是**功能维度**——按读/写/远程/本地/UI 分。
- 但用户**还想按自己的使用场景**给技能分组（如「日常感知」「写作记录」「资产查询」「调试常用」）。
- 这套场景分组**完全是用户偏好**，跟工具本身无关，跟权限也无关——只影响控制台技能页的展示。

### 数据结构
```ts
type SkillGroup = {
  id: string;          // slug，前端生成（"g" + base36 时间戳），后端可视作主键
  name: string;        // 用户可改名
  order: number;       // 0 起始，越小越靠上
  skillIds: string[];  // 该组下的 skillId 列表，按组内顺序
};
```

**规则**：
- 一个 skillId **最多只能出现在一个 group 里**（后端可以校验，前端也会保证）
- 不在任何 group 里的技能 → 前端展示在「未归类」区
- 删除一个 group 不删除技能（它们回到「未归类」）

### 端点

```http
GET /api/console/skill-groups
Authorization: Bearer <token>

→ 200 OK
{
  "groups": [
    { "id": "g_abc123", "name": "日常感知", "order": 0,
      "skillIds": ["device_status", "location_current", "weather_current", "health_summary"] },
    { "id": "g_def456", "name": "写作 · 记录", "order": 1,
      "skillIds": ["diary_write", "voice_bubble"] }
  ]
}
```

```http
PUT /api/console/skill-groups
Authorization: Bearer <token>
Content-Type: application/json

{ "groups": [ ... 整套覆盖 ... ] }

→ 200 OK
{ "ok": true }
```

**实现建议**：
- 复用 console session 已有的 SQLite 存储，加一张 `console_skill_groups` 表，按 username 主键
- 或者干脆当一坨 JSON blob 存（个人工具规模够用，懒得做 schema）

### 前端兜底
找不到这个端点（404/501）时，前端会把 groups 存在 `localStorage.asashiki.console.groups.<username>`。**会跨设备失同步，但单设备完全可用。**所以后端可以缓加。

---

## P2 · 系统健康汇总（强烈推荐）

### 背景
概览页底部有个「系统健康」卡片——展示 gateway / core-api / 各连接器 / 远程 MCP 的连通状态。**给非技术维度的"一眼看是否正常"很重要**。

### 端点

```http
GET /api/console/health
Authorization: Bearer <token>

→ 200 OK
{
  "gateway": {
    "ok": true,
    "uptime": "4d 12h",            // 进程启动至今的人类可读字串
    "note": "可选附加说明"
  },
  "coreApi": {
    "ok": true,
    "note": "11 条最近请求"           // 任何对人友好的简短状态
  },
  "connectors": [
    {
      "id": "okx", "name": "OKX 连接器",
      "status": "disabled",         // "ok" | "warn" | "err" | "disabled"
      "note": "凭据已配置 · 工具禁用中"
    },
    {
      "id": "supabase-remote", "name": "Supabase Remote MCP",
      "status": "err",
      "note": "离线 · project_ref 配置错误"
    },
    { "id": "openviking", "name": "OpenViking", "status": "ok", "note": "已连接 · 16:46 写入成功" },
    { "id": "ios-agents",  "name": "设备上报",  "status": "ok", "note": "2 台 iOS 在线 · 最近 4 分钟" }
  ]
}
```

**实现建议**：
- `gateway.ok` 直接 `true`（能到这里就是 ok 的）
- `coreApi` 内网 ping `/health` 拿
- `connectors` 复用现有 `connector_status` 工具的数据
- `uptime`：进程启动时间戳算差

### 前端兜底
找不到时 → 概览页底部显示「系统健康需要后端 `/api/console/health` 端点（建议复用 connector_status 工具的数据）」。**优雅降级，不崩。**

---

## P3 · 调用量统计

### 背景
概览页的 KPI 卡（24h 调用 / P95 延迟 / 错误率 / 活跃 Agent）、24h 调用量折线、工具排行 Top 10、Agent 占比——**全靠这一个端点**。

### 实现是否值得？

我（前端 Claude）建议**评估一下：**
- ✅ **如果后端能在 SQLite 上跑一个 7 天滚动聚合**——值得做，因为这页是用户每天会瞄一眼的运营仪表
- ❌ **如果要从 audit 表全表扫描**——别做，太慢，没价值
- 折中方案：后端在 audit insert 时**顺手维护一张聚合表** `audit_aggregates(date, agent_id, tool_name, count, error_count, latency_p50, latency_p95)`，然后这个端点直接读它，O(1)

### 端点

```http
GET /api/console/stats?range=24h
Authorization: Bearer <token>

range 取值：1h | 24h | 7d | 30d

→ 200 OK
{
  "range": "24h",
  "totalCalls": 184,
  "errorCalls": 0,
  "unauthorizedCalls": 9,
  "p50LatencyMs": 18,
  "p95LatencyMs": 142,
  "timeline": [
    { "t": 1717400000, "n": 4 },
    { "t": 1717403600, "n": 6 },
    ...
  ],
  "topTools": [
    { "skillId": "device_status",    "title": "Device Status",   "count": 62 },
    { "skillId": "weather_current",  "title": "Current Weather", "count": 38 },
    ...
  ],
  "byAgent": [
    { "agentId": "claude-ai",  "displayName": "Claude.ai", "count": 125, "pct": 0.68 },
    { "agentId": "chatgpt-ai", "displayName": "ChatGPT",   "count": 44,  "pct": 0.24 },
    ...
  ],
  "deltaVsPrev": {
    "totalCalls": 0.12,        // 与上一周期比的百分比（小数，0.12 = +12%）
    "errorCalls": 0.20,
    "p95LatencyMs": -3         // 绝对 ms 变化（负 = 变快）
  }
}
```

### 前端兜底
找不到时 → KPI 卡显示「—」，折线/排行/占比卡片显示「调用量统计需要后端 `/api/console/stats` 端点」的占位说明。**完全不影响其他功能。**

---

## P4 · 其他将来可加（不急）

### 4.1 审计分页
当前 `GET /api/console/audit?limit=150` 够用。将来要看历史可加：
```
GET /api/console/audit?limit=50&offset=150
GET /api/console/audit?limit=50&before=<created_at>
```

### 4.2 一次性 secret 误关找回
新建 agent 时返回的 secret 只显示一次。如果用户误关了页面，目前可以走 `POST /api/console/agents/:id/regen` 轮换出新 secret。要做"找回"几乎等于轮换，所以**不必另加端点**。

### 4.3 ui:// 资源代理（远程 MCP 带 UI 的情况）
跟前端无关，是 mcp-gateway 内的事，详见 `dev-conventions.md` §2。

---

## 字段命名 & 数据约定（前端依赖的）

**这些不要改，改了前端要跟着改：**

| 字段 | 出处 | 用途 |
|---|---|---|
| `skill.skillId` | `/skills` | 在 group / agent visibility 里都靠它做 join |
| `skill.category` | `/skills` | 前端只用作标签 chip，**不再做章节分类**（用户场景分组取代） |
| `skill.source` | `/skills` | `"local"` / `"remote-mcp"`，前端用来显示标签 chip |
| `skill.readOnly` | `/skills` | 只对 remote 有意义；写工具默认禁用 |
| `skill.allowWrite` | `/skills` | 远程写工具的二级开关 |
| `agent.agentId` | `/agents` | 同 skillId，是 join key |
| `visibility.restricted` | `/agents/:id/visibility` | 前端用它判断"默认全部可见"还是"白名单" |
| `visibility.allowlist` | 同上 | 白名单 skillId 列表 |
| `visibility.enabledSkills` | 同上 | 后端算好的该 agent 当前实际能看到的工具列表（前端只读，用于显示「N 项工具」） |
| `audit.created_at` | `/audit` | ISO 字符串。前端用这个排序、按日分组 |
| `audit.action` | `/audit` | 前端有翻译表（mcp_request → "工具调用"），新增 action 前端会显示 raw 字符串 |
| `audit.tool_name` | `/audit` | 在审计页折叠的会话卡片里作为 chip 展示 |

---

## 联调建议

1. **先把 P1 (skill-groups) 接上**——这块是用户最常感知的功能（自定义分组）
2. **然后 P2 (health)**——一旦接上，整个概览页底部就活起来了
3. **P3 (stats) 看你的判断**——如果嫌麻烦先不做，前端会显示「等待后端实现」占位，体验也 OK
4. 任何字段改动同步给前端，改 `src/types/api.ts` 和 `src/lib/api.ts`

需要联调时 ping 我（cowork 妈妈），改前端是几秒钟的事。

— 2026·06·11
