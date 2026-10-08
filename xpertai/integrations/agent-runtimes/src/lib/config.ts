import { z } from 'zod'

export const ProfileSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    provider: z.enum(['codex', 'codex-computer', 'qwen-computer', 'codebuddy-computer', 'claude-computer', 'kimi-computer', 'pi', 'claude-code', 'opencode']),
    version: z.string().min(1),
    workspaceIds: z.array(z.string().uuid()).min(1),
    workspaceRoot: z.string().min(1).optional(),
    executionEnvironment: z.literal('computer').optional(),
    /** An administrator-managed isolated runner, never a model-supplied command. */
    command: z.string().min(1).optional(),
    args: z.array(z.string()).default([]),
    environmentKeys: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).default([]),
    serverUrl: z.string().url().optional(),
    authorizationEnvironmentKey: z.string().optional(),
    model: z.string().optional(),
    timeoutMs: z.number().int().min(1000).max(3600000).default(600000)
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (profile.executionEnvironment && !['opencode', 'codex-computer', 'qwen-computer', 'codebuddy-computer', 'claude-computer', 'kimi-computer'].includes(profile.provider))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provider does not support managed Computer execution', path: ['executionEnvironment'] })
    if (['codex-computer', 'qwen-computer', 'codebuddy-computer', 'claude-computer', 'kimi-computer'].includes(profile.provider) && profile.executionEnvironment !== 'computer')
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'This provider requires the managed Computer environment', path: ['executionEnvironment'] })
    if (!profile.executionEnvironment && !profile.workspaceRoot)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A managed workspace root is required', path: ['workspaceRoot'] })
    if (profile.executionEnvironment && (profile.command || profile.serverUrl || profile.args.length || profile.environmentKeys.length || profile.authorizationEnvironmentKey))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Computer runner settings are resolved by the host', path: ['executionEnvironment'] })
    if ((profile.executionEnvironment || ['pi', 'opencode'].includes(profile.provider)) && profile.model)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Configure the model in the managed runner or OpenCode server',
        path: ['model']
      })
    if (['codex', 'pi'].includes(profile.provider) && !profile.executionEnvironment && !profile.command)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A managed runner command is required', path: ['command'] })
    if (profile.provider === 'opencode' && !profile.executionEnvironment && !profile.serverUrl)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A managed server URL is required', path: ['serverUrl'] })
  })
export const ConfigSchema = z
  .object({ profiles: z.array(ProfileSchema).default([]) })
  .strict()
  .refine(
    (config) => new Set(config.profiles.map((profile) => profile.id)).size === config.profiles.length,
    'Profile IDs must be unique'
  )
export type RuntimeProfile = z.infer<typeof ProfileSchema>
export type RuntimeConfiguration = z.infer<typeof ConfigSchema>
export const RUNTIME_CONFIGURATION = 'XPERT_AGENT_RUNTIME_CONFIGURATION'
