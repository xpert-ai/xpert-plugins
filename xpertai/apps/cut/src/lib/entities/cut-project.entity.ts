import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { CutProjectDocument, CutProjectStatus } from '../types.js'

@Entity('plugin_cut_project')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'platformProjectId', 'updatedAt'])
export class CutProject {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar' })
  tenantId!: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null

  @Column({ type: 'varchar', nullable: true })
  platformProjectId?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'text', nullable: true })
  brief?: string | null

  @Column({ type: 'varchar', default: 'draft' })
  status!: CutProjectStatus

  @Column({ type: 'jsonb' })
  document!: CutProjectDocument

  @Column({ type: 'int', default: 1 })
  revision!: number

  @Column({ type: 'int', default: 0 })
  currentVersionNumber!: number

  @Column({ type: 'varchar', nullable: true })
  currentVersionId?: string | null

  @Column({ type: 'text', nullable: true })
  failureReason?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
