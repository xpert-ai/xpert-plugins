import { createRequire } from "node:module";
import type { XpertProjectTypeRef } from "@xpert-ai/contracts";
import { z } from "zod/v3";

export const PACKAGE_METADATA = z
  .object({
    name: z.literal("@xpert-ai/plugin-margin-improvement"),
    version: z.string().min(1),
    xpert: z.object({
      plugin: z.object({
        level: z.literal("tenant"),
        artifactNamespace: z.literal("margin_improvement"),
      }),
    }),
  })
  .parse(createRequire(import.meta.url)("../package.json"));
export const NAME = PACKAGE_METADATA.name;
export const VERSION = PACKAGE_METADATA.version;
export const ICON = {
  type: "emoji" as const,
  value: "📈",
  background: "#E0F2EE",
};
export const PROJECT_TYPE: XpertProjectTypeRef = {
  applicationKey: `${NAME}:margin-improvement`,
  projectTypeKey: "improvement",
};
export const ROLES = [
  {
    key: "coordinator",
    title: "经营改善协调 Assistant",
    emoji: "🧭",
    color: "#E3ECF6",
  },
  {
    key: "finance",
    title: "财务分析 Assistant",
    emoji: "📊",
    color: "#DEF2ED",
  },
  {
    key: "procurement",
    title: "采购核实 Assistant",
    emoji: "🔎",
    color: "#E5EBFA",
  },
  {
    key: "execution",
    title: "受控执行 Assistant",
    emoji: "⚙️",
    color: "#FFF0D6",
  },
] as const;
export type Role = (typeof ROLES)[number]["key"];
export const STEPS = [
  {
    key: "discover",
    role: "finance",
    title: "发现经营偏差",
    stage: "analysis",
  },
  {
    key: "verify",
    role: "procurement",
    title: "核实采购与订单事实",
    stage: "analysis",
  },
  {
    key: "propose",
    role: "finance",
    title: "形成有据可查的处置方案",
    stage: "decision",
  },
  {
    key: "execute",
    role: "execution",
    title: "批准后执行并取得回执",
    stage: "delivery",
  },
  { key: "review", role: "finance", title: "同口径复查结果", stage: "review" },
] as const;
export type Step = (typeof STEPS)[number]["key"];
export const templateKey = (role: Role) => `margin-improvement-${role}`;
export const agentKey = (role: Role) => `Agent_${role}`;
export const middleware = (role: Role) => `margin_improvement_${role}`;
export const refs = {
  subject: "margin_improvement.case@1",
  evidence: "margin_improvement.evidence@1",
  result: "margin_improvement.result@1",
  route: "margin_improvement.route@1",
  approval: "margin_improvement.approval@1",
  decision: "margin_improvement.decision@1",
} as const;
export const operationRef = (step: Step) => `margin_improvement.${step}@1`;
