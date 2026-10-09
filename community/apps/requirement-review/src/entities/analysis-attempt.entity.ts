import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from '../constants.js'
import { OwnedRecord } from './owned-record.js'
import type { AttemptStatus } from '../domain/contracts.js'

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'analysis_attempt'))
@Index(['tenantId', 'organizationId', 'ownerId', 'reviewId', 'requestKey'], {
  unique: true
})
export class AnalysisAttempt extends OwnedRecord {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'varchar', length: 36 }) reviewId!: string
  @Column({ type: 'varchar', length: 64 }) requestKey!: string
  @Column({ type: 'int' }) inputVersion!: number
  @Column({ type: 'varchar' }) status!: AttemptStatus
  @Column({ type: 'varchar' }) startedAt!: string
  @Column({ type: 'varchar' }) deadlineAt!: string
  @Column({ type: 'varchar', nullable: true }) completedAt!: string | null
  @Column({ type: 'varchar', nullable: true }) model!: string | null
  @Column({ type: 'varchar' }) promptVersion!: string
  @Column({ type: 'varchar', nullable: true }) errorCode!: string | null
  @Column({ type: 'json', nullable: true }) usage!: {
    inputTokens: number
    outputTokens: number
  } | null
}
