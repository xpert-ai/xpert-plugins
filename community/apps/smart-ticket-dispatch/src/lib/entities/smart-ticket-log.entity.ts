import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity('plugin_smart_ticket_log')
@Index(['ticketId', 'createdAt'])
export class SmartTicketLog {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'uuid' })
  ticketId?: string

  @Column({ type: 'varchar' })
  action?: string

  /** 'ai' or the human user id. */
  @Column({ type: 'varchar', nullable: true })
  operator?: string

  @Column({ type: 'text', nullable: true })
  detail?: string

  @CreateDateColumn()
  createdAt?: Date
}
