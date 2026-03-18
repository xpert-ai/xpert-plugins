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
})
