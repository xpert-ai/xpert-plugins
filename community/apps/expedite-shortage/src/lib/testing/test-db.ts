/**
 * 单测用的内存 PostgreSQL（pg-mem）+ 一个可手动拨动的假时钟。
 * 只在 *.spec.ts 里使用，不会被打包进 dist（tsconfig.lib.json 排除了 testing 目录）。
 */
import 'reflect-metadata'
import { newDb } from 'pg-mem'
import type { DataSource } from 'typeorm'
import type { Clock } from '../clock.js'
import {
  AnalysisJobEntity,
  ENTITIES,
  ExpediteRequestEntity,
  RequestLogEntity,
  ShortageFindingEntity
} from '../entities/index.js'
import { ExpediteService } from '../expedite.service.js'
import { MockSupplyDataSource } from '../supply/mock-supply-data-source.js'
import type { ExpediteScope } from '../types.js'

export class FakeClock implements Clock {
  constructor(private current = new Date('2026-11-12T01:00:00.000Z')) {}
  now() {
    return new Date(this.current)
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms)
  }
}

export const SCOPE: ExpediteScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'planner-1' }
export const OTHER_ORG: ExpediteScope = { tenantId: 'tenant-a', organizationId: 'org-b', userId: 'planner-2' }

export async function createTestDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true })
  // TypeORM 初始化时会查询这两个函数，pg-mem 默认没有
  db.public.registerFunction({ name: 'current_database', implementation: () => 'expedite_test' })
  db.public.registerFunction({ name: 'version', implementation: () => 'PostgreSQL 16 (pg-mem)' })
  const dataSource: DataSource = await db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities: ENTITIES
  })
  await dataSource.initialize()
  await dataSource.synchronize()
  return dataSource
}

export function createService(dataSource: DataSource, clock = new FakeClock()) {
  const service = new ExpediteService(
    dataSource.getRepository(ExpediteRequestEntity),
    dataSource.getRepository(AnalysisJobEntity),
    dataSource.getRepository(ShortageFindingEntity),
    dataSource.getRepository(RequestLogEntity),
    new MockSupplyDataSource(),
    clock
  )
  return { service, clock }
}
