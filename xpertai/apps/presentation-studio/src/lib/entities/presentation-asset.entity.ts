import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn } from 'typeorm'
import { presentationStudioTable } from '../constants.js'
import type { PresentationAssetReference, PresentationJsonValue } from '../types.js'
import { PresentationDeck } from './presentation-deck.entity.js'

@Entity(presentationStudioTable('asset'))
@ForeignKey(() => PresentationDeck, ['deckId'], ['id'], {
  name: 'plugin_presentation_studio_asset_parent_fk',
  onDelete: 'CASCADE'
})
@ForeignKey(() => PresentationDeck, ['deckId', 'projectId'], ['id', 'projectId'], {
  name: 'plugin_presentation_studio_asset_parent_project_fk',
  onDelete: 'CASCADE'
})
@Index(['tenantId', 'organizationId', 'deckId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'deckId', 'sha256'])
export class PresentationAsset {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string
  @Column({ type: 'uuid', nullable: true, update: false }) projectId?: string
  @Column({ type: 'uuid' }) deckId!: string
  @Column({ type: 'varchar', nullable: true }) versionId?: string
  @Column({ type: 'varchar', nullable: true }) slideId?: string
  @Column({ type: 'varchar' }) role!: string
  @Column({ type: 'varchar' }) fileName!: string
  @Column({ type: 'varchar', nullable: true }) mimeType?: string
  @Column({ type: 'int' }) size!: number
  @Column({ type: 'varchar' }) sha256!: string
  @Column({ type: 'json' }) fileReference!: PresentationAssetReference
  @Column({ type: 'json', nullable: true }) evidence?: PresentationJsonValue
  @Column({ type: 'varchar', nullable: true }) createdById?: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
}
