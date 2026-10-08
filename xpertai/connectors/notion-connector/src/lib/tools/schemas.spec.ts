import { queryNotionDataSourceSchema, searchNotionSchema } from './schemas.js'

describe('Notion tool schemas', () => {
  it('rejects unknown keys and unbounded search input', () => {
    expect(searchNotionSchema.safeParse({ query: 'x'.repeat(201) }).success).toBe(false)
    expect(searchNotionSchema.safeParse({ query: 'ok', unknown: true }).success).toBe(false)
  })

  it('accepts a bounded typed data source filter', () => {
    const result = queryNotionDataSourceSchema.safeParse({
      data_source_id: 'ds-1',
      filter: { type: 'status', property: 'Status', operator: 'equals', value: 'In progress' },
      page_size: 20
    })
    expect(result.success).toBe(true)
  })

  it('parses a once-stringified data source filter and preserves strict validation', () => {
    const filter = { type: 'status', property: 'Status', operator: 'equals', value: 'In progress' }
    const result = queryNotionDataSourceSchema.safeParse({
      data_source_id: 'ds-1',
      filter: JSON.stringify(filter),
      page_size: 20
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.filter).toEqual(filter)
  })

  it.each([
    ['malformed JSON', '{"type":"status"'],
    ['JSON scalar', 'true'],
    ['double-stringified filter', JSON.stringify(JSON.stringify({ type: 'status' }))],
    ['oversized string', 'x'.repeat(2_049)]
  ])('rejects %s as a data source filter', (_label, filter) => {
    expect(queryNotionDataSourceSchema.safeParse({ data_source_id: 'ds-1', filter }).success).toBe(false)
  })
})
