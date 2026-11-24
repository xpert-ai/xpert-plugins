import { z } from "zod/v3";

export const evidenceKindSchema = z.enum([
  "service_report",
  "operating_conditions",
  "teardown",
  "reproduction_test",
]);
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export const evidenceLabels: Record<EvidenceKind, string> = {
  service_report: "报修记录",
  operating_conditions: "运行工况",
  teardown: "拆检记录",
  reproduction_test: "复现实验",
};
export const ruleSchema = z
  .object({
    productFamily: z.literal("M200"),
    requiredEvidence: z
      .array(evidenceKindSchema)
      .min(1)
      .max(4)
      .refine(
        (kinds) => new Set(kinds).size === kinds.length,
        "duplicate_evidence_kind",
      ),
    keepRootCauseAsHypothesis: z.boolean(),
  })
  .strict();
export type AftercareRule = z.infer<typeof ruleSchema>;
export const factsSchema = z
  .object({
    productFamily: z.string().min(1),
    availableEvidence: z.array(evidenceKindSchema).max(4),
  })
  .strict();
export type AftercareFacts = z.infer<typeof factsSchema>;
export type RuleOutcome =
  | "request_evidence"
  | "human_review"
  | "draft_conclusion"
  | "not_applicable";
export const outcomeLabels: Record<RuleOutcome, string> = {
  request_evidence: "先补证，保留根因假设",
  human_review: "证据齐备，交人类确认根因",
  draft_conclusion: "按已有线索形成根因草案",
  not_applicable: "超出 M200 适用范围",
};
export const BASELINE_RULE: AftercareRule = {
  productFamily: "M200",
  requiredEvidence: ["service_report"],
  keepRootCauseAsHypothesis: false,
};
export const BASELINE_VERSION = "A1";
export const DATASET_VERSION = "aftercare-routing-holdout/1";
type RuleCase = {
  id: string;
  title: string;
  input: AftercareFacts;
  expected: RuleOutcome;
};
// Independent, explicitly labelled synthetic holdouts; never copied from a source order.
export const HOLDOUT_CASES: readonly RuleCase[] = [
  {
    id: "H01",
    title: "只有报修线索",
    input: { productFamily: "M200", availableEvidence: ["service_report"] },
    expected: "request_evidence",
  },
  {
    id: "H02",
    title: "缺少运行工况",
    input: {
      productFamily: "M200",
      availableEvidence: ["service_report", "teardown", "reproduction_test"],
    },
    expected: "request_evidence",
  },
  {
    id: "H03",
    title: "缺少拆检记录",
    input: {
      productFamily: "M200",
      availableEvidence: [
        "service_report",
        "operating_conditions",
        "reproduction_test",
      ],
    },
    expected: "request_evidence",
  },
  {
    id: "H04",
    title: "缺少复现实验",
    input: {
      productFamily: "M200",
      availableEvidence: ["service_report", "operating_conditions", "teardown"],
    },
    expected: "request_evidence",
  },
  {
    id: "H05",
    title: "四类证据齐备仍需人确认",
    input: {
      productFamily: "M200",
      availableEvidence: [
        "service_report",
        "operating_conditions",
        "teardown",
        "reproduction_test",
      ],
    },
    expected: "human_review",
  },
  {
    id: "H06",
    title: "缺少原始报修记录",
    input: {
      productFamily: "M200",
      availableEvidence: [
        "operating_conditions",
        "teardown",
        "reproduction_test",
      ],
    },
    expected: "request_evidence",
  },
  {
    id: "H07",
    title: "其他产品不套用规则",
    input: { productFamily: "M300", availableEvidence: ["service_report"] },
    expected: "not_applicable",
  },
  {
    id: "H08",
    title: "没有来源资料",
    input: { productFamily: "M200", availableEvidence: [] },
    expected: "request_evidence",
  },
];
export function applyRule(rule: AftercareRule, input: AftercareFacts) {
  const missing = rule.requiredEvidence.filter(
    (kind) => !input.availableEvidence.includes(kind),
  );
  const outcome: RuleOutcome =
    input.productFamily !== rule.productFamily
      ? "not_applicable"
      : missing.length
        ? "request_evidence"
        : rule.keepRootCauseAsHypothesis
          ? "human_review"
          : "draft_conclusion";
  return {
    outcome,
    label: outcomeLabels[outcome],
    missingEvidence: outcome === "not_applicable" ? [] : missing,
  };
}
export function evaluateRule(
  baseline: AftercareRule,
  candidate: AftercareRule,
) {
  return HOLDOUT_CASES.map((sample) => ({
    ...sample,
    baseline: applyRule(baseline, sample.input).outcome,
    candidate: applyRule(candidate, sample.input).outcome,
    passed: applyRule(candidate, sample.input).outcome === sample.expected,
  }));
}
export const proposeSchema = ruleSchema
  .extend({
    rationale: z.string().min(40).max(1800),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type ProposeInput = z.infer<typeof proposeSchema>;
