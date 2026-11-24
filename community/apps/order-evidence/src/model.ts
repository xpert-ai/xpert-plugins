import { Column, Entity, Index, PrimaryColumn } from "typeorm";
import { pluginArtifactTableName } from "@xpert-ai/plugin-sdk";
import { ARTIFACT_NAMESPACE } from "./definition.js";
import { z } from "zod/v3";
export const CONFIG = "ORDER_EVIDENCE_CONFIG";
export const installationSchema = z.object({debug:z.boolean().default(false)});
// Stored case snapshots retain the configuration used for their original run.
export const configSchema = z
  .object({
    assistants: z
      .object({
        contract: z.string().uuid(),
        engineering: z.string().uuid(),
        procurement: z.string().uuid(),
        production: z.string().uuid(),
        quality: z.string().uuid(),
        aftercare: z.string().uuid(),
      })
      .strict()
      .optional(),
    approvers: z
      .object({
        contract: z.array(z.string().uuid()).min(1),
        engineering: z.array(z.string().uuid()).min(1),
        procurement: z.array(z.string().uuid()).min(1),
        production: z.array(z.string().uuid()).min(1),
        quality: z.array(z.string().uuid()).min(1),
        aftercare: z.array(z.string().uuid()).min(1),
      })
      .strict()
      .optional(),
    maintenanceAssistantId: z.string().uuid().optional(),
    capabilityPublishers: z.array(z.string().uuid()).min(1).optional(),
    debug: z.boolean().default(false),
  })
  .strict();
export type Config = z.infer<typeof configSchema>;
export const resultSchema = z
  .object({
    caseId: z.string().uuid(),
    roundId: z.string().uuid(),
    generation: z.number().int().positive(),
    nodeKey: z.string(),
    inputDigest: z.string(),
    revision: z.number().int().positive(),
    summary: z.string().max(6000),
    improvementSuggested: z.boolean(),
    evidenceIds: z.array(z.string()),
    approved: z.boolean().optional(),
    decisionActorId: z.string().optional(),
    proposalDigest: z.string().optional(),
    receipt: z.string().optional(),
    appliedMethod: z
      .object({
        version: z.string(),
        hash: z.string(),
        publicationReceiptId: z.string(),
        outcome: z.string(),
        missingEvidence: z.array(z.string()),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Result = z.infer<typeof resultSchema>;
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, "case"))
@Index(["tenantId", "organizationId", "projectId"], { unique: true })
export class OrderCase {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") tenantId!: string;
  @Column("uuid") organizationId!: string;
  @Column("uuid") projectId!: string;
  @Column("uuid") createdById!: string;
  @Column("uuid") coordinatorId!: string;
  @Column("varchar") title!: string;
  @Column("integer", { default: 1 }) revision!: number;
  @Column("text") snapshotJson!: string;
  @Column("varchar") sourceDigest!: string;
  @Column("text") bindingsJson!: string;
  @Column("jsonb", { default: {} }) assistants!: Record<string, string>;
  @Column("uuid", { nullable: true }) bindingId!: string | null;
  @Column("uuid", { nullable: true }) instanceId!: string | null;
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, "work"))
@Index(["tenantId", "organizationId", "projectId", "executionId"], {
  unique: true,
})
export class OrderWork {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") tenantId!: string;
  @Column("uuid") organizationId!: string;
  @Column("uuid") projectId!: string;
  @Column("uuid") caseId!: string;
  @Column("varchar") step!: string;
  @Column("uuid") executionId!: string;
  @Column("uuid") executorId!: string;
  @Column("integer") revision!: number;
  @Column("text") contextJson!: string;
  @Column("text", { nullable: true }) datasetJson!: string | null;
  @Column("jsonb", { nullable: true }) result!: Result | null;
  @Column("varchar", { nullable: true }) resultDigest!: string | null;
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, "evidence"))
@Index(["tenantId", "organizationId", "projectId"])
export class OrderEvidence {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") tenantId!: string;
  @Column("uuid") organizationId!: string;
  @Column("uuid") projectId!: string;
  @Column("varchar") digest!: string;
  @Column("jsonb") content!: Result;
}
export const ENTITIES = [OrderCase, OrderWork, OrderEvidence];
export const finalizeSchema = z
  .object({
    assessment: z
      .string()
      .min(40)
      .max(4500)
      .describe(
        "本节点的独立判断；区分事实、假设与下一步，并说明演示数据范围。",
      ),
    evidenceIds: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe("当前读取结果给出的证据标识，不填写执行或审批标识。"),
  })
  .strict();
export type Finalize = z.infer<typeof finalizeSchema>;
