import { canPublishMethod } from "../organization-config.js";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Not, IsNull } from "typeorm";
import {
  EvolutionTargetProviderStrategy,
  ProjectAccessRuntimeCapability,
} from "@xpert-ai/plugin-sdk";
import {
  evidenceDrivenStrategy,
  type EvolutionTargetDescriptor,
  type EvolutionTargetProvider,
  type EvolutionChangeProvider,
  type EvolutionChangeOperation,
  type EvolutionChangeEvaluation,
} from "@xpert-ai/contracts";
import { digest } from "../digest.js";
import { OrderImprovementService } from "./source.service.js";
import {
  OrderImprovement,
  OrderRuleHead,
  OrderRulePublication,
  OrderRuleAdoption,
} from "./entities.js";
import { TARGET_ID } from "./rules.service.js";
import {
  DATASET_VERSION,
  HOLDOUT_CASES,
  evaluateRule,
  ruleSchema,
  evidenceLabels,
  outcomeLabels,
} from "./rule.js";

const strategy = evidenceDrivenStrategy({
  version: "order-aftercare/1",
  evidenceKinds: ["artifact"],
  effect: "explicit_adoption",
  requiredChecks: [
    { kind: "regression", origin: "order_aftercare_holdout", blocking: true },
  ],
});
@Injectable()
@EvolutionTargetProviderStrategy(TARGET_ID)
export class OrderMethodEvolution
  implements EvolutionTargetProvider, EvolutionChangeProvider
{
  readonly descriptor: EvolutionTargetDescriptor = {
    targetId: TARGET_ID,
    targetType: "manufacturing.aftercare_method",
    displayName: "M200 售后判断方法",
    providerKey: TARGET_ID,
    providerVersion: "1.0.0",
    artifactSchemaVersion: "1",
    supportedScopes: ["organization"],
    riskLevel: "R2",
    metricSetId: "order_aftercare_rule_checks",
    status: "active",
    strategies: [strategy],
    capabilities: {
      candidateBuild: true,
      replay: false,
      shadow: false,
      canary: false,
      install: false,
      rollback: false,
    },
  };
  readonly draftBuilder = this;
  readonly checkEvaluator = this;
  readonly versionPublisher = this;
  readonly presenter = this;
  constructor(private readonly source: OrderImprovementService) {}
  private identity(op: EvolutionChangeOperation) {
    if (
      !op.context.organizationId ||
      op.context.targetId !== TARGET_ID ||
      op.change.targetId !== TARGET_ID ||
      op.change.scope.type !== "organization" ||
      op.change.scope.key !== op.context.organizationId ||
      digest(op.change.scope.dimensions) !== digest({ productFamily: "M200" })
    )
      throw new ForbiddenException("improvement_scope_mismatch");
    return {
      tenantId: op.context.tenantId,
      organizationId: op.context.organizationId,
    };
  }
  private async record(op: EvolutionChangeOperation) {
    const identity = this.identity(op);
    const record = await this.source.orders.db
      .getRepository(OrderImprovement)
      .findOneByOrFail({ ...identity, id: op.change.requestId });
    const actual = await this.source.source(
      {
        actor: { ...identity, userId: op.context.actor.actorId },
        projectId: record.projectId,
      },
      record.caseId,
    );
    if (
      record.createdById !== op.change.createdBy ||
      record.sourceDigest !== actual.sourceDigest ||
      digest(record.evidence) !== digest(op.change.evidence) ||
      digest(record.baseline) !== digest(op.change.baseline) ||
      record.candidateHash !== digest(ruleSchema.parse(record.candidateRule)) ||
      record.baseline.hash !== digest(ruleSchema.parse(record.baselineRule)) ||
      record.datasetHash !== digest(HOLDOUT_CASES)
    )
      throw new ConflictException("reviewed_improvement_inputs_changed");
    return record;
  }
  async prepare(op: EvolutionChangeOperation) {
    const r = await this.record(op);
    return {
      artifact: {
        uri: `order-aftercare-method:${r.id}`,
        hash: r.candidateHash,
        schemaVersion: "1",
        mediaType: "application/json" as const,
      },
      baseline: r.baseline,
      summary: `先核对${r.candidateRule.requiredEvidence.map((k) => evidenceLabels[k]).join("、")}；缺证先补证。${r.candidateRule.keepRootCauseAsHypothesis ? "根因交人类确认。" : "形成根因草案。"}`,
      changes: [
        {
          path: "requiredEvidence",
          operation: "replace",
          summary: "补充根因判断的证据核对要求",
          before: r.baselineRule.requiredEvidence
            .map((k) => evidenceLabels[k])
            .join("、"),
          after: r.candidateRule.requiredEvidence
            .map((k) => evidenceLabels[k])
            .join("、"),
        },
        {
          path: "keepRootCauseAsHypothesis",
          operation: "replace",
          summary: "明确 Assistant 判断与人类批准边界",
          before: r.baselineRule.keepRootCauseAsHypothesis
            ? "根因由人确认"
            : "根据已有线索形成根因草案",
          after: r.candidateRule.keepRootCauseAsHypothesis
            ? "保留假设，交人类确认"
            : "根据已有线索形成根因草案",
        },
      ],
      warnings: [
        "独立合成样例的规则核对，不代表客户现场成效；发布后仍须由下一单明确采用。",
      ],
    };
  }
  async evaluate(
    op: EvolutionChangeOperation,
  ): Promise<EvolutionChangeEvaluation> {
    const r = await this.record(op);
    if (op.change.candidate?.artifact.hash !== r.candidateHash)
      throw new ConflictException("candidate_hash_mismatch");
    const rows = evaluateRule(r.baselineRule, r.candidateRule);
    return {
      runId: randomUUID(),
      candidateHash: r.candidateHash,
      baselineHash: r.baseline.hash,
      evidenceHash: op.change.evidenceHash,
      datasetVersion: DATASET_VERSION,
      datasetHash: r.datasetHash,
      checks: rows.map((row) => ({
        checkId: row.id,
        title: row.title,
        kind: "regression",
        origin: "order_aftercare_holdout",
        passed: row.passed,
        blocking: true,
        details: `原方法：${outcomeLabels[row.baseline]}；候选：${outcomeLabels[row.candidate]}；预期：${outcomeLabels[row.expected]}。合成独立样例。`,
        evidenceRefs: [`order-method-holdout:${DATASET_VERSION}/${row.id}`],
      })),
      readiness: [
        {
          key: "independent_case_checks",
          label: {
            en_US: "Independent synthetic checks",
            zh_Hans: "独立合成样例核对",
          },
          status: rows.every((row) => row.passed) ? "passed" : "blocked",
          reasons: rows.filter((row) => !row.passed).map((row) => row.id),
        },
      ],
      passed: rows.every((row) => row.passed),
      completedAt: new Date().toISOString(),
      assessment: "tested",
    };
  }
  async validateCurrent(op: EvolutionChangeOperation) {
    const r = await this.record(op);
    const identity = this.identity(op);
    const published = await this.source.orders.db
      .getRepository(OrderRulePublication)
      .findOneBy({ ...identity, changeId: op.change.changeId });
    const current = await this.source.rules.baseline(identity);
    const valid =
      op.change.candidate?.artifact.hash === r.candidateHash &&
      (published?.receipt.candidateHash === r.candidateHash ||
        digest(current.version) === digest(r.baseline));
    return { valid, reasons: valid ? [] : ["baseline_or_candidate_changed"] };
  }
  async authorizePublication(op: EvolutionChangeOperation) {
    if (op.context.actor.actorType !== "human")
      throw new ForbiddenException("configured_human_capability_publisher_required");
    const r = await this.record(op);
    const request = {
      actor: { ...this.identity(op), userId: op.context.actor.actorId },
      projectId: r.projectId,
      includeApplicationBindings: true,
    };
    const access = await this.source.orders.runtime.require(ProjectAccessRuntimeCapability).assertManage(request);
    if (!canPublishMethod(access, op.context.actor.actorId))
      throw new ForbiddenException("configured_human_capability_publisher_required");
  }
  async publish(op: EvolutionChangeOperation) {
    await this.authorizePublication(op);
    const r = await this.record(op),
      identity = this.identity(op),
      { change } = op;
    const approval = change.approval,
      evaluation = change.evaluation;
    if (
      !approval ||
      approval.decision !== "approved" ||
      approval.candidateHash !== r.candidateHash ||
      change.candidate?.artifact.hash !== r.candidateHash ||
      !evaluation?.passed ||
      approval.evaluationRunId !== evaluation.runId ||
      evaluation.candidateHash !== r.candidateHash ||
      evaluation.baselineHash !== r.baseline.hash ||
      evaluation.datasetHash !== r.datasetHash ||
      evaluation.datasetVersion !== DATASET_VERSION ||
      evaluation.evidenceHash !== change.evidenceHash ||
      !evaluateRule(r.baselineRule, r.candidateRule).every((row) => row.passed)
    )
      throw new ConflictException("exact_tested_human_approval_required");
    return this.source.orders.db.transaction(async (manager) => {
      const publications = manager.getRepository(OrderRulePublication),
        heads = manager.getRepository(OrderRuleHead);
      await heads
        .createQueryBuilder()
        .insert()
        .values({ ...identity, id: randomUUID(), revision: 1 })
        .orIgnore()
        .execute();
      const head = await heads.findOneOrFail({
        where: identity,
        lock: { mode: "pessimistic_write" },
      });
      const existing = await publications.findOneBy({
        ...identity,
        changeId: change.changeId,
      });
      if (existing) {
        if (
          existing.receipt.candidateHash !== r.candidateHash ||
          existing.receipt.approvalId !== approval.approvalId
        )
          throw new ConflictException("immutable_publication_conflict");
        return existing.receipt;
      }
      const baseline = await this.source.rules.baseline(identity, manager);
      if (digest(baseline.version) !== digest(r.baseline))
        throw new ConflictException("publication_baseline_changed");
      const id = randomUUID(),
        now = new Date();
      const receipt = {
        receiptId: id,
        changeId: change.changeId,
        candidateHash: r.candidateHash,
        approvalId: approval.approvalId,
        resource: {
          resourceId: TARGET_ID,
          version: `A${head.revision + 1}`,
          hash: r.candidateHash,
        },
        completedAt: now.toISOString(),
      };
      await publications.insert({
        ...identity,
        id,
        projectId: r.projectId,
        improvementId: r.id,
        changeId: change.changeId,
        rule: r.candidateRule,
        receipt,
        createdAt: now,
      });
      await heads.update(
        { ...identity, id: head.id, revision: head.revision },
        { revision: head.revision + 1, publicationId: id },
      );
      return receipt;
    });
  }
  async describe(op: EvolutionChangeOperation) {
    const r = await this.record(op),
      identity = this.identity(op);
    const rows = evaluateRule(r.baselineRule, r.candidateRule);
    const publication = await this.source.orders.db
      .getRepository(OrderRulePublication)
      .findOneBy({ ...identity, changeId: op.change.changeId });
    const adoptions = publication
      ? await this.source.orders.db.getRepository(OrderRuleAdoption).countBy({
          ...identity,
          publicationId: publication.id,
          resultDigest: Not(IsNull()),
        })
      : 0;
    return {
      title: "售后证据怎样改变下一单",
      resourceLabel: "M200 售后判断方法",
      description: "真实平台评测与发布记录；业务资料和核对样例为合成演示。",
      metrics: [
        {
          key: "baseline_pass",
          label: "原方法符合样例数",
          value: rows.filter((row) => row.baseline === row.expected).length,
          total: rows.length,
        },
        {
          key: "candidate_pass",
          label: "候选符合样例数",
          value: rows.filter((row) => row.passed).length,
          total: rows.length,
        },
        {
          kind: "adoption" as const,
          key: "adopted_orders",
          label: "已执行并留痕的后续订单",
          value: adoptions,
        },
      ],
      effect: {
        status: adoptions ? ("active" as const) : ("pending" as const),
        label: adoptions ? "下一单已采用" : "尚无下一单采用记录",
        description:
          "采用指 Assistant 已按固定发布版本完成判断并记录结果，不等于现场故障率已经改善。",
      },
      business: {
        title: "售后证据 → 判断方法 → 下一单采用",
        baselineLabel: r.baseline.version,
        validationHint: "8 个独立合成样例；逐例执行同一个确定性规则函数。",
        proposal: r.rationale,
        context: [
          {
            key: "scope",
            label: "适用范围",
            value: "本组织的 M200 订单；在新项目中明确采用",
          },
        ],
        evidence: r.evidence.map((e, index) => ({
          key: String(index),
          documentName:
            index === 0
              ? "售后 Assistant 判断"
              : index === 1
                ? "质量 / 工程人工确认"
                : "冻结的订单资料",
          location: e.uri,
        })),
        changes: [
          {
            key: "method",
            label: "缺证处理",
            before: "按已有线索形成根因草案",
            after: `核对${r.candidateRule.requiredEvidence.map((k) => evidenceLabels[k]).join("、")}；不足先补证；${r.candidateRule.keepRootCauseAsHypothesis ? "根因由人确认" : "形成根因草案"}`,
          },
        ],
        adoption: {
          subjectLabel: "后续演示订单",
          adopted: adoptions,
          total: Math.max(1, adoptions),
        },
      },
      workbench: {
        xpertId: r.assistantId,
        viewKey: "platform.project-tasks__timeline",
        selectionId: r.projectId,
        parameters: { projectId: r.projectId, initialTab: "pipeline" },
      },
    };
  }
}
