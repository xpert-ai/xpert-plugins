import '@xpert-ai/plugin-sdk'

declare module '@xpert-ai/plugin-sdk' {
  export interface ISSOProviderDescriptor {
    provider: string
    displayName: string
    icon: string
    order: number
    startUrl: string
  }

  export interface ISSOProviderContext {
    tenantId: string
    organizationId?: string | null
    requestBaseUrl: string
  }

  export interface ISSOProviderStrategy {
    describe(
      context: ISSOProviderContext
    ): ISSOProviderDescriptor | null | Promise<ISSOProviderDescriptor | null>
  }

  export const SSO_PROVIDER: string
  export const SSOProviderStrategyKey: (provider: string) => ClassDecorator

  export const ACCOUNT_BINDING_PERMISSION_SERVICE_TOKEN: string
  export interface BindCurrentUserInput {
    provider: string
    subjectId: string
    profile?: Record<string, any>
  }
  export interface ResolveBoundUserInput {
    provider: string
    subjectId: string
  }
  export interface BoundIdentityRef {
    provider: string
    subjectId: string
  }
  export interface AccountBindingPermissionService {
    bindCurrentUser(input: BindCurrentUserInput): Promise<BoundIdentityRef>
    resolveBoundUser<TUser = any>(input: ResolveBoundUserInput): Promise<TUser | null>
    unbindCurrentUser(provider: string): Promise<void>
  }

  export interface IssuedAuthTokens {
    jwt: string
    refreshToken: string
    userId: string
  }

  export const BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN: string
  export interface BoundIdentityLoginInput {
    provider: string
    subjectId: string
    tenantId: string
    organizationId?: string | null
  }
  export interface BoundIdentityLoginPermissionService {
    loginWithBoundIdentity(input: BoundIdentityLoginInput): Promise<IssuedAuthTokens | null>
  }

  export const SSO_BINDING_PERMISSION_SERVICE_TOKEN: string
  export type PendingSsoBindingFlow = 'anonymous_bind' | 'current_user_confirm'
  export interface CreatePendingBindingInput {
    provider: string
    subjectId: string
    tenantId: string
    organizationId?: string | null
    displayName?: string | null
    avatarUrl?: string | null
    profile?: Record<string, any> | null
    returnTo?: string | null
    flow?: PendingSsoBindingFlow
  }
  export interface CreatedPendingBindingRef {
    ticket: string
  }
  export interface SsoBindingPermissionService {
    createPendingBinding(input: CreatePendingBindingInput): Promise<CreatedPendingBindingRef>
  }
}

export {}
