jest.mock('@xpert-ai/plugin-sdk', () => ({
  WorkflowTriggerStrategy: () => (target: unknown) => target,
  ChatChannel: () => (target: unknown) => target,
  defineChannelMessageType: (...parts: unknown[]) => parts.join(':'),
  AGENT_CHAT_DISPATCH_MESSAGE_TYPE: 'agent_chat_dispatch',
  HANDOFF_PERMISSION_SERVICE_TOKEN: Symbol('HANDOFF_PERMISSION_SERVICE_TOKEN'),
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  RequestContext: {
    currentTenantId: () => undefined,
    currentUserId: () => undefined,
    getLanguageCode: () => undefined,
    getOrganizationId: () => undefined
  }
}))

import { WechatPersonalTriggerStrategy } from './wechat-personal-trigger.strategy.js'

describe('WechatPersonalTriggerStrategy', () => {
  it('replays published trigger bindings during server bootstrap', () => {
    const strategy = new WechatPersonalTriggerStrategy({} as any, {} as any, {} as any, {} as any, {} as any)

    expect(strategy.bootstrap).toEqual({
      mode: 'replay_publish',
      critical: false
    })
  })
})
