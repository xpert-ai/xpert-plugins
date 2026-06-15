import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { ExcalidrawVersionSource } from '../types.js'

@Entity('plugin_excalidraw_drawing_version')
@Index(['tenantId', 'organizationId', 'drawingId', 'versionNumber'])
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class ExcalidrawDrawingVersion {
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

  @Index()
  @Column({ type: 'varchar' })
  drawingId!: string

  @Column({ type: 'int' })
  versionNumber!: number

  @Column({ type: 'varchar', default: 'workbench' })
  sourceType?: ExcalidrawVersionSource

  @Column({ type: 'jsonb', nullable: true })
  elements?: unknown[]

  @Column({ type: 'jsonb', nullable: true })
  appState?: Record<string, unknown> | null

  @Column({ type: 'jsonb', nullable: true })
  files?: Record<string, unknown> | null

  @Column({ type: 'text', nullable: true })
  mermaidSource?: string | null

  @Column({ type: 'text', nullable: true })
  changeSummary?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
