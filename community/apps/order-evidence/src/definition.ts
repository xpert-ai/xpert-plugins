import { createRequire } from "node:module";
import type { XpertProjectTypeRef } from "@xpert-ai/contracts";
export const PACKAGE_METADATA = createRequire(import.meta.url)(
  "../package.json",
) as {
  name: string;
  version: string;
  xpert: { plugin: { level: "tenant"; artifactNamespace: string } };
};
export const NAME = PACKAGE_METADATA.name;
export const VERSION = PACKAGE_METADATA.version;
export const ARTIFACT_NAMESPACE = "order_evidence";
if (PACKAGE_METADATA.xpert.plugin.artifactNamespace !== ARTIFACT_NAMESPACE) {
  throw new Error("order_evidence_artifact_namespace_mismatch");
}
export const LEVEL = PACKAGE_METADATA.xpert.plugin.level;
export const ICON = {
  type: "emoji" as const,
  value: "🏭",
  background: "#DEF2ED",
};
export const PROJECT_TYPE: XpertProjectTypeRef = {
  applicationKey: `${NAME}:order-evidence`,
  projectTypeKey: "order",
};
export const ROLES = [
  {
    key: "coordinator",
    title: "订单协作 Assistant",
    emoji: "🧭",
    color: "#E3ECF6",
  },
  { key: "contract", title: "合同 Assistant", emoji: "📄", color: "#DEF2ED" },
  {
    key: "engineering",
    title: "工程 Assistant",
    emoji: "📐",
    color: "#E5EBFA",
  },
  {
    key: "procurement",
    title: "采购 Assistant",
    emoji: "📦",
    color: "#F9E8D4",
  },
  { key: "production", title: "计划 Assistant", emoji: "🏭", color: "#E2EDF7" },
  { key: "quality", title: "质量 Assistant", emoji: "🔬", color: "#E9E3F5" },
  { key: "aftercare", title: "售后 Assistant", emoji: "🔧", color: "#F9E7E1" },
] as const;
export type Role = (typeof ROLES)[number]["key"];
export const STEPS = [
  {
    key: "contract",
    role: "contract",
    title: "提取合同要求与歧义",
    stage: "contract",
    human: "销售 / 工程确认要求",
    decision: "确认 IP67 适用部位",
    output: "合同要求与澄清单",
  },
  {
    key: "engineering",
    role: "engineering",
    title: "比对 BOM 与设计要求",
    stage: "engineering",
    human: "工程负责人批准变更",
    decision: "批准本版 BOM 变更建议",
    output: "设计差异与变更草案",
  },
  {
    key: "procurement",
    role: "procurement",
    title: "核对齐套与欠料风险",
    stage: "procurement",
    human: "采购负责人确认供应",
    decision: "确认选定供应方案",
    output: "物料齐套与供应方案",
  },
  {
    key: "production",
    role: "production",
    title: "核查产能并建议排程",
    stage: "production",
    human: "计划负责人批准调整",
    decision: "批准本版排程建议",
    output: "工单与排程建议",
  },
  {
    key: "quality",
    role: "quality",
    title: "汇集试验与交付证据",
    stage: "quality",
    human: "质量 / 授权人确认交付",
    decision: "确认试验依据与交付放行",
    output: "试验与交付证据包",
  },
  {
    key: "aftercare",
    role: "aftercare",
    title: "关联拆检与实装证据",
    stage: "aftercare",
    human: "质量 / 工程确认改进",
    decision: "确认根因判断与改进方案",
    output: "根因假设与改进建议",
  },
] as const;
export type Step = (typeof STEPS)[number]["key"];
export const templateKey = (role: Role) => `order-evidence-${role}`;
export const agentKey = (role: Role) => `Agent_${role}`;
export const middleware = (role: Role) => `${ARTIFACT_NAMESPACE}_${role}`;
export const refs = {
  subject: `${ARTIFACT_NAMESPACE}.case@1`,
  evidence: `${ARTIFACT_NAMESPACE}.evidence@1`,
  result: `${ARTIFACT_NAMESPACE}.result@1`,
  route: `${ARTIFACT_NAMESPACE}.route@1`,
  approval: `${ARTIFACT_NAMESPACE}.approval@1`,
  decision: `${ARTIFACT_NAMESPACE}.decision@1`,
} as const;
export const operationRef = (step: Step) => `${ARTIFACT_NAMESPACE}.${step}@1`;
