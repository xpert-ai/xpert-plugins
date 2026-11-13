import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import {
  boardSchema, confirmTriageSchema, proposeTriageSchema, rejectTriageSchema,
  resetTicketSchema, scopeSchema, statusSchema, ticketViewSchema
} from './domain/contracts.js'
import type {
  ConfirmTriageInput, ProposeTriageInput, RejectTriageInput, ResetTicketInput,
  TicketBoard, TicketScope, TicketView
} from './domain/contracts.js'
import { TicketTriageError, statusOrder } from './domain/contracts.js'
import { TicketRecord } from './ticket.entity.js'
import { TOOL_LIST_TICKETS, TOOL_PROPOSE_TRIAGE } from './constants.js'

const now = () => new Date().toISOString()

interface SeedTicket {
  ticketCode: string
  subject: string
  body: string
  channel: string
  customerTier: string
}

/** Deterministic demo data. Seeding twice must not create duplicates. */
export const SEED_TICKETS: SeedTicket[] = [
  {
    ticketCode: 'T-1001', subject: '支付成功但 VIP 课程未解锁', channel: '在线客服', customerTier: '金卡',
    body: '客户 12:04 支付成功，订单号 20261105-7781，页面仍提示未开通。客户已等待 25 分钟，情绪激动，要求今天内解决。'
  },
  {
    ticketCode: 'T-1002', subject: '发票抬头写错，需要重开', channel: '邮件', customerTier: '普通',
    body: '客户上月订单的发票抬头把“科技有限公司”写成了“科技有限公司（分部）”，希望作废重开，附带了原发票号。'
  },
  {
    ticketCode: 'T-1003', subject: '物流显示已签收但没收到货', channel: '电话', customerTier: '白金',
    body: '客户反馈快递显示家人代签，但家中无人。要求今天给出处理结论，涉及金额 3,280 元。'
  },
  {
    ticketCode: 'T-1004', subject: '升级后在导出 Excel 时报错', channel: '工单系统', customerTier: '企业',
    body: '企业客户升级到新版本后，导出报表时提示“列超出限制”。影响 60 人的团队每日对账，希望给出临时规避方案。'
  }
]

function ticketId(scope: TicketScope, ticketCode: string) {
  return createHash('sha256')
    .update(JSON.stringify([scope.tenantId, scope.organizationId, scope.xpertId, ticketCode]))
    .digest('hex')
}

@Injectable()
export class TicketTriageService {
  constructor(@InjectRepository(TicketRecord) private readonly tickets: Repository<TicketRecord>) {}

  private owned(scope: TicketScope) {
    const parsed = scopeSchema.parse(scope)
    // The triage board is shared by the assistant workspace team, so boards are keyed by
    // tenant + organization + assistant. The View host and the Agent host resolve those three
    // values identically; per-user rows would hide the board seeded from the View side.
    return { tenantId: parsed.tenantId, organizationId: parsed.organizationId, xpertId: parsed.xpertId }
  }

  private toView(record: TicketRecord): TicketView {
    return ticketViewSchema.parse({
      ticketCode: record.ticketCode, subject: record.subject, channel: record.channel,
      customerTier: record.customerTier, status: statusSchema.parse(record.status),
      priority: record.priority, team: record.team, rationale: record.rationale,
      draftReply: record.draftReply, reviewNote: record.reviewNote,
      attemptCount: record.attemptCount, lastErrorCode: record.lastErrorCode,
      revision: record.revision, updatedAt: record.updatedAt
    })
  }

  async board(scope: TicketScope): Promise<TicketBoard> {
    const records = await this.tickets.find({ where: this.owned(scope), order: { ticketCode: 'ASC' } })
    const items = records.map(record => this.toView(record))
      .sort((left, right) => statusOrder[left.status] - statusOrder[right.status] || left.ticketCode.localeCompare(right.ticketCode))
    const counts = items.reduce((acc, item) => {
      acc[item.status] += 1
      return acc
    }, { pending: 0, proposed: 0, confirmed: 0, failed: 0 })
    return boardSchema.parse({
      items,
      summary: {
        total: items.length, pending: counts.pending, proposed: counts.proposed,
        confirmed: counts.confirmed, failed: counts.failed
      }
    })
  }

  async seedDemoTickets(scope: TicketScope) {
    const owned = this.owned(scope)
    const existing = await this.tickets.find({ where: owned })
    const known = new Set(existing.map(record => record.ticketCode))
    const missing = SEED_TICKETS.filter(ticket => !known.has(ticket.ticketCode))
    if (missing.length) {
      const timestamp = now()
      await this.tickets.manager.insert(TicketRecord, missing.map(ticket => ({
        ...owned, workspaceId: '', userId: '',
        id: ticketId(scope, ticket.ticketCode), ticketCode: ticket.ticketCode,
        subject: ticket.subject, body: ticket.body, channel: ticket.channel, customerTier: ticket.customerTier,
        status: 'pending' as const, priority: null, team: null, rationale: null, draftReply: null,
        reviewNote: null, attemptCount: 0, lastErrorCode: null, revision: 1,
        createdAt: timestamp, updatedAt: timestamp
      })))
    }
    return this.board(scope)
  }

