import { createChartViewTools } from './view-tools'

describe('chart App tools', () => {
  it('advertises mutations only after the chart has data and validates exact input', () => {
    const post = jest.fn()
    const setCaption = jest.fn()
    let ready = false
    const handle = createChartViewTools({ post, setCaption, read: () => ({ synthetic: true }), ready: () => ready })
    handle({ jsonrpc: '2.0', id: 'list', method: 'tools/list' })
    expect(post.mock.calls[0][0].result.tools.map((tool: { name: string }) => tool.name)).toEqual(['get_chart_state'])
    ready = true
    handle({ jsonrpc: '2.0', id: 'list', method: 'tools/list' })
    expect(post.mock.calls[1][0].result.tools).toHaveLength(2)
    handle({ jsonrpc: '2.0', id: 'call', method: 'tools/call', params: { name: 'set_chart_caption', arguments: { caption: 'Report' } } })
    expect(setCaption).toHaveBeenCalledWith('Report')
    for (const args of [{ caption: 'x'.repeat(121) }, { caption: 'Report', hidden: true }, []]) {
      handle({ jsonrpc: '2.0', id: 'bad', method: 'tools/call', params: { name: 'set_chart_caption', arguments: args } })
      expect(post.mock.calls.at(-1)?.[0].result.isError).toBe(true)
    }
    expect(setCaption).toHaveBeenCalledTimes(1)
  })

  it('keeps state local to each view and ignores unrelated notifications', () => {
    const a = jest.fn(), b = jest.fn()
    const options = { ready: () => true, setCaption: () => undefined }
    const first = createChartViewTools({ ...options, post: a, read: () => ({ caption: 'A' }) })
    const second = createChartViewTools({ ...options, post: b, read: () => ({ caption: 'B' }) })
    const request = { jsonrpc: '2.0', id: 'call', method: 'tools/call', params: { name: 'get_chart_state' } }
    first(request); second(request)
    expect(a.mock.calls[0][0].result.content[0].text).toContain('A')
    expect(b.mock.calls[0][0].result.content[0].text).toContain('B')
    expect(first({ method: 'notifications/cancelled' })).toBe(false)
  })
})
