import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import type { IIntegration, TIntegrationProvider } from '@metad/contracts'
import { IntegrationStrategy, IntegrationStrategyKey, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import axios, { AxiosError } from 'axios'
import { RolesEnum } from './contracts-compat.js'
import { LarkCapabilityService, TLarkCapabilityMatrix } from './lark-capability.service.js'
import { LarkLongConnectionService } from './lark-long-connection.service.js'
import { describeLarkProxy, getLarkAxiosRequestConfig } from './lark-network.js'
import {
  iconImage,
  INTEGRATION_LARK,
  TLarkConnectionProbeResult,
  TLarkRuntimeStatus,
  TIntegrationLarkOptions
} from './types.js'
import { toLarkApiErrorMessage } from './utils.js'

@Injectable()
@IntegrationStrategyKey(INTEGRATION_LARK)
export class LarkIntegrationStrategy implements IntegrationStrategy<TIntegrationLarkOptions> {
  private readonly logger = new Logger(LarkIntegrationStrategy.name)

  constructor(
    private readonly capabilityService: LarkCapabilityService,
    private readonly longConnectionService: LarkLongConnectionService
  ) {}

  meta: TIntegrationProvider = {
    name: INTEGRATION_LARK,
    label: {
      en_US: 'Lark',
      zh_Hans: 'Lark'
    },
    icon: {
      type: 'image',
      value: iconImage
    },
    description: {
      en_US: 'Integration with Lark (Feishu) platform for messaging and collaboration.',
      zh_Hans: 'Integration with Lark (Feishu) platform for messaging and collaboration.'
    },
    webhook: true,
    schema: {
      type: 'object',
      properties: {
        isLark: {
          type: 'boolean',
          title: {
            en_US: 'Is Lark',
            zh_Hans: 'Is Lark'
          },
          placeholder: {
            en_US: 'Using Lark (international version) instead of Feishu (Chinese version)',
            zh_Hans: 'Using Lark (international version) instead of Feishu (Chinese version)'
          }
        },
        appId: { type: 'string', title: 'App ID' },
        appSecret: {
          type: 'string',
          title: 'App Secret',
          'x-ui': {
            component: 'password'
          }
        },
        verificationToken: {
          type: 'string',
          title: 'Verification Token',
          'x-ui': {
            component: 'password'
          }
        },
        encryptKey: {
          type: 'string',
          title: {
            en_US: 'Encrypt Key',
            zh_Hans: 'Encrypt Key'
          },
          'x-ui': {
            component: 'password'
          }
        },
        connectionMode: {
          type: 'string',
          title: {
            en_US: 'Connection Mode',
            zh_Hans: 'Connection Mode'
          },
          enum: ['webhook', 'long_connection'],
          default: 'webhook',
          'x-ui': {
            enumLabels: {
              webhook: {
                en_US: 'Webhook',
                zh_Hans: 'Webhook'
              },
              long_connection: {
                en_US: 'Long Connection',
                zh_Hans: 'Long Connection'
              }
            }
          }
        },
        xpertId: {
          type: 'string',
          title: {
            en_US: 'Xpert',
            zh_Hans: 'Xpert'
          },
          description: {
            en_US: 'Choose a corresponding digital expert',
            zh_Hans: 'Choose a corresponding digital expert'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/xpert/select-options'
          }
        },
        preferLanguage: {
          type: 'string',
          title: {
            en_US: 'Preferred Language',
            zh_Hans: 'Preferred Language'
          },
          enum: ['en', 'zh-Hans'],
          'x-ui': {
            enumLabels: {
              en: { en_US: 'English', zh_Hans: 'English' },
              'zh-Hans': { en_US: 'Chinese', zh_Hans: 'Chinese' }
            }
          }
        },
        userProvision: {
          type: 'object',
          title: {
            en_US: 'User Provision',
            zh_Hans: 'User Provision'
          },
          properties: {
            autoProvision: {
              type: 'boolean',
              title: {
                en_US: 'Auto Provision User',
                zh_Hans: 'Auto Provision User'
              },
              default: false
            },
            roleName: {
              type: 'string',
              title: {
                en_US: 'Default Role',
                zh_Hans: 'Default Role'
              },
              enum: Object.values(RolesEnum),
              default: RolesEnum.EMPLOYEE
            }
          }
        }
      },
      required: ['appId', 'appSecret'],
      secret: ['appSecret', 'verificationToken', 'encryptKey']
    }
  }

  async execute(integration: IIntegration<TIntegrationLarkOptions>, payload: TIntegrationStrategyParams): Promise<any> {
    void integration
    void payload
    return null
  }

  async onCreate(integration: IIntegration<TIntegrationLarkOptions>): Promise<void> {
    if (this.capabilityService.resolveConnectionMode(integration.options) === 'long_connection') {
      await this.longConnectionService.connect(integration.id)
    }
  }

  async onUpdate(previous: IIntegration<TIntegrationLarkOptions>, current: IIntegration<any>): Promise<void> {
    const wasLongConnection = this.capabilityService.resolveConnectionMode(previous.options) === 'long_connection'
    const isLongConnection =
      current.provider === INTEGRATION_LARK &&
      this.capabilityService.resolveConnectionMode(current.options as TIntegrationLarkOptions) === 'long_connection'

    if (wasLongConnection && !isLongConnection) {
      await this.longConnectionService.disconnect(previous.id)
      return
    }

    if (isLongConnection && (!wasLongConnection || this.hasLongConnectionConfigChanged(previous.options, current.options as TIntegrationLarkOptions))) {
      await this.longConnectionService.reconnect(current.id)
    }
  }

  async onDelete(integration: IIntegration<TIntegrationLarkOptions>): Promise<void> {
    if (this.capabilityService.resolveConnectionMode(integration.options) === 'long_connection') {
      await this.longConnectionService.disconnect(integration.id)
    }
  }

  async getRuntimeView(integration: IIntegration<TIntegrationLarkOptions>) {
    const capabilities = this.capabilityService.getCapabilities(integration.options)
    const connectionMode = this.capabilityService.resolveConnectionMode(integration.options)

    if (connectionMode !== 'long_connection') {
      return {
        supported: true,
        state: connectionMode,
        connected: false,
        sections: [
          {
            key: 'runtime-status',
            title: 'Runtime Status',
            tone: 'info' as const,
            items: [
              {
                key: 'connectionMode',
                type: 'badge' as const,
                label: 'Connection Mode',
                value: connectionMode
              }
            ],
            messages: ['Webhook mode receives callbacks through the saved webhook URL and does not keep a persistent socket connection.']
          },
          this.buildCapabilitiesSection(capabilities)
        ]
      }
    }

    const status = await this.longConnectionService.status(integration.id)
    return this.buildRuntimeView(integration, status, capabilities)
  }

  async runRuntimeAction(integration: IIntegration<TIntegrationLarkOptions>, action: string) {
    if (this.capabilityService.resolveConnectionMode(integration.options) !== 'long_connection') {
      throw new BadRequestException('Runtime actions are only available in long connection mode.')
    }

    switch (action) {
      case 'reconnect': {
        const status = await this.longConnectionService.reconnect(integration.id)
        return this.buildRuntimeView(integration, status)
      }
      case 'disconnect': {
        const status = await this.longConnectionService.disconnect(integration.id)
        return this.buildRuntimeView(integration, status)
      }
      default:
        throw new BadRequestException(`Unsupported Lark runtime action: ${action}`)
    }
  }

  async validateConfig(config: TIntegrationLarkOptions, integration?: IIntegration<TIntegrationLarkOptions>) {
    if (!config?.appId) {
      throw new Error('App ID is required')
    }

    if (!config?.appSecret) {
      throw new Error('App Secret is required')
    }

    try {
      const baseUrl = config.isLark ? 'https://open.larksuite.com' : 'https://open.feishu.cn'
      const axiosConfig = getLarkAxiosRequestConfig('https:')
      const proxyInfo = describeLarkProxy('https:')
      if (proxyInfo.note) {
        this.logger.log(`[lark] ${proxyInfo.note}`)
      }

      const tokenResponse = await axios.post(
        `${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
        {
          app_id: config.appId,
          app_secret: config.appSecret
        },
        {
          ...axiosConfig,
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      )

      const tokenData = tokenResponse?.data
      if (tokenData?.code !== 0 || !tokenData?.tenant_access_token) {
        throw new Error(tokenData?.msg || 'Failed to get tenant access token from Lark API')
      }

      const botInfoResponse = await axios.get(`${baseUrl}/open-apis/bot/v3/info`, {
        ...axiosConfig,
        headers: {
          Authorization: `Bearer ${tokenData.tenant_access_token}`
        },
        timeout: 10000
      })

      const botInfo = botInfoResponse?.data
      if (botInfo?.code !== 0 || !botInfo?.bot?.open_id) {
        throw new Error('Failed to get bot info from Lark API')
      }

      const connectionMode = this.capabilityService.resolveConnectionMode(config)
      const capabilities = this.capabilityService.getCapabilities(config)
      const apiBaseUrl = process.env.API_BASE_URL

      if (connectionMode === 'long_connection') {
        const probe = await this.longConnectionService.probeConfig(config)
        const warningMessages = [
          probe.connected
            ? 'Long connection probe succeeded. You can save this integration now.'
            : `Long connection probe failed: ${probe.lastError || 'Unknown error'}`
        ]

        return {
          webhookUrl: '',
          mode: connectionMode,
          sections: [
            this.buildWarningsSection(warningMessages),
            this.buildProbeSection(probe),
            this.buildCapabilitiesSection(capabilities)
          ]
        }
      }

      return {
        mode: connectionMode,
        webhookUrl: `${apiBaseUrl}/api/lark/webhook/${integration?.id || '<save_and_get_your_integration_id>'}`,
        sections: [
          {
            key: 'connection-mode',
            title: 'Connection Mode',
            tone: 'info' as const,
            items: [
              {
                key: 'mode',
                type: 'badge' as const,
                label: 'Mode',
                value: connectionMode
              }
            ],
            messages: ['Webhook mode uses the callback URL below after the integration is saved.']
          },
          this.buildCapabilitiesSection(capabilities)
        ]
      }
    } catch (error: any) {
      const axiosError = error as AxiosError<{ code?: number; msg?: string }>
      const message =
        toLarkApiErrorMessage(error) ||
        axiosError?.response?.data?.msg ||
        axiosError?.message ||
        'Unknown error'
      this.logger.error('Lark connection test failed:', error)
      throw new Error(`Lark API connection failed: ${message}`)
    }
  }

  private buildWarningsSection(messages: string[]) {
    return {
      key: 'warnings',
      title: 'Warnings',
      tone: 'warning' as const,
      messages
    }
  }

  private buildProbeSection(probe: TLarkConnectionProbeResult) {
    const tone: 'success' | 'danger' = probe.connected ? 'success' : 'danger'

    return {
      key: 'probe',
      title: 'Connection Probe',
      tone,
      items: [
        {
          key: 'state',
          type: 'badge' as const,
          label: 'State',
          value: probe.state
        },
        {
          key: 'connected',
          type: 'boolean' as const,
          label: 'Connected',
          value: probe.connected
        },
        {
          key: 'endpointValidated',
          type: 'boolean' as const,
          label: 'Endpoint Ready',
          value: probe.endpointValidated
        },
        {
          key: 'checkedAt',
          type: 'datetime' as const,
          label: 'Checked At',
          value: probe.checkedAt
        },
        {
          key: 'recoverable',
          type: 'boolean' as const,
          label: 'Recoverable',
          value: probe.recoverable ?? false
        }
      ],
      messages: [
        probe.connected
          ? 'Long connection probe succeeded. You can save this integration now.'
          : 'Long connection probe did not pass yet. You can adjust config and try again before saving.'
      ]
    }
  }

  private buildCapabilitiesSection(capabilities: TLarkCapabilityMatrix) {
    return {
      key: 'capabilities',
      title: 'Capabilities',
      tone: 'neutral' as const,
      items: [
        {
          key: 'supportsInboundMessage',
          type: 'boolean' as const,
          label: 'Inbound Message',
          value: capabilities.supportsInboundMessage
        },
        {
          key: 'supportsMentionTrigger',
          type: 'boolean' as const,
          label: 'Mention Trigger',
          value: capabilities.supportsMentionTrigger
        },
        {
          key: 'supportsCardSend',
          type: 'boolean' as const,
          label: 'Card Send',
          value: capabilities.supportsCardSend
        },
        {
          key: 'supportsCardAction',
          type: 'boolean' as const,
          label: 'Card Action',
          value: capabilities.supportsCardAction
        },
        {
          key: 'supportsWebhookCallback',
          type: 'boolean' as const,
          label: 'Webhook Callback',
          value: capabilities.supportsWebhookCallback
        }
      ]
    }
  }

  private buildRuntimeView(
    integration: IIntegration<TIntegrationLarkOptions>,
    status: TLarkRuntimeStatus,
    capabilities = this.capabilityService.getCapabilities(integration.options)
  ) {
    return {
      supported: true,
      state: status.state,
      connected: status.connected,
      sections: [
        {
          key: 'runtime-status',
          title: 'Runtime Status',
          tone: 'info' as const,
          items: [
            {
              key: 'connectionMode',
              type: 'badge' as const,
              label: 'Connection Mode',
              value: status.connectionMode
            },
            {
              key: 'state',
              type: 'badge' as const,
              label: 'State',
              value: status.state
            },
            {
              key: 'connected',
              type: 'boolean' as const,
              label: 'Connected',
              value: status.connected
            },
            {
              key: 'ownerInstanceId',
              type: 'text' as const,
              label: 'Owner',
              value: status.ownerInstanceId ?? null
            },
            {
              key: 'lastConnectedAt',
              type: 'datetime' as const,
              label: 'Last Connected',
              value: status.lastConnectedAt ?? null
            },
            {
              key: 'nextReconnectAt',
              type: 'datetime' as const,
              label: 'Next Reconnect',
              value: status.nextReconnectAt ?? null
            },
            {
              key: 'failureCount',
              type: 'text' as const,
              label: 'Failure Count',
              value: status.failureCount ?? 0
            },
            {
              key: 'lastError',
              type: 'paragraph' as const,
              label: 'Last Error',
              value: status.lastError ?? null
            },
            {
              key: 'disabledReason',
              type: 'paragraph' as const,
              label: 'Disabled Reason',
              value: status.disabledReason ?? null
            }
          ],
          actions: [
            {
              key: 'reconnect',
              label: 'Reconnect',
              variant: 'stroked' as const,
              color: 'default' as const,
              requiresSaved: true,
              hiddenWhenDirty: true
            },
            {
              key: 'disconnect',
              label: 'Disconnect',
              variant: 'flat' as const,
              color: 'warn' as const,
              requiresSaved: true,
              hiddenWhenDirty: true,
              confirmText: 'Disconnect the long connection for this integration?'
            }
          ]
        },
        this.buildCapabilitiesSection(capabilities)
      ]
    }
  }

  private hasLongConnectionConfigChanged(
    previous: TIntegrationLarkOptions | null | undefined,
    current: TIntegrationLarkOptions | null | undefined
  ) {
    return JSON.stringify(previous ?? {}) !== JSON.stringify(current ?? {})
  }
}
