import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IIntegration } from '@xpert-ai/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  RequestContext,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { type Cache } from 'cache-manager'
import { Repository } from 'typeorm'
import { WECHAT_PROVIDER_KEY } from './constants.js'
import { normalizeConversationKey } from './conversation-user-key.js'
import { WechatAccountEntity } from './entities/index.js'
import { WECHAT_PLUGIN_CONTEXT } from './tokens.js'
import { normalizeString, TIntegrationWechatOptions } from './types.js'
import { WechatClient } from './wechat.client.js'

const SD_KEY_PATTERN = /^SD[a-zA-Z0-9]{10}$/
const LOGIN_SESSION_CACHE_TTL_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

type WechatTenantScope = {
  tenantId?: string | null
  organizationId?: string | null
}

type LoginTicketCache = {
  data62?: string
  ticket?: string
}

export type WechatDeviceLoginStatusForView = {
  uuid: string
  sessionId?: string
  nextAction: string
  message?: string
  qrCodeUrl?: string
  headImgUrl?: string
  nickName?: string
  wxid?: string
  remainingSeconds?: number
  warning?: string
}

export type WechatDeviceBindResult = {
  uuid: string
}

export type WechatDeviceAccountSyncResult = {
  accounts: WechatAccountEntity[]
}

export type WechatDeviceAccountActionResult = {
  uuid: string
}

@Injectable()
export class WechatAccountManagementService {
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    private readonly wechatClient: WechatClient,
    @InjectRepository(WechatAccountEntity)
    private readonly accountRepository: Repository<WechatAccountEntity>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  async bindDeviceKey(integrationId: string, key: string): Promise<WechatDeviceBindResult> {
    const integration = await this.readWechatIntegration(integrationId)
    const uuid = this.requireDeviceKey(key)
    const result = await this.wechatClient.bindDeviceKey(integration, { key: uuid })
    if (!result.success) {
      throw new BadRequestException(result.error || '绑定设备失败')
    }

    await this.upsertLocalAccount(integration, {
      uuid,
      status: 'offline'
    })
    return { uuid }
  }

  async startDeviceLogin(integrationId: string, uuid: string): Promise<WechatDeviceLoginStatusForView> {
    const integration = await this.readWechatIntegration(integrationId)
    const normalizedUuid = this.requireAccountUuid(uuid)
    const result = await this.wechatClient.startDeviceLogin(integration, { uuid: normalizedUuid })
    if (!result.success) {
      throw new BadRequestException(result.error || '启动扫码登录失败')
    }

    const status = this.toLoginStatus(normalizedUuid, result.raw)
    await this.cacheLoginTicket(integration.id, normalizedUuid, status.sessionId, result.raw)
    if (status.nextAction === 'LOGIN_SUCCESS') {
      await this.syncAfterLoginSuccess(integration)
    }
    return status
  }

  async pollDeviceLogin(
    integrationId: string,
    uuid: string,
    sessionId: string
  ): Promise<WechatDeviceLoginStatusForView> {
    const integration = await this.readWechatIntegration(integrationId)
    const normalizedUuid = this.requireAccountUuid(uuid)
    const normalizedSessionId = this.requireString(sessionId, 'sessionId 参数不能为空')
    const result = await this.wechatClient.pollDeviceLogin(integration, {
      uuid: normalizedUuid,
      sessionId: normalizedSessionId
    })
    if (!result.success) {
      throw new BadRequestException(result.error || '查询登录状态失败')
    }

    const status = this.toLoginStatus(normalizedUuid, result.raw)
    await this.cacheLoginTicket(integration.id, normalizedUuid, status.sessionId || normalizedSessionId, result.raw)
    if (status.nextAction === 'LOGIN_SUCCESS') {
      await this.syncAfterLoginSuccess(integration)
    }
    return status
  }

