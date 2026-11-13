/**
 * 分析任务表：每点一次“AI 分析 / 重试 / 重新分析”产生一个任务，用于幂等和留痕。
 * 重试是新建任务而不是覆盖旧任务，旧任务的失败原因和结论都保留可追溯（产品设计决策 8）。
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from '../constants.js'
import type { Feasibility, JobStatus } from '../types.js'
import { ScopedColumns } from './scoped-columns.js'

export const ANALYSIS_JOB_TABLE = pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'analysis_job')

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'analysis_job'))
// 同一请求的任务序号唯一：两个并发的“开始分析”只有一个能插入成功
@Index(['requestId', 'seq'], { unique: true })
@Index(['tenantId', 'organizationId', 'requestId'])
export class AnalysisJobEntity extends ScopedColumns {
  @PrimaryColumn({ type: 'uuid' }) id!: string
  @Column({ type: 'uuid' }) requestId!: string
  /** 第几次分析，从 1 开始 */
  @Column({ type: 'int' }) seq!: number
  @Column({ type: 'varchar', length: 20 }) status!: JobStatus
  /** 创建时就确定本任务是否模拟库存故障（请求开关打开且 seq = 1） */
  @Column({ type: 'boolean', default: false }) simulateInventoryOutage!: boolean
  @Column({ type: 'varchar', length: 40, nullable: true }) errorCode!: string | null
  @Column({ type: 'text', nullable: true }) errorMessage!: string | null
  @Column({ type: 'varchar', length: 20, nullable: true }) feasibility!: Feasibility | null
  @Column({ type: 'varchar', length: 10, nullable: true }) recommendedDate!: string | null
  @Column({ type: 'text', nullable: true }) summary!: string | null
  /** 执行分析的会话（智能体读取任务时记录，便于追溯） */
  @Column({ type: 'varchar', length: 64, nullable: true }) conversationId!: string | null
  @Column({ type: 'varchar', length: 64 }) createdById!: string
  /** 创建时间，也是超时判定的起点 */
  @Column({ type: 'timestamptz' }) createdAt!: Date
  @Column({ type: 'timestamptz', nullable: true }) startedAt!: Date | null
  @Column({ type: 'timestamptz', nullable: true }) finishedAt!: Date | null
}
