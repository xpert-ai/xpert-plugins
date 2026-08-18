import { z } from 'zod/v3'

export const CODEXPERT_CONNECTOR_MIDDLEWARE_NAME = 'CodexpertConnector'
export const CODEXPERT_AGENT_KEY = 'codexpert'
export const CODEXPERT_XPERT_NAME = 'Codexpert'

export const CodexpertConnectorConfigSchema = z.object({
  codexpertMcpUrl: z.string().url().optional(),
  codexpertConnectorBaseUrl: z.string().url().optional(),
  serviceToken: z.string().trim().min(1).optional(),
  timeoutMs: z.number().int().positive().optional().default(600_000),
  enableVisibleProjection: z.boolean().optional().default(true),
  enableStatusEvents: z.boolean().optional().default(true),
  defaultXpertId: z.string().trim().min(1).optional(),
  defaultRepoId: z.string().trim().min(1).optional(),
  defaultConnectionId: z.string().trim().min(1).optional(),
  defaultBranchName: z.string().trim().min(1).optional()
})

export type CodexpertConnectorConfig = z.infer<typeof CodexpertConnectorConfigSchema>

export const RunCodexpertTaskInputSchema = z.object({
  prompt: z.string().trim().min(1),
  taskTitle: z.string().trim().min(1).optional(),
  codingSessionId: z.string().trim().min(1).optional(),
  conversationId: z.string().trim().min(1).optional(),
  threadId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  xpertId: z.string().trim().min(1).optional(),
  repoId: z.string().trim().min(1).optional(),
  connectionId: z.string().trim().min(1).optional(),
  branchName: z.string().trim().min(1).optional(),
  timeoutMs: z.number().int().positive().optional()
})

export type RunCodexpertTaskInput = z.infer<typeof RunCodexpertTaskInputSchema>

export type PrincipalContext = {
  tenantId: string
  organizationId: string
  userId: string
}

export type CodexpertConnectorEvent =
  | {
      type: 'status'
      text?: string
      headline?: string
      phase?: string
      isMilestone?: boolean
      details?: Record<string, unknown>
    }
  | {
      type: 'text_delta'
      text: string
      stream?: string
      tag?: string
    }
  | {
      type: 'tool_call_update'
      toolName?: string
      name?: string
      status?: string
      message?: string
      error?: string
    }
  | {
      type: 'done'
      status?: string
      summary?: string | null
      output?: string | null
      taskId?: string | null
      codingSessionId?: string | null
      threadId?: string | null
      executionId?: string | null
      environmentId?: string | null
      prUrl?: string | null
    }
  | {
      type: 'error'
      message: string
      phase?: string
      headline?: string
      taskId?: string | null
      codingSessionId?: string | null
      threadId?: string | null
      executionId?: string | null
      environmentId?: string | null
    }

export type CodexpertTaskResult = {
  status: 'success' | 'failed' | 'timeout' | 'canceled'
  codingSessionId: string | null
  taskId: string | null
  threadId: string | null
  executionId: string | null
  repo: {
    id?: string | null
    name?: string | null
    owner?: string | null
    slug?: string | null
  } | null
  branch: string | null
  environmentId: string | null
  environmentReused: boolean | null
  summary: string | null
  error: string | null
  prUrl?: string | null
}
