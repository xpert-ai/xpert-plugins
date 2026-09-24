import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ContractClauseType, ContractHumanDecision, ContractRiskLevel } from '../types'

/**
 * AI 抽出的一条条款建议 + 人工对它的最终处置。
 *
 * 这张表是「AI 建议」与「人工结论」并存的载体：ai* 列只由 AI 写，human* 列只由人写，
 * 两者都不覆盖对方，因此保存之后仍然能看出人改了什么（可追溯的责任归属）。
 */
@Entity('plugin_contract_review_clause')
@Index(['tenantId', 'organizationId', 'caseId', 'clauseType'])
export class ContractReviewClause {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Index()
  @Column({ type: 'varchar' })
  caseId?: string

  /** 展示顺序 */
  @Column({ type: 'int', default: 0 })
  sequence?: number

  @Column({ type: 'varchar' })
  clauseType?: ContractClauseType

  /** 合同原文摘录 —— 人工核对建议是否成立的依据 */
  @Column({ type: 'text' })
  excerpt?: string

  // ---- 以下 ai* 列由模型写入，人工不可改写 ----

  /** AI 对该条款的判断 */
  @Column({ type: 'text', nullable: true })
  aiConclusion?: string | null

  @Column({ type: 'varchar', default: 'medium' })
  aiRiskLevel?: ContractRiskLevel

  /** AI 给出该风险等级的理由 */
  @Column({ type: 'text', nullable: true })
  aiReason?: string | null

  // ---- 以下 human* 列由人工写入 ----

  @Index()
  @Column({ type: 'varchar', default: 'pending' })
  humanDecision?: ContractHumanDecision

  /** 人工终判。decision=edited 时为改写后的结论，否则一般等于 aiConclusion。 */
  @Column({ type: 'text', nullable: true })
  humanConclusion?: string | null

  @Column({ type: 'text', nullable: true })
  humanNote?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
