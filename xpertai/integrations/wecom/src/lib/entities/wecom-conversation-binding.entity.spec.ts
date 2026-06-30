import { getMetadataArgsStorage } from 'typeorm'
import { WeComConversationBindingEntity } from './wecom-conversation-binding.entity.js'

describe('WeComConversationBindingEntity', () => {
  it('keeps userId indexed but not globally unique', () => {
    const userIdIndex = getMetadataArgsStorage().indices.find((index) => {
      return (
        index.target === WeComConversationBindingEntity &&
        index.columns.length === 1 &&
        index.columns[0] === 'userId'
      )
    })

    expect(userIdIndex).toBeDefined()
    expect(userIdIndex?.unique).not.toBe(true)
  })
})
