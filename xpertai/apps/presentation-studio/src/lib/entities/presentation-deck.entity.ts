import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { presentationStudioTable } from '../constants.js'
import type { PresentationDeckSpec, PresentationStatus, PresentationThemePack } from '../types.js'

@Entity(presentationStudioTable('deck'))
@Index(['tenantId', 'organizationId', 'projectId', 'status'])
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'updatedAt'])
export class PresentationDeck {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string
  @Column({ type: 'varchar', nullable: true }) projectId?: string
  @Column({ type: 'varchar', nullable: true }) createdById?: string
  @Column({ type: 'varchar', nullable: true }) assistantId?: string
  @Column({ type: 'varchar', nullable: true }) conversationId?: string
  @Column({ type: 'varchar' }) title!: string
  @Column({ type: 'text' }) goal!: string
  @Column({ type: 'text', nullable: true }) audience?: string
  @Column({ type: 'varchar', nullable: true }) owner?: string
  @Column({ type: 'varchar' }) themePack!: PresentationThemePack
  @Column({ type: 'varchar', default: 'draft' }) status!: PresentationStatus
  @Column({ type: 'int', default: 0 }) revision!: number
  @Column({ type: 'varchar', nullable: true }) currentVersionId?: string
  @Column({ type: 'int', default: 0 }) currentVersionNumber!: number
  @Column({ type: 'json' }) deckSpec!: PresentationDeckSpec
  @Column({ type: 'json', nullable: true }) editorState?: unknown
  @Column({ type: 'text', nullable: true }) yjsStateBase64?: string
  @Column({ type: 'text', nullable: true }) yjsStateVectorBase64?: string
  @Column({ type: 'int', default: 0 }) yjsUpdateCount!: number
  @Column({ type: 'varchar', nullable: true }) checksum?: string
  @Column({ type: 'text', nullable: true }) failureReason?: string
  @Column({ type: 'varchar', nullable: true }) lastEditedById?: string
  @Column({ type: 'timestamptz', nullable: true }) lastEditedAt?: Date
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt?: Date
}
