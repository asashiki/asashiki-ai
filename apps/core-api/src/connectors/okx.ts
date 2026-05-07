import { createHmac } from "node:crypto";

const BASE_URL = "https://www.okx.com";

function sign(timestamp: string, method: string, path: string, secretKey: string): string {
  const message = `${timestamp}${method}${path}`;
  return createHmac("sha256", secretKey).update(message).digest("base64");
}

function headers(apiKey: string, secretKey: string, passphrase: string) {
  const timestamp = new Date().toISOString();
  return {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": sign(timestamp, "GET", "", secretKey),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json"
  };
}

async function okxGet(path: string, apiKey: string, secretKey: string, passphrase: string) {
  const timestamp = new Date().toISOString();
  const sig = sign(timestamp, "GET", path, secretKey);
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": sig,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) throw new Error(`OKX HTTP ${res.status}`);
  const json = await res.json() as { code: string; msg: string; data: unknown[] };
  if (json.code !== "0") throw new Error(`OKX API error ${json.code}: ${json.msg}`);
  return json.data;
}

export interface OkxConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

export function createOkxConnector(config: OkxConfig) {
  const { apiKey, secretKey, passphrase } = config;

  async function getAccountBalance() {
    const data = await okxGet("/api/v5/account/balance", apiKey, secretKey, passphrase) as any[];
    const acct = data[0] ?? {};
    const details = (acct.details ?? []) as Array<{
      ccy: string; eq: string; availEq: string; frozenBal: string; usdEq: string;
    }>;
    return {
      fetchedAt: new Date().toISOString(),
      totalEquityUsd: Number(acct.totalEq ?? 0),
      holdings: details
        .filter((d) => Number(d.eq) > 0)
        .map((d) => ({
          currency: d.ccy,
          balance: Number(d.eq),
          available: Number(d.availEq),
          frozen: Number(d.frozenBal),
          valueUsd: Number(d.usdEq)
        }))
        .sort((a, b) => b.valueUsd - a.valueUsd)
    };
  }

  async function getPositions() {
    const data = await okxGet("/api/v5/account/positions", apiKey, secretKey, passphrase) as any[];
    return {
      fetchedAt: new Date().toISOString(),
      positions: data.map((p) => ({
        instrument: p.instId,
        type: p.instType,
        side: p.posSide,
        size: Number(p.pos),
        entryPrice: Number(p.avgPx),
        markPrice: Number(p.markPx),
        unrealizedPnl: Number(p.upl),
        unrealizedPnlRatio: Number(p.uplRatio),
        leverage: Number(p.lever),
        margin: Number(p.margin),
        currency: p.ccy,
        updatedAt: new Date(Number(p.uTime)).toISOString()
      }))
    };
  }

  async function getAssetBalances() {
    const data = await okxGet("/api/v5/asset/balances", apiKey, secretKey, passphrase) as any[];
    return {
      fetchedAt: new Date().toISOString(),
      assets: data
        .filter((a: any) => Number(a.bal) > 0)
        .map((a: any) => ({
          currency: a.ccy,
          balance: Number(a.bal),
          available: Number(a.availBal),
          frozen: Number(a.frozenBal)
        }))
        .sort((a: any, b: any) => b.balance - a.balance)
    };
  }

  return { getAccountBalance, getPositions, getAssetBalances };
}

export function parseOkxEnv(env: NodeJS.ProcessEnv): OkxConfig | null {
  const apiKey = env.OKX_API_KEY?.trim();
  const secretKey = env.OKX_SECRET_KEY?.trim();
  const passphrase = env.OKX_PASSPHRASE?.trim();
  if (!apiKey || !secretKey || !passphrase) return null;
  return { apiKey, secretKey, passphrase };
}
