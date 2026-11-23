import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { canPublishMethod, maintenanceAssistantId, organizationConfig } from "./organization-config.js";
import { installationSchema } from "./model.js";
import { PROJECT_TYPE } from "./definition.js";

const project = {
  ...PROJECT_TYPE,
  projectId: randomUUID(),
  role: "owner" as const,
  archived: false,
  canManage: true,
};
const roles = Object.fromEntries(
  [
    "contract",
    "engineering",
    "procurement",
    "production",
    "quality",
    "aftercare",
  ].map((key) => [key, randomUUID()]),
);
const coordinatorId = randomUUID();
const members = Object.fromEntries(
  Object.keys(roles).map((key) => [key, [randomUUID()]]),
);
const access = {
  ...project,
  applicationBindings: { coordinatorId, roles, settings: { members } },
};
describe("organization order configuration", () => {
  it("binds canonical role references and human approvers from the same installation", () => {
    const selected = organizationConfig(access);
    expect(selected.coordinatorId).toBe(coordinatorId);
    expect(selected.config.assistants).toEqual(roles);
    expect(selected.config.approvers).toEqual(members);
  });
  it("resolves maintenance and publication independently of order-stage approvers", () => {
    const assistant = randomUUID();
    const publisher = randomUUID();
    const maintenance = { ...project, applicationBindings: { roles: { capability: assistant } } };
    const publication = { ...project, applicationBindings: { settings: { members: { capabilityPublishers: [publisher] } } } };
    expect(maintenanceAssistantId(maintenance)).toBe(assistant);
    expect(maintenanceAssistantId(publication)).toBeUndefined();
    expect(canPublishMethod(maintenance, publisher)).toBe(false);
    expect(canPublishMethod(publication, publisher)).toBe(true);
    expect(canPublishMethod(publication, randomUUID())).toBe(false);
    expect(maintenanceAssistantId({ ...maintenance, applicationKey: "another-app" })).toBeUndefined();
    expect(canPublishMethod({ ...publication, projectTypeKey: "another-type" }, publisher)).toBe(false);
    expect(() => organizationConfig(maintenance)).toThrow("organization_application_setup_required");
    expect(() => organizationConfig(publication)).toThrow("organization_application_setup_required");
  });
  it("requires every role and approver and ignores old tenant-level selections", () => {
    expect(
      installationSchema.parse({ assistants: roles, approvers: members }),
    ).toEqual({ debug: false });
    expect(() => organizationConfig(project)).toThrow(
      "organization_application_setup_required",
    );
    const broken = {
      ...access,
      applicationBindings: { ...access.applicationBindings, roles: {} },
    };
    expect(() => organizationConfig(broken)).toThrow(
      "organization_application_setup_required",
    );
    expect(() =>
      organizationConfig({
        ...access,
        applicationBindings: {
          ...access.applicationBindings,
          settings: { members: {} },
        },
      } as typeof access),
    ).toThrow("organization_application_setup_required");
  });
});
