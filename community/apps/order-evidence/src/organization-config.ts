import { ConflictException } from "@nestjs/common";
import { z } from "zod/v3";
import type { ProjectHumanAccess } from "@xpert-ai/plugin-sdk";
import { PROJECT_TYPE } from "./definition.js";
import { configSchema } from "./model.js";

const orderProject = z.object({
  applicationKey: z.literal(PROJECT_TYPE.applicationKey),
  projectTypeKey: z.literal(PROJECT_TYPE.projectTypeKey),
});
const scopedAccess = orderProject.extend({
  applicationBindings: z.object({
    coordinatorId: z.string().uuid(),
    roles: configSchema.shape.assistants.unwrap().strip(),
    settings: z.object({ members: configSchema.shape.approvers.unwrap().strip() }),
  }),
});
export function organizationConfig(access: ProjectHumanAccess) {
  const parsed = scopedAccess.safeParse(access);
  if (!parsed.success)
    throw new ConflictException("organization_application_setup_required");
  const { coordinatorId, roles, settings } = parsed.data.applicationBindings;
  return { coordinatorId, config: { assistants: roles, approvers: settings.members } };
}

const maintenanceRole = orderProject.extend({
  applicationBindings: z.object({ roles: z.object({ capability: z.string().uuid() }) }),
});
const methodPublication = orderProject.extend({
  applicationBindings: z.object({
    settings: z.object({ members: z.object({ capabilityPublishers: z.array(z.string().uuid()) }) }),
  }),
});

export function maintenanceAssistantId(access: ProjectHumanAccess) {
  const binding = maintenanceRole.safeParse(access);
  return binding.success ? binding.data.applicationBindings.roles.capability : undefined;
}

export function canPublishMethod(access: ProjectHumanAccess, userId: string) {
  const binding = methodPublication.safeParse(access);
  return binding.success && binding.data.applicationBindings.settings.members.capabilityPublishers.includes(userId);
}
