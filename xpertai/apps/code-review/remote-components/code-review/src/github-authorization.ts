import { command } from './bridge'

const errors = new Map([
  ['connector_auth_method_unavailable', 'github_oauth_unavailable'],
  ['connector_integration_unsupported', 'github_oauth_unavailable'],
  ['connector_integration_unavailable', 'github_integration_unavailable'],
  ['connector_connection_mismatch', 'github_integration_mismatch']
])

/** GitHub policy stays in the plugin; the host enforces only declared Connector constraints. */
export async function connectGitHubAccount(integrationId?: string | null, invoke = command) {
  try {
    return await invoke('workspace.connector.connect', {
      provider: 'github',
      ...(integrationId ? { authMethodId: 'github-app-oauth', integrationId } : {})
    })
  } catch (error) {
    const code = error instanceof Error ? errors.get(error.message) : undefined
    if (code) throw new Error(code)
    throw error
  }
}
