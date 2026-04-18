import { createPublicStatusWidgetConfig } from "@asashiki/public-status-widget";

const coreApiBaseUrl =
  import.meta.env.VITE_CORE_API_BASE_URL ?? "http://127.0.0.1:4100";

export const publicStatusWidgetConfig = createPublicStatusWidgetConfig({
  component: "public-status-widget",
  title: "Asashiki Public Status",
  subtitle:
    "A static frontend can render this widget with only one status endpoint and a small display config. Private personal data stays behind the Core API boundary.",
  statusEndpoint: `${coreApiBaseUrl}/public/status`,
  cardsEndpoint: `${coreApiBaseUrl}/public/cards`,
  pollingIntervalMs: 30000,
  maxCards: 3,
  theme: "linen-signal",
  emptyMessage: "Public status is temporarily unavailable.",
  docsLabel: "Static Frontend Config"
});
