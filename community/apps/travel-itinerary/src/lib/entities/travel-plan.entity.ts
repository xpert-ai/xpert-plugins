import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { TravelItinerary, TravelPlanStatus, TravelRequirements } from '../types'

@Entity('plugin_travel_itinerary_plan')
@Index(['tenantId', 'organizationId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'status', 'updatedAt'])
export class TravelPlan {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar' })
  title?: string

  @Column({ type: 'varchar', default: 'draft' })
  status?: TravelPlanStatus

  @Column({ type: 'jsonb' })
  requirements?: TravelRequirements

  @Column({ type: 'jsonb', nullable: true })
  itinerary?: TravelItinerary | null

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  updatedById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
