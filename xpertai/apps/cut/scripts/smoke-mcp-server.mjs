import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'

const expectedTools = [
  'cut_ir_create_project',
  'cut_ir_validate_project',
  'cut_ir_apply_operations',
  'cut_ir_compare_projects'
]

const client = new Client({ name: 'cut-mcp-package-smoke', version: '0.1.0' })
const serverPath = fileURLToPath(new URL('../dist/mcp-server.js', import.meta.url))
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stderr: 'pipe'
})
let stderr = ''
transport.stderr?.on('data', (chunk) => { stderr += String(chunk) })

try {
  await client.connect(transport)
  const listed = await client.listTools()
  const names = listed.tools.map((tool) => tool.name)
  if (JSON.stringify(names) !== JSON.stringify(expectedTools)) {
    throw new Error(`Unexpected Cut MCP tools: ${names.join(', ')}`)
  }

  const result = await client.callTool({
    name: 'cut_ir_create_project',
    arguments: { width: 640, height: 360, fps: 24, durationSeconds: 12 }
  })
  if (result.isError || result.structuredContent?.kind !== 'cut.ir.project-created') {
    throw new Error('Cut MCP create-project smoke call failed.')
  }
  process.stderr.write(`Cut MCP smoke passed: ${names.length} tools, in-memory project created.\n`)
} finally {
  await client.close()
}

if (stderr.trim()) throw new Error(`Cut MCP server wrote unexpected stderr output: ${stderr.trim()}`)
