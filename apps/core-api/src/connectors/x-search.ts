import type { XSearchInput } from "@asashiki/schemas";

export interface XSearchConfig {
  endpoint: string;
  token: string;
  timeoutMs: number;
}

export interface XSearchResponse {
  success: boolean;
  query: string;
  results: unknown[];
  meta?: Record<string, unknown>;
  service?: string;
  error?: string;
  [key: string]: unknown;
}

function stripHandle(h: string): string {
  return h.replace(/^@+/, "").trim();
}

export function createXSearchConnector(config: XSearchConfig) {
  const { endpoint, token, timeoutMs } = config;

  async function search(input: XSearchInput): Promise<XSearchResponse> {
    const body: Record<string, unknown> = { query: input.query };
    if (input.limit != null) body.limit = input.limit;
    if (input.allowedHandles?.length) {
      body.allowed_x_handles = input.allowedHandles.map(stripHandle);
    }
    if (input.excludedHandles?.length) {
      body.excluded_x_handles = input.excludedHandles.map(stripHandle);
    }
    if (input.fromDate) body.from_date = input.fromDate;
    if (input.toDate) body.to_date = input.toDate;
    if (input.enableImageUnderstanding != null) {
      body.enable_image_understanding = input.enableImageUnderstanding;
    }
    if (input.enableVideoUnderstanding != null) {
      body.enable_video_understanding = input.enableVideoUnderstanding;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new Error(`x-search timeout after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`x-search returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      const errMsg =
        (parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as Record<string, unknown>).error)
          : null) ?? `HTTP ${res.status}`;
      throw new Error(`x-search failed: ${errMsg}`);
    }

    const obj = (parsed ?? {}) as Record<string, unknown>;
    return {
      success: obj.success === true,
      query: typeof obj.query === "string" ? obj.query : input.query,
      results: Array.isArray(obj.results) ? obj.results : [],
      meta: obj.meta && typeof obj.meta === "object" ? (obj.meta as Record<string, unknown>) : undefined,
      service: typeof obj.service === "string" ? obj.service : undefined,
      error: typeof obj.error === "string" ? obj.error : undefined,
      ...obj
    };
  }

  return { search };
}

export function parseXSearchEnv(env: NodeJS.ProcessEnv): XSearchConfig | null {
  const endpoint = env.XSEARCH_ENDPOINT?.trim();
  const token = env.XSEARCH_API_TOKEN?.trim();
  if (!endpoint || !token) return null;
  const timeoutSec = Number(env.XSEARCH_TIMEOUT_SECONDS ?? 240);
  const timeoutMs = Number.isFinite(timeoutSec) && timeoutSec > 0
    ? Math.round(timeoutSec * 1000)
    : 240_000;
  return { endpoint, token, timeoutMs };
}
