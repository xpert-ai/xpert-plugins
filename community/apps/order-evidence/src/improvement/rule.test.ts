import { describe, expect, it } from "vitest";
import {
  BASELINE_RULE,
  HOLDOUT_CASES,
  applyRule,
  evaluateRule,
  ruleSchema,
  type AftercareRule,
} from "./rule.js";
import { fixture, fixtureFor } from "../fixture.js";
import { configuration, descriptors } from "../configuration.js";
import { checkProjectPipelineConfiguration } from "@xpert-ai/contracts";

const rule: AftercareRule = {
  productFamily: "M200",
  requiredEvidence: [
    "service_report",
    "operating_conditions",
    "teardown",
    "reproduction_test",
  ],
  keepRootCauseAsHypothesis: true,
};
describe("aftercare method evidence and authority", () => {
  it("keeps old flow history and adds a supplement-evidence route only to the adoption template", () => {
    expect(configuration().template.version).toBe("1.1.0");
    const next = configuration({}, true);
    expect(next.template.version).toBe("1.2.0");
    expect(
      next.template.nodes.find(
        (node) => node.key === "wait-aftercare-evidence",
      ),
    ).toMatchObject({ kind: "terminal", disposition: "await_new_subject" });
    expect(next.template.edges).toContainEqual({
      from: "check-adopted-method",
      to: "wait-aftercare-evidence",
      outcome: "hold",
    });
    expect(next.template.edges).toContainEqual({
      from: "check-adopted-method",
      to: "approve-aftercare",
      outcome: "proceed",
    });
    expect(
      checkProjectPipelineConfiguration(next, [
        ...descriptors,
        { kind: "schema", ref: "platform.human-decision@1" },
        { kind: "completion", ref: "platform.output-validated@1" },
      ]).issues,
    ).toEqual([]);
  });
  it.each(Array.from({ length: 15 }, (_, i) => i))(
    "requests evidence for incomplete combination %s",
    (mask) => {
      const availableEvidence = rule.requiredEvidence.filter(
        (_, index) => mask & (1 << index),
      );
      const result = applyRule(rule, {
        productFamily: "M200",
        availableEvidence,
      });
      expect(result.outcome).toBe("request_evidence");
      expect(result.missingEvidence.length).toBeGreaterThan(0);
    },
  );
  it("routes complete evidence to a human instead of treating it as approval", () => {
    expect(
      applyRule(rule, {
        productFamily: "M200",
        availableEvidence: rule.requiredEvidence,
      }).outcome,
    ).toBe("human_review");
  });
  it("does not apply a product-specific method outside its scope", () => {
    expect(
      applyRule(rule, { productFamily: "M300", availableEvidence: [] }),
    ).toMatchObject({ outcome: "not_applicable", missingEvidence: [] });
  });
  it("fails a candidate that omits teardown or human root-cause review", () => {
    const missingTeardown = {
      ...rule,
      requiredEvidence: rule.requiredEvidence.filter(
        (kind) => kind !== "teardown",
      ),
    };
    expect(
      evaluateRule(BASELINE_RULE, missingTeardown).find(
        (row) => row.id === "H03",
      )?.passed,
    ).toBe(false);
    expect(
      evaluateRule(BASELINE_RULE, {
        ...rule,
        keepRootCauseAsHypothesis: false,
      }).find((row) => row.id === "H05")?.passed,
    ).toBe(false);
  });
  it("executes baseline and candidate on independent holdouts", () => {
    const rows = evaluateRule(BASELINE_RULE, rule);
    expect(rows.filter((row) => row.baseline === row.expected)).toHaveLength(3);
    expect(rows.filter((row) => row.passed)).toHaveLength(8);
    expect(new Set(HOLDOUT_CASES.map((row) => row.id)).size).toBe(8);
    expect(
      HOLDOUT_CASES.every(
        (row) => !fixture.documents.some((doc) => doc.id === row.id),
      ),
    ).toBe(true);
  });
  it("keeps the next order distinct and explicitly requires a published method", () => {
    const next = fixtureFor("next_order_adoption");
    expect(next.orderId).not.toBe(fixture.orderId);
    expect(next.adoptPublishedMethod).toBe(true);
    expect(
      next.documents.some((document) => document.kind === "inspection"),
    ).toBe(false);
    expect(applyRule(rule, next.aftercareFacts!).missingEvidence).toEqual([
      "operating_conditions",
      "teardown",
      "reproduction_test",
    ]);
    expect(
      fixture.documents.some((document) => document.kind === "inspection"),
    ).toBe(true);
  });
  it("rejects duplicate evidence requirements and unbounded model-supplied fields", () => {
    expect(
      ruleSchema.safeParse({
        ...rule,
        requiredEvidence: ["teardown", "teardown"],
      }).success,
    ).toBe(false);
    expect(ruleSchema.safeParse({ ...rule, approved: true }).success).toBe(
      false,
    );
  });
});
