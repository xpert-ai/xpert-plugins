import type { Repository } from 'typeorm'
import { SmartTicketDispatchService } from './smart-ticket-dispatch.service'
import type { SmartTicket } from './entities/smart-ticket.entity'
import type { SmartTicketScope, SmartTicketTriageInput } from './types'

class FakeRepository {
  public rows: any[] = []

  create(data: any) {
    return { ...data }
  }

  save(row: any) {
    if (!row.id) {
      row.id = `id-${this.rows.length + 1}`
      this.rows.push(row)
    } else {
      const index = this.rows.findIndex((item) => item.id === row.id)
      if (index >= 0) {
        this.rows[index] = row
      } else {
        this.rows.push(row)
      }
    }
    return Promise.resolve(row)
  }

  findOne({ where }: any) {
    return Promise.resolve(
      this.rows.find((row) => Object.entries(where).every(([key, value]) => value === undefined || row[key] === value)) ||
        null
    )
  }
}

function createService() {
  const ticketRepo = new FakeRepository()
  const logRepo = new FakeRepository()
  const service = new SmartTicketDispatchService(
    ticketRepo as unknown as Repository<SmartTicket>,
    logRepo as unknown as Repository<any>
  )
  return { service, ticketRepo, logRepo }
}

const scope: SmartTicketScope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  userId: 'user-1',
  assistantId: 'assistant-1',
  conversationId: 'conv-1'
}

function triageInput(overrides: Partial<SmartTicketTriageInput> = {}): SmartTicketTriageInput {
  return {
    originalContent: '客户反馈优惠券无法使用',
    category: 'billing',
    urgency: 'high',
    aiSuggestedTeam: 'billing',
    ...overrides
  }
}

describe('SmartTicketDispatchService.saveTriagedTicket', () => {
  it('creates a pending ticket with ticket no and idempotency key', async () => {
    const { service } = createService()
    const { ticket, duplicated } = await service.saveTriagedTicket(triageInput(), scope)

    expect(duplicated).toBe(false)
    expect(ticket.status).toBe('pending_confirmation')
    expect(ticket.ticketNo).toMatch(/^TD-\d{8}-\d{4}$/)
    expect(ticket.idempotencyKey).toBeTruthy()
    expect(ticket.originalContent).toBe('客户反馈优惠券无法使用')
  })

  it('reuses the pending ticket when the same request is retried (idempotent)', async () => {
    const { service } = createService()
    const first = await service.saveTriagedTicket(triageInput(), scope)
    const second = await service.saveTriagedTicket(triageInput({ aiConfidence: 0.9 }), scope)

    expect(second.duplicated).toBe(true)
    expect(second.ticket.id).toBe(first.ticket.id)
  })

  it('creates a separate ticket for a different customer request', async () => {
    const { service } = createService()
    const first = await service.saveTriagedTicket(triageInput(), scope)
    const second = await service.saveTriagedTicket(triageInput({ originalContent: '物流太慢' }), scope)

    expect(second.duplicated).toBe(false)
    expect(second.ticket.id).not.toBe(first.ticket.id)
  })

  it('rejects empty original content', async () => {
    const { service } = createService()
    await expect(service.saveTriagedTicket(triageInput({ originalContent: '   ' }), scope)).rejects.toThrow(
      '工单描述内容不能为空'
    )
  })
})

describe('SmartTicketDispatchService status transitions', () => {
  it('confirms dispatch only from pending_confirmation and records human decision', async () => {
    const { service } = createService()
    const { ticket } = await service.saveTriagedTicket(triageInput(), scope)

    const dispatched = await service.confirmDispatch(
      scope,
      ticket.id,
      { confirmedTeam: 'technical_support', confirmedOwner: '张三', dispatchRemark: '优先处理' },
      scope.userId
    )
    expect(dispatched.status).toBe('dispatched')
    expect(dispatched.confirmedTeam).toBe('technical_support')
    expect(dispatched.confirmedOwner).toBe('张三')

    await expect(service.rejectTicket(scope, ticket.id, '重复操作')).rejects.toThrow('驳回')
  })

  it('resolves a dispatched ticket and rejects resolving a pending one', async () => {
    const { service } = createService()
    const { ticket } = await service.saveTriagedTicket(triageInput(), scope)

    await expect(service.markResolved(scope, ticket.id, '过早操作')).rejects.toThrow('已分派')

    await service.confirmDispatch(scope, ticket.id, { confirmedOwner: '李四' })
    const resolved = await service.markResolved(scope, ticket.id, '已修复并回访')
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolutionSummary).toBe('已修复并回访')
  })

  it('increments retryCount without creating new tickets', async () => {
    const { service, ticketRepo } = createService()
    const { ticket } = await service.saveTriagedTicket(triageInput(), scope)

    const retried = await service.retryTriage(scope, ticket.id, scope.userId)
    expect(retried.retryCount).toBe(1)
    expect(ticketRepo.rows).toHaveLength(1)
  })
})
