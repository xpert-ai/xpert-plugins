import { readFile } from 'node:fs/promises'
import YAML from '/Users/xpertai/Pro/xpert-pro/node_modules/yaml/dist/index.js'
import {
  createRequestHeaders,
  resolveAuthentication
} from '/Users/xpertai/GitHub/os/xpert/tools/scripts/local-plugin-cli.mjs'

const apiOrigin = 'http://localhost:3000'
const workspaceId = '3ad87d56-feb7-49e1-85ec-4b4c4fbbaa0d'
const skillId = '5f72ec0a-4b9c-4a63-81ee-c8e438ee463b'
const xpertId = '6e266458-7287-47c1-9cbb-40fdc9419061'
const authArgs = {
  apiUrl: apiOrigin,
  scope: 'organization',
  orgId: '5bdc8076-36cd-444a-9aa1-82ea0fa30496',
  tenantId: 'a3ed4e50-da8e-4b4b-aec1-87e1027ad3f1'
}
const authentication = await resolveAuthentication(authArgs)
const headers = createRequestHeaders(authArgs, authentication.token, authentication.tenantId)

async function request(method, path, body) {
  const response = await fetch(`${apiOrigin}/api${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const text = await response.text()
  const value = text && response.headers.get('content-type')?.includes('application/json')
    ? JSON.parse(text)
    : text
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${text.slice(0, 1000)}`)
  return value
}

const skillContent = await readFile(new URL('../skills/img2threejs-semantic-modeling/SKILL.md', import.meta.url), 'utf8')
await request('PUT', `/skill-package/workspace/${workspaceId}/${skillId}/file`, {
  path: 'SKILL.md',
  content: skillContent
})

const assistantDsl = YAML.parse(await readFile(new URL('../src/xpert-img2threejs-assistant.yaml', import.meta.url), 'utf8'))
const exportedResponse = await request(
  'GET',
  `/xpert/${xpertId}/export?isDraft=true&includeMemory=false&data=${encodeURIComponent('{}')}`
)
const exportedDraftValue = exportedResponse?.data ?? exportedResponse
const exportedDraft = typeof exportedDraftValue === 'string'
  ? YAML.parse(exportedDraftValue)
  : exportedDraftValue
const desiredAgent = assistantDsl.nodes.find((node) => node.type === 'agent' && node.key === 'Agent_Img2ThreeJs')
if (!Array.isArray(exportedDraft?.nodes)) {
  throw new Error(`ASSISTANT_DRAFT_SHAPE_UNEXPECTED:${JSON.stringify({
    responseKeys: Object.keys(exportedResponse ?? {}),
    dataKeys: Object.keys(exportedDraft ?? {})
  })}`)
}
const draftAgent = exportedDraft.nodes.find((node) => node.type === 'agent' && node.key === 'Agent_Img2ThreeJs')
if (!desiredAgent?.entity?.prompt || !draftAgent?.entity) throw new Error('ASSISTANT_AGENT_NODE_NOT_FOUND')
draftAgent.entity.prompt = desiredAgent.entity.prompt
draftAgent.hash = desiredAgent.hash
exportedDraft.team.copilotModel = {
  copilotId: '6cf9e2ec-e402-42cf-af80-e0b6e5a0fe18',
  referencedId: null,
  modelType: 'llm',
  model: 'kimi-k2.5',
  options: {
    context_size: 262144,
    temperature: 0.1,
    maxRetries: 4,
    max_tokens: 24000
  }
}
if (draftAgent.entity.copilotModel) {
  draftAgent.entity.copilotModel = { ...exportedDraft.team.copilotModel }
}
const desiredContextCompression = assistantDsl.nodes.find(
  (node) => node.type === 'workflow' && node.key === 'Middleware_Img2ThreeJsContextCompression'
)
const desiredContextConnection = assistantDsl.connections.find(
  (connection) => connection.key === 'Agent_Img2ThreeJs/Middleware_Img2ThreeJsContextCompression'
)
const desiredSandboxShell = assistantDsl.nodes.find(
  (node) => node.type === 'workflow' && node.key === 'Middleware_Img2ThreeJsShell'
)
const desiredSandboxShellConnection = assistantDsl.connections.find(
  (connection) => connection.key === 'Agent_Img2ThreeJs/Middleware_Img2ThreeJsShell'
)
if (!desiredContextCompression || !desiredContextConnection || !desiredSandboxShell || !desiredSandboxShellConnection) {
  throw new Error('ASSISTANT_CONTEXT_COMPRESSION_TEMPLATE_MISSING')
}
const contextNodeIndex = exportedDraft.nodes.findIndex(
  (node) => node.type === 'workflow' && node.key === desiredContextCompression.key
)
if (contextNodeIndex >= 0) exportedDraft.nodes[contextNodeIndex] = desiredContextCompression
else exportedDraft.nodes.push(desiredContextCompression)
const sandboxShellNodeIndex = exportedDraft.nodes.findIndex(
  (node) => node.type === 'workflow' && node.key === desiredSandboxShell.key
)
if (sandboxShellNodeIndex >= 0) exportedDraft.nodes[sandboxShellNodeIndex] = desiredSandboxShell
else exportedDraft.nodes.push(desiredSandboxShell)
exportedDraft.connections = Array.isArray(exportedDraft.connections) ? exportedDraft.connections : []
const contextConnectionIndex = exportedDraft.connections.findIndex(
  (connection) => connection.key === desiredContextConnection.key
)
if (contextConnectionIndex >= 0) exportedDraft.connections[contextConnectionIndex] = desiredContextConnection
else exportedDraft.connections.push(desiredContextConnection)
const sandboxShellConnectionIndex = exportedDraft.connections.findIndex(
  (connection) => connection.key === desiredSandboxShellConnection.key
)
if (sandboxShellConnectionIndex >= 0) {
  exportedDraft.connections[sandboxShellConnectionIndex] = desiredSandboxShellConnection
} else {
  exportedDraft.connections.push(desiredSandboxShellConnection)
}
const connectedMiddlewareKeys = exportedDraft.connections
  .filter((connection) => connection.type === 'workflow' && connection.from === 'Agent_Img2ThreeJs')
  .map((connection) => connection.to)
