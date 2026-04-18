# 08 Public Status Widget

## 1. Purpose

这一层的目标不是把 Public Web 和某一个前端框架绑定死，而是把“公开状态展示”抽成一个可搬运的静态组件约定。

这样你以后如果：

- 换掉当前 Public Web
- 改成别的静态站生成器
- 想嵌到单页 marketing site
- 想让 Cloudflare Pages 之外的静态站也读相同状态

都可以直接复用同一套公开读取方式。

## 2. Public-only contract

公开组件只允许读取：

- `GET /public/status`
- `GET /public/cards`
- `GET /public/widget-config`

不允许读取：

- profile summary
- journals 原文
- health 明细
- audit 明细
- connector 私密错误上下文

## 3. Current reusable package

当前仓库里的可复用组件包：

- `packages/public-status-widget`

当前 Public Web 的配置入口：

- `apps/public-web/src/public-status.config.ts`

## 4. Minimal invocation

```ts
import { mountPublicStatusWidget } from "@asashiki/public-status-widget";
import { createPublicStatusWidgetConfig } from "@asashiki/public-status-widget";

await mountPublicStatusWidget(
  document.querySelector("#public-status")!,
  createPublicStatusWidgetConfig({
    component: "public-status-widget",
    title: "Asashiki Public Status",
    subtitle: "Reusable public read model for static frontends.",
    statusEndpoint: "http://127.0.0.1:4100/public/status",
    cardsEndpoint: "http://127.0.0.1:4100/public/cards",
    pollingIntervalMs: 30000,
    maxCards: 3,
    theme: "linen-signal",
    emptyMessage: "Public status is temporarily unavailable.",
    docsLabel: "Static Frontend Config"
  })
);
```

## 5. Why keep widget config separate

把配置单独显式放出来，有几个好处：

- 后续换前端时，可以直接看到 endpoint / polling / theme / card 上限
- Public Web 页面本身可以展示这份配置，作为“接入说明”
- 公开组件与私密后台不会混用 API
- future frontend 可以直接照抄配置后运行

## 6. Snapshot and validation

Milestone 4 当前有一份公开 API snapshot：

- `apps/core-api/snapshots/public-status.snapshot.json`

推荐验证顺序：

1. `pnpm public:snapshot`
2. `pnpm dev:services`
3. `pnpm dev:web`
4. 打开 `http://127.0.0.1:3000`
5. 检查页面能展示公开状态组件与配置示例
