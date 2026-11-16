import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { ComplaintAnalysisAttempt, ComplaintTicket, ENTITIES } from '../src/lib/ticket.entity.js'
import { ComplaintTriageService } from '../src/lib/triage.service.js'

export { COMPLAINT, analysisInput, scope, ticketInput } from './data.js'

export interface Harness {
  db: DataSource
  service: ComplaintTriageService
  // A second service over the same database: what a page reload or an API restart would see.
  reopen: () => ComplaintTriageService
  clock: { now: Date }
}

export async function harness(): Promise<Harness> {
  const db = new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true })
  await db.initialize()
  const clock = { now: new Date('2026-09-17T08:00:00.000Z') }
  const make = () => {
    const service = new ComplaintTriageService(db.getRepository(ComplaintTicket), db.getRepository(ComplaintAnalysisAttempt))
    service.now = () => new Date(clock.now)
    return service
  }
  return { db, service: make(), reopen: make, clock }
}

export function advance(clock: { now: Date }, ms: number) {
  clock.now = new Date(clock.now.getTime() + ms)
}
