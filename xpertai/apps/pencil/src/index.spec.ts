jest.mock('@xpert-ai/plugin-sdk', () => ({
  XpertServerPlugin: () => (target: Function) => target
}))

jest.mock('@nestjs/typeorm', () => ({
  TypeOrmModule: {
    forFeature: jest.fn(() => ({}))
  },
  InjectRepository: () => () => undefined
}))

jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: Function) => target,
  BadRequestException: class BadRequestException extends Error {},
  ConflictException: class ConflictException extends Error {},
  NotFoundException: class NotFoundException extends Error {},
  Inject: () => () => undefined,
  Optional: () => () => undefined
}))

jest.mock('./lib/pencil.middleware.js', () => ({
  PencilMiddleware: class MockPencilMiddleware {}
}))

jest.mock('./lib/pencil.service.js', () => ({
  PencilService: class MockPencilService {}
}))

jest.mock('./lib/pencil-view.provider.js', () => ({
  PencilViewProvider: class MockPencilViewProvider {}
}))

jest.mock('./lib/pencil-graph.js', () => ({}))

import plugin from './index.js'
import {
  PENCIL_FEATURE,
  PENCIL_MIDDLEWARE_NAME,
  PENCIL_PROVIDER_KEY,
  PENCIL_TEMPLATE_PROVIDER_KEY,
  PENCIL_WORKBENCH_VIEW_KEY
} from './lib/constants.js'

describe('Pencil plugin metadata', () => {
  it('registers target app metadata and runtime providers', () => {
    expect(plugin.meta.name).toBe('@xpert-ai/plugin-pencil')
    expect(plugin.meta.targetApps).toEqual(expect.arrayContaining(['data-xpert', 'xpert']))
    expect(plugin.meta.targetAppMeta?.['data-xpert']?.capabilities).toContain(PENCIL_FEATURE)
    expect(plugin.meta.targetAppMeta?.['data-xpert']?.runtime).toEqual(
      expect.objectContaining({
        middlewareProviders: [PENCIL_MIDDLEWARE_NAME],
        viewProviders: [PENCIL_PROVIDER_KEY],
        templateProviders: [PENCIL_TEMPLATE_PROVIDER_KEY]
      })
    )
    expect(JSON.stringify(plugin.meta.targetAppMeta)).toContain(PENCIL_WORKBENCH_VIEW_KEY)
    expect(plugin.templates?.[0]?.key).toBe('pencil-assistant')
    expect(plugin.templates?.[0]?.avatar?.url).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(plugin.templates?.[0]?.dslContent).toContain('url: data:image/svg+xml;base64,')
  })
})
