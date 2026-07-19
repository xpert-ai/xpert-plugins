import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  CutEditProposalItem,
  CutEditProposalStatus,
  CutProjectDocument,
  CutProposalConstraints
} from '../types.js'

@Entity('plugin_cut_edit_proposal')
@Index(['tenantId', 'organizationId', 'cutProjectId', 'status', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'cutProjectId', 'idempotencyKey'], { unique: true })
export class CutEditProposal {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null

  @Column({ type: 'varchar', nullable: true })
  platformProjectId?: string | null

  @Column({ type: 'varchar' })
  cutProjectId!: string

  @Column({ type: 'int' })
  sourceRevision!: number

  @Column({ type: 'jsonb' })
  sourceDocument!: CutProjectDocument

  @Column({ type: 'varchar', default: 'draft' })
  status!: CutEditProposalStatus

  @Column({ type: 'int', default: 1 })
  revision!: number

  @Column({ type: 'text' })
  goal!: string

  @Column({ type: 'jsonb', nullable: true })
  constraints?: CutProposalConstraints | null

  @Column({ type: 'jsonb' })
  items!: CutEditProposalItem[]

  @Column({ type: 'float' })
  estimatedDurationSeconds!: number

  @Column({ type: 'varchar' })
  idempotencyKey!: string

  @Column({ type: 'text', nullable: true })
  reviewNote?: string | null

  @Column({ type: 'int', nullable: true })
  appliedRevision?: number | null

  @Column({ type: 'int', nullable: true })
  revertedRevision?: number | null

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
