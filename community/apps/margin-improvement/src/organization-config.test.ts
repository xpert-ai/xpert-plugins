import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { organizationConfig } from "./organization-config.js";
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
  ["finance", "procurement", "execution"].map((key) => [key, randomUUID()]),
);
const coordinatorId = randomUUID();
const binding = {
  id: "analysis",
  source: {
    kind: "definition",
    definitionId: randomUUID(),
    versionId: randomUUID(),
  },
  providerId: "data-xpert.ontology",
  operation: "action",
  contractVersion: 1,
  parameters: [],
  payload: {},
  output: {
    datasetId: "margin",
    grain: [],
    fields: [
      {
        id: "actual",
        sourceField: "actual",
        label: "Actual",
        role: "measure",
        nullable: false,
        logicalType: "decimal",
      },
    ],
  },
};
const queries = {
  analysisBinding: binding,
  factsBinding: binding,
  reviewBinding: binding,
};
const access = {
  ...project,
  applicationBindings: { coordinatorId, roles, settings: { queries } },
};
describe("organization margin configuration", () => {
  it("binds roles and the three scoped ontology queries", () => {
    const selected = organizationConfig(access);
    expect(selected.coordinatorId).toBe(coordinatorId);
    expect(selected.config.assistants).toEqual(roles);
    expect(selected.config.factsBinding?.source).toEqual(binding.source);
  });
  it("rejects old tenant bindings, missing setup, and a mismatched provider", () => {
    expect(installationSchema.parse({ assistants: roles, ...queries })).toEqual(
      {},
    );
    expect(() => organizationConfig(project)).toThrow(
      "organization_application_setup_required",
    );
    const wrong = {
      ...access,
      applicationBindings: {
        ...access.applicationBindings,
        settings: {
          queries: {
            ...queries,
            reviewBinding: { ...binding, providerId: "other.provider" },
          },
        },
      },
    };
    expect(() => organizationConfig(wrong)).toThrow(
      "organization_ontology_queries_required",
    );
  });
});
