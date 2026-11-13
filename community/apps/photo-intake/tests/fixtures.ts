import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import type { IntakeScope } from '../src/lib/domain/contracts.js'
import { IntakeCase } from '../dist/lib/intake-case.entity.js'
import { IntakePhoto } from '../dist/lib/intake-photo.entity.js'
import { IntakeService } from '../dist/lib/intake.service.js'

export const scope: IntakeScope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  xpertId: 'xpert-1'
}

/** Smallest byte string that carries a JPEG signature. The service checks signatures, not pixels. */
export const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])
export const JPEG_DATA_URL = `data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`
export const PNG_DATA_URL = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]).toString('base64')}`

/** Real TypeORM repositories on an in-memory SQLite database, so indexes and queries are exercised. */
export async function createService() {
  const db = new DataSource({ type: 'sqljs', entities: [IntakeCase, IntakePhoto], synchronize: true })
  await db.initialize()
  const cases = db.getRepository(IntakeCase)
  const photos = db.getRepository(IntakePhoto)
  return { db, cases, photos, service: new IntakeService(cases, photos) }
}

export function newCase(title = 'Water dripping in room 3') {
  return { requestKey: randomUUID(), title, photo: { dataUrl: JPEG_DATA_URL } }
}
