import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { DrawioDrawingKind, DrawioDrawingStatus } from '../types.js'

@Entity('plugin_drawio_drawing')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'projectId', 'status'])
@Index(['tenantId', 'organizationId', 'kind', 'updatedAt'])
export class DrawioDrawing {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'varchar', default: 'diagram' })
  kind?: DrawioDrawingKind

  @Column({ type: 'varchar', default: 'draft' })
  status?: DrawioDrawingStatus

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[]

  @Column({ type: 'varchar', nullable: true })
  source?: string

  @Column({ type: 'varchar', nullable: true })
  currentVersionId?: string

  @Column({ type: 'int', default: 0 })
  currentVersionNumber?: number

  @Column({ type: 'varchar', nullable: true })
  lastEditedById?: string

  @Column({ type: 'timestamptz', nullable: true })
  lastEditedAt?: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
