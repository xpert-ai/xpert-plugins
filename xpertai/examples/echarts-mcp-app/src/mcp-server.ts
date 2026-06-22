#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pathToFileURL } from 'url'
import { registerEChartsMcpApp } from './lib/mcp-tools.js'

export async function createEChartsMcpServer() {
  const server = new McpServer({
    name: 'xpert-echarts-mcp-app',
    version: '0.0.1'
  })
  await registerEChartsMcpApp(server)
  return server
}

export async function main() {
  const server = await createEChartsMcpServer()
  await server.connect(new StdioServerTransport())
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exit(1)
  })
}
