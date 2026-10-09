import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { actionOutcome, viewData } from '../src/lib/remote-components/support-ticket/src/utils'

/**
 * The workbench reads two different envelopes from the host bridge:
 * - `executeAction` resolves with `result = { success, message, refresh, data }`
 * - `requestData` resolves with the view payload on `data`
 * These fixtures mirror that protocol so a host change breaks this test instead of the UI.
 */
describe('remote component bridge contract', () => {
  it('reads the plugin payload of an action result from result.data', () => {
    const outcome = actionOutcome({
      type: 'response',
      requestId: '1',
      result: {
        success: true,
        message: { en_US: 'Ticket submitted', zh_Hans: '工单已提交' },
        refresh: true,
        data: {
          ticketId: 'ticket-1',
          ticketNo: 'ST-20260921-0001',
          duplicated: false,
          clientCommand: { commandKey: 'assistant.chat.send_message', payload: { text: '请处理工单 ST-20260921-0001' } }
        }
      }
    })

    assert.equal(outcome.success, true)
    assert.equal(outcome.data.ticketId, 'ticket-1')
    assert.equal(outcome.data.clientCommand.commandKey, 'assistant.chat.send_message')
  })

  it('surfaces the machine readable failure code of a rejected action', () => {
    const outcome = actionOutcome({
      type: 'response',
      result: {
        success: false,
        message: { en_US: 'Ticket was modified by someone else', zh_Hans: '工单已被其他人修改' },
        data: { code: 'revision_conflict' }
      }
    })

    assert.equal(outcome.success, false)
    assert.equal(outcome.code, 'revision_conflict')
  })

  it('treats a missing result wrapper as a failure code free outcome', () => {
    const outcome = actionOutcome({ type: 'response' })
    assert.equal(outcome.success, true)
    assert.equal(outcome.code, undefined)
    assert.deepEqual(outcome.data, {})
  })

  it('reads view data from the data envelope', () => {
    const data = viewData({
      type: 'response',
      data: { items: [{ id: 'ticket-1' }], total: 1, summary: { stats: { confirmed: 0 } } }
    })

    assert.equal((data as { total: number }).total, 1)
    assert.equal((data as { items: Array<{ id: string }> }).items[0].id, 'ticket-1')
  })
})
