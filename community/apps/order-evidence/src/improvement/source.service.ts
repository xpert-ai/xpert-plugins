import { maintenanceAssistantId } from "../organization-config.js";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { IsNull } from "typeorm";
import { z } from "zod/v3";
import {
  EvolutionChangeRuntimeCapability,
  ProjectAccessRuntimeCapability,
  type XpertBusinessToolContext,
  type ProjectPipelineContext,
} from "@xpert-ai/plugin-sdk";
import type { EvolutionEvidenceRef } from "@xpert-ai/contracts";
import { OrderService, context, owner } from "../service.js";
import { OrderEvidence, resultSchema } from "../model.js";
import { digest } from "../digest.js";
import { snapshotSchema, documentsFor } from "../fixture.js";
import { OrderImprovement } from "./entities.js";
import { OrderRulesService, TARGET_ID } from "./rules.service.js";
import {
  DATASET_VERSION,
  HOLDOUT_CASES,
  ruleSchema,
  type ProposeInput,
} from "./rule.js";

@Injectable()
export class OrderImprovementService {
  constructor(
    readonly orders: OrderService,
    readonly rules: OrderRulesService,
  ) {}
  async source(c: ProjectPipelineContext, caseId?: string) {
    const e = await this.orders.root(c, caseId);
    const all = await this.orders.db
      .getRepository(OrderEvidence)
      .findBy(owner(c));
    const approved = all.filter(
      ({ content }) =>
        content.caseId === e.id &&
        content.revision === e.revision &&
        content.nodeKey === "approve-aftercare" &&
        content.approved &&
        content.improvementSuggested &&
        content.receipt &&
        content.decisionActorId,
    );
    if (approved.length !== 1)
      throw new ConflictException("one_approved_aftercare_result_required");
    const decision = approved[0]!;
    const proposal = all.find(
      (item) =>
        item.digest === decision.content.proposalDigest &&
        item.content.nodeKey === "aftercare",
    );
    if (
      !proposal ||
      proposal.content.roundId !== decision.content.roundId ||
      proposal.content.inputDigest !== decision.content.inputDigest ||
      proposal.digest !== digest(resultSchema.parse(proposal.content)) ||
      decision.digest !== digest(resultSchema.parse(decision.content))
    )
      throw new ConflictException("approved_source_integrity_mismatch");
    const snapshot = snapshotSchema.parse(JSON.parse(e.snapshotJson));
    const evidence: EvolutionEvidenceRef[] = [proposal, decision].map(
      (item) => ({
        kind: "artifact",
        subjectKey: e.id,
        uri: `order-evidence:${item.id}`,
        version: String(item.content.revision),
        hash: item.digest,
      }),
    );
    evidence.push({
      kind: "artifact",
      subjectKey: e.id,
      uri: `order-snapshot:${e.id}`,
      version: String(e.revision),
      hash: e.sourceDigest,
    });
    return {
      e,
      evidence,
      sourceDigest: digest(evidence),
      proposal: proposal.content,
      decision: decision.content,
      documents: documentsFor(snapshot, "aftercare"),
      dataLabel: snapshot.dataLabel,
    };
  }
  async authorize(tool: XpertBusinessToolContext) {
    const c = context(tool);
    const request = { ...c, includeApplicationBindings: true };
    const access = await this.orders.runtime
      .require(ProjectAccessRuntimeCapability)
      .assertManage(request);
    const maintenanceId = maintenanceAssistantId(access);
    if (
      !maintenanceId ||
      tool.xpertId !== maintenanceId ||
      tool.agentKey !== "Agent_capability" ||
      !access.assistantIds?.includes(tool.xpertId)
    )
      throw new ForbiddenException("configured_maintenance_assistant_required");
    await this.orders.runtime
      .require(ProjectAccessRuntimeCapability)
      .assertAssistant({ ...c, assistantId: tool.xpertId });
    return c;
  }
  async read(tool: XpertBusinessToolContext) {
    const c = await this.authorize(tool);
    const source = await this.source(c);
    const identity = {
      tenantId: c.actor.tenantId,
      organizationId: owner(c).organizationId,
    };
    const baseline = await this.rules.baseline(identity);
    if (baseline.publication)
      await this.rules.requirePublished(identity, baseline.publication);
    return {
      sourceDigest: source.sourceDigest,
      dataLabel: source.dataLabel,
      approvedAftercareAssessment: source.proposal.summary,
      humanDecision: source.decision.summary,
      documents: source.documents,
      baseline: baseline.version,
      baselineRule: baseline.rule,
      proposalGuidance:
        "M200 售后判断先核对报修、工况、拆检、复现实验；缺证先补证，根因假设交人类确认。提出可评测候选，不批准、不发布、不改变工程 BOM。",
      evaluation: {
        datasetVersion: DATASET_VERSION,
        kind: "独立合成样例的确定性规则核对；不是客户生产成效或模型整体准确率",
      },
    };
  }
  async submit(tool: XpertBusinessToolContext, input: ProposeInput) {
    const c = await this.authorize(tool);
    const source = await this.source(c);
    if (source.sourceDigest !== input.sourceDigest)
      throw new ConflictException("source_digest_mismatch");
    const candidateRule = ruleSchema.parse({
      productFamily: input.productFamily,
      requiredEvidence: input.requiredEvidence,
      keepRootCauseAsHypothesis: input.keepRootCauseAsHypothesis,
    });
    const executionId = z.string().uuid().parse(tool.executionId);
    const repo = this.orders.db.getRepository(OrderImprovement);
    const identity = {
      tenantId: c.actor.tenantId,
      organizationId: owner(c).organizationId,
    };
    let saved = await repo.findOneBy({ ...identity, executionId });
    if (!saved) {
      const baseline = await this.rules.baseline(identity);
      if (baseline.publication)
        await this.rules.requirePublished(identity, baseline.publication);
      await repo
        .createQueryBuilder()
        .insert()
        .values({
          ...owner(c),
          id: randomUUID(),
          caseId: source.e.id,
          createdById: c.actor.userId,
          assistantId: tool.xpertId!,
          executionId,
          sourceDigest: source.sourceDigest,
          evidence: source.evidence,
          baseline: baseline.version,
          baselineRule: baseline.rule,
          candidateRule,
          candidateHash: digest(candidateRule),
          rationale: input.rationale,
          datasetHash: digest(HOLDOUT_CASES),
          createdAt: new Date(),
        })
        .orIgnore()
        .execute();
      saved = await repo.findOneByOrFail({ ...identity, executionId });
    }
    if (
      saved.projectId !== c.projectId ||
      saved.sourceDigest !== input.sourceDigest ||
      saved.candidateHash !== digest(candidateRule) ||
      saved.rationale !== input.rationale
    )
      throw new ConflictException("immutable_candidate_request_conflict");
    const api = this.orders.runtime.require(EvolutionChangeRuntimeCapability);
    const change = saved.changeId
      ? await api.get({ ...identity, changeId: saved.changeId })
      : await api.prepare({
          ...identity,
          targetId: TARGET_ID,
          requestId: saved.id,
          strategyId: "evidence_driven",
          sourceKind: "business_evidence",
          scope: {
            type: "organization",
            key: identity.organizationId,
            dimensions: { productFamily: "M200" },
          },
          baseline: saved.baseline,
          evidence: saved.evidence,
          executionContext: {
            xpertId: saved.assistantId,
            projectId: c.projectId,
            title: "售后判断方法 · 候选评测",
            input: saved.rationale,
            language: "zh-Hans",
          },
        });
    await repo.update(
      { ...identity, id: saved.id, changeId: IsNull() },
      { changeId: change.changeId },
    );
    return {
      changeId: change.changeId,
      status: change.status,
      candidateHash: saved.candidateHash,
      next: "平台异步执行独立样例核对。到智能体进化查看评测；只有配置的能力负责人可人工批准并发布。助手到此结束。",
    };
  }
}
