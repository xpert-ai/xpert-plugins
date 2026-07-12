import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { presentationStudioTable } from '../constants.js'
import type { PresentationAssetReference, PresentationJsonValue } from '../types.js'

@Entity(presentationStudioTable('asset'))
@Index(['tenantId', 'organizationId', 'deckId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'deckId', 'sha256'])
export class PresentationAsset {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string
  @Column({ type: 'varchar', nullable: true }) projectId?: string
  @Column({ type: 'varchar' }) deckId!: string
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
