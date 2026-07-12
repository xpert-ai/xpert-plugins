import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SitesAccessMode, SitesDeploymentStatus } from '../types.js'

@Entity('plugin_sites_deployment')
@Index(['tenantId', 'organizationId', 'assistantId', 'projectId'])
@Index(['tenantId', 'organizationId', 'deploymentUrl'])
export class SitesDeployment {
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

  @Column({ type: 'varchar' })
  deploymentUrl?: string

  @Column({ type: 'varchar', nullable: true })
  artifactId?: string | null

  @Column({ type: 'varchar', nullable: true })
  artifactVersionId?: string | null

  @Column({ type: 'varchar', nullable: true })
  artifactLinkId?: string | null

  @Column({ type: 'varchar', default: 'deployed' })
  status?: SitesDeploymentStatus

  @Column({ type: 'varchar', default: 'admins_only' })
  accessMode?: SitesAccessMode

  @Column({ type: 'jsonb', nullable: true })
  customAudience?: string[]

  @Column({ type: 'varchar', nullable: true })
  environmentFingerprint?: string

  @Column({ type: 'timestamptz', nullable: true })
  deployedAt?: Date

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
