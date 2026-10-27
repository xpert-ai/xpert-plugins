import { Injectable } from '@nestjs/common'
import {
  managedAgentRuntimeSchema,
  AgentRuntimeDeploymentCapability,
  type AgentRuntimeDeployment,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeStart,
  type ManagedAgentRuntimeProfile
} from '@xpert-ai/plugin-sdk'
import { agentPrompt } from './input.js'

const presets = [
  { provider: 'codex-computer', title: 'Codex', toolName: 'delegate_codex' },
  { provider: 'claude-computer', title: 'Claude Code', toolName: 'delegate_claude' },
  { provider: 'qwen-computer', title: 'Qwen Code', toolName: 'delegate_qwen' },
  { provider: 'codebuddy-computer', title: 'CodeBuddy', toolName: 'delegate_codebuddy' },
  { provider: 'kimi-computer', title: 'Kimi Code', toolName: 'delegate_kimi' },
  { provider: 'opencode', title: 'OpenCode (Computer)', toolName: 'delegate_opencode' },
  { provider: 'codex', title: 'Codex (App Server)', toolName: 'delegate_codex_server', environment: 'process' },
  { provider: 'pi', title: 'Pi', toolName: 'delegate_pi', environment: 'process' },
  { provider: 'claude-code', title: 'Claude Code (SDK)', toolName: 'delegate_claude_sdk', environment: 'sdk' },
  {
    provider: 'opencode',
    title: 'OpenCode (Service)',
    toolName: 'delegate_opencode_service',
    environment: 'service',
    reference: 'managed-opencode-service'
  }
] as const

export type RuntimeProvider = (typeof presets)[number]['provider']
export interface RuntimeProfile {
  id: string
  provider: RuntimeProvider
  version: string
  executionEnvironment: ManagedAgentRuntimeProfile['environment']
  deploymentRevision?: string
}

/** Presets describe execution; the host checks actor access before resolving a binding. */
@Injectable()
export class RuntimeProfiles {
  managedProfiles(provider: RuntimeProvider): ManagedAgentRuntimeProfile[] {
    return presets
      .filter((preset) => preset.provider === provider)
      .map((preset) => ({
        reference: 'reference' in preset ? preset.reference : `managed-${provider}`,
        version: '1',
        title: preset.title,
        toolName: preset.toolName,
        environment: 'environment' in preset ? preset.environment : 'computer',
        description: `Delegate a coding task to ${preset.title} using an authorized host-managed backend.`
      }))
  }

  private resolve(
    provider: RuntimeProvider,
    reference: unknown,
    marker: unknown,
    workspaceId?: string
  ): RuntimeProfile | undefined {
    const parsed = managedAgentRuntimeSchema.safeParse(marker)
    if (
      !workspaceId ||
      !parsed.success ||
      parsed.data.version !== '1' ||
      !this.managedProfiles(provider).some((item) => item.reference === reference)
    )
      return undefined
    const preset = this.managedProfiles(provider).find((item) => item.reference === reference)!
    return { id: preset.reference, provider, version: parsed.data.version, executionEnvironment: preset.environment }
  }

  receiptProfile(handle: AgentRuntimeHandle, context: AgentRuntimeContext, provider: RuntimeProvider) {
    if (handle.metadata?.workspaceId !== context.scope.workspaceId) return undefined
    const profile = this.resolve(
      provider,
      handle.metadata?.profileId,
      handle.metadata?.managedRuntime,
      context.scope.workspaceId
    )
    return profile
      ? {
          ...profile,
          ...(typeof handle.metadata?.deploymentRevision === 'string'
            ? { deploymentRevision: handle.metadata.deploymentRevision }
            : {})
        }
      : undefined
  }

  profile(request: AgentRuntimeStart, context: AgentRuntimeContext, provider: RuntimeProvider) {
    const profile = this.resolve(
      provider,
      request.target.reference,
      request.target.configuration.managedRuntime,
      context.scope.workspaceId
    )
    const environment = request.target.configuration.executionEnvironment
    if (
      !profile ||
      request.target.provider !== provider ||
      request.target.configuration.profileVersion !== profile.version ||
      !environment ||
      typeof environment !== 'object' ||
      Array.isArray(environment) ||
      environment.type !== profile.executionEnvironment
    )
      throw new Error('Managed runtime profile is unavailable')
    agentPrompt(request.input)
    if (request.input.files?.length) throw new Error('This runtime has no file materialization adapter')
    return {
      ...profile,
      ...(typeof request.target.configuration.deploymentRevision === 'string'
        ? { deploymentRevision: request.target.configuration.deploymentRevision }
        : {})
    }
  }

  async deployment(profile: RuntimeProfile, context: AgentRuntimeContext): Promise<AgentRuntimeDeployment> {
    const deployment = await context.capabilities.require(AgentRuntimeDeploymentCapability).resolve()
    if (
      profile.executionEnvironment === 'computer' ||
      deployment.provider !== profile.provider ||
      deployment.type !== profile.executionEnvironment ||
      deployment.revision !== profile.deploymentRevision
    )
      throw new Error('Managed runtime deployment is unavailable or changed')
    return deployment
  }
}
