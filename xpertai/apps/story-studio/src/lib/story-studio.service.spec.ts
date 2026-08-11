import 'reflect-metadata'
jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

import {
  BadRequestException,
  ConflictException,
  NotFoundException
} from '@nestjs/common'
import type { EntityManager, Repository } from 'typeorm'
import { StoryActionLog, StoryProject } from './entities/index.js'
import {
  buildStoryScopeKey,
  StoryStudioService
} from './story-studio.service.js'
import type { StoryScope } from './types.js'

type FakeRecord = {
  id?: string
  createdAt?: Date
  updatedAt?: Date
}

class FakeRepository<T extends FakeRecord> {
  records: T[] = []
  manager!: EntityManager
  private sequence = 0

  create(input: Partial<T>) {
    return { ...input } as T
  }

  async save(entity: T) {
    if (!entity.id) {
      entity.id = `00000000-0000-4000-8000-${String(
        ++this.sequence
      ).padStart(12, '0')}`
      entity.createdAt = new Date('2026-07-25T00:00:00.000Z')
    }
    entity.updatedAt = new Date('2026-07-25T00:00:00.000Z')
    const index = this.records.findIndex((item) => item.id === entity.id)
    if (index >= 0) {
      this.records[index] = { ...this.records[index], ...entity }
    } else {
      this.records.push(entity)
    }
    return entity
  }

  async findOne(input: { where?: Partial<T> }) {
    return (
      this.records.find((record) =>
        matchesWhere(record, input.where ?? {})
      ) ?? null
    )
  }

  async update(where: Partial<T>, patch: Partial<T>) {
    const record = this.records.find((candidate) =>
      matchesWhere(candidate, where)
    )
    if (!record) {
      return { affected: 0 }
    }
    Object.assign(record, patch, {
      updatedAt: new Date('2026-07-25T00:00:01.000Z')
    })
    return { affected: 1 }
  }

  async findAndCount(input: {
    where?: Partial<T> | Partial<T>[]
    skip?: number
    take?: number
  }): Promise<[T[], number]> {
    const alternatives = Array.isArray(input.where)
      ? input.where
      : [input.where ?? {}]
    const filtered = this.records.filter((record) =>
      alternatives.some((where) => matchesWhere(record, where))
    )
    const start = input.skip ?? 0
    return [
      filtered.slice(start, start + (input.take ?? filtered.length)),
      filtered.length
    ]
  }
}

const scope: StoryScope = {
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  workspaceId: 'workspace-a',
  hostProjectId: 'host-project-a',
  userId: 'user-a',
  assistantId: null
}

