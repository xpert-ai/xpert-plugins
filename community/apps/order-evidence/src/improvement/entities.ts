import { Column, Entity, Index, PrimaryColumn } from "typeorm";
import { pluginArtifactTableName } from "@xpert-ai/plugin-sdk";
import type {
  EvolutionEvidenceRef,
  EvolutionPublicationReceipt,
  EvolutionVersionRef,
} from "@xpert-ai/contracts";
import { ARTIFACT_NAMESPACE } from "../definition.js";
import type { AftercareRule, AftercareFacts, applyRule } from "./rule.js";

@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, "improvement"))
@Index(["tenantId", "organizationId", "executionId"], { unique: true })
export class OrderImprovement {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") tenantId!: string;
  @Column("uuid") organizationId!: string;
  @Column("uuid") projectId!: string;
  @Column("uuid") caseId!: string;
  @Column("uuid") createdById!: string;
  @Column("uuid") assistantId!: string;
  @Column("uuid") executionId!: string;
  @Column("varchar") sourceDigest!: string;
  @Column("jsonb") evidence!: EvolutionEvidenceRef[];
  @Column("jsonb") baseline!: EvolutionVersionRef;
  @Column("jsonb") baselineRule!: AftercareRule;
  @Column("jsonb") candidateRule!: AftercareRule;
  @Column("varchar") candidateHash!: string;
  @Column("text") rationale!: string;
  @Column("varchar") datasetHash!: string;
  @Column("timestamptz") createdAt!: Date;
  @Column("varchar", { nullable: true }) changeId!: string | null;
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, "rule_head"))
@Index(["tenantId", "organizationId"], { unique: true })
export class OrderRuleHead {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") tenantId!: string;
  @Column("uuid") organizationId!: string;
  @Column("integer") revision!: number;
  @Column("uuid", { nullable: true }) publicationId!: string | null;
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, "rule_publication"))
@Index(["tenantId", "organizationId", "changeId"], { unique: true })
export class OrderRulePublication {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") tenantId!: string;
  @Column("uuid") organizationId!: string;
  @Column("uuid") projectId!: string;
  @Column("uuid") improvementId!: string;
  @Column("varchar") changeId!: string;
  @Column("jsonb") rule!: AftercareRule;
  @Column("jsonb") receipt!: EvolutionPublicationReceipt;
  @Column("timestamptz") createdAt!: Date;
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, "rule_adoption"))
@Index(["tenantId", "organizationId", "projectId"], { unique: true })
export class OrderRuleAdoption {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") tenantId!: string;
  @Column("uuid") organizationId!: string;
  @Column("uuid") projectId!: string;
  @Column("uuid") caseId!: string;
  @Column("uuid") publicationId!: string;
  @Column("jsonb") version!: EvolutionVersionRef;
  @Column("jsonb") rule!: AftercareRule;
  @Column("jsonb") input!: AftercareFacts;
  @Column("jsonb") decision!: ReturnType<typeof applyRule>;
  @Column("uuid") adoptedById!: string;
  @Column("timestamptz") adoptedAt!: Date;
  @Column("uuid", { nullable: true }) executionId!: string | null;
  @Column("varchar", { nullable: true }) resultDigest!: string | null;
}
export const IMPROVEMENT_ENTITIES = [
  OrderImprovement,
  OrderRuleHead,
  OrderRulePublication,
  OrderRuleAdoption,
];
