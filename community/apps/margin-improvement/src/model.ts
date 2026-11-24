import { Column, Entity, Index, PrimaryColumn } from "typeorm";
import {
  pluginArtifactTableName,
  analyticsBindingSchema,
} from "@xpert-ai/plugin-sdk";
import type { AnalyticalDataset } from "@xpert-ai/contracts";
import { z } from "zod/v3";
export const installationSchema = z.object({});
// Stored case snapshots retain the configuration used for their original run.
export const configSchema = z
  .object({
    assistants: z
      .object({
        finance: z.string().uuid(),
        procurement: z.string().uuid(),
        execution: z.string().uuid(),
      })
      .strict()
      .optional(),
    analysisBinding: analyticsBindingSchema.optional(),
    factsBinding: analyticsBindingSchema.optional(),
    reviewBinding: analyticsBindingSchema.optional(),
    actualField: z.string().default("actual"),
    budgetField: z.string().default("budget"),
    threshold: z.number().nonnegative().default(2),
    dataLabel: z.string().default("制造业经营偏差演示 · 合成业务数据"),
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
    needsAction: z.boolean(),
    evidenceIds: z.array(z.string()),
    approved: z.boolean().optional(),
    decisionActorId: z.string().optional(),
    proposalDigest: z.string().optional(),
    receipt: z.string().optional(),
  })
  .strict();
export type Result = z.infer<typeof resultSchema>;
@Entity(pluginArtifactTableName("margin_improvement", "case"))
@Index(["tenantId", "organizationId", "projectId"], { unique: true })
export class MarginCase {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") tenantId!: string;
  @Column("uuid") organizationId!: string;
  @Column("uuid") projectId!: string;
  @Column("uuid") createdById!: string;
  @Column("uuid") coordinatorId!: string;
  @Column("varchar") title!: string;
  @Column("integer", { default: 1 }) revision!: number;
  @Column("varchar") sourceDigest!: string;
  @Column("text") bindingsJson!: string;
  @Column("jsonb", { default: {} }) assistants!: Record<string, string>;
  @Column("uuid", { nullable: true }) bindingId!: string | null;
  @Column("uuid", { nullable: true }) instanceId!: string | null;
}
@Entity(pluginArtifactTableName("margin_improvement", "work"))
@Index(["tenantId", "organizationId", "projectId", "executionId"], {
  unique: true,
})
export class MarginWork {
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
@Entity(pluginArtifactTableName("margin_improvement", "evidence"))
@Index(["tenantId", "organizationId", "projectId"])
export class MarginEvidence {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") tenantId!: string;
  @Column("uuid") organizationId!: string;
  @Column("uuid") projectId!: string;
  @Column("varchar") digest!: string;
  @Column("jsonb") content!: Result;
}
export const ENTITIES = [MarginCase, MarginWork, MarginEvidence];
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
