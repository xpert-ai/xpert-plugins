import { z } from "zod/v3";
import type { Snapshot } from "./fixture.js";
import { ARTIFACT_NAMESPACE } from "./definition.js";

export const routingFactsSchema = z
  .object({
    materials: z
      .object({
        available: z.number().int().nonnegative(),
        inTransit: z.number().int().nonnegative(),
        arrivalConfirmed: z.boolean(),
      })
      .strict(),
    quality: z
      .object({
        tested: z.number().int().nonnegative(),
        passed: z.number().int().nonnegative(),
        traceable: z.number().int().nonnegative(),
        deliveryPackComplete: z.boolean(),
      })
      .strict()
      .refine((v) => v.passed <= v.tested, "passed_cannot_exceed_tested"),
  })
  .strict();
export const routingStages = ["contract", "procurement", "quality"] as const;
export type RoutingStage = (typeof routingStages)[number];
export const checkRef = (stage: RoutingStage) =>
  `${ARTIFACT_NAMESPACE}.check_${stage}@1`;
export const routingSpecs = {
  contract: {
    title: "要求证据齐备？",
    proceed: "齐备，交人确认",
    hold: "缺少依据，补证",
    waiting: "等待技术要求补证",
  },
  procurement: {
    title: "供应覆盖需求？",
    proceed: "覆盖需求，审核方案",
    hold: "缺口或到期未确认",
    waiting: "等待供应补证",
  },
  quality: {
    title: "满足放行依据？",
    proceed: "试验通过且可追溯",
    hold: "不满足，补检 / 返工",
    waiting: "等待质量补证",
  },
} as const;

/** Typed source facts select paths; neither model prose nor labels authorize business actions. */
export function evaluateBusinessRoute(
  stage: RoutingStage,
  snapshot: Snapshot,
): "proceed" | "hold" {
  const kinds = new Set(snapshot.documents.map((d) => d.kind));
  if (stage === "contract")
    return kinds.has("contract") && kinds.has("clarification")
      ? "proceed"
      : "hold";
  const facts = snapshot.routingFacts;
  if (!facts) return "hold";
  if (stage === "procurement") {
    if (!kinds.has("material") || !kinds.has("purchase")) return "hold";
    const m = facts.materials;
    // Confirmed transit supports a conditional supply plan, never available stock or goods receipt.
    return m.available >= snapshot.quantity ||
      (m.arrivalConfirmed && m.available + m.inTransit >= snapshot.quantity)
      ? "proceed"
      : "hold";
  }
  const q = facts.quality;
  return kinds.has("test") &&
    kinds.has("serial") &&
    kinds.has("delivery") &&
    q.tested >= snapshot.quantity &&
    q.passed >= snapshot.quantity &&
    q.traceable >= snapshot.quantity &&
    q.deliveryPackComplete
    ? "proceed"
    : "hold";
}
export const demoScenarioSchema = z.enum([
  "standard",
  "requirements_missing",
  "next_order_adoption",
]);
export type DemoScenario = z.infer<typeof demoScenarioSchema>;
