/**
 * 操作日志表：谁（计划员 / AI / 系统）在什么时候对请求做了什么，用于追溯。
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from '../constants.js'
import type { LogActor } from '../types.js'
import { ScopedColumns } from './scoped-columns.js'

export const LOG_TABLE = pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'log')

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'log'))
@Index(['tenantId', 'organizationId', 'requestId', 'createdAt'])
export class RequestLogEntity extends ScopedColumns {
  @PrimaryColumn({ type: 'uuid' }) id!: string
  @Column({ type: 'uuid' }) requestId!: string
  @Column({ type: 'uuid', nullable: true }) jobId!: string | null
  @Column({ type: 'varchar', length: 10 }) actor!: LogActor
  /** 动作代码，例如 request_created、analysis_started、finding_saved */
  @Column({ type: 'varchar', length: 40 }) action!: string
  /** 一句话摘要（英文代码 + 参数，界面再翻译） */
  @Column({ type: 'text' }) summary!: string
  @Column({ type: 'timestamptz' }) createdAt!: Date
}
