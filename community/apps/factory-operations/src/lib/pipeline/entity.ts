import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { z } from 'zod/v3'
import { factoryTable } from '../artifact-namespace.js'
export const resultSchema = z.object({ caseId: z.string().uuid(), nodeKey: z.string().min(1),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/), revision: z.number().int().positive(), summary: z.string().max(4000),
  outcome: z.enum(['accepted', 'approved', 'rejected', 'complete', 'partial-failure', 'recovered', 'needs-intervention']) }).strict()
export type FactoryPipelineResult = z.infer<typeof resultSchema>
@Entity(factoryTable('pipeline_evidence'))
@Index(['tenantId', 'organizationId', 'projectId'])
export class FactoryPipelineEvidence {
  @PrimaryColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column({ type: 'uuid' }) projectId!: string
  @Column({ type: 'uuid' }) operationId!: string
  @Column({ type: 'varchar' }) digest!: string
  @Column({ type: 'jsonb' }) content!: FactoryPipelineResult
}
