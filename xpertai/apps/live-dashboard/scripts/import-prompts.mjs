#!/usr/bin/env node
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const require = createRequire(import.meta.url)
const { dashboardWorkspacePrompts } = require('../dist/lib/prompt-workflows.js')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Create-only import: no Assistant edits, broad associations, replacement or automatic publication. */
export async function importPrompts({ apiUrl, organizationId, assistantId, token, apply = false, request = fetch, log = console.log }) {
  const base = new URL(apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`)
  if (base.username || base.password || base.search || base.hash ||
      !['http:', 'https:'].includes(base.protocol)) throw new Error('Use an HTTP(S) API base URL without credentials, query or fragment.')
  if (base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
    throw new Error('Use HTTPS for a remote API. TLS certificate verification must remain enabled.')
  if (!uuid.test(organizationId) || !uuid.test(assistantId)) throw new Error('Organization and Assistant IDs must be UUIDs.')
  const bearer = token?.trim().replace(/^Bearer\s+/i, '')
  if (!bearer) throw new Error('Set XPERT_TOKEN to a platform login token.')
  const headers = { Authorization: `Bearer ${bearer}`, 'organization-id': organizationId, 'Content-Type': 'application/json' }
  async function api(path, body) {
    const response = await request(new URL(path, base), {
      method: body ? 'POST' : 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(30000),
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    if (!response.ok) throw new Error(`API ${body ? 'POST' : 'GET'} failed (${response.status}). No existing data was overwritten. Rerun to inspect partial progress.`)
    return response.json()
  }
  const assistant = await api(`xpert/${assistantId}`)
  if (assistant?.id !== assistantId || !uuid.test(assistant.workspaceId ?? '') ||
      assistant.organizationId !== organizationId || assistant.latest === false)
    throw new Error('The Assistant must be the current version in the selected organization and an authoring workspace.')
  const nodes = assistant.graph?.nodes
  if (!Array.isArray(nodes)) throw new Error('The Assistant has no published graph. Configure and publish LiveDashboard first.')
  const middlewares = nodes.filter(node => node?.type === 'workflow' && node.entity?.type === 'middleware' && node.entity.provider === 'LiveDashboard')
  // Required middleware is always active, so prompts need no stale per-Assistant node keys.
  if (middlewares.length !== 1 || middlewares[0].entity.required !== true)
    throw new Error('Configure one LiveDashboard middleware as required (System middleware), publish, then rerun.')
  async function runtimeCommands() {
    const runtime = await api(`xpert/${assistantId}/runtime-capabilities`)
    if (!Array.isArray(runtime?.commands)) throw new Error('Unexpected runtime command response; import stopped.')
    return runtime.commands
  }
  const commands = await runtimeCommands()
  if (!commands.some(command => command.source?.type === 'middleware' && command.source.provider === 'LiveDashboard' && command.source.nodeKey === middlewares[0].key))
    throw new Error('Published LiveDashboard commands are unavailable. Connect the middleware to the main Agent and load the updated plugin first.')
  function available(workflow, existing, catalog) {
    return catalog.some(command => command.name === workflow.name && command.kind === 'prompt_workflow' &&
      command.source?.type === 'workspace_prompt_workflow' && command.source.workflowId === existing.id &&
      command.action?.type === 'insert_text' && command.action.template === workflow.template)
  }
  const workspace = encodeURIComponent(assistant.workspaceId)
  const creates = []
  const skipped = []
  const conflicts = []
  for (const workflow of dashboardWorkspacePrompts) {
    const data = encodeURIComponent(JSON.stringify({ where: { name: workflow.name }, take: 2 }))
    const page = await api(`prompt-workflow/by-workspace/${workspace}?data=${data}`)
    if (!Array.isArray(page?.items) || page.total !== page.items.length || page.total > 1 ||
        page.items.some(item => item?.name !== workflow.name)) throw new Error('Unexpected prompt lookup result; import stopped.')
    const existing = page.items[0]
    if (existing) {
      const applicable = !existing.associatedXpertIds?.length || existing.associatedXpertIds.includes(assistantId)
      if (existing.archivedAt || existing.actionType === 'insert_invocation' || existing.actionType === 'submit_prompt' ||
          existing.template !== workflow.template || !applicable || !available(workflow, existing, commands)) conflicts.push(workflow.name)
      else skipped.push(workflow.name)
    } else {
      if (commands.some(command => command.name === workflow.name)) conflicts.push(workflow.name)
      creates.push({ ...workflow, associatedXpertIds: [assistantId] })
    }
  }
  if (conflicts.length) throw new Error(`Resolve existing prompts in the workspace prompt library before importing (no writes made): ${[...new Set(conflicts)].join(', ')}. Associate the existing prompt with this Assistant if appropriate; user edits and archived prompts are preserved.`)
  log(`${apply ? 'Apply' : 'Preview'}: create ${creates.length}, already available ${skipped.length}. Assistant ${assistantId}.`)
  const created = []
  const savedWorkflows = []
  if (apply) for (const body of creates) {
    const saved = await api(`prompt-workflow/workspace/${workspace}`, body)
    if (!uuid.test(saved?.id ?? '') || saved.name !== body.name ||
        saved.template !== body.template || !saved.associatedXpertIds?.includes(assistantId))
      throw new Error(`Creation response did not confirm ${body.name}; inspect the prompt library before retrying.`)
    created.push(body.name)
    savedWorkflows.push(saved)
    log(`Created ${body.name}`)
  }
  if (savedWorkflows.length) {
    const updated = await runtimeCommands()
    if (savedWorkflows.some(workflow => !available(workflow, workflow, updated)))
      throw new Error('Prompts were created but runtime shortcuts are not confirmed. Inspect the Assistant command settings; existing data was not overwritten.')
    log('Created shortcuts confirmed by the published Assistant runtime.')
  }
  return { planned: creates.map(item => item.name), created, skipped }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: {
      'api-url': { type: 'string' }, 'organization-id': { type: 'string' },
      'assistant-id': { type: 'string' }, apply: { type: 'boolean', default: false }, help: { type: 'boolean' }
    } })
    if (values.help) console.log('Set XPERT_TOKEN, then run import-prompts.mjs --api-url https://host/api --organization-id UUID --assistant-id UUID [--apply]. Default: read-only preview. Requires Node 20+.')
    else if (!values['api-url'] || !values['organization-id'] || !values['assistant-id']) throw new Error('Required: --api-url, --organization-id, --assistant-id. See --help.')
    else await importPrompts({ apiUrl: values['api-url'], organizationId: values['organization-id'], assistantId: values['assistant-id'], token: process.env.XPERT_TOKEN, apply: values.apply })
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Prompt import failed.')
    process.exitCode = 1
  }
}
