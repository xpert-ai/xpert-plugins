import { NotionApiClient } from './notion-api.client.js'
import { NotionRateLimiter } from './notion-rate-limiter.js'

const mockRequest = jest.fn()

jest.mock('@notionhq/client', () => ({
  Client: jest.fn().mockImplementation(() => ({ request: mockRequest }))
}))

describe('NotionApiClient', () => {
  beforeEach(() => mockRequest.mockReset())

  it('uses the current search endpoint and maps pagination', async () => {
    mockRequest.mockResolvedValue({
      object: 'list',
      results: [
        { object: 'page', id: 'page-1', properties: { Name: { type: 'title', title: [{ plain_text: 'Plan' }] } } }
      ],
      next_cursor: 'cursor-2',
      has_more: true
    })
    const result = await new NotionApiClient(new NotionRateLimiter(0)).search(
      { connectorId: 'connector-1', accessToken: 'access-1' },
      { query: 'Plan', resultType: 'page', cursor: 'cursor-1', pageSize: 20 }
    )
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'search',
        method: 'post',
        body: expect.objectContaining({ query: 'Plan', start_cursor: 'cursor-1', page_size: 20 })
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        nextCursor: 'cursor-2',
        hasMore: true,
        items: [expect.objectContaining({ id: 'page-1', title: 'Plan' })]
      })
    )
  })

  it('queries a Data Source with a typed provider filter', async () => {
    mockRequest.mockResolvedValue({ object: 'list', results: [], has_more: false, next_cursor: null })
    await new NotionApiClient(new NotionRateLimiter(0)).queryDataSource(
      { connectorId: 'connector-1', accessToken: 'access-1' },
      {
        dataSourceId: 'ds-1',
        filter: { property: 'Status', type: 'status', operator: 'equals', value: 'Done' },
        sorts: [{ property: 'Name', direction: 'ascending' }],
        pageSize: 10
      }
    )
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'data_sources/ds-1/query',
        method: 'post',
        body: expect.objectContaining({ filter: { property: 'Status', status: { equals: 'Done' } } })
      })
    )
  })

  it('normalizes provider authorization failures', async () => {
    mockRequest.mockRejectedValue({ status: 403, message: 'forbidden' })
    await expect(
      new NotionApiClient(new NotionRateLimiter(0)).retrievePage(
        { connectorId: 'connector-1', accessToken: 'access-1' },
        'page-1'
      )
    ).rejects.toMatchObject({ code: 'NOTION_FORBIDDEN', status: 403 })
  })

  it('preserves Retry-After metadata', async () => {
    mockRequest.mockRejectedValue({ status: 429, message: 'slow down', headers: { 'retry-after': '2' } })
    await expect(
      new NotionApiClient(new SingleAttemptLimiter()).retrievePage(
        { connectorId: 'connector-1', accessToken: 'access-1' },
        'page-1'
      )
    ).rejects.toMatchObject({ code: 'NOTION_RATE_LIMITED', retryAfterSeconds: 2 })
  })
})

class SingleAttemptLimiter extends NotionRateLimiter {
  override async execute<T>(_key: string, operation: () => Promise<T>): Promise<T> {
    return operation()
  }
}
