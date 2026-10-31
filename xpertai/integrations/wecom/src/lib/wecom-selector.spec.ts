jest.mock('./conversation.service.js', () => ({ WeComConversationService: class {} }))
jest.mock('./wecom-channel.strategy.js', () => ({ WeComChannelStrategy: class {} }))
jest.mock('./wecom-long-connection.service.js', () => ({ WeComLongConnectionService: class {} }))
jest.mock('./workflow/wecom-trigger.strategy.js', () => ({ WeComTriggerStrategy: class {} }))
jest.mock('./auth/wecom-auth.guard.js', () => ({ WeComAuthGuard: class {} }))
jest.mock('./wecom-integration.strategy.js', () => ({ WECOM_HTTP_SUBSCRIPTION_HINTS: [] }))

import type express from 'express'
import { WeComHooksController } from './wecom.controller.js'

describe('WeCom authorized integration selector', () => {
  const trigger = { getBoundXpertId: jest.fn() }
  const controller = new WeComHooksController({} as never, {} as never, {} as never, trigger as never, {} as never)
  const request = {
    protocol: 'https',
    get: () => 'xpert.example',
    headers: {
      authorization: 'Bearer fixture',
      'tenant-id': 'tenant',
      'organization-id': 'organization',
      language: 'zh-Hans',
      'x-scope-level': 'organization'
    }
  } as unknown as express.Request
  let fetchMock: jest.SpyInstance
  beforeEach(() => {
    trigger.getBoundXpertId.mockReset().mockResolvedValue('bound-assistant')
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async (url) =>
          new Response(
            JSON.stringify([
              {
                value: String(url).includes('wecom_long') ? 'long' : 'short',
                label: 'Robot',
                scopeLevel: 'tenant',
                options: { secret: 'must-not-leak' }
              }
            ]),
            { status: 200 }
          )
      )
  })
  afterEach(() => jest.restoreAllMocks())

  it('forwards the actor context and purpose, strips credentials and marks occupied bindings', async () => {
    const options = await controller.getIntegrationSelectOptions(request, undefined, 'bind')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/integration/available?provider=wecom&usage=bind'),
      {
        method: 'GET',
        headers: request.headers
      }
    )
    expect(options).toHaveLength(2)
    expect(
      options.every(
        (option) =>
          option.disabled && option.description.includes('租户授权集成') && option.description.includes('已绑定')
      )
    ).toBe(true)
    expect(JSON.stringify(options)).not.toContain('must-not-leak')
    expect(JSON.stringify(options)).not.toContain('bound-assistant')
  })

  it('allows invocation choices independently of exclusive trigger bindings', async () => {
    const options = await controller.getIntegrationSelectOptions(request, undefined, 'invoke')
    expect(options.every((option) => !option.disabled)).toBe(true)
    expect(trigger.getBoundXpertId).not.toHaveBeenCalled()
  })

  it('keeps host authorization failures visible instead of showing an empty list', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 403 }))
    await expect(controller.getIntegrationSelectOptions(request)).rejects.toMatchObject({ status: 403 })
  })

  it('rejects an invalid usage before making an upstream request', async () => {
    await expect(controller.getIntegrationSelectOptions(request, undefined, 'admin')).rejects.toMatchObject({
      status: 400
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
