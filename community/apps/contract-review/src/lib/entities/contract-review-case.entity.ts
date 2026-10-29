import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ContractReviewCaseStatus } from '../types'

/**
 * 一次合同审查任务。
 *
 * 生命周期：draft（已录入待审查）→ extracting（AI 审查中）→ extracted（AI 已出建议，待人确认）→ confirmed（人工已确认并落库）
 * 失败时停留在 extracting 并把原因写进 lastExtractionError，契约正文始终保留，可原地重试。
 */
@Entity('plugin_contract_review_case')
@Index(['tenantId', 'organizationId', 'status', 'createdAt'])
export class ContractReviewCase {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  /** 合同名称，例如「XX 项目设备采购合同」 */
  @Column({ type: 'varchar' })
  title?: string

  /** 相对方（可选） */
  @Column({ type: 'varchar', nullable: true })
  counterparty?: string | null

  /** 合同正文全文。失败重试时依赖它，任何情况下都不清空。 */
  @Column({ type: 'text' })
  contractText?: string

  @Index()
  @Column({ type: 'varchar', default: 'draft' })
  status?: ContractReviewCaseStatus

  /** AI 审查尝试次数，用于失败重试的可观测性 */
  @Column({ type: 'int', default: 0 })
  extractionAttempts?: number

  @Column({ type: 'timestamptz', nullable: true })
  lastExtractionAt?: Date | null

  /** 上一次失败原因（模型不可用/超时/未返回）。成功后清空。 */
  @Column({ type: 'text', nullable: true })
  lastExtractionError?: string | null

  /** 人工确认落库时间 */
  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date | null

  @Column({ type: 'varchar', nullable: true })
  createdBy?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
