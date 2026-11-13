import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from './constants.js'
import type { EvaluationRunSummary } from './domain/evaluation.js'

/** A bounded aggregate (10 samples × 2 variants × 3 attempts) permits atomic CAS writes
 * for claims, results, reviews and decisions without plugin-owned transactions. */
@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'evaluation_run'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId', 'requestKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId', 'createdAt'])
export class EvaluationRun {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
  @Column({ type: 'varchar', length: 36 }) requestKey!: string
  @Column({ type: 'varchar', length: 120 }) title!: string
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'varchar', length: 16 }) status!: EvaluationRunSummary['status']
  @Column({ type: 'int' }) sampleCount!: number
  @Column({ type: 'text' }) snapshotJson!: string
  @Column({ type: 'text' }) cellsJson!: string
  @Column({ type: 'text' }) reviewsJson!: string
  @Column({ type: 'text', nullable: true }) decisionJson!: string | null
  @Column({ type: 'varchar', nullable: true }) leaseUntil!: string | null
  @Column({ type: 'varchar' }) createdAt!: string
  @Column({ type: 'varchar' }) updatedAt!: string
}
