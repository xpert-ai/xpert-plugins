import { Injectable } from "@nestjs/common";
import { ProjectPipelineContributor } from "@xpert-ai/plugin-sdk";
import {
  projectPipelineConfigurationSchema,
  type ProjectPipelineExtensionDescriptor,
} from "@xpert-ai/contracts";
import {
  PROJECT_TYPE,
  ROLES,
  STEPS,
  refs,
  operationRef,
} from "./definition.js";
export function configuration(assistants: Record<string, string> = {}) {
  const input = (nodeKey: string) => ({
    from: "node_output",
    nodeKey,
    port: "result",
  });
  const work = STEPS.map((s) => ({
    key: s.key,
    label: s.title,
    kind: "work",
    laneKey: s.role,
    stageKey: s.stage,
    executorSlot: s.role,
    operationRef: operationRef(s.key),
    completionRef: "platform.output-validated@1",
    inputBindings: { subject: { from: "subject" } },
    outputPorts: { result: refs.result },
  }));
  const gate = (key: string, stageKey: string, proposal: string) => ({
    key,
    label: key === "approve" ? "人类批准当前方案" : "人类验收复查结果",
    kind: "human_gate",
    laneKey: "human",
    stageKey,
    candidateRoleKey: "human",
    policyRef: refs.approval,
    outcomes: ["approved", "rejected"],
    outcomeLabels: {
      approved: key === "approve" ? "批准选定动作" : "确认验收",
      rejected: "退回重做",
    },
    inputBindings: { proposal: input(proposal) },
    outputPorts: { decision: "platform.human-decision@1" },
  });
  const record = (
    key: string,
    gateKey: string,
    proposal: string,
    stageKey: string,
  ) => ({
    key,
    label: "记录人工决定",
    presentation: { foldIntoApproval: gateKey },
    kind: "work",
    laneKey: "system",
    stageKey,
    executorSlot: "system",
    operationRef: refs.decision,
    completionRef: "platform.output-validated@1",
    inputBindings: {
      subject: { from: "subject" },
      approval: { from: "node_output", nodeKey: gateKey, port: "decision" },
      proposal: input(proposal),
    },
    outputPorts: { result: refs.result },
  });
  return projectPipelineConfigurationSchema.parse({
    schemaVersion: 1,
    template: {
      key: "margin_improvement.closed_loop",
      version: "1.0.0",
      title: "经营偏差闭环 · 分析—批准—执行—复查",
      executionAuthority: "platform",
      projectTypes: [PROJECT_TYPE],
      subjectResolverRef: refs.subject,
      topology: { source: "definition" },
      roles: [
        ...ROLES.filter((r) => r.key !== "coordinator").map((r) => ({
          key: r.key,
          allowedKinds: ["assistant"],
        })),
        { key: "human", allowedKinds: ["human"] },
        { key: "system", allowedKinds: ["service"] },
      ],
      lanes: [
        ...ROLES.filter((r) => r.key !== "coordinator").map((r, i) => ({
          key: r.key,
          roleKey: r.key,
          label: r.title,
          order: i * 10,
        })),
        {
          key: "human",
          roleKey: "human",
          label: "业务负责人 · 批准 / 验收",
          order: 30,
        },
        {
          key: "system",
          roleKey: "system",
          label: "业务规则与回执",
          order: 40,
        },
      ],
      stages: [
        { key: "analysis", label: "发现与核实", order: 0 },
        { key: "decision", label: "建议与批准", order: 10 },
        { key: "delivery", label: "受控执行", order: 20 },
        { key: "review", label: "复查与验收", order: 30 },
      ],
      nodes: [
        ...work,
        {
          key: "route",
          label: "Router · 是否需要处置",
          kind: "router",
          stageKey: "analysis",
          policyRef: refs.route,
          outcomes: ["action", "monitor"],
          unmatched: "block",
          inputBindings: { analysis: input("discover") },
        },
        gate("approve", "decision", "propose"),
        record("record-approved", "approve", "propose", "decision"),
        record("record-rejected", "approve", "propose", "decision"),
        gate("accept", "review", "review"),
        record("record-accepted", "accept", "review", "review"),
        record("record-rework", "accept", "review", "review"),
        {
          key: "completed",
          label: "已验收",
          kind: "terminal",
          stageKey: "review",
          outcome: "completed",
        },
        {
          key: "monitor",
          label: "持续观察",
          kind: "terminal",
          stageKey: "analysis",
          outcome: "monitoring",
          disposition: "await_new_subject",
        },
        {
          key: "rejected",
          label: "等待新方案",
          kind: "terminal",
          stageKey: "review",
          outcome: "rejected",
          disposition: "await_new_subject",
        },
      ],
      edges: [
        { from: "discover", to: "route" },
        { from: "route", to: "verify", outcome: "action" },
        { from: "route", to: "monitor", outcome: "monitor" },
        { from: "verify", to: "propose" },
        { from: "propose", to: "approve" },
        { from: "approve", to: "record-approved", outcome: "approved" },
        { from: "approve", to: "record-rejected", outcome: "rejected" },
        { from: "record-approved", to: "execute" },
        { from: "record-rejected", to: "rejected" },
        { from: "execute", to: "review" },
        { from: "review", to: "accept" },
        { from: "accept", to: "record-accepted", outcome: "approved" },
        { from: "accept", to: "record-rework", outcome: "rejected" },
        { from: "record-accepted", to: "completed" },
        { from: "record-rework", to: "rejected" },
      ],
      roundPolicy: {
        entryNodeKey: "discover",
        maxRounds: 10,
        onRework: "await_new_subject_then_next_round",
        onLimit: "attention",
        newVersionWhileActive: "supersede_round",
        terminalOutcomes: ["completed"],
      },
      failurePolicy: {
        requiredNodeFailure: "block_and_attention",
        unknownExecution: "inspect_without_replay",
      },
    },
    binding: {
      templateRef: "margin_improvement.closed_loop@1.0.0",
      roleBindings: {
        human: { kind: "human", selectionKey: "project-managers" },
      },
      executorBindings: {
        ...Object.fromEntries(
          ROLES.filter((r) => r.key !== "coordinator").map((r) => [
            r.key,
            {
              kind: "assistant",
              roleKey: r.key,
              selectionKey: assistants[r.key] ?? `select-${r.key}`,
            },
          ]),
        ),
        system: {
          kind: "service",
          roleKey: "system",
          selectionKey: "margin-services",
        },
      },
      parameters: {},
      limits: {
        maxConcurrentExecutions: 1,
        maxTechnicalAttemptsPerNode: 2,
      },
    },
  });
}
const one = (schemaRef: string) => ({ schemaRef, cardinality: "one" as const });
export const descriptors: ProjectPipelineExtensionDescriptor[] = [
  { kind: "schema", ref: refs.result },
  { kind: "subject", ref: refs.subject, outputSchemaRef: refs.result },
  ...STEPS.map((s) => ({
    kind: "operation" as const,
    ref: operationRef(s.key),
    effects: "isolated_write" as const,
    idempotency: "keyed_receipt" as const,
    retry: "after_confirmed_failure" as const,
    requiredCapabilities: [],
    inputs: { subject: one(refs.result) },
    outputs: { result: refs.result },
  })),
  {
    kind: "operation",
    ref: refs.decision,
    effects: "isolated_write",
    idempotency: "keyed_receipt",
    requiredCapabilities: [],
    inputs: {
      subject: one(refs.result),
      approval: one("platform.human-decision@1"),
      proposal: one(refs.result),
    },
    outputs: { result: refs.result },
  },
  { kind: "policy", ref: refs.route, outcomes: ["action", "monitor"] },
  { kind: "policy", ref: refs.approval, outcomes: ["approved", "rejected"] },
];
@Injectable()
@ProjectPipelineContributor("margin_improvement")
export class MarginContribution {
  readonly key = "margin_improvement";
  readonly configurations = [configuration()];
  readonly descriptors = descriptors;
}