  async verifyLoginCode(
    integrationId: string,
    uuid: string,
    sessionId: string,
    code: string
  ): Promise<WechatDeviceLoginStatusForView> {
    const integration = await this.readWechatIntegration(integrationId)
    const normalizedUuid = this.requireAccountUuid(uuid)
    const normalizedSessionId = this.requireString(sessionId, 'sessionId 参数不能为空')
    const normalizedCode = this.requireString(code, '验证码不能为空')
    const ticket = await this.requireLoginTicket(integration.id, normalizedUuid, normalizedSessionId)
    const result = await this.wechatClient.verifyLoginCode(integration, {
      uuid: normalizedUuid,
      code: normalizedCode,
      data62: ticket.data62,
      ticket: ticket.ticket,
      sessionId: normalizedSessionId
    })
    if (!result.success) {
      throw new BadRequestException(result.error || '验证码校验失败')
    }
    await this.cacheLoginTicket(integration.id, normalizedUuid, normalizedSessionId, result.raw)
    return this.pollDeviceLogin(integration.id, normalizedUuid, normalizedSessionId)
  }

  async verifyLoginSlide(
    integrationId: string,
    uuid: string,
    sessionId: string,
    randstr: string,
    slideticket: string
  ): Promise<WechatDeviceLoginStatusForView> {
    const integration = await this.readWechatIntegration(integrationId)
    const normalizedUuid = this.requireAccountUuid(uuid)
    const normalizedSessionId = this.requireString(sessionId, 'sessionId 参数不能为空')
    const normalizedRandstr = this.requireString(randstr, 'randstr 不能为空')
    const normalizedSlideTicket = this.requireString(slideticket, 'slideticket 不能为空')
    const ticket = await this.requireLoginTicket(integration.id, normalizedUuid, normalizedSessionId)
    const result = await this.wechatClient.verifyLoginSlide(integration, {
      data62: ticket.data62,
      ticket: ticket.ticket,
      randstr: normalizedRandstr,
      slideticket: normalizedSlideTicket,
      sessionId: normalizedSessionId
    })
    if (!result.success) {
      throw new BadRequestException(result.error || '滑块验证失败')
    }
    await this.cacheLoginTicket(integration.id, normalizedUuid, normalizedSessionId, result.raw)
    return this.pollDeviceLogin(integration.id, normalizedUuid, normalizedSessionId)
  }

  async syncDeviceAccounts(integrationId: string): Promise<WechatDeviceAccountSyncResult> {
    const integration = await this.readWechatIntegration(integrationId)
    const accounts = await this.syncDeviceAccountsForIntegration(integration)
    return { accounts }
  }

  async logoutDeviceAccount(integrationId: string, uuid: string): Promise<WechatDeviceAccountActionResult> {
    const integration = await this.readWechatIntegration(integrationId)
    const normalizedUuid = this.requireAccountUuid(uuid)
    const result = await this.wechatClient.logoutDeviceAccount(integration, { uuid: normalizedUuid })
    if (!result.success || resolveResponseData(result.raw) === false) {
      throw new BadRequestException(result.error || resolveResponseText(result.raw) || '退出登录失败')
    }

    const scope = this.resolveTenantScope(integration)
    await this.accountRepository.update(
      this.scopedWhere({ integrationId: integration.id, uuid: normalizedUuid }, scope),
      {
        status: 'offline',
        lastError: null
      }
    )
    return { uuid: normalizedUuid }
  }

  async deleteDeviceAccount(integrationId: string, uuid: string): Promise<WechatDeviceAccountActionResult> {
    const integration = await this.readWechatIntegration(integrationId)
    const normalizedUuid = this.requireAccountUuid(uuid)
    const result = await this.wechatClient.deleteDeviceAccount(integration, { uuid: normalizedUuid })
    if (!result.success) {
      throw new BadRequestException(result.error || '删除设备失败')
    }

    const scope = this.resolveTenantScope(integration)
    await this.accountRepository.delete(
      this.scopedWhere({ integrationId: integration.id, uuid: normalizedUuid }, scope)
    )
    return { uuid: normalizedUuid }
  }

  private async syncAfterLoginSuccess(integration: IIntegration<TIntegrationWechatOptions>): Promise<void> {
    await this.syncDeviceAccountsForIntegration(integration)
  }

