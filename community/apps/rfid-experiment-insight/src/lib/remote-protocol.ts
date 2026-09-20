import type { XpertViewActionResult, XpertViewDataResult } from '@xpert-ai/contracts'

// Shared transport contract for the ViewProvider bootstrap, Remote Component and mock host.
// Use the platform envelope's explicit `type`, never payload-shape heuristics.
export const RFID_REMOTE_PROTOCOL = {
  channel: 'xpertai.remote_component', protocolVersion: 1,
  responses: {
    requestData: 'data', executeAction: 'actionResult', executeFileAction: 'fileActionResult',
    invokeClientCommand: 'clientCommandResult'
  }
} as const
export type RfidRemoteResponse =
  | { type: 'data'; data: XpertViewDataResult }
  | { type: 'actionResult'; result: XpertViewActionResult }
  | { type: 'fileActionResult'; result: XpertViewActionResult }
  | { type: 'clientCommandResult'; result: { success: boolean; message?: string } }
  | { type: 'error'; message: string }
