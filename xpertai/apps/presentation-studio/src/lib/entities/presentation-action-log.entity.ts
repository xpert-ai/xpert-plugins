import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn } from 'typeorm'
import { presentationStudioTable } from '../constants.js'
import type { PresentationJsonObject } from '../types.js'
import { PresentationDeck } from './presentation-deck.entity.js'

@Entity(presentationStudioTable('action_log'))
@ForeignKey(() => PresentationDeck, ['deckId'], ['id'], {
  name: 'plugin_presentation_studio_action_log_parent_fk',
  onDelete: 'CASCADE'
})
@ForeignKey(() => PresentationDeck, ['deckId', 'projectId'], ['id', 'projectId'], {
  name: 'plugin_presentation_studio_action_log_parent_project_fk',
  onDelete: 'CASCADE'
})
@Index(['tenantId', 'organizationId', 'deckId', 'createdAt'])
export class PresentationActionLog {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string
  @Column({ type: 'uuid', nullable: true, update: false }) projectId?: string
  @Column({ type: 'uuid', nullable: true }) deckId?: string
  @Column({ type: 'varchar', nullable: true }) versionId?: string
  @Column({ type: 'varchar', nullable: true }) exportId?: string
  @Column({ type: 'varchar' }) action!: string
  @Column({ type: 'varchar' }) actor!: 'agent' | 'workbench' | 'system' | 'collaboration'
  @Column({ type: 'varchar' }) status!: 'succeeded' | 'failed'
  @Column({ type: 'text', nullable: true }) message?: string
  @Column({ type: 'json', nullable: true }) summary?: PresentationJsonObject
  @Column({ type: 'text', nullable: true }) errorMessage?: string
  @Column({ type: 'varchar', nullable: true }) createdById?: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
}