draftAgent.entity.options = {
  ...(draftAgent.entity.options ?? {}),
  middlewares: {
    ...(draftAgent.entity.options?.middlewares ?? {}),
    order: [
      'Middleware_Img2ThreeJsContextCompression',
      'Middleware_Img2ThreeJsFiles',
      'Middleware_Img2ThreeJsShell',
      ...connectedMiddlewareKeys.filter((key) => ![
        'Middleware_Img2ThreeJsContextCompression',
        'Middleware_Img2ThreeJsFiles',
        'Middleware_Img2ThreeJsShell',
        'Middleware_Img2ThreeJs'
      ].includes(key)),
      'Middleware_Img2ThreeJs'
    ]
  }
}
exportedDraft.team.agentConfig = assistantDsl.team.agentConfig
const savedDraftResponse = await request('PUT', `/xpert/${xpertId}/draft`, exportedDraft)
const savedDraft = savedDraftResponse?.data ?? savedDraftResponse
if (!savedDraft?.nodes?.some?.((node) => node.type === 'agent' && node.entity?.prompt?.includes('normal progressive-disclosure workflow')) ||
    !savedDraft?.nodes?.some?.((node) => node.key === 'Middleware_Img2ThreeJsContextCompression' && node.entity?.provider === 'ContextCompressionMiddleware') ||
    !savedDraft?.nodes?.some?.((node) => node.key === 'Middleware_Img2ThreeJsShell' && node.entity?.provider === 'SandboxShell')) {
  throw new Error('SAVED_ASSISTANT_DRAFT_VERIFICATION_FAILED')
}

const xpertResponse = await request('GET', `/xpert/${xpertId}`)
const xpert = xpertResponse?.data ?? xpertResponse
let environmentId = xpert.environmentId ?? xpert.environment?.id ?? xpert.publishEnvironmentId ?? ''
if (!environmentId) {
  const environmentResponse = await request('GET', `/environment/default/${workspaceId}`)
  const environment = environmentResponse?.data ?? environmentResponse
  environmentId = environment?.id ?? ''
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(environmentId)) {
  throw new Error(`DEFAULT_ENVIRONMENT_NOT_FOUND:${JSON.stringify({ environmentId: environmentId || null })}`)
}
const publishResponse = await request('POST', `/xpert/${xpertId}/publish?newVersion=false`, {
  environmentId,
  releaseNotes: 'Keep caller-managed concurrency fields removed, compress long modeling context, and route persistent source build failures to autonomous diagnostic-driven code refinement instead of retrying immutable code.'
})
const published = publishResponse?.data ?? publishResponse

