import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import type {
  ProjectPipelineOperationContext,
  RuntimeCapabilityRegistry,
} from "@xpert-ai/plugin-sdk";
import { MarginService, digest } from "./service.js";
import { configSchema, resultSchema } from "./model.js";
import { configuration } from "./configuration.js";
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
const runtime = { require: vi.fn() };
const service = () =>
  new MarginService(
    {} as DataSource,
    runtime as unknown as RuntimeCapabilityRegistry,
    configSchema.parse({}),
  );
describe("governed margin workflow", () => {
  it("uses native route, two human gates and published assistant slots", () => {
    const f = configuration();
    expect(f.template.executionAuthority).toBe("platform");
    expect(
      f.template.nodes.filter((n) => n.kind === "human_gate"),
    ).toHaveLength(2);
    expect(f.template.nodes.filter((n) => n.kind === "router")).toHaveLength(1);
    expect(f.template.edges).toContainEqual({
      from: "record-approved",
      to: "execute",
    });
    expect(
      f.template.edges.some((e) => e.from === "propose" && e.to === "execute"),
    ).toBe(false);
  });
  it.each([
    [true, "action"],
    [false, "monitor"],
  ])(
    "routes typed evidence without mutation %s",
    async (needsAction, outcome) => {
      const s = service();
      vi.spyOn(s, "input").mockResolvedValue({
        caseId: randomUUID(),
        roundId: c.work.roundId,
        generation: 1,
        nodeKey: "discover",
        inputDigest: c.work.inputDigest,
        revision: 1,
        summary: "proof",
        needsAction,
        evidenceIds: [],
      });
      expect((await s.route(c)).outcome).toBe(outcome);
    },
  );
  it("requires exact round identity in finalized evidence", () => {
    expect(() =>
      resultSchema.parse({
        caseId: randomUUID(),
        nodeKey: "discover",
        inputDigest: "x",
        revision: 1,
        summary: "x",
        needsAction: true,
        evidenceIds: [],
      }),
    ).toThrow();
  });
  it("rejects stale and cross-round evidence before policy use", async () => {
    const s = service();
    const ref = {
      resolverRef: "margin_improvement.evidence@1",
      objectKey: randomUUID(),
      schemaRef: "margin_improvement.result@1",
      version: "x",
      digest: "x",
      producerOperationId: randomUUID(),
    };
    vi.spyOn(s, "evidence").mockResolvedValue({
      caseId: randomUUID(),
      roundId: randomUUID(),
      generation: 1,
      nodeKey: "propose",
      inputDigest: c.work.inputDigest,
      revision: 1,
      summary: "x",
      needsAction: true,
      evidenceIds: [],
    });
    await expect(
      s.input(
        { ...c, inputs: { proposal: { kind: "evidence", value: ref } } },
        "proposal",
      ),
    ).rejects.toThrow("stale_evidence");
  });
  it("does not accept an agent-provided selector as human authority", async () => {
    expect(await service().authorize(c, "assistant", "approved")).toBe(false);
  });
  it("canonical digest is key-order independent and content sensitive", () => {
    expect(digest({ a: 1, b: 2 })).toBe(digest({ b: 2, a: 1 }));
    expect(digest({ a: 2 })).not.toBe(digest({ a: 1 }));
  });
  it.each(["cancelled", "superseded", "completed"])(
    "rejects inactive work %s",
    async (state) => {
      runtime.require.mockReturnValue({
        graph: async () => ({
          runId: c.work.runId,
          roundId: c.work.roundId,
          runState: state,
          round: { generation: 1, inputDigest: c.work.inputDigest, state },
          nodes: [],
        }),
      });
      await expect(service().active(c)).rejects.toThrow(
        "platform_work_inactive",
      );
    },
  );
  it("rejects node identity outside the selected active round", async () => {
    runtime.require.mockReturnValue({
      graph: async () => ({
        runId: c.work.runId,
        roundId: c.work.roundId,
        runState: "active",
        round: {
          generation: 1,
          inputDigest: c.work.inputDigest,
          state: "active",
        },
        nodes: [],
      }),
    });
    await expect(service().active(c)).rejects.toThrow("platform_node_inactive");
  });
});
