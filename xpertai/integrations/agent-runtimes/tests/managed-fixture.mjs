export function managedTarget(provider) {
  return {
    provider,
    reference: `managed-${provider}`,
    configuration: {
      profileVersion: '1',
      executionEnvironment: { type: 'computer' },
      managedRuntime: { type: 'builtin', version: '1' }
    }
  }
}
export const managedOptions = [{ provider: 'codex-computer', reference: 'managed-codex-computer', title: 'Codex' }]

export function directTarget(provider) {
  const type = provider === 'claude-code' ? 'sdk' : provider === 'opencode' ? 'service' : 'process'
  return {
    ...managedTarget(provider),
    reference: provider === 'opencode' ? 'managed-opencode-service' : `managed-${provider}`,
    configuration: {
      ...managedTarget(provider).configuration,
      executionEnvironment: { type },
      deploymentRevision: 'deployment-1'
    }
  }
}

export function directCapabilities(provider, workspaceId, workspaceRoot, settings = {}) {
  return {
    require: (capability) => {
      if (capability.id !== 'platform.agent_runtime.deployment') throw Error('Unexpected capability')
      return {
        resolve: async () => ({
          provider,
          type: directTarget(provider).configuration.executionEnvironment.type,
          revision: 'deployment-1',
          workspaceRoot,
          environment: {},
          timeoutMs: 600000,
          ...settings
        })
      }
    }
  }
}
