import { ZsxqConnectorError } from '../errors.js'
import {
  mapAccount,
  mapComments,
  mapGroups,
  mapMembers,
  mapMutationReceipt,
  mapScheduledJobs,
  mapTopicDetail,
  mapTopics
} from './zsxq-mappers.js'

describe('Knowledge Planet response mappers', () => {
  it('maps account and strips untrusted avatar URLs', () => {
    expect(mapAccount({ user: { user_id: 101, nickname: 'Alice', avatar_url: 'http://evil.test/a' } })).toEqual({
      id: '101',
      name: 'Alice'
    })
  })

  it('maps provider pages into bounded stable DTOs', () => {
    expect(
      mapGroups({
        groups: [{ group_id: '12', name: 'Platform', statistics: { members_count: 4 } }],
        has_more: true,
        next_end_time: 'cursor-1'
      })
    ).toEqual({
      items: [{ id: '12', name: 'Platform', memberCount: 4 }],
      hasMore: true,
      nextCursor: 'cursor-1'
    })
    expect(
      mapTopics({
        items: [
          { topic_id: '8', content: 'hello', owner: { user_id: '3', name: 'Bob' }, create_time: '2026-01-01T00:00:00Z' }
        ]
      })
    ).toMatchObject({
      items: [{ id: '8', excerpt: 'hello', author: { id: '3', name: 'Bob' }, createdAt: '2026-01-01T00:00:00Z' }]
    })
    expect(
      mapComments({ comments: [{ comment_id: '9', text: 'reply', owner: { user_id: '3', name: 'Bob' } }] })
    ).toEqual({
      items: [{ id: '9', text: 'reply', author: { id: '3', name: 'Bob' } }],
      hasMore: false
    })
    expect(
      mapMembers({
        members: [{ user_id: '5', nickname: 'Carol', role: 'member', avatar_url: 'https://img.example/avatar' }]
      })
    ).toEqual({
      items: [{ id: '5', name: 'Carol', role: 'member', avatarUrl: 'https://img.example/avatar' }],
      hasMore: false
    })
    expect(
      mapScheduledJobs({
        jobs: [{ job_id: '6', group_id: '12', text: 'later', scheduled_time: '2026-09-02T10:00:00Z' }]
      })
    ).toEqual({
      items: [{ id: '6', groupId: '12', text: 'later', scheduledTime: '2026-09-02T10:00:00Z' }],
      hasMore: false
    })
  })

  it('requires identity fields for account and topic details', () => {
    expect(() => mapAccount({ user: { nickname: 'missing id' } })).toThrow(ZsxqConnectorError)
    expect(() => mapTopicDetail({ topic: { text: 'missing id' } })).toThrow(/missing topic_id/)
  })

  it('returns a provider receipt without echoing the raw payload', () => {
    expect(mapMutationReceipt({ topic_id: '44', secret: 'do-not-return' }, 'create_topic', ['topic_id'])).toEqual({
      status: 'completed',
      operation: 'create_topic',
      id: '44',
      verified: false
    })
  })
})
