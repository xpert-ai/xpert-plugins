import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import {
  DefaultRuntimeCapabilityRegistry,
  type ProjectPipelineOperationContext,
} from "@xpert-ai/plugin-sdk";
import { checkProjectPipelineConfiguration } from "@xpert-ai/contracts";
import { configuration, descriptors } from "./configuration.js";
import { routingStages } from "./routing.js";
import { STEPS, refs } from "./definition.js";
import { fixture, documentsFor } from "./fixture.js";
import { validateStageEvidence, type PriorEvidence } from "./policy.js";
import { OrderService, digest, owner } from "./service.js";
import { OrderRulesService } from "./improvement/rules.service.js";
import { configSchema, resultSchema, finalizeSchema } from "./model.js";
const c: ProjectPipelineOperationContext = {
  actor: {
    tenantId: randomUUID(),
    organizationId: randomUUID(),
    userId: randomUUID(),
  },
  projectId: randomUUID(),
  work: {
    instanceId: randomUUID(),
    runId: randomUUID(),
    roundId: randomUUID(),
    nodeInstanceId: randomUUID(),
    operationId: randomUUID(),
    inputDigest: "a".repeat(64),
    generation: 1,
  },
  idempotencyKey: randomUUID(),
  inputs: {},
  parameters: {},
  subjects: [],
};
const result = (nodeKey: string): PriorEvidence => ({
  caseId: randomUUID(),
  roundId: c.work.roundId,
  generation: 1,
  nodeKey,
  inputDigest: c.work.inputDigest,
  revision: 1,
  summary: "Evidence assessment",
  improvementSuggested: false,
  evidenceIds: [],
  evidenceId: randomUUID(),
  digest: "current-proposal",
});
const service = () =>
  new OrderService(
    new DataSource({ type: "postgres" }),
    new DefaultRuntimeCapabilityRegistry(),
    configSchema.parse({}),
    new OrderRulesService(
      new DataSource({ type: "postgres" }),
      new DefaultRuntimeCapabilityRegistry(),
    ),
  );
describe("order decision boundaries", () => {
  it("requires a native human decision at every stage before advancement", () => {
    const f = configuration();
    expect(
      f.template.nodes.filter((n) => n.kind === "human_gate"),
    ).toHaveLength(6);
    for (const s of STEPS) {
      expect(f.template.edges).toContainEqual({
        from: s.key,
        to: routingStages.some((stage) => stage === s.key)
          ? `check-${s.key}`
          : `approve-${s.key}`,
      });
      expect(f.template.edges).toContainEqual({
        from: `approve-${s.key}`,
        to: `record-${s.key}-rejected`,
        outcome: "rejected",
      });
    }
    expect(f.template.executionAuthority).toBe("platform");
  });
  it("validates against the public configuration checker", () => {
    const result = checkProjectPipelineConfiguration(configuration(), [
      ...descriptors,
      { kind: "schema", ref: "platform.human-decision@1" },
      { kind: "completion", ref: "platform.output-validated@1" },
    ]);
    expect(result.issues).toEqual([]);
  });
  it("accepts the natural judgment-only tool payload", () =>
    expect(
      finalizeSchema.parse({
        assessment:
          "这是合成资料的独立判断，需销售与工程确认防护等级适用部位，助手不能自行批准或更改技术条件。",
        evidenceIds: ["CON-1201", "CLR-1201"],
      }),
    ).toBeTruthy());
  it("rejects unrelated or forged source evidence", () =>
    expect(() =>
      validateStageEvidence(
        "contract",
        fixture,
        ["CON-1201", "CLR-1201", "OTHER-PROJECT"],
        [],
      ),
    ).toThrow("unknown_evidence"));
  it("rejects a partial evidence set", () =>
    expect(() =>
      validateStageEvidence("contract", fixture, ["CON-1201"], []),
    ).toThrow("all_stage_source_evidence_required"));
  it("accepts complete first-stage evidence without granting approval", () =>
    expect(() =>
      validateStageEvidence(
        "contract",
        fixture,
        documentsFor(fixture, "contract").map((d) => d.id),
        [],
      ),
    ).not.toThrow());
  it.each(["missing", "rejected", "changed"])(
    "blocks downstream work when predecessor approval is %s",
    (mode) => {
      const p = result("contract");
      const approval = {
        ...result("approve-contract"),
        approved: mode !== "rejected",
        proposalDigest: mode === "changed" ? "old-version" : p.digest,
      };
      expect(() =>
        validateStageEvidence(
          "engineering",
          fixture,
          ["CLR-1201", "BOM-1201"],
          mode === "missing" ? [p] : [p, approval],
        ),
      ).toThrow("exact_predecessor_human_approval_required");
    },
  );
  it("accepts exact predecessor proposal approval", () => {
    const p = result("contract");
    expect(() =>
      validateStageEvidence(
        "engineering",
        fixture,
        ["CLR-1201", "BOM-1201"],
        [
          p,
          {
            ...result("approve-contract"),
            approved: true,
            proposalDigest: p.digest,
          },
        ],
      ),
    ).not.toThrow();
  });
  it.each([
    [true, "change"],
    [false, "monitor"],
  ])(
    "routes only typed business state %s",
    async (improvementSuggested, outcome) => {
      const s = service();
      vi.spyOn(s, "input").mockResolvedValue({
        ...result("approve-aftercare"),
        improvementSuggested,
      });
      expect((await s.route(c)).outcome).toBe(outcome);
    },
  );
  it("rejects another round’s evidence", async () => {
    const s = service();
    vi.spyOn(s, "evidence").mockResolvedValue({
      ...result("contract"),
      roundId: randomUUID(),
    });
    const ref = {
      resolverRef: refs.evidence,
      objectKey: randomUUID(),
      version: "x",
      digest: "x",
      schemaRef: refs.result,
    };
    await expect(
      s.input(
        { ...c, inputs: { proposal: { kind: "evidence", value: ref } } },
        "proposal",
      ),
    ).rejects.toThrow("stale_evidence");
  });
  it("does not grant approval to an assistant selector", async () =>
    expect(await service().authorize(c, "assistant", "approved")).toBe(false));
  it("pins scope and revision identity", () => {
    expect(owner(c)).toEqual({
      tenantId: c.actor.tenantId,
      organizationId: c.actor.organizationId,
      projectId: c.projectId,
    });
    expect(() => resultSchema.parse({ summary: "x" })).toThrow();
    expect(digest({ x: 1, y: 2 })).toBe(digest({ y: 2, x: 1 }));
    expect(digest({ x: 2 })).not.toBe(digest({ x: 1 }));
  });
});
