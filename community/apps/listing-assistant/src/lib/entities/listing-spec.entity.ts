import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { LISTING_SPEC_TABLE } from '../constants.js'

@Entity(LISTING_SPEC_TABLE)
@Index(['taskId', 'sortOrder'])
export class ListingSpec {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'uuid' })
  taskId!: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'varchar', nullable: true })
  price?: string | null

  @Column({ type: 'int', nullable: true })
  stock?: number | null

  @Column({ type: 'int', default: 0 })
  sortOrder!: number
}
