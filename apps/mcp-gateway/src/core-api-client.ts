import {
  connectorSchema,
  connectorSummarySchema,
  healthSummarySchema,
  journalDraftInputSchema,
  journalDraftSavedSchema,
  profileSummarySchema,
  recentContextSchema
} from "@asashiki/schemas";

function resolveUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

export function createCoreApiClient(baseUrl: string) {
  return {
    async getProfileSummary() {
      const response = await fetch(resolveUrl(baseUrl, "/api/profile/summary"));

      if (!response.ok) {
        throw new Error("Failed to load profile summary from Core API.");
      }

      return profileSummarySchema.parse(await response.json());
    },

    async getRecentContext() {
      const response = await fetch(resolveUrl(baseUrl, "/api/context/recent"));

      if (!response.ok) {
        throw new Error("Failed to load recent context from Core API.");
      }

      return recentContextSchema.parse(await response.json());
    },

    async createJournalDraft(input: unknown) {
      const baseInput =
        typeof input === "object" && input !== null
          ? (input as Record<string, unknown>)
          : {};

      const payload = journalDraftInputSchema.parse({
        ...baseInput,
        source:
          typeof baseInput.source === "string"
            ? baseInput.source
            : "mcp-gateway"
      });

      const response = await fetch(resolveUrl(baseUrl, "/api/journals/drafts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Failed to create journal draft via Core API.");
      }

      return journalDraftSavedSchema.parse(await response.json());
    },

    async getHealthSummary() {
      const response = await fetch(resolveUrl(baseUrl, "/api/health/summary"));

      if (!response.ok) {
        throw new Error("Failed to load health summary from Core API.");
      }

      return healthSummarySchema.parse(await response.json());
    },

    async getConnectorStatus() {
      const [summaryResponse, connectorsResponse] = await Promise.all([
        fetch(resolveUrl(baseUrl, "/api/connectors/summary")),
        fetch(resolveUrl(baseUrl, "/api/connectors"))
      ]);

      if (!summaryResponse.ok || !connectorsResponse.ok) {
        throw new Error("Failed to load connector status from Core API.");
      }

      return {
        summary: connectorSummarySchema.parse(await summaryResponse.json()),
        connectors: connectorSchema.array().parse(await connectorsResponse.json())
      };
    }
  };
}

export type CoreApiClient = ReturnType<typeof createCoreApiClient>;