describe('StoryStudioService mutation contracts', () => {
  let projects: FakeRepository<StoryProject>
  let logs: FakeRepository<StoryActionLog>
  let service: StoryStudioService

  beforeEach(() => {
    projects = new FakeRepository<StoryProject>()
    logs = new FakeRepository<StoryActionLog>()
    const manager = {
      getRepository(entity: unknown) {
        return entity === StoryProject ? projects : logs
      },
      async transaction<T>(
        callback: (transactionManager: EntityManager) => Promise<T>
      ) {
        return callback(asEntityManager(manager))
      }
    }
    projects.manager = asEntityManager(manager)
    logs.manager = asEntityManager(manager)
    service = new StoryStudioService(
      asRepository(projects),
      asRepository(logs)
    )
  })

  it('creates once and returns an idempotent receipt for an exact retry', async () => {
    const input = {
      operationId: 'create:story:001',
      title: 'Moonlit Courier',
      premise: 'A courier delivers memories.',
      productionFormat: 'vertical_short' as const,
      aspectRatio: '9:16' as const,
      changeSummary: 'Created approved Story Studio brief'
    }

    const created = await service.createProject(scope, input)
    const retried = await service.createProject(scope, input)

    expect(created.receipt).toMatchObject({
      duplicate: false,
      revision: 1,
      status: 'draft'
    })
    expect(retried.receipt).toMatchObject({
      duplicate: true,
      revision: 1,
      projectId: created.project.id
    })
    expect(projects.records).toHaveLength(1)
    expect(logs.records).toHaveLength(1)
  })

  it('rejects reusing an operation id with a different payload', async () => {
    const input = {
      operationId: 'create:story:002',
      title: 'Original title',
      changeSummary: 'Created original brief'
    }
    await service.createProject(scope, input)

    await expect(
      service.createProject(scope, {
        ...input,
        title: 'Different title'
      })
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('increments revisions with compare-and-swap and preserves exact retries', async () => {
    const created = await service.createProject(scope, {
      operationId: 'create:story:003',
      title: 'Revision story',
      changeSummary: 'Created revision test project'
    })
    const mutation = {
      projectId: created.project.id,
      operationId: 'update:story:003',
      baseRevision: 1,
      title: 'Revision story v2',
      changeSummary: 'Updated the project title'
    }

    const updated = await service.updateProject(scope, mutation)
    const retried = await service.updateProject(scope, mutation)

    expect(updated.receipt).toMatchObject({
      duplicate: false,
      previousRevision: 1,
      revision: 2
    })
    expect(retried.receipt).toMatchObject({
      duplicate: true,
      previousRevision: 1,
      revision: 2
    })
    await expect(
      service.updateProject(scope, {
        ...mutation,
        operationId: 'update:story:stale',
        title: 'Stale update'
      })
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('reads only the compact revision token for concurrency recovery', async () => {
    const created = await service.createProject(scope, {
      operationId: 'create:story:revision-read',
      title: 'Compact revision story',
      changeSummary: 'Created compact revision test project'
    })
    await service.updateProject(scope, {
      projectId: created.project.id,
      operationId: 'update:story:revision-read',
      baseRevision: 1,
      title: 'Compact revision story v2',
      changeSummary: 'Advanced compact revision test project'
    })

    await expect(
      service.getProjectRevision(scope, {
        projectId: created.project.id
      })
    ).resolves.toEqual({
      projectId: created.project.id,
      revision: 2
    })
  })

  it('enforces explicit lifecycle transitions', async () => {
    const created = await service.createProject(scope, {
      operationId: 'create:story:004',
      title: 'Lifecycle story',
      changeSummary: 'Created lifecycle test project'
    })

    await expect(
      service.updateProjectStatus(scope, {
        projectId: created.project.id,
        operationId: 'status:story:004',
        baseRevision: 1,
        status: 'review',
        changeSummary: 'Attempted to skip planning'
      })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('advances, records a failure, and clears failure fields on recovery', async () => {
    const created = await service.createProject(scope, {
      operationId: 'create:story:005',
      title: 'Recoverable story',
      changeSummary: 'Created recoverable story'
    })
    const planning = await service.updateProjectStatus(scope, {
      projectId: created.project.id,
      operationId: 'status:story:005',
      baseRevision: 1,
      status: 'planning',
      changeSummary: 'Moved story to planning'
    })
    const failed = await service.reportFailure(scope, {
      projectId: created.project.id,
      operationId: 'failure:story:005',
      baseRevision: 2,
      failureCode: 'source_parse_failed',
      errorMessage: 'The source could not be parsed.',
      recoverable: true,
      changeSummary: 'Recorded a recoverable source failure'
    })
    const recovered = await service.updateProjectStatus(scope, {
      projectId: created.project.id,
      operationId: 'status:story:005:recover',
      baseRevision: 3,
      status: 'draft',
      changeSummary: 'Recovered the story to draft'
    })

    expect(planning.receipt).toMatchObject({
      revision: 2,
      status: 'planning'
    })
    expect(failed.project).toMatchObject({
      revision: 3,
      status: 'failed',
      failureCode: 'source_parse_failed',
      failureRecoverable: true
    })
    expect(recovered.project).toMatchObject({
      revision: 4,
      status: 'draft',
      failureCode: null,
      failureMessage: null,
      failureRecoverable: null
    })
  })

  it('isolates project reads and paginated lists by the exact scope key', async () => {
    for (const index of [1, 2, 3]) {
      await service.createProject(scope, {
        operationId: `create:story:scope:${index}`,
        title: `Scoped story ${index}`,
        changeSummary: `Created scoped story ${index}`
      })
    }
    const page = await service.searchProjects(scope, {
      page: 2,
      pageSize: 2
    })
    expect(page).toMatchObject({
      total: 3,
      page: 2,
      pageSize: 2
    })
    expect(page.items).toHaveLength(1)

    await expect(
      service.getProjectSummary(
        { ...scope, workspaceId: 'workspace-b' },
        { projectId: projects.records[0].id! }
      )
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('derives stable and isolated scope keys', () => {
    expect(buildStoryScopeKey(scope)).toHaveLength(64)
    expect(buildStoryScopeKey(scope)).toBe(buildStoryScopeKey({ ...scope }))
    expect(buildStoryScopeKey(scope)).not.toBe(
      buildStoryScopeKey({ ...scope, workspaceId: 'workspace-b' })
    )
  })
})

function matchesWhere<T extends object>(
  record: T,
  where: Partial<T>
) {
  return Object.entries(where).every(
    ([key, value]) => Reflect.get(record, key) === value
  )
}

function asEntityManager(value: object): EntityManager {
  return value as never
}

function asRepository<T extends FakeRecord>(
  value: FakeRepository<T>
): Repository<T> {
  return value as never
}
