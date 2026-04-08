import { LarkRecipientDirectoryService } from './lark-recipient-directory.service.js'

class MemoryCache {
  private readonly store = new Map<string, unknown>()

  async set(key: string, value: unknown) {
    this.store.set(key, value)
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined
  }
}

describe('LarkRecipientDirectoryService', () => {
  function createFixture() {
    const cache = new MemoryCache()
    const service = new LarkRecipientDirectoryService(cache as any)
    return {
      cache,
      service
    }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('builds group and private scope keys', () => {
    const { service } = createFixture()

    expect(
      service.buildKey({
        integrationId: 'integration-1',
        chatType: 'group',
        chatId: 'oc_group_1',
        senderOpenId: 'ou_sender_1'
      })
    ).toBe('lark:recipient-dir:integration-1:chat:oc_group_1')

    expect(
      service.buildKey({
        integrationId: 'integration-1',
        chatType: 'private',
        senderOpenId: 'ou_sender_1'
      })
    ).toBe('lark:recipient-dir:integration-1:user:ou_sender_1')
  })

  it('stores mentions and resolves exact names case-insensitively', async () => {
    const { service } = createFixture()
    const key = service.buildKey({
      integrationId: 'integration-1',
      chatType: 'group',
      chatId: 'oc_group_1'
    })!
    const scope = {
      scopeType: 'group' as const,
      integrationId: 'integration-1',
      chatId: 'oc_group_1'
    }

    await service.upsertMentions(key, {
      scope,
      mentions: [
        {
          key: '@_user_1',
          id: 'ou_user_1',
          idType: 'open_id',
          name: 'Tom Jerry',
          rawToken: '@Tom Jerry'
        }
      ]
    })

    const resolved = await service.resolveByName(key, 'tom jerry')
    expect(resolved).toEqual({
      status: 'resolved',
      entry: expect.objectContaining({
        openId: 'ou_user_1',
        name: 'Tom Jerry',
        aliases: ['Tom Jerry'],
        ref: 'u_1'
      })
    })
  })

  it('resolves sender entry by open_id', async () => {
    const { service } = createFixture()
    const key = service.buildKey({
      integrationId: 'integration-1',
      chatType: 'group',
      chatId: 'oc_group_1'
    })!
    const scope = {
      scopeType: 'group' as const,
      integrationId: 'integration-1',
      chatId: 'oc_group_1'
    }

    await service.upsertSender(key, {
      scope,
      openId: 'ou_sender_1',
      name: 'Alice Zhang'
    })

    await expect(service.resolveByOpenId(key, 'ou_sender_1')).resolves.toEqual(
      expect.objectContaining({
        openId: 'ou_sender_1',
        name: 'Alice Zhang'
      })
    )
  })

  it('returns ambiguous when exact name matches multiple entries', async () => {
    const { service } = createFixture()
    const key = service.buildKey({
      integrationId: 'integration-1',
      chatType: 'group',
      chatId: 'oc_group_1'
    })!
    const scope = {
      scopeType: 'group' as const,
      integrationId: 'integration-1',
      chatId: 'oc_group_1'
    }

    await service.upsertMentions(key, {
      scope,
      mentions: [
        {
          key: '@_user_1',
          id: 'ou_user_1',
          idType: 'open_id',
          name: '张三',
          rawToken: '@张三'
        },
        {
          key: '@_user_2',
          id: 'ou_user_2',
          idType: 'open_id',
          name: '张三',
          rawToken: '@张三'
        }
      ]
    })

    const resolved = await service.resolveByName(key, '张三')
    expect(resolved).toEqual({
      status: 'ambiguous',
      entries: expect.arrayContaining([
        expect.objectContaining({ openId: 'ou_user_1' }),
        expect.objectContaining({ openId: 'ou_user_2' })
      ])
    })
  })

  it('aggregates entries by integration, deduplicates open ids, and supports search/sort/pagination', async () => {
    const { service } = createFixture()
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-01T00:00:00.000Z').getTime())

    const groupKey = service.buildKey({
      integrationId: 'integration-1',
      chatType: 'group',
      chatId: 'oc_group_1'
    })!
    const privateKey = service.buildKey({
      integrationId: 'integration-1',
      chatType: 'private',
      senderOpenId: 'ou_user_1'
    })!

    await service.upsertSender(groupKey, {
      scope: {
        scopeType: 'group',
        integrationId: 'integration-1',
        chatId: 'oc_group_1'
      },
      openId: 'ou_user_2',
      name: 'Bob Lee'
    })
    await service.upsertSender(privateKey, {
      scope: {
        scopeType: 'private',
        integrationId: 'integration-1',
        senderOpenId: 'ou_user_1'
      },
      openId: 'ou_user_1',
      name: 'Alice'
    })
    await service.upsertMentions(groupKey, {
      scope: {
        scopeType: 'group',
        integrationId: 'integration-1',
        chatId: 'oc_group_1'
      },
      mentions: [
        {
          key: '@_user_1',
          id: 'ou_user_1',
          idType: 'open_id',
          name: 'Alice Zhang',
          rawToken: '@Alice Zhang'
        }
      ]
    })

    await expect(
      service.listByIntegration('integration-1', {
        sortBy: 'name',
        sortDirection: 'asc'
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'ou_user_1',
          openId: 'ou_user_1',
          aliases: expect.arrayContaining(['Alice', 'Alice Zhang'])
        }),
        expect.objectContaining({
          id: 'ou_user_2',
          name: 'Bob Lee',
          openId: 'ou_user_2',
          source: 'sender',
          aliases: ['Bob Lee']
        })
      ],
      total: 2
    })

    await expect(
      service.listByIntegration('integration-1', {
        search: 'alice',
        page: 1,
        pageSize: 1
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'ou_user_1',
          openId: 'ou_user_1'
        })
      ],
      total: 1
    })
  })

  it('cleans missing or expired directory keys from the integration index during aggregation', async () => {
    const { cache, service } = createFixture()
    const key = service.buildKey({
      integrationId: 'integration-1',
      chatType: 'group',
      chatId: 'oc_group_1'
    })!

    await service.upsertSender(key, {
      scope: {
        scopeType: 'group',
        integrationId: 'integration-1',
        chatId: 'oc_group_1'
      },
      openId: 'ou_user_1',
      name: 'Alice'
    })

    await cache.set('lark:recipient-dir:integration-1:keys', [key, 'lark:recipient-dir:integration-1:chat:missing'])

    await expect(service.listByIntegration('integration-1')).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'ou_user_1',
          openId: 'ou_user_1'
        })
      ],
      total: 1
    })

    await expect(cache.get('lark:recipient-dir:integration-1:keys')).resolves.toEqual([key])
  })
})
