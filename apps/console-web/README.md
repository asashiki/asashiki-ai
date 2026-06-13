# Asashiki MCP · Console Web

> Asashiki MCP 的网页控制台前端。React + Vite + TypeScript，皮肤遵循 [asashiki-design 樱羽 Sakura v0.1](https://github.com/Hey/asashiki-design)。
> 当前版本：**0.1.0**（前端骨架完成，等后端联调）。

---

## 1. 这是什么

`mcp.asashiki.com` 网关原本只有一套 SSR 的简陋页面。Cowork 那边重做了一版独立 SPA：

- **5 页**：概览 / 技能 / Agents / 远程接入 / 审计
- 完全跨域调用 `mcp.asashiki.com/api/console/*`
- 浅仪式樱羽风格（粉/紫蓝印象色 + 大量留白 + 12° 斜切作 signature）
- 自带浅/深双主题
- 移动端、平板自适应（断点 760 / 1100）

设计稿与本地预览见 `preview-v4-sakura.html`（双击浏览器打开即可）。

---

## 2. 快速开始

```bash
# 安装依赖
npm install

# 本地开发（自带把 /api/* 反代到 mcp.asashiki.com）
npm run dev

# 类型检查
npm run typecheck

# 生产构建（产物 dist/）
npm run build

# 本地起 preview（看构建产物）
npm run preview
```

打开浏览器访问 <http://localhost:5173/>。

### 2.1 本地登录

开发模式下，前端通过 vite 的 dev-proxy 把 `/api/*` 转发到 `https://mcp.asashiki.com`。
直接用 console 账号 (`asashiki`) 登录即可——会话 token 走 Authorization 头，
不依赖 cookie，所以跨域没有任何坑。

### 2.2 自定义 API 目标

如果想本地跑后端，在项目根目录建一个 `.env.local`：

```env
# 把 dev 时的 /api 反代目标换掉
VITE_DEV_PROXY=http://localhost:4200

# 或者把构建产物的 base URL 改成绝对地址
VITE_API_BASE=https://mcp.asashiki.com
```

---

## 3. 目录结构

```
console-web/
├── README.md                # 本文件
├── BACKEND_TODOS.md         # ★ 给后端的待补端点清单（最重要）
├── DESIGN.md                # 前端设计说明 + 设计决策
├── preview-v4-sakura.html   # 视觉验收用的单文件预览（可双击打开）
├── index.html
├── vite.config.ts           # 含 /api → mcp.asashiki.com 的 dev-proxy
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx             # 入口
    ├── App.tsx              # 鉴权 + 路由分流
    ├── styles/
    │   ├── tokens.css       # ★ 樱羽 tokens（与 asashiki-design 一致）
    │   └── app.css          # 全局组件样式
    ├── lib/
    │   ├── api.ts           # API 客户端（含 401/500 处理）
    │   └── drag.ts          # HTML5 drag helper
    ├── types/
    │   └── api.ts           # 与后端对齐的数据类型
    ├── hooks/
    │   └── useAsync.ts      # 简易 async hook
    ├── components/
    │   ├── Shell.tsx        # 顶栏 + 移动菜单 + 主题切换 + 健康指示
    │   ├── PageHead.tsx
    │   ├── Modal.tsx
    │   ├── Toggle.tsx
    │   ├── Sparkline.tsx
    │   └── VisibilityDropdown.tsx  # ★ 技能行的"对哪些 agent 可见"下拉
    └── pages/
        ├── Login.tsx
        ├── Overview.tsx     # 概览页（KPI / 调用量 / 工具排行 / Agent 占比 / 异常 / 健康）
        ├── Skills.tsx       # 技能页（自定义场景分组 + 拖拽 + 可见性下拉）
        ├── Agents.tsx       # Agents 列表 + 新建 + 轮换 + 一次性 secret 弹窗
        ├── Remote.tsx       # 远程 MCP 服务器
        └── Audit.tsx        # 审计（按会话折叠）
```

---

## 4. 接口约定

完整的接口契约见根目录 `console-api.md`（你写的那份）。前端已对齐：

| 端点 | 用途 | 状态 |
|---|---|---|
| `POST /api/console/login` | 登录 | ✅ 接好 |
| `GET  /api/console/me` | 校验 token | ✅ 接好 |
| `POST /api/console/logout` | 登出 | ✅ 接好 |
| `GET  /api/console/skills` | 技能列表 | ✅ 接好 |
| `POST /api/console/skills/:id/enabled` | 启停 | ✅ 接好 |
| `POST /api/console/skills/:id/allow-write` | 允许写入 | ✅ 接好 |
| `GET  /api/console/agents` | Agents 列表 | ✅ 接好 |
| `POST /api/console/agents` | 新建 + 一次性 secret | ✅ 接好 |
| `POST /api/console/agents/:id/regen` | 轮换密钥 | ✅ 接好 |
| `POST /api/console/agents/:id/enabled` | 启停 | ✅ 接好 |
| `GET  /api/console/agents/:id/visibility` | 取可见性 | ✅ 接好 |
| `POST /api/console/agents/:id/visibility` | 改可见性 | ✅ 接好 |
| `GET  /api/console/audit` | 审计日志 | ✅ 接好 |
| `GET  /api/console/remote` | 远程服务器 | ✅ 接好 |
| `POST /api/console/remote` | 添加远程 | ✅ 接好 |
| `DELETE /api/console/remote/:id` | 删除远程 | ✅ 接好 |
| `POST /api/console/remote/rediscover` | 重新发现 | ✅ 接好 |
| `GET  /api/console/skill-groups` | 用户自定义分组 | 🆕 **待后端实现** |
| `PUT  /api/console/skill-groups` | 保存分组 | 🆕 **待后端实现** |
| `GET  /api/console/stats?range=…` | 调用量统计 | 🆕 **待后端实现** |
| `GET  /api/console/health` | 系统健康汇总 | 🆕 **待后端实现** |

🆕 的端点**前端已有兜底**（localStorage / 占位 UI），所以即使后端暂时没接，
前端也跑得起来，不会崩。优先级建议看 [`BACKEND_TODOS.md`](./BACKEND_TODOS.md)。

---

## 5. 部署到 mcp.asashiki.com

推荐方案：在 mcp-gateway 的 NPM/Nginx 反代里挂一条静态站点。

```bash
# 1. 在 console-web/ 里构建
npm install
npm run build
# 产物：dist/

# 2. 把 dist 拷贝到 gateway 容器或 nginx 静态目录
# 例如：
rsync -av dist/ /srv/asashiki-mcp/console-web/

# 3. NPM 反代配置（新建 console.mcp.asashiki.com 或挂到 mcp.asashiki.com/console-v2/）
#    location / {
#        try_files $uri /index.html;   # SPA fallback
#    }
#    location /api/console/ {
#        proxy_pass http://mcp-gateway:4200/api/console/;
#        proxy_set_header Authorization $http_authorization;
#    }
```

**重要：因为是 SPA，要给 404 fall-through 到 `index.html`，让前端路由接管。**

---

## 6. 风格与组件

- 全部颜色 / 圆角 / 阴影 / 字阶**从 `src/styles/tokens.css` 取**，禁止写死 hex。
- 三档圆角：`--radius-s 7px` / `--radius-m 10px` / `--radius-l 14px`。
- 强调色面积 ≤ 全屏 15%，不要在导航/卡片上铺满。
- −12° 斜切（`--skew`）每屏 ≤ 3 处，只用在 eyebrow 小块 / 进度条尾 / 状态 chip / logo / 卡角斜纹。
- 中日同字号，靠留白和文字色分层，不靠加粗堆叠。
- 红线：渐变背景 / 渐变按钮、强调色铺满、阴影代替留白、emoji 当主视觉——出现即返工。

完整规范在 [`asashiki-design/DESIGN.md`](../asashiki-design/DESIGN.md)。

---

## 7. 给协作者（Claude Code）的话

- **先看 `BACKEND_TODOS.md`**——里面列了所有需要新加的端点、字段、返回结构。
- 凡是带「**待后端实现**」标记的端点，前端都做了兜底（404/501 → localStorage 或占位 UI），
  所以**这些端点可以按需要慢慢加**，加一个上一个。
- 如果改了任何已上线端点的契约（字段重命名、返回结构调整等），请同步改 `src/types/api.ts` 与 `src/lib/api.ts`。
- 部署细节里有疑问优先查 §5。

— Cowork 妈妈 2026·06·11
