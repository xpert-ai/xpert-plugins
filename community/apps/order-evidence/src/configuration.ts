import { Injectable } from "@nestjs/common";
import { ProjectPipelineContributor } from "@xpert-ai/plugin-sdk";
import {
  projectPipelineConfigurationSchema,
  type ProjectPipelineExtensionDescriptor,
} from "@xpert-ai/contracts";
import {
  routingStages,
  routingSpecs,
  checkRef,
  type RoutingStage,
} from "./routing.js";
import {
  ARTIFACT_NAMESPACE,
  PROJECT_TYPE,
  ROLES,
  STEPS,
  refs,
  operationRef,
} from "./definition.js";
export function configuration(
  assistants: Record<string, string> = {},
  methodAdoption = false,
) {
  const version = methodAdoption ? "1.2.0" : "1.1.0";
  const output = (nodeKey: string, port = "result") => ({
    from: "node_output",
    nodeKey,
    port,
  });
  const nodes = STEPS.flatMap((s) => [
    {
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
    },
    {
      key: `approve-${s.key}`,
      label: s.human,
      kind: "human_gate",
      laneKey: "human",
      stageKey: s.stage,
      candidateRoleKey: "human",
      policyRef: refs.approval,
      outcomes: ["approved", "rejected"],
      outcomeLabels: { approved: s.decision, rejected: "退回补证 / 重做" },
      inputBindings: { proposal: output(s.key) },
      outputPorts: { decision: "platform.human-decision@1" },
    },
    ...["approved", "rejected"].map((outcome) => ({
      key: `record-${s.key}-${outcome}`,
      label: "记录人工决定与回执",
      presentation: { foldIntoApproval: `approve-${s.key}` },
      kind: "work",
      laneKey: "system",
      stageKey: s.stage,
      executorSlot: "system",
      operationRef: refs.decision,
      completionRef: "platform.output-validated@1",
      inputBindings: {
        subject: { from: "subject" },
        approval: output(`approve-${s.key}`, "decision"),
        proposal: output(s.key),
      },
      outputPorts: { result: refs.result },
    })),
  ]);
  const edges = STEPS.flatMap((s, i) => [
    ...(routingStages.includes(s.key as RoutingStage)
      ? [
          { from: s.key, to: `check-${s.key}` },
          {
            from: `check-${s.key}`,
            to: `approve-${s.key}`,
            outcome: "proceed",
          },
          { from: `check-${s.key}`, to: `wait-${s.key}`, outcome: "hold" },
        ]
      : methodAdoption && s.key === "aftercare"
        ? [
            { from: s.key, to: "check-adopted-method" },
            {
              from: "check-adopted-method",
              to: "approve-aftercare",
              outcome: "proceed",
            },
            {
              from: "check-adopted-method",
              to: "wait-aftercare-evidence",
              outcome: "hold",
            },
          ]
        : [{ from: s.key, to: `approve-${s.key}` }]),
    {
      from: `approve-${s.key}`,
      to: `record-${s.key}-approved`,
      outcome: "approved",
    },
    {
      from: `approve-${s.key}`,
      to: `record-${s.key}-rejected`,
      outcome: "rejected",
    },
    { from: `record-${s.key}-approved`, to: STEPS[i + 1]?.key ?? "route" },
    { from: `record-${s.key}-rejected`, to: "rejected" },
  ]);
  return projectPipelineConfigurationSchema.parse({
    schemaVersion: 1,
    template: {
      key: `${ARTIFACT_NAMESPACE}.order_lifecycle`,
      version,
      title: methodAdoption
        ? "下一单 · 采用已发布方法并验证补证路线"
        : "一张订单 · 人与 Assistants 协作",
      executionAuthority: "platform",
      projectTypes: [PROJECT_TYPE],
      subjectResolverRef: refs.subject,
      topology: { source: "definition" },
      roles: [
        ...STEPS.map((s) => ({ key: s.role, allowedKinds: ["assistant"] })),
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
          label: "人类责任人 · 确认 / 批准",
          order: 60,
        },
        {
          key: "system",
          roleKey: "system",
          label: "受控记录与回执",
          order: 70,
        },
      ],
      stages: STEPS.map((s, i) => ({
        key: s.stage,
        label: ["接单", "设计", "采购", "生产", "质量与交付", "售后改进"][i],
        order: i * 10,
      })),
      nodes: [
        ...nodes,
        ...(methodAdoption
          ? [
              {
                key: "check-adopted-method",
                label: "已发布方法 · 售后证据齐备？",
                kind: "router",
                stageKey: "aftercare",
                policyRef: refs.methodRoute,
                outcomes: ["proceed", "hold"],
                unmatched: "block",
                inputBindings: { analysis: output("aftercare") },
              },
              {
                key: "wait-aftercare-evidence",
                label: "下一单已采用 · 等待工况 / 拆检 / 实验补证",
                kind: "terminal",
                stageKey: "aftercare",
                outcome: "needs_aftercare_evidence",
                disposition: "await_new_subject",
              },
            ]
          : []),
        ...routingStages.flatMap((stage) => [
          {
            key: `check-${stage}`,
            label: routingSpecs[stage].title,
            kind: "router",
            stageKey: stage,
            policyRef: checkRef(stage),
            outcomes: ["proceed", "hold"],
            unmatched: "block",
            inputBindings: { analysis: output(stage) },
          },
          {
            key: `wait-${stage}`,
            label: routingSpecs[stage].waiting,
            kind: "terminal",
            stageKey: stage,
            outcome: `needs_${stage}_evidence`,
            disposition: "await_new_subject",
          },
        ]),
        {
          key: "route",
          label: "Router · 下一单如何跟进",
          kind: "router",
          stageKey: "aftercare",
          policyRef: refs.route,
          outcomes: ["change", "monitor"],
          unmatched: "block",
          inputBindings: { analysis: output("record-aftercare-approved") },
        },
        {
          key: "change-planned",
          label: "改进已批准 · 待下一单验证",
          kind: "terminal",
          stageKey: "aftercare",
          outcome: "change_planned",
        },
        {
          key: "monitoring",
          label: "持续观察在役表现",
          kind: "terminal",
          stageKey: "aftercare",
          outcome: "monitoring",
        },
        {
          key: "rejected",
          label: "等待补证或新版本",
          kind: "terminal",
          stageKey: "aftercare",
          outcome: "rejected",
          disposition: "await_new_subject",
        },
      ],
      edges: [
        ...edges,
        { from: "route", to: "change-planned", outcome: "change" },
        { from: "route", to: "monitoring", outcome: "monitor" },
      ],
      roundPolicy: {
        entryNodeKey: "contract",
        maxRounds: 10,
        onRework: "await_new_subject_then_next_round",
        onLimit: "attention",
        newVersionWhileActive: "supersede_round",
        terminalOutcomes: ["change_planned", "monitoring"],
      },
      failurePolicy: {
        requiredNodeFailure: "block_and_attention",
        unknownExecution: "inspect_without_replay",
      },
    },
    binding: {
      templateRef: `${ARTIFACT_NAMESPACE}.order_lifecycle@${version}`,
      roleBindings: {
        human: { kind: "human", selectionKey: "configured-approvers" },
      },
      executorBindings: {
        ...Object.fromEntries(
          STEPS.map((s) => [
            s.role,
            {
              kind: "assistant",
              roleKey: s.role,
              selectionKey: assistants[s.role] ?? `select-${s.role}`,
            },
          ]),
        ),
        system: {
          kind: "service",
          roleKey: "system",
          selectionKey: "order-evidence-service",
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
  ...routingStages.map((stage) => ({
    kind: "policy" as const,
    ref: checkRef(stage),
    outcomes: ["proceed", "hold"],
  })),
  { kind: "policy", ref: refs.route, outcomes: ["change", "monitor"] },
  { kind: "policy", ref: refs.methodRoute, outcomes: ["proceed", "hold"] },
  { kind: "policy", ref: refs.approval, outcomes: ["approved", "rejected"] },
];
@Injectable()
@ProjectPipelineContributor(ARTIFACT_NAMESPACE)
export class OrderContribution {
  readonly key = ARTIFACT_NAMESPACE;
  readonly configurations = [configuration(), configuration({}, true)];
  readonly descriptors = descriptors;
}
