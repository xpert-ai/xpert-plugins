import { Column, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm'

export abstract class ScopedRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId!: string | null

  @Column({ type: 'varchar', nullable: true })
  workspaceId!: string | null

  @Column({ type: 'varchar', nullable: true })
  platformProjectId!: string | null

  @Column({ type: 'varchar', nullable: true })
  xpertId!: string | null

  @Column({ type: 'varchar' })
  createdById!: string

  @VersionColumn()
  revision!: number

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
