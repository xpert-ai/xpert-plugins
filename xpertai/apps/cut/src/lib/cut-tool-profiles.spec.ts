import { CUT_MIDDLEWARE_TOOL_NAMES } from './constants.js'
import { CUT_DETAIL_READS, CUT_TOOL_PROFILES, cutProfileTools, cutExecutionSchema } from './cut-tool-profiles.js'

describe('Cut profiles', () => {
  it('assigns all 43 MCP operations once and retains seven detail reads internally', () => {
    const mapped = CUT_TOOL_PROFILES.flatMap((profile) => profile.tools)
    expect(new Set(mapped).size).toBe(43)
    expect(mapped).toHaveLength(43)
    expect(new Set([...mapped, ...CUT_DETAIL_READS])).toEqual(new Set(CUT_MIDDLEWARE_TOOL_NAMES))
    expect(cutProfileTools('base')).toHaveLength(4)
    expect(cutProfileTools('base')).not.toContain('cut_report_failure')
  })
  it('keeps write groups separate and recovery available without stage state', () => {
    expect(cutProfileTools('timeline-visual')).toHaveLength(4)
    expect(cutProfileTools('export-video')).toEqual(['cut_start_headless_export'])
    expect(cutProfileTools('version-finalize')).toEqual(['cut_finalize_version'])
    expect(cutProfileTools('proposal-undo')).toEqual(['cut_revert_edit_proposal'])
    expect(cutProfileTools('task-control')).toEqual(['cut_cancel_analysis_job'])
    expect(cutProfileTools('detail-reads')).toContain('cut_get_analysis_job')
    expect(cutProfileTools('detail-reads')).toContain('cut_get_edit_proposal')
  })
  it('rejects unknown operations and profiles at the gateway boundary', () => {
    expect(cutExecutionSchema.safeParse({ profile: 'base', operation: 'cut_save_project', arguments: {} }).success).toBe(false)
    expect(cutExecutionSchema.safeParse({ profile: 'all', operation: 'cut_list_tracks', arguments: {} }).success).toBe(false)
  })
})
