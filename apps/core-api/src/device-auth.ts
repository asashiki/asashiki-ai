import { z } from "zod";
import type { DeviceIdentity } from "./repository.js";

const deviceTokenEntrySchema = z.object({
  token: z.string().min(8),
  deviceId: z.string().min(1).max(64),
  deviceName: z.string().min(1).max(80),
  platform: z.string().min(1).max(32)
});

const deviceTokensSchema = z.array(deviceTokenEntrySchema).max(32);

export type DeviceTokenEntry = z.infer<typeof deviceTokenEntrySchema>;

export function parseDeviceTokens(raw: string | undefined): DeviceTokenEntry[] {
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `DEVICE_TOKENS_JSON is not valid JSON: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }

  return deviceTokensSchema.parse(parsed);
}

export function createDeviceAuth(entries: DeviceTokenEntry[]) {
  const lookup = new Map<string, DeviceIdentity>();

  for (const entry of entries) {
    lookup.set(entry.token, {
      deviceId: entry.deviceId,
      deviceName: entry.deviceName,
      platform: entry.platform
    });
  }

  return {
    isEnabled() {
      return lookup.size > 0;
    },

    listDevices(): DeviceIdentity[] {
      return [...lookup.values()];
    },

    resolve(authorizationHeader: unknown): DeviceIdentity | null {
      if (typeof authorizationHeader !== "string") {
        return null;
      }

      const [scheme, token] = authorizationHeader.split(" ");

      if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
      }

      return lookup.get(token.trim()) ?? null;
    }
  };
}

export type DeviceAuth = ReturnType<typeof createDeviceAuth>;
