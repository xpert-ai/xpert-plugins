import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import type { EntityManager } from 'typeorm'
import {
  DockyardError, saveBuffersSchema, saveScratchpadSchema,
  saveWorkspaceSchema, scopeSchema, workspaceStateSchema
} from './domain/contracts.js'
import type { BufferEntry, WorkspaceScope } from './domain/contracts.js'
import { validateWorkspace } from './domain/layout.js'
import { WorkspaceRecord } from './workspace.entity.js'

function recordId(scope: WorkspaceScope, kind: WorkspaceRecord['kind']) {
  const s = scopeSchema.parse(scope)
  return createHash('sha256').update(JSON.stringify([s.tenantId, s.organizationId, s.workspaceId, s.userId, s.xpertId, kind])).digest('hex')
}
const now = () => new Date().toISOString()

@Injectable()
export class DockyardWorkspaceService {
  constructor(@InjectRepository(WorkspaceRecord) private readonly records: Repository<WorkspaceRecord>) {}

  private where(scope: WorkspaceScope, kind: WorkspaceRecord['kind']) {
    return { ...scopeSchema.parse(scope), kind, id: recordId(scope, kind) }
  }

  private async read(scope: WorkspaceScope, kind: WorkspaceRecord['kind'], manager = this.records.manager) {
    return manager.findOneBy(WorkspaceRecord, this.where(scope, kind))
  }

  async getWorkspace(scope: WorkspaceScope) {
    const [layout, buffers, scratchpad] = await Promise.all([
      this.read(scope, 'layout'), this.read(scope, 'buffers'), this.read(scope, 'scratchpad')
    ])
    return {
      workspace: { revision: layout?.revision ?? 0, state: layout ? workspaceStateSchema.parse(JSON.parse(layout.payloadJson)) : null },
      buffers: { revision: buffers?.revision ?? 0,
        items: buffers ? saveBuffersSchema.shape.buffers.parse(JSON.parse(buffers.payloadJson)) : [] as BufferEntry[] },
      scratchpad: { revision: scratchpad?.revision ?? 0,
        text: scratchpad ? saveScratchpadSchema.shape.text.parse(JSON.parse(scratchpad.payloadJson)) : null },
      proposal: null
    }
  }

  private async write(scope: WorkspaceScope, kind: WorkspaceRecord['kind'], expectedRevision: number, payloadJson: string, manager: EntityManager) {
    const where = this.where(scope, kind)
    const updatedAt = now()
    if (expectedRevision === 0) {
      // A unique scope/kind key makes simultaneous first saves conflict instead of overwriting.
      try { await manager.insert(WorkspaceRecord, { ...where, revision: 1, payloadJson, updatedAt }) }
      catch (error) {
        // Only classify actual unique violations. Connectivity/schema failures remain failures.
        if (isUniqueViolation(error)) throw new DockyardError('conflict')
        throw error
      }
    } else {
      const result = await manager.update(WorkspaceRecord, { ...where, revision: expectedRevision }, {
        revision: expectedRevision + 1, payloadJson, updatedAt
      })
      if (result.affected !== 1) throw new DockyardError('conflict')
    }
    return { revision: expectedRevision + 1 }
  }

  async saveWorkspace(scope: WorkspaceScope, input: ReturnType<typeof saveWorkspaceSchema.parse>) {
    const parsed = saveWorkspaceSchema.parse(input)
    validateWorkspace(parsed.state)
    return this.write(scope, 'layout', parsed.expectedRevision, JSON.stringify(parsed.state), this.records.manager)
  }

  async saveBuffers(scope: WorkspaceScope, input: ReturnType<typeof saveBuffersSchema.parse>, manager = this.records.manager) {
    const parsed = saveBuffersSchema.parse(input)
    return this.write(scope, 'buffers', parsed.expectedRevision, JSON.stringify(parsed.buffers), manager)
  }

  async saveScratchpad(scope: WorkspaceScope, input: ReturnType<typeof saveScratchpadSchema.parse>) {
    const parsed = saveScratchpadSchema.parse(input)
    return this.write(scope, 'scratchpad', parsed.expectedRevision, JSON.stringify(parsed.text), this.records.manager)
  }

}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY')) return true
  // sql.js does not expose a machine-readable SQLite code. This local compatibility
  // boundary is confined to identifying its exact UNIQUE/PRIMARY KEY error prefix.
  return error instanceof Error && /^UNIQUE constraint failed: (plugin_dockyard_workspace_record|plugin_dockyard_layout_proposal)\./.test(error.message)
}
