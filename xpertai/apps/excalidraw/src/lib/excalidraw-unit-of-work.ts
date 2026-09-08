import { AsyncLocalStorage } from 'node:async_hooks'
import type { EntityManager } from 'typeorm'

export const excalidrawUnitOfWork = new AsyncLocalStorage<{
  manager: EntityManager
  operationId?: string
  operationKey?: string
  inputHash?: string
}>()
