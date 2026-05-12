// MiniMax T2A v2 (text-to-audio) connector.
// Returns raw MP3 bytes; caller decides where to persist.

const ENDPOINT = "https://api.minimaxi.com/v1/t2a_v2";
const MODEL = "speech-2.8-hd";

export interface MinimaxConfig {
  apiKey: string;
  voiceId: string;
}

export function parseMinimaxConfig(env: NodeJS.ProcessEnv): MinimaxConfig | null {
  const apiKey = env.MINIMAX_API_KEY?.trim();
  const voiceId = env.MINIMAX_VOICE_ID?.trim() || "AnnaClone2026new";
  if (!apiKey) return null;
  return { apiKey, voiceId };
}

interface MinimaxResponse {
  data?: { audio?: string };
  base_resp?: { status_code?: number; status_msg?: string };
}

export async function synthesizeVoice(config: MinimaxConfig, text: string): Promise<Buffer> {
  if (!text || text.trim().length === 0) throw new Error("text is empty");
  if (text.length > 5000) throw new Error("text too long (max 5000 chars)");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      text,
      stream: false,
      voice_setting: { voice_id: config.voiceId }
    })
  });

  if (!res.ok) throw new Error(`MiniMax HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json() as MinimaxResponse;
  const status = json.base_resp?.status_code;
  if (status !== undefined && status !== 0) {
    throw new Error(`MiniMax API error ${status}: ${json.base_resp?.status_msg}`);
  }
  const hex = json.data?.audio;
  if (!hex) throw new Error("MiniMax response missing data.audio");
  return Buffer.from(hex, "hex");
}
