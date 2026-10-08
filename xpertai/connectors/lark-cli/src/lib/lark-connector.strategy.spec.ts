import axios from 'axios'
import { gunzipSync } from 'node:zlib'
import { LarkConnectorStrategy } from './lark-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => () => undefined
}))

jest.mock('axios')

describe('LarkConnectorStrategy', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>

  beforeEach(() => {
    mockedAxios.post.mockReset()
    mockedAxios.get.mockReset()
  })

  it('declares Feishu workspace connector as a CLI-managed connector', async () => {
    const connector = new LarkConnectorStrategy()
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        device_code: 'app-device-code',
        user_code: 'app-user-code',
        verification_uri_complete: 'https://open.feishu.cn/page/cli?user_code=app-user-code',
        expires_in: 300,
        interval: 5
      }
    })
    const result = await connector.buildAuthorizationUrl({
      redirectUri: 'https://xpert.example.com/api/xpert-workspace/connectors/oauth/callback',
      state: 'state-1',
      scopes: ['contact:user:readonly']
    })

    const url = new URL(result.authorizationUrl)
    const beginBody = new URLSearchParams(mockedAxios.post.mock.calls[0][1] as string)
    expect(connector.definition.provider).toBe('lark')
    expect(connector.definition.appCredentials?.fields ?? []).toHaveLength(0)
    expect(beginBody.get('request_user_info')).toBe('open_id')
    expect(connector.definition.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'feishu.user_access_token',
          identity: 'user',
          credential: 'access_token',
          storage: 'runtime_only',
          required: true
        }),
        expect.objectContaining({
          key: 'feishu.refresh_token',
          identity: 'user',
          credential: 'refresh_token',
          storage: 'platform_vault'
        }),
        expect.objectContaining({
          key: 'feishu.app_credential',
          identity: 'app',
          credential: 'app_credential',
          storage: 'platform_vault'
        })
      ])
    )
    expect(url.origin).toBe('https://open.feishu.cn')
    expect(url.searchParams.get('user_code')).toBe('app-user-code')
    expect(url.searchParams.get('from')).toBe('sdk')
    expect(url.searchParams.get('source')).toBe('node-sdk/xpert')
    expect(url.searchParams.get('tp')).toBe('sdk')
    expect(decodeAddonsParam(url)).toEqual({
      scopes: {
        tenant: [],
        user: ['contact:user:readonly', 'offline_access']
      }
    })
    expect(result.pollIntervalSeconds).toBe(5)
    expect(result.metadata).toEqual(
      expect.objectContaining({
        phase: 'app_registration',
        deviceCode: 'app-device-code',
        interval: 5
      })
    )
  })

  it('uses plugin-owned default user scopes when starting Feishu connector authorization', async () => {
    const connector = new LarkConnectorStrategy()
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        device_code: 'app-device-code',
        user_code: 'app-user-code',
        verification_uri_complete: 'https://open.feishu.cn/page/cli?user_code=app-user-code',
        expires_in: 300,
        interval: 5
      }
    })

    const result = await connector.buildAuthorizationUrl({
      redirectUri: 'https://xpert.example.com/api/xpert-workspace/connectors/oauth/callback',
      state: 'state-1'
    })
    const url = new URL(result.authorizationUrl)
    const addons = decodeAddonsParam(url) as { scopes: { tenant: string[]; user: string[] } }

    expect(connector.definition.auth?.scopes).toEqual(
      expect.arrayContaining([
        'base:record:read',
        'calendar:calendar.event:read',
        'docx:document:readonly',
        'drive:file:download',
        'im:message.send_as_user',
        'sheets:spreadsheet:read',
        'wiki:node:read'
      ])
    )
    expect(connector.definition.auth?.scopes).not.toContain('offline_access')
    expect(connector.definition.auth?.scopes).not.toContain('im:message:send_as_bot')
    expect(result.scopes).toEqual(connector.definition.auth?.scopes)
    expect(addons.scopes.tenant).toEqual([])
    expect(addons.scopes.user).toEqual(expect.arrayContaining(connector.definition.auth?.scopes ?? []))
    expect(addons.scopes.user).toContain('offline_access')
    expect(addons.scopes.user).not.toContain('im:message:send_as_bot')
  })

  it('polls Feishu app registration and user authorization into a connector credential', async () => {
    const connector = new LarkConnectorStrategy()
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          client_id: 'cli_app_id',
          client_secret: 'app_secret'
        }
      })
      .mockResolvedValueOnce({
        data: {
          device_code: 'user-device-code',
          verification_uri_complete: 'https://open.feishu.cn/page/cli?user_code=user-code',
          expires_in: 240,
          interval: 5
        }
      })

    const pending = await connector.pollAuthorization({
      redirectUri: 'https://xpert.example.com/api/xpert-workspace/connectors/oauth/callback',
      scopes: ['contact:user:readonly'],
      metadata: {
        phase: 'app_registration',
        deviceCode: 'app-device-code',
        interval: 5
      }
    })

    expect(pending).toEqual(
      expect.objectContaining({
        status: 'pending',
        authorizationUrl: 'https://open.feishu.cn/page/cli?user_code=user-code',
        metadata: expect.objectContaining({
          phase: 'user_authorization',
          appId: 'cli_app_id',
          appSecret: 'app_secret',
          deviceCode: 'user-device-code'
        })
      })
    )

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        access_token: 'user_access_token',
        refresh_token: 'refresh_token',
        expires_in: 7200,
        refresh_token_expires_in: 604800,
        scope: 'contact:user:readonly offline_access'
      }
    })
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        code: 0,
        data: {
          open_id: 'ou_xxx',
          union_id: 'on_xxx',
          name: 'Feishu User',
          email: 'user@example.com'
        }
      }
    })

    const complete = await connector.pollAuthorization({
      redirectUri: 'https://xpert.example.com/api/xpert-workspace/connectors/oauth/callback',
      scopes: ['contact:user:readonly'],
      metadata: (pending as any).metadata
    })

    expect(complete).toEqual(
      expect.objectContaining({
        status: 'complete',
        credential: expect.objectContaining({
          appId: 'cli_app_id',
          brand: 'feishu',
          app: {
            appId: 'cli_app_id',
            appSecret: 'app_secret',
            brand: 'feishu'
          },
          accessToken: 'user_access_token',
          refreshToken: 'refresh_token',
          scopes: ['contact:user:readonly', 'offline_access'],
          profile: expect.objectContaining({
            openId: 'ou_xxx',
            name: 'Feishu User'
          })
        })
      })
    )
  })

  it('treats Feishu app-registration HTTP 400 authorization_pending as pending', async () => {
    const connector = new LarkConnectorStrategy()
    mockedAxios.post.mockRejectedValueOnce({
      response: {
        data: {
          error: 'authorization_pending'
        }
      }
    })

    await expect(
      connector.pollAuthorization({
        redirectUri: 'https://xpert.example.com/api/xpert-workspace/connectors/oauth/callback',
        scopes: ['contact:user:readonly'],
        metadata: {
          phase: 'app_registration',
          deviceCode: 'app-device-code',
          interval: 5
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'pending',
        pollIntervalSeconds: 5,
        metadata: expect.objectContaining({
          phase: 'app_registration',
          deviceCode: 'app-device-code',
          interval: 5
        })
      })
    )
  })

  it('backs off Feishu app-registration polling when Feishu returns slow_down', async () => {
    const connector = new LarkConnectorStrategy()
    mockedAxios.post.mockRejectedValueOnce({
      response: {
        data: {
          error: 'slow_down'
        }
      }
    })

    await expect(
      connector.pollAuthorization({
        redirectUri: 'https://xpert.example.com/api/xpert-workspace/connectors/oauth/callback',
        scopes: ['contact:user:readonly'],
        metadata: {
          phase: 'app_registration',
          deviceCode: 'app-device-code',
          interval: 5
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'pending',
        pollIntervalSeconds: 10,
        metadata: expect.objectContaining({
          phase: 'app_registration',
          interval: 10
        })
      })
    )
  })

  it('backs off Feishu device-token polling when Feishu returns slow_down', async () => {
    const connector = new LarkConnectorStrategy()
    mockedAxios.post.mockRejectedValueOnce({
      response: {
        data: {
          error: 'slow_down'
        }
      }
    })

    await expect(
      connector.pollAuthorization({
        redirectUri: 'https://xpert.example.com/api/xpert-workspace/connectors/oauth/callback',
        scopes: ['contact:user:readonly'],
        metadata: {
          phase: 'user_authorization',
          appId: 'cli_app_id',
          appSecret: 'app_secret',
          deviceCode: 'user-device-code',
          interval: 5
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'pending',
        pollIntervalSeconds: 10,
        metadata: expect.objectContaining({
          phase: 'user_authorization',
          interval: 10
        })
      })
    )
  })

  it('rejects Lark international tenants returned by Feishu app registration', async () => {
    const connector = new LarkConnectorStrategy()
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        client_id: 'cli_app_id',
        client_secret: 'app_secret',
        user_info: {
          tenant_brand: 'lark'
        }
      }
    })

    const result = await connector.pollAuthorization({
      redirectUri: 'https://xpert.example.com/api/xpert-workspace/connectors/oauth/callback',
      scopes: ['contact:user:readonly'],
      metadata: {
        phase: 'app_registration',
        deviceCode: 'app-device-code',
        interval: 5
      }
    })

    expect(result).toEqual({
      status: 'error',
      error: 'Feishu connector only supports Feishu China tenants.',
      metadata: {
        phase: 'app_registration',
        deviceCode: 'app-device-code',
        interval: 5
      }
    })
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
  })

  it('exchanges an OAuth code for a connector credential with app secret scoped to internal app credentials', async () => {
    const connector = new LarkConnectorStrategy()
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        code: 0,
        data: {
          access_token: 'user_access_token',
          refresh_token: 'refresh_token',
          expires_in: 7200,
          refresh_expires_in: 604800,
          scope: 'contact:user:readonly'
        }
      }
    })
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        code: 0,
        data: {
          open_id: 'ou_xxx',
          union_id: 'on_xxx',
          name: 'Feishu User',
          email: 'user@example.com'
        }
      }
    })

    const credential = await connector.exchangeOAuthCode({
      app: {
        appId: 'cli_app_id',
        appSecret: 'app_secret',
        brand: 'feishu'
      },
      code: 'auth_code',
      redirectUri: 'https://xpert.example.com/api/xpert-workspace/connectors/oauth/callback'
    })

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
      expect.objectContaining({
        grant_type: 'authorization_code',
        client_id: 'cli_app_id',
        client_secret: 'app_secret',
        code: 'auth_code'
      }),
      expect.any(Object)
    )
    expect(credential).toEqual(
      expect.objectContaining({
        appId: 'cli_app_id',
        brand: 'feishu',
        app: {
          appId: 'cli_app_id',
          appSecret: 'app_secret',
          brand: 'feishu'
        },
        accessToken: 'user_access_token',
        refreshToken: 'refresh_token',
        scopes: ['contact:user:readonly'],
        profile: expect.objectContaining({
          openId: 'ou_xxx',
          name: 'Feishu User',
          email: 'user@example.com'
        })
      })
    )
    expect(credential).not.toHaveProperty('appSecret')
  })
})

function decodeAddonsParam(url: URL) {
  const encoded = url.searchParams.get('addons')
  expect(encoded).toBeTruthy()
  const base64 = (encoded as string).replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return JSON.parse(gunzipSync(Buffer.from(padded, 'base64')).toString('utf8'))
}
