import { Column } from 'typeorm'

export abstract class OwnedRecord {
  @Column({ type: 'varchar', nullable: true }) tenantId!: string | null
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column({ type: 'varchar' }) ownerId!: string
}
