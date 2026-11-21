/**
 * 提前交货请求表：业务主对象，一条请求对应一次客户的提前交货诉求。
 * Python 类比：SQLAlchemy 的 class ExpediteRequest(Base): __tablename__ = 'plugin_expedite_shortage_request'。
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from '../constants.js'
import type { Feasibility, RequestStatus } from '../types.js'
import { ScopedColumns } from './scoped-columns.js'

export const REQUEST_TABLE = pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'request')

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'request'))
@Index(['tenantId', 'organizationId', 'status'])
// 同一组织内一个订单只能有一条提前交货请求；也让“载入演示请求”天然幂等
@Index(['tenantId', 'organizationId', 'orderNo'], { unique: true })
export class ExpediteRequestEntity extends ScopedColumns {
  /** 主键由服务端生成 UUID（不依赖数据库函数） */
  @PrimaryColumn({ type: 'uuid' }) id!: string
  @Column({ type: 'varchar', length: 40 }) orderNo!: string
  @Column({ type: 'varchar', length: 80 }) customerName!: string
  @Column({ type: 'varchar', length: 20 }) productCode!: string
  @Column({ type: 'int' }) quantity!: number
  /** 日期统一存 'YYYY-MM-DD' 字符串 */
  @Column({ type: 'varchar', length: 10 }) originalDueDate!: string
  @Column({ type: 'varchar', length: 10 }) targetDate!: string
  @Column({ type: 'text', nullable: true }) remark!: string | null
  @Column({ type: 'varchar', length: 20 }) status!: RequestStatus
  /** 演示开关：第 1 次分析时模拟库存系统故障 */
  @Column({ type: 'boolean', default: false }) demoFailInventoryOnce!: boolean
  /** 当前分析任务：界面只展示这个任务的结论，写工具也只接受这个任务 */
  @Column({ type: 'uuid', nullable: true }) currentJobId!: string | null
  /** 已创建的分析任务数，下一次任务序号 = jobCount + 1 */
  @Column({ type: 'int', default: 0 }) jobCount!: number
  /** 乐观锁版本号：每次状态迁移 +1，条件更新时带上它 */
  @Column({ type: 'int', default: 1 }) revision!: number
  @Column({ type: 'varchar', length: 20, nullable: true }) finalFeasibility!: Feasibility | null
  @Column({ type: 'varchar', length: 10, nullable: true }) finalDate!: string | null
  @Column({ type: 'text', nullable: true }) finalNote!: string | null
  @Column({ type: 'text', nullable: true }) rejectReason!: string | null
  @Column({ type: 'varchar', length: 64 }) createdById!: string
  @Column({ type: 'varchar', length: 64, nullable: true }) decidedById!: string | null
  @Column({ type: 'timestamptz', nullable: true }) decidedAt!: Date | null
  @Column({ type: 'timestamptz' }) createdAt!: Date
  @Column({ type: 'timestamptz' }) updatedAt!: Date
}
