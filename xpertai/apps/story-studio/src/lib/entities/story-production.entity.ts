import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  StoryAsset,
  StoryCharacter,
  StoryEpisode,
  StoryPlan,
  StoryScene,
  StorySourceMaterial
} from '../production-types.js'
import { storyStudioTable } from '../story-studio-artifact-namespace.js'

@Entity(storyStudioTable('production'))
@Index(['tenantId', 'scopeKey', 'projectId'], { unique: true })
export class StoryProduction {
  @PrimaryGeneratedColumn('uuid')
  id!: string
  @Index()
  @Column({ type: 'varchar' })
  tenantId!: string
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null
  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null
  @Column({ type: 'varchar', nullable: true })
  hostProjectId?: string | null
  @Column({ type: 'varchar', length: 64 })
  scopeKey!: string
  @Index()
  @Column({ type: 'uuid' })
  projectId!: string
  @Column({ type: 'int' })
  projectRevision!: number
  @Column({ type: 'int', default: 1 })
  documentRevision!: number
  @Column({ type: 'text' })
  sourceSynopsis!: string
  @Column({ type: 'text' })
  adaptationGoal!: string
  @Column({ type: 'text' })
  visualStyle!: string
  @Column({ type: 'text', nullable: true })
  audience?: string | null
  @Column({ type: 'jsonb', default: () => "'[]'" })
  sourceMaterials!: StorySourceMaterial[]
  @Column({ type: 'jsonb', nullable: true })
  storyPlan?: StoryPlan | null
  @Column({ type: 'jsonb', default: () => "'[]'" })
  episodes!: StoryEpisode[]
  @Column({ type: 'jsonb', default: () => "'[]'" })
  assets!: StoryAsset[]
  @Column({ type: 'jsonb', default: () => "'[]'" })
  characters!: StoryCharacter[]
  @Column({ type: 'jsonb', default: () => "'[]'" })
  scenes!: StoryScene[]
  @Column({ type: 'varchar', length: 128 })
  operationId!: string
  @Column({ type: 'varchar', length: 64 })
  inputChecksum!: string
  @Column({ type: 'varchar', length: 240 })
  changeSummary!: string
  @Column({ type: 'varchar', nullable: true })
  lastEditedById?: string | null
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
