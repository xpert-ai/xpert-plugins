import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SitesAccessMode, SitesHostingConfig, SitesProjectStatus, SitesStorageShape } from '../types.js'

@Entity('plugin_sites_project')
@Index(['tenantId', 'organizationId', 'assistantId', 'slug'])
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
export class SitesProject {
  /** Metadata CAS is independent of the source tree hash, including trash/restore ABA. */
  @Column({ type: 'int', default: 0 }) catalogRevision?: number
  @Column({ type: 'uuid', nullable: true }) copiedFromId?: string
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  /** Platform Project ownership. Null retains legacy personal/Assistant scope. */
  @Index() @Column({ type: 'uuid', nullable: true, update: false }) hostProjectId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Column({ type: 'varchar' })
  name?: string

  @Index()
  @Column({ type: 'varchar' })
  slug?: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'varchar', default: 'draft' })
  status?: SitesProjectStatus

  @Column({ type: 'varchar', default: 'admins_only' })
  audience?: SitesAccessMode

  @Column({ type: 'jsonb', nullable: true })
  customAudience?: string[]

  @Column({ type: 'varchar', default: 'static' })
  storageShape?: SitesStorageShape

  @Column({ type: 'varchar', nullable: true })
  sourcePath?: string

  @Column({ type: 'jsonb', nullable: true })
  hostingConfig?: SitesHostingConfig

  @Column({ type: 'varchar', nullable: true })
  currentDeploymentId?: string

  @Column({ type: 'varchar', nullable: true })
  currentDeploymentUrl?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
