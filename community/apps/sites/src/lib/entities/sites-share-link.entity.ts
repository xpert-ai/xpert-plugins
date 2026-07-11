import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SitesShareLinkStatus } from '../types.js'

@Entity('plugin_sites_share_link')
@Index(['tenantId', 'organizationId', 'assistantId', 'projectId'])
@Index(['tenantId', 'organizationId', 'deploymentId'])
export class SitesShareLink {
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

  @Index()
  @Column({ type: 'varchar' })
  versionId?: string

  @Index()
  @Column({ type: 'varchar' })
  deploymentId?: string

  @Column({ type: 'varchar' })
  tokenHash?: string

  @Column({ type: 'varchar', nullable: true })
  label?: string

  @Column({ type: 'varchar', default: 'active' })
  status?: SitesShareLinkStatus

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null

  @Column({ type: 'int', default: 0 })
  accessCount?: number

  @Column({ type: 'timestamptz', nullable: true })
  lastAccessedAt?: Date | null

  @Column({ type: 'varchar', nullable: true })
  revokedById?: string

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt?: Date | null

  @Column({ type: 'text', nullable: true })
  revokedReason?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
