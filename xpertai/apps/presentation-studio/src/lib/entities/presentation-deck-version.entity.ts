import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn } from 'typeorm'
import { presentationStudioTable } from '../constants.js'
import type { PresentationDeckSpec, PresentationEditorState, PresentationVersionSource } from '../types.js'
import { PresentationDeck } from './presentation-deck.entity.js'

@Entity(presentationStudioTable('deck_version'))
@ForeignKey(() => PresentationDeck, ['deckId'], ['id'], {
  name: 'plugin_presentation_studio_deck_version_parent_fk',
  onDelete: 'CASCADE'
})
@ForeignKey(() => PresentationDeck, ['deckId', 'projectId'], ['id', 'projectId'], {
  name: 'plugin_presentation_studio_deck_version_parent_project_fk',
  onDelete: 'CASCADE'
})
@Index(['deckId', 'versionNumber'], { unique: true })
@Index(['tenantId', 'organizationId', 'deckId', 'createdAt'])
export class PresentationDeckVersion {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string
  @Column({ type: 'uuid', nullable: true, update: false }) projectId?: string
  @Column({ type: 'uuid' }) deckId!: string
  @Column({ type: 'int' }) versionNumber!: number
  @Column({ type: 'varchar' }) source!: PresentationVersionSource
  @Column({ type: 'json' }) deckSpec!: PresentationDeckSpec
  @Column({ type: 'json', nullable: true }) editorState?: PresentationEditorState
  @Column({ type: 'text', nullable: true }) yjsStateBase64?: string
  @Column({ type: 'text', nullable: true }) yjsStateVectorBase64?: string
  @Column({ type: 'int', default: 0 }) yjsUpdateCount!: number
  @Column({ type: 'varchar' }) checksum!: string
  @Column({ type: 'varchar' }) rendererVersion!: string
  @Column({ type: 'varchar' }) upstreamCommit!: string
  @Column({ type: 'text', nullable: true }) changeSummary?: string
  @Column({ type: 'varchar', nullable: true }) createdById?: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
}
