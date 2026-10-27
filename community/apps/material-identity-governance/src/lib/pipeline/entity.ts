import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { ARTIFACT_NAMESPACE } from '../artifact-namespace.js'
import { z } from 'zod/v3'
export const resultSchema = z.object({ caseId: z.string().uuid(), nodeKey: z.string().min(1),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/), revision: z.number().int().positive(), summary: z.string().max(4000),
  criticalConflict: z.boolean() }).strict()
export type MaterialPipelineResult = z.infer<typeof resultSchema>
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'pipeline_evidence'))
@Index(['tenantId', 'organizationId', 'projectId'])
export class MaterialPipelineEvidence {
  @PrimaryColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'uuid' }) projectId!: string
  @Column({ type: 'uuid' }) operationId!: string
  @Column({ type: 'varchar' }) digest!: string
  @Column({ type: 'jsonb' }) content!: MaterialPipelineResult
}
