import { ConflictException } from "@nestjs/common";
import { z } from "zod/v3";
import type { ProjectHumanAccess } from "@xpert-ai/plugin-sdk";
import { PROJECT_TYPE, ROLES } from "./definition.js";
import { configSchema } from "./model.js";

const scopedAccess = z.object({
  applicationKey: z.literal(PROJECT_TYPE.applicationKey),
  projectTypeKey: z.literal(PROJECT_TYPE.projectTypeKey),
  applicationBindings: z.object({
    coordinatorId: z.string().uuid(),
    roles: z.record(z.string().uuid()),
    settings: z.object({
      queries: z.object({
        analysisBinding: z.unknown(),
        factsBinding: z.unknown(),
        reviewBinding: z.unknown(),
      }),
    }),
  }),
});
export function organizationConfig(access: ProjectHumanAccess) {
  const parsed = scopedAccess.safeParse(access);
  if (!parsed.success)
    throw new ConflictException("organization_application_setup_required");
  const { coordinatorId, roles, settings } = parsed.data.applicationBindings;
  const assistants = Object.fromEntries(
    ROLES.filter((r) => r.key !== "coordinator").map((r) => [
      r.key,
      roles[r.key],
    ]),
  );
  const validated = configSchema.safeParse({ assistants, ...settings.queries });
  if (!validated.success)
    throw new ConflictException("organization_application_setup_required");
  const config = validated.data;
  if (
    [config.analysisBinding, config.factsBinding, config.reviewBinding].some(
      (b) => b?.providerId !== "data-xpert.ontology",
    )
  )
    throw new ConflictException("organization_ontology_queries_required");
  return { coordinatorId, config };
}
