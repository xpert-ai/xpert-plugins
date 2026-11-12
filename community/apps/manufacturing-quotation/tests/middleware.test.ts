import 'reflect-metadata'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { AgentMiddleware, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { describe, expect, it, vi } from 'vitest'
import { BusinessError, type Catalog, type ProposalLine, type Scope, type Status } from '../src/contracts.js'
import { QuotationDraft } from '../src/draft.entity.js'
import { sourceRows } from '../src/proposal-validation.js'
import { QuotationMiddleware } from '../src/quotation.middleware.js'
import type { QuotationService } from '../src/quotation.service.js'

const draftId = '8c490bd0-2f0f-4e4c-b57f-e148909cc2dc'
const attemptId = '38fb3283-651a-4b12-8642-7a3e4df45578'
const previousAttemptId = '47dab94a-4e1f-4baa-9240-14e2678f7e08'
const snapshot = { revision: 7, attemptId }
const scope: Scope = {
  tenantId: 'tenant-fixture', organizationId: 'organization-fixture',
  userId: 'user-fixture', assistantId: 'assistant-fixture'
}
const catalog: Catalog = {
  catalogVersion: 'a'.repeat(64), synthetic: true,
  products: [{ id: 'demo-elbow-25-b', category: '玛钢', productName: '90°弯头', specification: '25', priceMarker: 'b', aliases: [], status: 'enabled' }]
}
const line: ProposalLine = {
  category: '玛钢', productName: '90°弯头', specification: '25', priceMarker: 'b', gradeRaw: '',
  quantityCartons: 2, evidence: '90°弯头 25 2箱'
}
const inquiryData = {
  id: draftId, inquiry: line.evidence, status: 'analyzing' as const, catalogVersion: catalog.catalogVersion,
  sourceRows: sourceRows(line.evidence), catalog
}
const proposal = { draftId, lines: [line] }

type ModelService = Pick<QuotationService, 'get' | 'readForAgent' | 'catalogForAgent' | 'reserveModelRequest' | 'saveProposal' | 'reportFailure'>
type WrapModelCall = NonNullable<AgentMiddleware['wrapModelCall']>

function setup() {
  let status: Status = 'analyzing'
  const service = {
    get: vi.fn<ModelService['get']>(async () => Object.assign(new QuotationDraft(), { status })),
    readForAgent: vi.fn<ModelService['readForAgent']>(async (_scope, _draftId, requestedAttemptId) => {
      if (requestedAttemptId !== attemptId) throw new BusinessError('conflict')
      return { snapshot, data: inquiryData }
    }),
    catalogForAgent: vi.fn<ModelService['catalogForAgent']>(async () => catalog),
    reserveModelRequest: vi.fn<ModelService['reserveModelRequest']>().mockResolvedValue(undefined),
    saveProposal: vi.fn<ModelService['saveProposal']>(async () => {
      status = 'review'
      return Object.assign(new QuotationDraft(), { id: draftId, status, lines: [line] })
    }),
    reportFailure: vi.fn<ModelService['reportFailure']>(async () => {
      status = 'failed'
      return Object.assign(new QuotationDraft(), { id: draftId, status })
    })
  } satisfies ModelService
  const middleware = new QuotationMiddleware(service as ModelService as QuotationService)

  function createAgent(executionId: string) {
    const context = {
      tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId,
      xpertId: scope.assistantId, executionId, tools: new Map()
    } satisfies Pick<IAgentMiddlewareContext, 'tenantId' | 'organizationId' | 'userId' | 'xpertId' | 'executionId' | 'tools'>
    const instance = middleware.createMiddleware({}, context as IAgentMiddlewareContext)
    const tools = instance.tools ?? []
    return {
      names: tools.map((tool) => tool.name),
      async invoke(name: string, input: Record<string, unknown>) {
        const tool = tools.find((candidate) => candidate.name === name)
        if (!tool) throw new Error(`Missing test tool ${name}`)
        return JSON.parse(String(await tool.invoke(input)))
      },
      async call(handler: Parameters<WrapModelCall>[1], prompt = `请处理询价 draftId=${draftId}，attemptId=${attemptId}。`) {
        return instance.wrapModelCall!({ messages: [new HumanMessage(prompt)], tools } as unknown as Parameters<WrapModelCall>[0], handler)
      }
    }
  }

  return { service, createAgent }
}

describe('quotation model tool boundary', () => {
  it('exposes four review tools and returns only the synthetic directory projection', async () => {
    const { service, createAgent } = setup()
    const agent = createAgent('execution-1')
    expect(agent.names.sort()).toEqual([
      'manufacturing_get_catalog', 'manufacturing_read_inquiry', 'manufacturing_report_failure', 'manufacturing_save_proposal'
    ])
    expect(await agent.invoke('manufacturing_get_catalog', {})).toEqual(catalog)
    expect(service.catalogForAgent).toHaveBeenCalledWith(scope)
  })

  it('requires a successful read with the exact attempt before permitting mutations', async () => {
    const { service, createAgent } = setup()
    const agent = createAgent('execution-1')
    const unread = { success: false, errorCode: 'read_inquiry_first' }

    await expect(agent.invoke('manufacturing_save_proposal', proposal)).resolves.toEqual(unread)
    await expect(agent.invoke('manufacturing_report_failure', { draftId })).resolves.toEqual(unread)
    await expect(agent.invoke('manufacturing_read_inquiry', { draftId })).rejects.toThrow(/expected schema/i)
    expect(service.readForAgent).not.toHaveBeenCalled()
    await expect(agent.invoke('manufacturing_read_inquiry', { draftId, attemptId: previousAttemptId }))
      .resolves.toEqual({ success: false, errorCode: 'conflict' })
    expect(service.readForAgent).toHaveBeenCalledWith(scope, draftId, previousAttemptId)
    await expect(agent.invoke('manufacturing_save_proposal', proposal)).resolves.toEqual(unread)
    expect(service.saveProposal).not.toHaveBeenCalled()
    expect(service.reportFailure).not.toHaveBeenCalled()

    await expect(agent.invoke('manufacturing_read_inquiry', { draftId, attemptId })).resolves.toEqual(inquiryData)
    expect(service.readForAgent).toHaveBeenLastCalledWith(scope, draftId, attemptId)
    await expect(agent.invoke('manufacturing_save_proposal', proposal)).resolves.toEqual({
      id: draftId, status: 'review', lineCount: 1, nextAction: 'human_review'
    })
    expect(service.saveProposal).toHaveBeenCalledTimes(1)
    expect(service.saveProposal).toHaveBeenCalledWith(scope, draftId, [line], snapshot)
  })

  it('rejects model-supplied revisions, pricing and confirmation fields before saving', async () => {
    const { service, createAgent } = setup()
    const agent = createAgent('execution-1')
    await agent.invoke('manufacturing_read_inquiry', { draftId, attemptId })
    for (const input of [
      { ...proposal, revision: 8 },
      { ...proposal, snapshot: { revision: 8, attemptId: previousAttemptId } },
      { ...proposal, confirmed: true },
      { ...proposal, lines: [{ ...line, unitPrice: '0.01' }] },
      { ...proposal, lines: [{ ...line, confirmed: true }] }
    ]) {
      await expect(agent.invoke('manufacturing_save_proposal', input)).rejects.toThrow(/expected schema/i)
    }
    expect(service.saveProposal).not.toHaveBeenCalled()
    await agent.invoke('manufacturing_save_proposal', proposal)
    expect(service.saveProposal).toHaveBeenCalledWith(scope, draftId, [line], snapshot)
  })

  it('does not share a read snapshot across middleware contexts', async () => {
    const { service, createAgent } = setup()
    const first = createAgent('execution-1')
    const second = createAgent('execution-2')
    await first.invoke('manufacturing_read_inquiry', { draftId, attemptId })
    await expect(second.invoke('manufacturing_save_proposal', proposal))
      .resolves.toEqual({ success: false, errorCode: 'read_inquiry_first' })
    expect(service.saveProposal).not.toHaveBeenCalled()
    await expect(first.invoke('manufacturing_report_failure', { draftId })).resolves.toEqual({
      id: draftId, status: 'failed', nextAction: 'clarify_and_retry'
    })
    expect(service.reportFailure).toHaveBeenCalledWith(scope, draftId, snapshot)
  })

  it('preloads original text and scoped catalog and offers only two model tools before review', async () => {
    const { service, createAgent } = setup()
    const agent = createAgent('execution-1')
    const response = new AIMessage({ content: '', tool_calls: [{ name: 'manufacturing_save_proposal', args: proposal }] })
    const handler = vi.fn<Parameters<WrapModelCall>[1]>().mockResolvedValue(response)
    await expect(agent.call(handler)).resolves.toBe(response)
    expect(service.readForAgent).toHaveBeenCalledWith(scope, draftId, attemptId)
    expect(service.reserveModelRequest).toHaveBeenCalledWith(scope, draftId, snapshot)
    const [request] = handler.mock.calls[0]
    expect(request.toolChoice).toBe('required')
    expect(request.tools.map(({ name }) => name).sort()).toEqual(['manufacturing_report_failure', 'manufacturing_save_proposal'])
    expect(request.messages.at(-1)?.content).toContain(JSON.stringify(inquiryData))
    expect(service.catalogForAgent).not.toHaveBeenCalled()
    await agent.invoke('manufacturing_save_proposal', proposal)
    expect((await agent.call(handler)).content).toContain('候选已保存')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(service.reserveModelRequest).toHaveBeenCalledTimes(1)
  })

  it('skips provider calls for unbound chat', async () => {
    const { service, createAgent } = setup()
    const agent = createAgent('execution-1')
    const handler = vi.fn<Parameters<WrapModelCall>[1]>()
    expect((await agent.call(handler, '没有打开工作台')).content).toContain('工作台')
    expect(service.readForAgent).not.toHaveBeenCalled()
    expect(service.reportFailure).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    ['a text-only response', new AIMessage('准备候选')],
    ['an invalid provider tool call', new AIMessage({ content: '', invalid_tool_calls: [{ name: 'manufacturing_save_proposal', args: '{' }] })],
    ['an unoffered tool', new AIMessage({ content: '', tool_calls: [{ name: 'manufacturing_read_inquiry', args: { draftId, attemptId } }] })],
    ['invalid result arguments', new AIMessage({ content: '', tool_calls: [{ name: 'manufacturing_save_proposal', args: { draftId, lines: [] } }] })],
    ['a tool for a different draft', new AIMessage({ content: '', tool_calls: [{ name: 'manufacturing_report_failure', args: { draftId: previousAttemptId } }] })]
  ])('marks the reserved attempt incomplete after %s', async (_name, response) => {
    const { service, createAgent } = setup()
    const agent = createAgent('execution-1')

    expect((await agent.call(() => response)).content).toContain('analysis_failed')
    expect(service.reserveModelRequest).toHaveBeenCalledExactlyOnceWith(scope, draftId, snapshot)
    expect(service.reportFailure).toHaveBeenCalledExactlyOnceWith(scope, draftId, snapshot, 'analysis_failed')
    expect(service.saveProposal).not.toHaveBeenCalled()
  })

  it('lets a valid clarification tool report its own result', async () => {
    const { service, createAgent } = setup()
    const agent = createAgent('execution-1')
    const response = new AIMessage({ content: '', tool_calls: [{ name: 'manufacturing_report_failure', args: { draftId } }] })

    await expect(agent.call(() => response)).resolves.toBe(response)
    expect(service.reportFailure).not.toHaveBeenCalled()
    await expect(agent.invoke('manufacturing_report_failure', { draftId })).resolves.toMatchObject({ id: draftId, status: 'failed' })
  })

  it('preserves a concurrent candidate when recording incomplete output conflicts', async () => {
    const { service, createAgent } = setup()
    const first = createAgent('execution-1')
    const second = createAgent('execution-2')
    service.reportFailure.mockRejectedValueOnce(new BusinessError('conflict'))

    await first.call(async () => {
      await second.invoke('manufacturing_read_inquiry', { draftId, attemptId })
      await second.invoke('manufacturing_save_proposal', proposal)
      return new AIMessage('准备候选')
    })

    expect(service.reportFailure).toHaveBeenCalledExactlyOnceWith(scope, draftId, snapshot, 'analysis_failed')
    expect((await service.get(scope, draftId)).status).toBe('review')
  })

  it.each(['conflict', 'model_budget_exhausted'] as const)(
    'keeps the active attempt when another execution cannot reserve a model request (%s)',
    async (errorCode) => {
      const { service, createAgent } = setup()
      const first = createAgent('execution-1')
      const second = createAgent('execution-2')
      const secondHandler = vi.fn<Parameters<WrapModelCall>[1]>()
      const response = new AIMessage({ content: '', tool_calls: [{ name: 'manufacturing_save_proposal', args: proposal }] })
      service.reserveModelRequest.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new BusinessError(errorCode))

      await expect(first.call(async () => {
        expect((await second.call(secondHandler)).content).toContain(errorCode)
        return response
      })).resolves.toBe(response)

      expect(secondHandler).not.toHaveBeenCalled()
      expect(service.reportFailure).not.toHaveBeenCalled()
      await expect(first.invoke('manufacturing_save_proposal', proposal)).resolves.toMatchObject({ id: draftId, status: 'review' })
      expect(service.saveProposal).toHaveBeenCalledWith(scope, draftId, [line], snapshot)
    }
  )

  it('marks the current attempt failed when the reserved model request fails', async () => {
    const { service, createAgent } = setup()
    const agent = createAgent('execution-1')
    const handler = vi.fn<Parameters<WrapModelCall>[1]>().mockRejectedValue(new Error('network failure'))

    expect((await agent.call(handler)).content).toContain('model_unavailable')
    expect(service.reserveModelRequest).toHaveBeenCalledWith(scope, draftId, snapshot)
    expect(service.reportFailure).toHaveBeenCalledExactlyOnceWith(scope, draftId, snapshot, 'model_unavailable')
  })
})
