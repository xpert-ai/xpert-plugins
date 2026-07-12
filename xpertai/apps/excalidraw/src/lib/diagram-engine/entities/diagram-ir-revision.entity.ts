import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type {
  DiagramIR,
  DiagramIrRevisionStatus,
  DiagramValidationReport,
  DiagramVisualReviewRecord,
  ResolvedDiagram
} from '../diagram.types.js'

@Entity('plugin_excalidraw_diagram_ir_revision')
@Index(['tenantId', 'organizationId', 'drawingId', 'revision'], { unique: true })
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class DiagramIrRevision {
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
  revision!: number

  @Column({ type: 'int', nullable: true })
  parentRevision?: number | null

  @Column({ type: 'varchar', nullable: true })
  templateKey?: string | null

  @Column({ type: 'varchar', nullable: true })
  templateVersion?: string | null

  @Column({ type: 'varchar', default: 'draft' })
  status!: DiagramIrRevisionStatus

  @Column({ type: 'jsonb' })
  ir!: DiagramIR

  @Column({ type: 'jsonb', nullable: true })
  resolved?: ResolvedDiagram | null

  @Column({ type: 'jsonb', nullable: true })
  validationReport?: DiagramValidationReport | null

  @Column({ type: 'jsonb', nullable: true })
  visualReviews?: DiagramVisualReviewRecord[] | null

  @Column({ type: 'jsonb', nullable: true })
  qualityArtifacts?: Record<string, unknown> | null

  @Column({ type: 'varchar', nullable: true })
  renderedExcalidrawVersionId?: string | null

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string | null

  @Column({ type: 'text', nullable: true })
  changeSummary?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