const installedSkill = await request(
  'GET',
  `/skill-package/workspace/${workspaceId}/${skillId}/file?path=${encodeURIComponent('SKILL.md')}`
)
const publishedExportResponse = await request(
  'GET',
  `/xpert/${xpertId}/export?isDraft=false&includeMemory=false&data=${encodeURIComponent('{}')}`
)
const publishedValue = publishedExportResponse?.data ?? publishedExportResponse
const publishedDsl = typeof publishedValue === 'string' ? YAML.parse(publishedValue) : publishedValue
const publishedAgent = publishedDsl?.nodes?.find?.((node) => node.type === 'agent' && node.key === 'Agent_Img2ThreeJs')
const publishedContextCompression = publishedDsl?.nodes?.find?.(
  (node) => node.key === 'Middleware_Img2ThreeJsContextCompression'
)
const publishedSandboxShell = publishedDsl?.nodes?.find?.(
  (node) => node.key === 'Middleware_Img2ThreeJsShell'
)
const installedSkillText = typeof installedSkill === 'string' ? installedSkill : JSON.stringify(installedSkill)
if (!installedSkillText.includes('preferred bounded transport for a diagnostic-only')) {
  throw new Error('INSTALLED_SKILL_VERIFICATION_FAILED')
}
if (!publishedAgent?.entity?.prompt?.includes('normal progressive-disclosure workflow')) {
  throw new Error(`PUBLISHED_ASSISTANT_VERIFICATION_FAILED:${JSON.stringify({
    keys: Object.keys(publishedDsl ?? {}),
    nodes: publishedDsl?.nodes?.map?.((node) => ({ type: node.type, key: node.key, entityKey: node.entity?.key })) ?? [],
    phraseAnywhere: JSON.stringify(publishedDsl ?? {}).includes('normal progressive-disclosure workflow'),
    publishResponsePhrase: JSON.stringify(published ?? {}).includes('normal progressive-disclosure workflow'),
    publishResponse,
    environmentId: environmentId || null
  })}`)
}
if (publishedAgent?.entity?.options?.middlewares?.order?.at?.(-1) !== 'Middleware_Img2ThreeJs') {
  throw new Error(`PUBLISHED_ASSISTANT_STATE_FILTER_NOT_LAST:${JSON.stringify(
    publishedAgent?.entity?.options?.middlewares?.order ?? null
  )}`)
}
if (publishedDsl?.team?.copilotModel?.model !== 'kimi-k2.5') {
  throw new Error('PUBLISHED_ASSISTANT_ACCEPTANCE_MODEL_MISMATCH')
}
if (publishedContextCompression?.entity?.provider !== 'ContextCompressionMiddleware') {
  throw new Error('PUBLISHED_ASSISTANT_CONTEXT_COMPRESSION_MISSING')
}
if (publishedSandboxShell?.entity?.provider !== 'SandboxShell') {
  throw new Error('PUBLISHED_ASSISTANT_SANDBOX_SHELL_MISSING')
}
if (!installedSkillText.includes('at or below 8,000 characters')) {
  throw new Error('INSTALLED_SKILL_BOUNDED_FILE_TRANSPORT_VERIFICATION_FAILED')
}
if (!installedSkillText.includes('non-empty `error` field is a failed operation')) {
  throw new Error('INSTALLED_SKILL_FILE_ERROR_SEMANTICS_VERIFICATION_FAILED')
}
if (publishedAgent?.entity?.prompt?.includes('first call read_skill_file')) {
  throw new Error('PUBLISHED_ASSISTANT_SKILL_READ_GATE_PRESENT')
}
const removedConcurrencyFields = /\b(?:baseRevision|expectedRevision|runRevision|projectRevision)\b/
if (removedConcurrencyFields.test(installedSkillText)) {
  throw new Error('INSTALLED_SKILL_CALLER_MANAGED_CONCURRENCY_FIELD_PRESENT')
}
if (removedConcurrencyFields.test(publishedAgent?.entity?.prompt ?? '')) {
  throw new Error('PUBLISHED_ASSISTANT_CALLER_MANAGED_CONCURRENCY_FIELD_PRESENT')
}
if (!installedSkillText.includes('model-spec-<specVersionId>.ts')) {
  throw new Error('INSTALLED_SKILL_IMMUTABLE_SPEC_PATH_MISSING')
}
if (!installedSkillText.includes('read_visual_diagnostics_then_refine_code')) {
  throw new Error('INSTALLED_SKILL_BUILD_FAILURE_ROUTING_MISSING')
}

process.stdout.write(JSON.stringify({
  skillUpdated: true,
  promptUpdated: savedDraft?.nodes?.some?.((node) => node.type === 'agent' && node.entity?.prompt?.includes('normal progressive-disclosure workflow')) ?? true,
  published: Boolean(published),
  installedSkillVerified: true,
  publishedPromptVerified: true,
  contextCompressionEnabled: true,
  sandboxShellEnabled: true,
  environmentId: environmentId || null
}) + '\n')
