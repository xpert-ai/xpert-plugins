import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'
import type { HumanDecisionResult } from '@xpert-ai/plugin-sdk'

@Entity('plugin_procurement_delay_decision')
@Index('uq_procurement_delay_revision', ['tenantId', 'organizationId', 'caseId', 'riskId', 'series', 'revision'], {
  unique: true
})
export class DelayDecision {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column('uuid') tenantId!: string
  @Column('uuid') organizationId!: string
  @Column('uuid') caseId!: string
  @Column('uuid') riskId!: string
  @Column('uuid') series!: string
  @Column('int') revision!: number
  @Column('uuid') buyerId!: string
  @Column('uuid') binding!: string
  @Column('int') bindingRevision!: number
  @Column('varchar') supplier!: string
  @Column('date') originalDate!: string
  @Column('date') revisedDate!: string
  @Column('uuid', { nullable: true }) replaces!: string | null
  @Column('uuid', { nullable: true }) conversationId!: string | null
  @Column('varchar', { nullable: true }) threadId!: string | null
  @Column('int', { default: 1 }) version!: number
  @Column('varchar', { default: 'pending' }) state!: 'pending' | 'accepted' | 'renegotiate' | 'superseded' | 'closed'
  @Column('uuid', { nullable: true }) decisionId!: string | null
  @Column('uuid', { nullable: true }) decidedBy!: string | null
  @Column('timestamptz', { nullable: true }) decidedAt!: Date | null
  @Column('uuid', { nullable: true }) outputMessageId!: string | null
  @Column('timestamptz', { nullable: true, default: () => 'now()' }) availableAt!: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}

@Entity('plugin_procurement_delay_input')
export class DelayDecisionInput {
  @PrimaryColumn('uuid') tenantId!: string
  @PrimaryColumn('uuid') organizationId!: string
  @PrimaryColumn('varchar') origin!: 'workbench' | 'lark'
  @PrimaryColumn('uuid') commandId!: string
  @Column('uuid') requestId!: string
  @Column('varchar') digest!: string
  @Column('jsonb') result!: HumanDecisionResult
}
