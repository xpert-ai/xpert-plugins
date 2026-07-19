import {
  buildLarkCardActionJobId,
  buildLarkGroupWindowFlushJobId,
  buildLarkHistoryCleanupJobId,
  buildLarkHistoryMaterializeJobId,
  buildLarkInboundJobId
} from './lark-job-id.js'

describe('Lark queue job ids', () => {
  it('builds deterministic colon-free ids for every Lark queue path', () => {
    const buildAll = () => [
      buildLarkHistoryCleanupJobId('integration:1', '2026-07-16', 4),
      buildLarkHistoryMaterializeJobId('integration:1', ['log:1', 'log:2']),
      buildLarkInboundJobId('log:1'),
      buildLarkCardActionJobId('scope:1', 'xpert:1', 'approve:now', 'message:1'),
      buildLarkGroupWindowFlushJobId('lark:mention-window:integration:1:chat:1')
    ]

    const first = buildAll()
    expect(buildAll()).toEqual(first)
    for (const jobId of first) {
      expect(jobId).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(jobId).not.toContain(':')
    }
  })
})