  private async require(scope: TicketScope, ticketCode: string) {
    const record = await this.tickets.findOne({ where: { ...this.owned(scope), ticketCode } })
    if (!record) throw new TicketTriageError('not_found', ticketCode)
    return record
  }

  private async update(scope: TicketScope, record: TicketRecord, expectedRevision: number, patch: Partial<TicketRecord>) {
    if (record.revision !== expectedRevision) throw new TicketTriageError('conflict', record.ticketCode)
    const result = await this.tickets.manager.update(TicketRecord, {
      ...this.owned(scope), ticketCode: record.ticketCode, revision: expectedRevision
    }, { ...patch, revision: expectedRevision + 1, updatedAt: now() })
    if (result.affected !== 1) throw new TicketTriageError('conflict', record.ticketCode)
    return { ticketCode: record.ticketCode, revision: expectedRevision + 1 }
  }

  /** The Assistant proposes a triage; a human still has to confirm it in the board. */
  async proposeTriage(scope: TicketScope, input: ProposeTriageInput) {
    const parsed = proposeTriageSchema.parse(input)
    const record = await this.require(scope, parsed.ticketCode)
    if (record.status === 'confirmed') throw new TicketTriageError('invalid_state', parsed.ticketCode)
    return this.update(scope, record, parsed.expectedRevision, {
      status: 'proposed', priority: parsed.priority, team: parsed.team,
      rationale: parsed.rationale, draftReply: parsed.draftReply,
      lastErrorCode: null, attemptCount: record.attemptCount + 1
    })
  }

  /** Human confirmation. This is the only step that closes a ticket. */
  async confirmTriage(scope: TicketScope, input: ConfirmTriageInput) {
    const parsed = confirmTriageSchema.parse(input)
    const record = await this.require(scope, parsed.ticketCode)
    if (record.status !== 'proposed') throw new TicketTriageError('invalid_state', parsed.ticketCode)
    return this.update(scope, record, parsed.expectedRevision, {
      status: 'confirmed', priority: parsed.priority ?? record.priority,
      team: parsed.team ?? record.team, reviewNote: parsed.reviewNote ?? record.reviewNote
    })
  }

  /** Reject keeps the ticket open and clears the rejected proposal so it can be redone. */
  async rejectTriage(scope: TicketScope, input: RejectTriageInput) {
    const parsed = rejectTriageSchema.parse(input)
    const record = await this.require(scope, parsed.ticketCode)
    if (record.status !== 'proposed') throw new TicketTriageError('invalid_state', parsed.ticketCode)
    return this.update(scope, record, parsed.expectedRevision, {
      status: 'pending', priority: null, team: null, rationale: null, draftReply: null,
      reviewNote: parsed.reason, lastErrorCode: null
    })
  }

  /** Retry path: a failed triage returns to pending without duplicating any business result. */
  async resetTicket(scope: TicketScope, input: ResetTicketInput) {
    const parsed = resetTicketSchema.parse(input)
    const record = await this.require(scope, parsed.ticketCode)
    if (record.status === 'confirmed') throw new TicketTriageError('invalid_state', parsed.ticketCode)
    return this.update(scope, record, parsed.expectedRevision, {
      status: 'pending', lastErrorCode: null
    })
  }

  /** Records a failed proposal attempt so the board can surface a retry entry point. */
  async markFailed(scope: TicketScope, ticketCode: string, expectedRevision: number, errorCode: string) {
    const record = await this.require(scope, ticketCode)
    return this.update(scope, record, expectedRevision, {
      status: 'failed', lastErrorCode: errorCode, attemptCount: record.attemptCount + 1
    })
  }

  /** Compact, model-facing projection: no tenant ids, no unrelated text. */
  async listForAssistant(scope: TicketScope, limit = 10) {
    const board = await this.board(scope)
    const items = board.items
      .filter(item => item.status !== 'confirmed')
      .slice(0, limit)
      .map(item => ({
        ticketCode: item.ticketCode, subject: item.subject, channel: item.channel,
        customerTier: item.customerTier, status: item.status, revision: item.revision,
        lastErrorCode: item.lastErrorCode
      }))
    return {
      tools: [TOOL_LIST_TICKETS, TOOL_PROPOSE_TRIAGE],
      summary: board.summary,
      items
    }
  }
}
