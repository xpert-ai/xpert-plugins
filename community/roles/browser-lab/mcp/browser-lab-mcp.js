#!/usr/bin/env node
const readline = require('node:readline')

const tools = [
  {
    name: 'xpertai_browser_plan',
    description: 'Create a safe browser verification plan.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string' },
        startUrl: { type: 'string' }
      },
      required: ['goal']
    }
  },
  {
    name: 'xpertai_browser_extract_links',
    description: 'Extract links from a text snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        baseUrl: { type: 'string' }
      },
      required: ['content']
    }
  }
]

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
})

rl.on('line', (line) => {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    return
  }

  if (request.method === 'initialize') {
    respond(request.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'browser-lab', version: '0.1.0' }
    })
    return
  }

  if (request.method === 'tools/list') {
    respond(request.id, { tools })
    return
  }

  if (request.method === 'tools/call') {
    const name = request.params && request.params.name
    respond(request.id, {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            tool: name,
            message: 'XpertAI Browser Lab MCP bridge is reachable.'
          })
        }
      ]
    })
  }
})

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}
