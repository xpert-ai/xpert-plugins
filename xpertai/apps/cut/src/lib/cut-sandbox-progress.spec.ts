import type { SandboxJobSnapshot } from '@xpert-ai/plugin-sdk'
import { cutTaskProgress, cutTaskStage, readCutSandboxProgress } from './cut-sandbox-progress.js'

describe('Cut Sandbox progress compatibility', () => {
  it('maps Action progress into the render portion of a Cut task', () => {
    expect(cutTaskProgress(0)).toBe(20)
    expect(cutTaskProgress(0.5)).toBe(55)
    expect(cutTaskProgress(1)).toBe(90)
  })

  it('reads a structured progress snapshot without depending on the new SDK at compile time', () => {
    const snapshot: SandboxJobSnapshot & { progress: { progress: number; stage: string; current: number; total: number } } = {
      id: 'job-1',
      runtimeProfile: 'browser/test',
      sandboxRuntimeVersion: '1',
      action: 'cut.render-mp4',
      actionVersion: '1',
      status: 'running',
      attempt: 1,
      outputs: [],
      progress: { progress: 0.25, stage: 'rendering', current: 25, total: 100 }
    }
    expect(readCutSandboxProgress(snapshot)).toEqual({ progress: 0.25, stage: 'rendering', current: 25, total: 100 })
  })

  it('normalizes unknown Sandbox lifecycle stages for the Cut UI', () => {
    expect(cutTaskStage('encoding')).toBe('rendering')
    expect(cutTaskStage('complete')).toBe('complete')
  })
})
