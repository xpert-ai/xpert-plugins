import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from './constants.js'
import type { CaseStatus, FailureCode } from './domain/case.js'

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'intake_case'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId', 'requestKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId', 'updatedAt'])
export class IntakeCase {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
  @Column({ type: 'varchar', length: 36 }) requestKey!: string
  @Column({ type: 'varchar', length: 120 }) title!: string
  @Column({ type: 'varchar', length: 16 }) status!: CaseStatus
  /** Bumped on every state change; analysis results must name the revision they belong to. */
  @Column({ type: 'int' }) revision!: number
  /** JSON array of CategorySuggestion for the latest completed analysis. */
  @Column({ type: 'text', nullable: true }) suggestionsJson!: string | null
  @Column({ type: 'varchar', length: 64, nullable: true }) confirmedCategoryId!: string | null
  @Column({ type: 'varchar', length: 64, nullable: true }) referenceCategoryId!: string | null
  @Column({ type: 'varchar', length: 64, nullable: true }) failureCode!: FailureCode | null
  @Column({ type: 'varchar' }) createdAt!: string
  @Column({ type: 'varchar' }) updatedAt!: string
}
