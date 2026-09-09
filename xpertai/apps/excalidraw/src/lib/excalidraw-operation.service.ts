import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import type { ZodType } from 'zod/v3'
import { ExcalidrawOperation } from './entities/excalidraw-operation.entity.js'
import { createStableJsonSignature } from './excalidraw-scene.validation.js'
import { excalidrawUnitOfWork } from './excalidraw-unit-of-work.js'
import type { ExcalidrawScope } from './types.js'
import type { JsonValue } from './tools/contracts.js'

@Injectable()
export class ExcalidrawOperationService {
  constructor(@InjectRepository(ExcalidrawOperation) private readonly repository: Repository<ExcalidrawOperation>) {}

  async lookup<T extends JsonValue>(
    scope: ExcalidrawScope,
    tool: string,
    operationId: string,
    input: JsonValue,
    schema: ZodType<T>
  ): Promise<T | null> {
    if (!scope.tenantId || !scope.organizationId || !scope.actorId) throw new Error('missing_execution_context')
    const where = {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      actorId: scope.actorId,
      operationId
    }
    const record = await this.repository.findOne({ where })
    if (!record) return null
    const inputHash = createHash('sha256').update(createStableJsonSignature({ tool, input })).digest('hex')
    if (record.inputHash !== inputHash || record.tool !== tool) throw new ConflictException('operation_id_conflict')
    return schema.parse(record.result)
  }

  async run<T extends JsonValue>(
    scope: ExcalidrawScope,
    tool: string,
    operationId: string,
    input: JsonValue,
    schema: ZodType<T>,
    action: () => Promise<T>
  ): Promise<T> {
    if (!scope.tenantId || !scope.organizationId || !scope.actorId) throw new Error('missing_execution_context')
    const where = {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      actorId: scope.actorId,
      operationId
    }
    const inputHash = createHash('sha256').update(createStableJsonSignature({ tool, input })).digest('hex')
    const replay = (record: ExcalidrawOperation) => {
      if (record.inputHash !== inputHash || record.tool !== tool) throw new ConflictException('operation_id_conflict')
      return schema.parse(record.result)
    }
    const existing = await this.repository.findOne({ where })
    if (existing) return replay(existing)
    try {
      return await this.repository.manager.transaction(async (manager) => {
        const repository = manager.getRepository(ExcalidrawOperation)
        const receipt = await repository.save(repository.create({ ...where, tool, inputHash }))
        return excalidrawUnitOfWork.run(
          {
            manager,
            operationId,
            inputHash,
            operationKey: createHash('sha256').update(JSON.stringify(where)).digest('hex')
          },
          async () => {
            const result = schema.parse(await action())
            receipt.result = result
            await repository.save(receipt)
            return result
          }
        )
      })
    } catch (error) {
      const committed = await this.repository.findOne({ where })
      if (committed) return replay(committed)
      throw error
    }
  }
}
