import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { TicketRecord } from './ticket.entity.js'
import {
  type AnalyzeTicketInput,
  type ConfirmTicketInput,
  type DeleteTicketInput,
  type RetryTicketInput,
  type SaveTicketInput,
  type TicketCategory,
  type TicketPriority,
  type TicketScope,
  type TicketSentiment,
  SmartTicketError
} from './domain/contracts.js'

@Injectable()
export class TicketService {
  constructor(
    @InjectRepository(TicketRecord)
    private readonly repo: Repository<TicketRecord>
  ) {}

  async listTickets(scope: TicketScope): Promise<TicketRecord[]> {
    return this.repo.find({
      where: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        xpertId: scope.xpertId
      },
      order: {
        createdAt: 'DESC'
      }
    })
  }

  async getTicket(scope: TicketScope, id: string): Promise<TicketRecord> {
    const ticket = await this.repo.findOne({
      where: {
        id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        xpertId: scope.xpertId
      }
    })
    if (!ticket) {
      throw new SmartTicketError('TICKET_NOT_FOUND', `工单 ${id} 不存在或无权访问`)
    }
    return ticket
  }

  async analyzeAndDraft(
    scope: TicketScope,
    input: AnalyzeTicketInput
  ): Promise<TicketRecord> {
    const raw = (input.rawContent || '').trim()
    if (raw.length < 10) {
      throw new SmartTicketError(
        'CONTENT_TOO_SHORT',
        '客诉反馈文本过短（至少 10 个字符），请补充详细背景后再提交分析。'
      )
    }

    if (input.simulateFailure) {
      throw new SmartTicketError(
        'SIMULATED_SERVICE_TIMEOUT',
        '模拟上游 AI 分析服务响应超时，请检查网络或点击重新尝试。'
      )
    }

    const analysis = this.extractTicketInsights(raw)
    const now = new Date().toISOString()
    const ticketId = `ticket_${randomUUID().replace(/-/g, '').slice(0, 12)}`

    const ticket = this.repo.create({
      id: ticketId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      xpertId: scope.xpertId,
      title: analysis.title,
      rawContent: raw,
      category: analysis.category,
      priority: analysis.priority,
      sentiment: analysis.sentiment,
      summary: analysis.summary,
      suggestedReply: analysis.suggestedReply,
      status: 'pending_review',
      failureCode: null,
      retryCount: 0,
      revision: 1,
      createdAt: now,
      updatedAt: now
    })

    return this.repo.save(ticket)
  }

  async confirmAndSave(
    scope: TicketScope,
    input: ConfirmTicketInput
  ): Promise<TicketRecord> {
    const ticket = await this.getTicket(scope, input.id)
    const now = new Date().toISOString()

    if (input.title) ticket.title = input.title
    if (input.category) ticket.category = input.category
    if (input.priority) ticket.priority = input.priority
    if (input.sentiment) ticket.sentiment = input.sentiment
    if (input.summary) ticket.summary = input.summary
    if (input.suggestedReply) ticket.suggestedReply = input.suggestedReply

    ticket.status = 'confirmed'
    ticket.revision += 1
    ticket.updatedAt = now

    return this.repo.save(ticket)
  }

  async retryAnalysis(
    scope: TicketScope,
    input: RetryTicketInput
  ): Promise<TicketRecord> {
    const ticket = await this.getTicket(scope, input.id)

    if (input.simulateFailure) {
      ticket.failureCode = 'SIMULATED_SERVICE_TIMEOUT'
      ticket.retryCount += 1
      ticket.updatedAt = new Date().toISOString()
      await this.repo.save(ticket)
      throw new SmartTicketError(
        'SIMULATED_SERVICE_TIMEOUT',
        '模拟上游 AI 分析服务响应超时，重试失败。'
      )
    }

    const analysis = this.extractTicketInsights(ticket.rawContent)
    ticket.title = analysis.title
    ticket.category = analysis.category
    ticket.priority = analysis.priority
    ticket.sentiment = analysis.sentiment
    ticket.summary = analysis.summary
    ticket.suggestedReply = analysis.suggestedReply
    ticket.failureCode = null
    ticket.retryCount += 1
    ticket.revision += 1
    ticket.updatedAt = new Date().toISOString()

    return this.repo.save(ticket)
  }

  async saveTicket(
    scope: TicketScope,
    input: SaveTicketInput
  ): Promise<TicketRecord> {
    const now = new Date().toISOString()
    if (input.id) {
      const existing = await this.getTicket(scope, input.id)
      existing.title = input.title
      existing.rawContent = input.rawContent
      existing.category = input.category
      existing.priority = input.priority
      existing.sentiment = input.sentiment
      existing.summary = input.summary
      existing.suggestedReply = input.suggestedReply
      existing.status = input.status
      existing.revision += 1
      existing.updatedAt = now
      return this.repo.save(existing)
    }

    const ticketId = `ticket_${randomUUID().replace(/-/g, '').slice(0, 12)}`
    const created = this.repo.create({
      id: ticketId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      xpertId: scope.xpertId,
      title: input.title,
      rawContent: input.rawContent,
      category: input.category,
      priority: input.priority,
      sentiment: input.sentiment,
      summary: input.summary,
      suggestedReply: input.suggestedReply,
      status: input.status,
      failureCode: null,
      retryCount: 0,
      revision: 1,
      createdAt: now,
      updatedAt: now
    })
    return this.repo.save(created)
  }

  async deleteTicket(
    scope: TicketScope,
    input: DeleteTicketInput
  ): Promise<{ success: boolean; id: string }> {
    const ticket = await this.getTicket(scope, input.id)
    await this.repo.remove(ticket)
    return { success: true, id: input.id }
  }

  private extractTicketInsights(raw: string): {
    title: string
    category: TicketCategory
    priority: TicketPriority
    sentiment: TicketSentiment
    summary: string
    suggestedReply: string
  } {
    const lower = raw.toLowerCase()

    let category: TicketCategory = 'other'
    if (/退款|扣费|发票|账单|支付|充值|多扣|价格|续费|订阅|金额|扣款/.test(lower)) {
      category = 'billing'
    } else if (/密码|登录|盗号|短信|验证码|被盗|安全|泄露|权限|授权/.test(lower)) {
      category = 'account_security'
    } else if (/崩溃|闪退|报错|500|404|卡顿|无法打开|白屏|无法使用|加载失败|bug|异常|死锁|报错/.test(lower)) {
      category = 'technical_issue'
    } else if (/建议|希望|功能|优化|增加|体验|改进|能不能|期待|最好能/.test(lower)) {
      category = 'product_suggestion'
    }

    let priority: TicketPriority = 'P2'
    if (/严重|紧急|崩溃|宕机|资产|资损|被盗|无法使用|数据丢失|影响生产/.test(lower)) {
      priority = 'P0'
    } else if (/退款|扣款|无法登录|白屏|闪退|报错|支付失败|权限失效/.test(lower)) {
      priority = 'P1'
    } else if (/卡顿|慢|建议|样式|错别字|体验/.test(lower)) {
      priority = 'P3'
    }

    let sentiment: TicketSentiment = 'neutral'
    if (/垃圾|投诉|退钱|骗子|极差|无法忍受|恶心|尽快|马上|受够了|赔偿|差评|气死/.test(lower) || priority === 'P0') {
      sentiment = 'negative_urgent'
    } else if (/感谢|赞|很棒|不错|喜欢|优秀|支持你们|辛苦/.test(lower)) {
      sentiment = 'positive'
    }

    const firstLine = raw.split(/[\r\n。！!？?]/)[0].trim()
    const categoryNameMap: Record<TicketCategory, string> = {
      billing: '【账单纠纷】',
      account_security: '【安全告警】',
      technical_issue: '【技术故障】',
      product_suggestion: '【功能建议】',
      other: '【用户反馈】'
    }
    const title = `${categoryNameMap[category]}${firstLine.slice(0, 36) || '用户反馈事项'}`

    const summary = `1. 用户反馈核心：${raw.slice(0, 100)}${raw.length > 100 ? '...' : ''}\n2. 业务分类判断：${categoryNameMap[category]}，判定紧急度为 ${priority} 级。\n3. 用户情绪评估：${sentiment === 'negative_urgent' ? '负向/情绪急切，需优先安抚并快速闭环' : sentiment === 'positive' ? '正向/认可支持，正常跟进建议' : '中性描述，按标准流程排查回复'}。`

    let suggestedReply = ''
    if (category === 'billing') {
      suggestedReply = `尊敬的用户您好，非常抱歉给您带来财务账单方面的不便！\n\n我们已针对您反馈的“${firstLine.slice(0, 20)}”发起专员账单复核。请您放心，若核实存在重复扣款或计费异常，款项将在 1-3 个工作日内原路退回至您的支付账户。\n\n如需加急处理，您可以回复提供您的订单号或交易流水截图，我们将竭诚为您跟进！`
    } else if (category === 'account_security') {
      suggestedReply = `尊敬的用户您好，我们高度重视您的账号与数据安全！\n\n针对您所反馈的账号安全隐患，我们已临时对异常登录态进行保护性阻断。建议您立即前往安全中心重置登录密码并检查双重身份认证（2FA）绑定状态。\n\n如有进一步异常，请随时联系安全应急支持团队。`
    } else if (category === 'technical_issue') {
      suggestedReply = `尊敬的用户您好，感谢您的细致反馈！\n\n对于您遇到的系统故障（${firstLine.slice(0, 24)}），研发运维团队正在根据错误日志进行定位与修复。建议您可以先尝试清除浏览器缓存或重新刷新登录。\n\n我们预计将在随后的补丁版本中完成修复，再次对耽误您的工作表示诚挚歉意！`
    } else if (category === 'product_suggestion') {
      suggestedReply = `尊敬的用户您好，非常感谢您对产品提出的宝贵建议！\n\n您提到的“${firstLine.slice(0, 30)}”非常切合当前很多用户的实际诉求，我们已将该需求记录至产品需求池（Feature Backlog）并提交产品评审团队评估排期。\n\n感谢您一路以来的支持与陪伴，祝您使用愉快！`
    } else {
      suggestedReply = `尊敬的用户您好，已收到您的反馈！\n\n我们正在认真核实您提出的问题，专员将在核查后第一时间为您跟进答复。如需补充更多信息，欢迎随时向我们留言。祝您生活愉快！`
    }

    return {
      title,
      category,
      priority,
      sentiment,
      summary,
      suggestedReply
    }
  }
}
