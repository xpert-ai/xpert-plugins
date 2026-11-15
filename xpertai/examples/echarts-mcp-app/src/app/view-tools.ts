type Options = {
  post: (message: object) => void
  read: () => unknown
  ready: () => boolean
  setCaption: (caption: string) => void
}

// Reverse App tools operate on this iframe only. Querying server data still uses
// the ordinary host tools/call boundary; this does not grant data access.
export function createChartViewTools(options: Options) {
  const read = { name: 'get_chart_state', description: 'Read this view’s current synthetic sales analysis.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
  const caption = { name: 'set_chart_caption', description: 'Set a caption in this live chart view; does not persist a shared document.',
    inputSchema: { type: 'object', properties: { caption: { type: 'string', maxLength: 120 } },
      required: ['caption'], additionalProperties: false } }
  return (value: unknown) => {
    if (!value || typeof value !== 'object' || !('jsonrpc' in value) || value.jsonrpc !== '2.0' ||
        !('id' in value) || (typeof value.id !== 'string' && typeof value.id !== 'number') ||
        !('method' in value)) return false
    if (value.method === 'tools/list') {
      options.post({ jsonrpc: '2.0', id: value.id, result: { tools: options.ready() ? [read, caption] : [read] } })
      return true
    }
    if (value.method !== 'tools/call') return false
    try {
      if (!('params' in value) || !value.params || typeof value.params !== 'object' || !('name' in value.params))
        throw new Error('Missing tool name')
      const args = 'arguments' in value.params ? value.params.arguments : {}
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be an object')
      let result: unknown
      if (value.params.name === read.name && Object.keys(args).length === 0) result = options.read()
      else if (value.params.name === caption.name && options.ready() && Object.keys(args).length === 1 &&
          'caption' in args && typeof args.caption === 'string' && args.caption.length <= 120) {
        options.setCaption(args.caption)
        result = { caption: args.caption, persisted: false }
      } else throw new Error('Unknown tool or invalid arguments')
      options.post({ jsonrpc: '2.0', id: value.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] } })
    } catch (error) {
      options.post({ jsonrpc: '2.0', id: value.id,
        result: { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool failed' }] } })
    }
    return true
  }
}
