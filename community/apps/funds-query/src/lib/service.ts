import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type {
  Scope,
  Context,
  Dataset,
  QueryResult,
  Page,
  Account,
  Transfer,
  Question,
  Workbench,
  JsonObject, AgentRuntimeRef, PreparedQuestion, Conversation, ProcessingStage
} from '../shared/contracts.js'
import { PythonClient, FundsError } from './python-client.js'

@Injectable()
export class FundsService {
  constructor(private readonly python: PythonClient) {}
  checkRuntime() { return this.python.checkRuntime() }
  context(scope: Scope, payload: JsonObject = {}) {
    return this.python.call<Context>(scope, 'context', payload)
  }
  select(scope: Scope, id: string) {
    return this.python.call<Dataset>(scope, 'select', { datasetId: id })
  }
  accounts(scope: Scope, payload: JsonObject) {
    return this.python.call<{ items: Account[]; total: number; hasMore: boolean }>(
      scope,
      'accounts',
      payload
    )
  }
  run(scope: Scope, payload: JsonObject, invocationKey?: string, runtime?: AgentRuntimeRef) {
    const operationId = invocationKey
      ? createHash('sha256')
          .update(invocationKey + JSON.stringify(payload))
          .digest('hex')
      : undefined
    return this.python.call<QueryResult>(scope, 'run', {
      ...payload,
      ...(runtime ? { _runtime: JSON.parse(JSON.stringify(runtime)) } : {}),
      ...(operationId ? { operationId } : {})
    })
  }
  result(scope: Scope, payload: JsonObject) {
    return this.python.call<QueryResult>(scope, 'result', payload)
  }
  prepare(scope: Scope, payload: JsonObject) {
    return this.python.call<PreparedQuestion>(
      scope,
      'prepare',
      payload
    )
  }
  dispatchFailed(scope: Scope, payload: JsonObject) {
    return this.python.call<{ queryId: string; status: string }>(scope, 'dispatch_failed', payload)
  }
  createSession(scope: Scope, payload: JsonObject) { return this.python.call<Conversation>(scope, 'create_session', payload) }
  selectSession(scope: Scope, payload: JsonObject) { return this.python.call<Conversation>(scope, 'select_session', payload) }
  deliveryState(scope: Scope, payload: JsonObject) { return this.python.call<object>(scope, 'delivery_state', payload) }
  progress(scope: Scope, queryId: string, runtime: AgentRuntimeRef, stage: ProcessingStage, reply?: string) {
    return this.python.call<object>(scope, 'progress', {
      queryId, stage, _runtime: JSON.parse(JSON.stringify(runtime)), ...(reply !== undefined ? { reply } : {})
    })
  }
  async import(scope: Scope, filename: string, content: Buffer) {
    if (content.length > 10 * 1024 * 1024)
      throw new FundsError('invalid_file', '文件不能超过 10 MiB。')
    return this.python.call<{ dataset: Dataset; reused: boolean }>(scope, 'import', {
      fileName: filename,
      base64: content.toString('base64')
    })
  }
  async view(scope: Scope, operation: string, payload: JsonObject): Promise<Workbench> {
    const context = await this.context(scope)
    if (operation === 'datasets')
      return {
        context: {
          ...context,
          datasets: await this.python.call<Page<Dataset>>(scope, 'datasets', payload)
        }
      }
    const id =
      typeof payload.datasetId === 'string' ? payload.datasetId : context.currentDataset?.id
    if (!id) return { context }
    const base = { ...payload, datasetId: id }
    if (operation === 'chat') return { context, ...await this.python.call<Omit<Workbench, 'context'>>(scope, 'chat', base) }
    if (operation === 'sessions') return { context, sessions: await this.python.call<Page<Conversation>>(scope, 'sessions', base) }
    if (operation === 'result') return { context, result: await this.result(scope, base) }
    if (operation === 'preview')
      return { context, preview: await this.python.call<Page<Transfer>>(scope, 'preview', base) }
    const history = await this.python.call<Page<Question>>(scope, 'history', base)
    const selected =
      typeof payload.queryId === 'string'
        ? payload.queryId
        : history.items[0]?.queryId
    return {
      context,
      history,
      ...(selected
        ? { result: await this.result(scope, { datasetId: id, queryId: selected }) }
        : {})
    }
  }
}