  private async syncDeviceAccountsForIntegration(
    integration: IIntegration<TIntegrationWechatOptions>
  ): Promise<WechatAccountEntity[]> {
    const result = await this.wechatClient.listDeviceAccounts(integration)
    if (!result.success) {
      throw new BadRequestException(result.error || '同步微信账号失败')
    }

    const items = asArray(resolveResponseData(result.raw))
    const scope = this.resolveTenantScope(integration)
    const existingAccounts = await this.accountRepository.find({
      where: this.scopedWhere({ integrationId: integration.id }, scope)
    })
    const existingByUuid = new Map(existingAccounts.map((account) => [normalizeString(account.uuid), account]))

    for (const item of items) {
      const record = item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : null
      const uuid = normalizeString(record?.uuid || record?.UUID || record?.key || record?.Key)
      if (!uuid) {
        continue
      }
      const existing = existingByUuid.get(uuid)
      const enabled = existing?.enabled !== false
      await this.upsertLocalAccount(integration, {
        uuid,
        ownerWxid:
          normalizeString(record?.username || record?.Username || record?.wxid || record?.Wxid || record?.wxID) || null,
        displayName:
          normalizeString(record?.nickname || record?.Nickname || record?.nickName || record?.NickName) || null,
        status: enabled ? this.resolveAccountStatus(record) : 'disabled',
        enabled
      })
    }

    return this.accountRepository.find({
      where: this.scopedWhere({ integrationId: integration.id }, scope),
      order: { updatedAt: 'DESC' },
      take: 500
    })
  }

  private async upsertLocalAccount(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: {
      uuid: string
      ownerWxid?: string | null
      displayName?: string | null
      status: WechatAccountEntity['status']
      enabled?: boolean
    }
  ): Promise<void> {
    const context = this.resolveBindingContext()
    const scope = this.resolveTenantScope(integration, context)
    await this.accountRepository.upsert(
      {
        integrationId: integration.id,
        uuid: input.uuid,
        ownerWxid: input.ownerWxid ?? null,
        displayName: input.displayName ?? input.ownerWxid ?? null,
        status: input.status,
        enabled: input.enabled !== false,
        lastError: null,
        tenantId: scope.tenantId ?? null,
        organizationId: scope.organizationId ?? null,
        createdById: context.createdById ?? null,
        updatedById: context.updatedById ?? null
      },
      ['integrationId', 'uuid']
    )
  }

  private toLoginStatus(uuid: string, raw: unknown): WechatDeviceLoginStatusForView {
    const data = resolveResponseData(raw)
    const record = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
    return {
      uuid: normalizeString(record.uuid || record.UUID) || uuid,
      sessionId: normalizeString(record.sessionId || record.SessionID),
      nextAction: normalizeString(record.nextAction || record.NextAction) || 'FAILED',
      message: normalizeString(record.message || record.Message || resolveResponseText(raw)),
      qrCodeUrl: normalizeString(record.qrCodeUrl || record.QrCodeURL || record.QrCodeUrl),
      headImgUrl: normalizeString(record.headImgUrl || record.HeadImgURL || record.HeadImgUrl),
      nickName: normalizeString(record.nickName || record.NickName || record.nickname || record.Nickname),
      wxid: normalizeString(record.wxid || record.WxID || record.Wxid),
      remainingSeconds: normalizeNumber(record.remainingSeconds || record.RemainingSeconds || record.expiredtime)
    }
  }

  private async cacheLoginTicket(
    integrationId: string,
    uuid: string,
    sessionId?: string,
    raw?: unknown
  ): Promise<void> {
    const normalizedSessionId = normalizeString(sessionId)
    if (!normalizedSessionId) {
      return
    }
    const data = resolveResponseData(raw)
    const record = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
    const nextTicket: LoginTicketCache = {
      data62: normalizeString(record.data62 || record.Data62),
      ticket: normalizeString(record.ticket || record.Ticket)
    }
    if (!nextTicket.data62 && !nextTicket.ticket) {
      const existing = await this.getLoginTicket(integrationId, uuid, normalizedSessionId)
      if (!existing) {
        return
      }
      nextTicket.data62 = existing.data62
      nextTicket.ticket = existing.ticket
    }
    await this.cacheManager.set(
      this.loginTicketCacheKey(integrationId, uuid, normalizedSessionId),
      nextTicket,
      LOGIN_SESSION_CACHE_TTL_MS
    )
  }

