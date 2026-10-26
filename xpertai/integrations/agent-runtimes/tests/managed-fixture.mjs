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
