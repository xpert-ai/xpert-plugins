import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SitesSourceFile, SitesStorageShape, SitesVersionStatus } from '../types.js'

@Entity('plugin_sites_version')
@Index(['tenantId', 'organizationId', 'assistantId', 'projectId'])
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
export class SitesVersion {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Index()
  @Column({ type: 'varchar' })
  projectId?: string

  @Column({ type: 'int' })
  versionNumber?: number

  @Column({ type: 'varchar', nullable: true })
  title?: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'text', nullable: true })
  prompt?: string

  @Column({ type: 'varchar', nullable: true })
  sourceCommit?: string

  @Column({ type: 'varchar', default: 'static' })
  storageShape?: SitesStorageShape

  @Column({ type: 'varchar', default: 'saved' })
  status?: SitesVersionStatus

  @Column({ type: 'jsonb' })
  files?: SitesSourceFile[]

  @Column({ type: 'text' })
  previewHtml?: string

  @Column({ type: 'varchar', nullable: true })
  artifactDigest?: string

  @Column({ type: 'text', nullable: true })
  buildLogs?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
