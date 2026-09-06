import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import workbench, { platformRoot } from '../factory-operations-center/preview.config.mjs'
export { platformRoot }
const root = dirname(fileURLToPath(import.meta.url))

// UI fixtures only. Durable continuation and authorization are tested against PostgreSQL.
export default {
  ...workbench,
  title: 'Assistant Profile · Factory Operations',
  instanceId: 'factory-assistant-profile-preview',
  component: { root, runtime: 'react', title: 'Assistant Profile' },
  hostContext: { ...workbench.hostContext, manifest: { key: 'factory-assistant-needs-attention' } },
  state: { stage: 1, actions: [], commands: [], requestDataCount: 0, failNextAction: false },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      const fixture = await workbench.handleRequest(message, { state })
      const item = { ...fixture.data.selectedCase, title: fixture.data.selectedCase.event.title, updatedAt: '2026-09-03T09:00:00.000Z',
        continuation: null, bindingNeedsRepair: false,
        allowedActions: state.stage === 1 ? ['approve_and_continue', 'reject_recovery_plan'] : [] }
      return { data: { items: [item], item: message.query?.selectionId ? item : null,
        total: 1, page: 1, pageSize: 10, simulation: true } }
    }
    if (message.type === 'invokeClientCommand') {
      state.commands.push({ key: message.commandKey, payload: message.payload })
      return { result: { success: true } }
    }
    if (message.type === 'executeAction') {
      state.actions.push({ actionKey: message.actionKey, input: structuredClone(message.input) })
      if (state.failNextAction) { state.failNextAction = false; throw new Error('Temporary connection failure') }
      state.stage = message.actionKey === 'reject_recovery_plan' ? 5 : 2
      return { result: { success: true, refresh: true, data: { continuation: { id: 'preview-only', status: 'pending' } } } }
    }
    throw new Error(`Unexpected request: ${message.type}`)
  }
}
