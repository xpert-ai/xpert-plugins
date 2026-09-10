import { describe, expect, it } from 'vitest'
import { assistantLaunchFailureSummary } from './task.service.js'

describe('assistantLaunchFailureSummary', () => {
  it('includes the concrete exception name and message', () => {
    expect(
      assistantLaunchFailureSummary(
        new Error('Copilot model is not available for the current membership plan.'),
      ),
    ).toBe(
      '平台未能启动助理任务：Error: Copilot model is not available for the current membership plan.',
    )
  })

  it('removes control characters and bounds persisted output', () => {
    const summary = assistantLaunchFailureSummary(`bad\n${'x'.repeat(800)}`)
    expect(summary).not.toContain('\n')
    expect(summary.length).toBeLessThanOrEqual(
      '平台未能启动助理任务：'.length + 500,
    )
  })

  it('does not serialize unknown objects', () => {
    expect(assistantLaunchFailureSummary({ token: 'secret' })).toBe(
      '平台未能启动助理任务：未知平台错误',
    )
  })
})
