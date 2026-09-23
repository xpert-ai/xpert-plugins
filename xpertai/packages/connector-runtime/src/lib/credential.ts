import type {
  ConnectorConnectInput, ConnectorConnectResult, ConnectorCredential,
  ConnectorProfile, ConnectorRuntimeCredentialResolveInput
} from '@xpert-ai/plugin-sdk/connector'

export type CredentialDriverOptions<T extends Record<string, unknown>, V = void> = {
  kind: 'api_key' | 'mail_protocol'
  authMethodId: string
  assertAuthMethod?: (id: string) => void
  parse: (values: Record<string, unknown> | undefined) => T
  parseStored?: (values: Record<string, unknown>) => T
  verify: (credential: T) => Promise<V>
  scopes?: string[]
  profile?: (credential: T, verification: V) => ConnectorProfile
}

/** Authentication only. The host continues to own the vault, accounts and grants. */
export function createCredentialDriver<T extends Record<string, unknown>, V = void>(options: CredentialDriverOptions<T, V>) {
  const assertMethod = (id: string) => {
    if (options.assertAuthMethod) options.assertAuthMethod(id)
    if (id !== options.authMethodId) throw new Error(`Unsupported connector authentication method '${id}'`)
  }
  return {
    kind: options.kind,
    async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
      assertMethod(input.authMethodId)
      const data = options.parse(input.values)
      const verification = await options.verify(data)
      const credential: ConnectorCredential = { data }
      if (options.scopes) credential.scopes = [...options.scopes]
      if (options.profile) credential.profile = options.profile(data, verification)
      return { status: 'active', credential }
    },
    resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput): T {
      assertMethod(input.authMethodId)
      return (options.parseStored ?? options.parse)(input.credential.data)
    }
  }
}
