import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager, IsNull } from "typeorm";
import { randomUUID } from "node:crypto";
import {
  EvolutionChangeRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry,
} from "@xpert-ai/plugin-sdk";
import type { EvolutionChangeIdentity } from "@xpert-ai/contracts";
import { digest } from "../digest.js";
import {
  OrderRuleHead,
  OrderRulePublication,
  OrderRuleAdoption,
} from "./entities.js";
import {
  BASELINE_RULE,
  BASELINE_VERSION,
  applyRule,
  type AftercareFacts,
} from "./rule.js";

export const TARGET_ID = "order_evidence.aftercare_method";
export type OrderScope = EvolutionChangeIdentity & { projectId: string };
@Injectable()
export class OrderRulesService {
  constructor(
    @InjectDataSource() readonly db: DataSource,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    readonly runtime: RuntimeCapabilityRegistry,
  ) {}
  async baseline(
    identity: EvolutionChangeIdentity,
    manager: EntityManager = this.db.manager,
  ) {
    const head = await manager.getRepository(OrderRuleHead).findOneBy(identity);
    if (!head?.publicationId)
      return {
        version: {
          resourceId: TARGET_ID,
          version: BASELINE_VERSION,
          hash: digest(BASELINE_RULE),
        },
        rule: BASELINE_RULE,
      };
    const publication = await manager
      .getRepository(OrderRulePublication)
      .findOneByOrFail({ ...identity, id: head.publicationId });
    return {
      version: publication.receipt.resource,
      rule: publication.rule,
      publication,
    };
  }
  async requirePublished(
    identity: EvolutionChangeIdentity,
    publication: OrderRulePublication,
  ) {
    const change = await this.runtime
      .require(EvolutionChangeRuntimeCapability)
      .get({ ...identity, changeId: publication.changeId });
    if (
      change.status !== "published" ||
      !change.receipt ||
      digest(change.receipt) !== digest(publication.receipt)
    )
      throw new ConflictException("human_publication_receipt_required");
  }
  async pin(
    scope: OrderScope,
    caseId: string,
    facts: AftercareFacts,
    actorId: string,
  ) {
    const repo = this.db.getRepository(OrderRuleAdoption);
    const existing = await repo.findOneBy(scope);
    if (existing) {
      if (
        existing.caseId !== caseId ||
        digest(existing.input) !== digest(facts)
      )
        throw new ConflictException("adoption_subject_mismatch");
      return existing;
    }
    const identity = {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    };
    const current = await this.baseline(identity);
    if (!current.publication)
      throw new ConflictException("published_improvement_required");
    await this.requirePublished(identity, current.publication);
    if (current.publication.projectId === scope.projectId)
      throw new ConflictException("next_order_must_be_a_different_project");
    await repo
      .createQueryBuilder()
      .insert()
      .values({
        ...scope,
        id: randomUUID(),
        caseId,
        publicationId: current.publication.id,
        version: current.version,
        rule: current.rule,
        input: facts,
        decision: applyRule(current.rule, facts),
        adoptedById: actorId,
        adoptedAt: new Date(),
      })
      .orIgnore()
      .execute();
    const pinned = await repo.findOneByOrFail(scope);
    if (pinned.caseId !== caseId || digest(pinned.input) !== digest(facts))
      throw new ConflictException("adoption_subject_mismatch");
    return pinned;
  }
  async read(scope: OrderScope, caseId: string) {
    const adoption = await this.db
      .getRepository(OrderRuleAdoption)
      .findOneBy({ ...scope, caseId });
    if (!adoption) return null;
    const publication = await this.db
      .getRepository(OrderRulePublication)
      .findOneByOrFail({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        id: adoption.publicationId,
      });
    if (
      adoption.version.hash !== digest(adoption.rule) ||
      digest(adoption.version) !== digest(publication.receipt.resource) ||
      digest(adoption.decision) !==
        digest(applyRule(adoption.rule, adoption.input))
    )
      throw new ConflictException("pinned_rule_integrity_mismatch");
    return { adoption, publication };
  }
  async recordUse(
    scope: OrderScope,
    caseId: string,
    executionId: string,
    resultDigest: string,
  ) {
    const current = await this.read(scope, caseId);
    if (!current) return;
    const repo = this.db.getRepository(OrderRuleAdoption);
    await repo.update(
      { ...scope, caseId, resultDigest: IsNull() },
      { executionId, resultDigest },
    );
    const saved = await repo.findOneByOrFail({ ...scope, caseId });
    if (
      saved.resultDigest !== resultDigest ||
      saved.executionId !== executionId
    )
      throw new ConflictException("immutable_adoption_result_conflict");
  }
}