  private async requireLoginTicket(
    integrationId: string,
    uuid: string,
    sessionId: string
  ): Promise<Required<LoginTicketCache>> {
    const ticket = await this.getLoginTicket(integrationId, uuid, sessionId)
    if (!ticket?.data62 || !ticket.ticket) {
      throw new BadRequestException('登录票据已过期，请重新扫码登录')
    }
    return {
      data62: ticket.data62,
      ticket: ticket.ticket
    }
  }

  private async getLoginTicket(
    integrationId: string,
    uuid: string,
    sessionId: string
  ): Promise<LoginTicketCache | undefined> {
    return this.cacheManager.get<LoginTicketCache>(this.loginTicketCacheKey(integrationId, uuid, sessionId))
  }

  private loginTicketCacheKey(integrationId: string, uuid: string, sessionId: string): string {
    return `wechat:account-login:${integrationId}:${uuid}:${sessionId}`
  }

  private async readWechatIntegration(integrationId: string): Promise<IIntegration<TIntegrationWechatOptions>> {
    const normalizedIntegrationId = normalizeConversationKey(integrationId)
    if (!normalizedIntegrationId) {
      throw new BadRequestException('缺少微信集成标识')
    }
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatOptions>>(
      normalizedIntegrationId,
      {
        relations: ['tenant']
      }
    )
    if (!integration) {
      throw new BadRequestException('微信集成不存在或不可访问')
    }
    if (integration.provider !== WECHAT_PROVIDER_KEY) {
      throw new BadRequestException(`Integration ${normalizedIntegrationId} is not provider '${WECHAT_PROVIDER_KEY}'`)
    }
    return integration
  }

  private requireDeviceKey(value: string): string {
    const key = normalizeString(value)
    if (!SD_KEY_PATTERN.test(key)) {
      throw new BadRequestException('请输入 SD 开头的 12 位设备 key')
    }
    return key
  }

  private requireAccountUuid(value: string): string {
    return this.requireString(value, '账号 uuid 不能为空')
  }

  private requireString(value: string, message: string): string {
    const text = normalizeString(value)
    if (!text) {
      throw new BadRequestException(message)
    }
    return text
  }

  private resolveAccountStatus(record: Record<string, unknown> | null): WechatAccountEntity['status'] {
    const numericStatus = normalizeNumber(record?.status ?? record?.Status ?? record?.state ?? record?.State)
    if (numericStatus === 1) {
      return 'online'
    }
    if (numericStatus === 0) {
      return 'offline'
    }
    const text = normalizeString(record?.status || record?.Status || record?.state || record?.State).toLowerCase()
    if (text === 'online' || text === 'offline' || text === 'unknown' || text === 'error' || text === 'disabled') {
      return text
    }
    return 'unknown'
  }

  private resolveTenantScope(
    integration?: IIntegration<TIntegrationWechatOptions> | WechatTenantScope | null,
    fallback?: WechatTenantScope | null
  ): WechatTenantScope {
    return {
      tenantId: integration?.tenantId ?? fallback?.tenantId ?? null,
      organizationId: integration?.organizationId ?? fallback?.organizationId ?? null
    }
  }

  private scopedWhere<T extends Record<string, unknown>>(where: T, scope?: WechatTenantScope | null): T & WechatTenantScope {
    const scoped = { ...where } as T & WechatTenantScope
    if (scope?.tenantId) {
      scoped.tenantId = scope.tenantId
    }
    if (scope?.organizationId) {
      scoped.organizationId = scope.organizationId
    }
    return scoped
  }

  private resolveBindingContext(): {
    tenantId: string | null
    organizationId: string | null
    createdById: string | null
    updatedById: string | null
  } {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    const userId = normalizeConversationKey(RequestContext.currentUserId())
    const executionUserId = userId && UUID_PATTERN.test(userId) ? userId : null
    return {
      tenantId: tenantId ?? null,
      organizationId: organizationId ?? null,
      createdById: executionUserId,
      updatedById: executionUserId
    }
  }
}

function resolveResponseData(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const record = payload as Record<string, unknown>
  if (record.data !== undefined) {
    return record.data
  }
  if (record.Data !== undefined) {
    return record.Data
  }
  return record
}

function resolveResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return typeof payload === 'string' ? payload : ''
  }
  const record = payload as Record<string, unknown>
  return normalizeString(record.text || record.Text || record.message || record.Message)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}
