import { getMetadataArgsStorage } from 'typeorm'
import { DingTalkConversationBindingEntity } from './dingtalk-conversation-binding.entity.js'

describe('DingTalkConversationBindingEntity', () => {
  it('keeps userId indexed but not globally unique', () => {
    const indices = getMetadataArgsStorage().indices.filter(
      (index) => index.target === DingTalkConversationBindingEntity
    )

    const userIdIndex = indices.find((index) => {
      const columns = typeof index.columns === 'function' ? index.columns({} as any) : index.columns
      return Array.isArray(columns) && columns.length === 1 && columns[0] === 'userId'
    })

    expect(userIdIndex).toBeDefined()
    expect(Boolean(userIdIndex?.options?.unique || (userIdIndex as any)?.unique)).toBe(false)
  })
})
