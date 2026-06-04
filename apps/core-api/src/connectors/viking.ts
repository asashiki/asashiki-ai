export interface VikingConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

export type VikingWriteMode = "create" | "append" | "replace";

export interface VikingWriteResult {
  uri: string;
  rootUri?: string;
  contextType?: string;
  mode: VikingWriteMode;
  writtenBytes: number;
  contentUpdated?: boolean;
  semanticStatus?: string;
  vectorStatus?: string;
}

export class VikingError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "VikingError";
    this.status = status;
    this.code = code;
  }
}

export function createVikingConnector(config: VikingConfig) {
  const { baseUrl, token, timeoutMs } = config;
  const base = baseUrl.replace(/\/$/, "");

  async function postJson(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
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
        throw new VikingError(`Viking ${path} timeout`, 504, "TIMEOUT");
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
      throw new VikingError(
        `Viking ${path} non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`,
        res.status,
        "BAD_RESPONSE"
      );
    }
    const obj = (parsed ?? {}) as Record<string, unknown>;
    if (obj.status !== "ok") {
      const err = (obj.error ?? {}) as Record<string, unknown>;
      throw new VikingError(
        typeof err.message === "string" ? err.message : `Viking ${path} failed`,
        res.status,
        typeof err.code === "string" ? err.code : "UNKNOWN"
      );
    }
    return obj.result;
  }

  async function writeContent(
    uri: string,
    content: string,
    mode: VikingWriteMode
  ): Promise<VikingWriteResult> {
    const result = (await postJson("/api/v1/content/write", {
      uri,
      content,
      mode,
      wait: false
    })) as Record<string, unknown>;
    return {
      uri: String(result.uri ?? uri),
      rootUri: typeof result.root_uri === "string" ? result.root_uri : undefined,
      contextType: typeof result.context_type === "string" ? result.context_type : undefined,
      mode: (result.mode as VikingWriteMode) ?? mode,
      writtenBytes: Number(result.written_bytes ?? content.length),
      contentUpdated: typeof result.content_updated === "boolean" ? result.content_updated : undefined,
      semanticStatus: typeof result.semantic_status === "string" ? result.semantic_status : undefined,
      vectorStatus: typeof result.vector_status === "string" ? result.vector_status : undefined
    };
  }

  return { writeContent };
}

export type VikingConnector = ReturnType<typeof createVikingConnector>;

export function parseVikingEnv(env: NodeJS.ProcessEnv): VikingConfig | null {
  const baseUrl = env.VIKING_API_BASE?.trim();
  const token = env.VIKING_API_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  const timeoutSec = Number(env.VIKING_TIMEOUT_SECONDS ?? 30);
  const timeoutMs = Number.isFinite(timeoutSec) && timeoutSec > 0
    ? Math.round(timeoutSec * 1000)
    : 30_000;
  return { baseUrl, token, timeoutMs };
}
