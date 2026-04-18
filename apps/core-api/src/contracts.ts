import {
  auditEventSchema,
  connectorSchema,
  connectorSummarySchema,
  healthSnapshotSchema,
  healthSummarySchema,
  journalCollectionSchema,
  journalDraftInputSchema,
  journalDraftSavedSchema,
  publicStatusWidgetConfigSchema,
  profileSummarySchema,
  publicStatusCardSchema,
  publicStatusSchema
} from "@asashiki/schemas";
import { z } from "zod";

export const apiRuntimeSchema = z.object({
  milestone: z.literal("Milestone 2"),
  databasePath: z.string().min(1),
  sharedPackages: z.array(z.string().min(1)).min(1)
});

export type ApiRuntime = z.infer<typeof apiRuntimeSchema>;

export const publicCardsSchema = z.array(publicStatusCardSchema);
export { publicStatusWidgetConfigSchema };

export const recentAuditSchema = z.array(auditEventSchema);
export const connectorsSchema = z.array(connectorSchema);

export {
  connectorSummarySchema,
  healthSnapshotSchema,
  healthSummarySchema,
  journalCollectionSchema,
  journalDraftInputSchema,
  journalDraftSavedSchema,
  profileSummarySchema,
  publicStatusSchema
};
