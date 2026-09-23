import { parseFirstJson } from './json.js'

describe('parseFirstJson', () => {
  it('finds JSON after CLI progress output and respects braces inside strings', () => {
    expect(parseFirstJson('Loading...\n{"message":"keep } and ]","items":[1,2]}\n')).toEqual({
      message: 'keep } and ]',
      items: [1, 2]
    })
  })

  it('parses arrays and rejects output without a complete JSON value', () => {
    expect(parseFirstJson('notice [1,{"ok":true}]')).toEqual([1, { ok: true }])
    expect(() => parseFirstJson('notice {"broken":')).toThrow(/valid JSON/)
  })
})
