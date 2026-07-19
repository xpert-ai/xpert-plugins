#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pathToFileURL } from 'node:url'
import { CUT_MCP_SERVER_NAME, CUT_MCP_SERVER_VERSION, registerCutMcpTools } from './lib/cut-mcp.js'

export async function createCutMcpServer() {
  const server = new McpServer({
    name: CUT_MCP_SERVER_NAME,
    version: CUT_MCP_SERVER_VERSION
  })
  registerCutMcpTools(server)
  return server
}

export async function main() {
  const server = await createCutMcpServer()
  await server.connect(new StdioServerTransport())
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exit(1)
  })
}
