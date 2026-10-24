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
    ['JSON null', 'null'],
    ['JSON array', '[]'],
    ['unknown filter key', JSON.stringify({ type: 'status', property: 'Status', operator: 'equals', value: 'Done', actor: 'other' })],
    ['wrong value type', JSON.stringify({ type: 'checkbox', property: 'Done', operator: 'equals', value: 'false' })],
    ['double-stringified filter', JSON.stringify(JSON.stringify({ type: 'status' }))],
    ['oversized string', 'x'.repeat(2_049)]
  ])('rejects %s as a data source filter', (_label, filter) => {
    expect(queryNotionDataSourceSchema.safeParse({ data_source_id: 'ds-1', filter }).success).toBe(false)
  })

  it('accepts 2,048 characters but rejects longer JSON before trimming whitespace', () => {
    const filter = { type: 'status', property: 'Status', operator: 'equals', value: 'Done' }
    const encoded = JSON.stringify(filter).padEnd(2_048)
    expect(queryNotionDataSourceSchema.parse({ data_source_id: 'ds-1', filter: encoded }).filter).toEqual(filter)
    expect(queryNotionDataSourceSchema.safeParse({ data_source_id: 'ds-1', filter: encoded + ' ' }).success).toBe(false)
  })

  it.each([
    { type: 'checkbox', property: 'Done', operator: 'equals', value: false },
    { type: 'number', property: 'Count', operator: 'greater_than', value: 0 },
    { type: 'rich_text', property: 'Notes', operator: 'contains', value: '{"nested":true}' }
  ])('preserves the $type filter value for native and JSON inputs', (filter) => {
    for (const input of [filter, JSON.stringify(filter)]) {
      expect(queryNotionDataSourceSchema.parse({ data_source_id: 'ds-1', filter: input }).filter).toEqual(filter)
    }
  })
})
