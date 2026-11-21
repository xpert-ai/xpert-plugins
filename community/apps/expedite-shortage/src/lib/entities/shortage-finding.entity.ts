/**
 * 缺料结论表：一个分析任务里每个缺料物料一条。
 * 数字（需求、可用、缺口）由服务端计算写入；建议类型、日期、理由来自 AI；决定和备注来自计划员。
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from '../constants.js'
import type { FindingDecision, FindingEvidence, SuggestionType } from '../types.js'
import { ScopedColumns } from './scoped-columns.js'

export const FINDING_TABLE = pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'finding')

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'finding'))
// 幂等键：同一任务重复保存同一物料是更新而不是新增
@Index(['jobId', 'materialCode'], { unique: true })
@Index(['tenantId', 'organizationId', 'requestId'])
export class ShortageFindingEntity extends ScopedColumns {
  @PrimaryColumn({ type: 'uuid' }) id!: string
  @Column({ type: 'uuid' }) jobId!: string
  @Column({ type: 'uuid' }) requestId!: string
  @Column({ type: 'varchar', length: 20 }) materialCode!: string
  @Column({ type: 'varchar', length: 80 }) materialName!: string
  @Column({ type: 'int' }) requiredQty!: number
  @Column({ type: 'int' }) availableQty!: number
  @Column({ type: 'int' }) shortageQty!: number
  /** 依据快照：BOM 路径、库存、在途、提前期、替代料 */
  @Column({ type: 'jsonb' }) evidence!: FindingEvidence
  @Column({ type: 'varchar', length: 20 }) suggestionType!: SuggestionType
  @Column({ type: 'varchar', length: 10, nullable: true }) suggestedDate!: string | null
  @Column({ type: 'varchar', length: 20, nullable: true }) substituteCode!: string | null
  @Column({ type: 'text' }) rationale!: string
  @Column({ type: 'varchar', length: 20, default: 'pending' }) decision!: FindingDecision
  @Column({ type: 'text', nullable: true }) decisionNote!: string | null
  @Column({ type: 'timestamptz', nullable: true }) decidedAt!: Date | null
  @Column({ type: 'timestamptz' }) createdAt!: Date
  @Column({ type: 'timestamptz' }) updatedAt!: Date
}
