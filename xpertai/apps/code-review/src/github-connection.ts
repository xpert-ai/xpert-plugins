import { z } from 'zod/v3'

// Only public account identity crosses the remote view bridge.
export const githubConnectionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('connected'), login: z.string().trim().min(1), integrationId: z.string().uuid().optional() }),
  z.object({ status: z.literal('integration_mismatch') }),
  z.object({ status: z.literal('disconnected') }),
  z.object({ status: z.literal('unavailable') })
])
export type GitHubConnection = z.infer<typeof githubConnectionSchema>
