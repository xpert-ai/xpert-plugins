import { createHash } from 'node:crypto'

// Mirrors the connected middleware configuration in the host's xpert-my-claw-xpert.yaml.
// Keep the role prompt separate; the host comparison test detects changes to this runtime preset.
const providers = [
  'ModelRetryMiddleware', 'scheduler', 'FileMemorySystemMiddleware', 'ContextCompressionMiddleware',
  'SandboxShell', 'SandboxFile', 'WebTools', 'todoListMiddleware', 'LoopGuardMiddleware',
  'ViewImageMiddleware', 'DanglingToolCallMiddleware', 'skillsMiddleware'
] as const

export function rolePluginDependencies() {
  return { plugins: [
    '@xpert-ai/plugin-file-memory', '@xpert-ai/plugin-dangling-tool-call', '@xpert-ai/plugin-view-image',
    '@xpert-ai/plugin-loop-guard', '@xpert-ai/plugin-web-tools', '@xpert-ai/plugin-model-retry'
  ] }
}

export function roleRuntime(agentKey: string) {
  const nodes = providers.map((provider, index) => {
    const key = `Middleware_${createHash('sha256').update(`${agentKey}:${provider}`).digest('hex').slice(0, 16)}`
    return {
      type: 'workflow' as const, key,
      position: { x: (index % 4) * 300, y: 220 + Math.floor(index / 4) * 140 },
      entity: { id: key, type: 'middleware' as const, key, title: provider, provider, required: true }
    }
  })
  return {
    nodes,
    connections: nodes.map((node) => ({ type: 'workflow' as const, key: `${agentKey}/${node.key}`, from: agentKey, to: node.key })),
    agentOptions: { vision: { enabled: true }, middlewares: { order: nodes.map((node) => node.key) } },
    features: { sandbox: { enabled: true, provider: 'nsjail' } },
    agentConfig: { recursionLimit: 1000 }
  }
}
