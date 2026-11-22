import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import type { AgentMiddlewareRuntimeApi } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import type { IntakeScope } from '../src/lib/domain/contracts.js'
import { IntakeCase } from '../dist/lib/intake-case.entity.js'
import { IntakePhoto } from '../dist/lib/intake-photo.entity.js'
import { IntakeAnalyzer } from '../dist/lib/intake.analyzer.js'
import { IntakeService } from '../dist/lib/intake.service.js'
import { EvaluationRun } from '../dist/lib/evaluation-run.entity.js'
import { EvaluationService } from '../dist/lib/evaluation.service.js'
import { EvaluationRunner } from '../dist/lib/evaluation.runner.js'

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
export async function createService(database?: Uint8Array) {
  const db = new DataSource({ type: 'sqljs', database, entities: [IntakeCase, IntakePhoto, EvaluationRun], synchronize: true })
  await db.initialize()
  const cases = db.getRepository(IntakeCase)
  const photos = db.getRepository(IntakePhoto)
  const service = new IntakeService(cases, photos)
  const evaluations = new EvaluationService(db.getRepository(EvaluationRun), service)
  const runner = new EvaluationRunner(evaluations, service)
  const analyzer = new IntakeAnalyzer(service, evaluations)
  return { db, cases, photos, service, evaluations, runner, analyzer }
}
export type Fixture = Awaited<ReturnType<typeof createService>>

export function newCase(title = 'Water dripping in room 3') {
  return { requestKey: randomUUID(), title, photo: { dataUrl: JPEG_DATA_URL } }
}

/** A case a person has confirmed, as acceptance runs require. Pass a photo to avoid duplicate image content. */
export async function confirmedCase(fixture: Fixture, title = 'Water dripping in room 3', categoryId = 'plumbing', dataUrl = JPEG_DATA_URL) {
  const created = await fixture.service.createCase(scope, { ...newCase(title), photo: { dataUrl } })
  return fixture.service.confirmCase(scope, { caseId: created.id, revision: created.revision, categoryId })
}

/** A real LangChain chat model whose reply the test decides; everything around it is the code under test. */
class MeasuredModel extends BaseChatModel {
  constructor(readonly respond: (messages: BaseMessage[]) => Promise<AIMessage>) { super({}) }
  _llmType() { return 'photo-intake-test-double' }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const message = await this.respond(messages)
    return { generations: [{ text: String(message.content), message }] }
  }
}

export function runtimeFor(respond: (messages: BaseMessage[]) => Promise<AIMessage>): AgentMiddlewareRuntimeApi {
  const model = new MeasuredModel(respond)
  return {
    getDefaultChatModel: async () => ({ model: 'test-vision', copilotId: 'connection-1' }),
    // The SDK exposes a caller-selected generic. This fixture provides exactly BaseChatModel.
    createModelClient: async <T>() => model as T,
    wrapWorkflowNodeExecution: async () => { throw new Error('unused fixture capability') }
  }
}

export const answer = (id = 'plumbing') => new AIMessage({
  content: JSON.stringify({ categoryId: id, reason: 'A pipe is visibly leaking.' }),
  usage_metadata: { input_tokens: 20, output_tokens: 10, total_tokens: 30 }
})
