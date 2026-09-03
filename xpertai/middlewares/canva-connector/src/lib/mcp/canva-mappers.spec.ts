import { mapCandidateList, mapDesign, mapDesignList } from './canva-mappers.js'

describe('Canva MCP response mappers', () => {
  it('returns allowlisted design fields without thumbnail URLs', () => {
    const result = mapDesign({
      id: 'design-1',
      title: 'Quarterly plan',
      thumbnail_url: 'https://private.example/image.png',
      unexpected: 'not exposed'
    })

    expect(result).toEqual({
      id: 'design-1',
      title: 'Quarterly plan',
      type: null,
      status: null,
      updatedAt: null,
      hasThumbnail: true
    })
    expect(JSON.stringify(result)).not.toContain('private.example')
  })

  it('bounds list and candidate responses', () => {
    const designs = mapDesignList({ items: Array.from({ length: 80 }, (_, index) => ({ id: `design-${index}` })) }, 1, 50)
    const candidates = mapCandidateList({ candidates: Array.from({ length: 30 }, (_, index) => ({ id: `candidate-${index}` })) })

    expect(designs.items).toHaveLength(50)
    expect(designs.hasMore).toBe(true)
    expect(candidates.items).toHaveLength(20)
  })

  it('maps the nested async generate-design response and preserves its job ID', () => {
    const result = mapCandidateList({
      job: {
        id: 'job_EXAMPLE',
        status: 'success',
        result: {
          generated_designs: [
            { candidate_id: 'dg-1', url: 'https://www.canva.cn/design/dg-1', thumbnails: [{ url: 'https://www.canva.cn/thumb/dg-1' }] },
            { candidate_id: 'dg-2', thumbnails: [] }
          ]
        }
      }
    })

    expect(result).toEqual({
      jobId: 'job_EXAMPLE',
      status: 'success',
      selectionMode: 'candidate_id',
      items: [
        { index: 1, candidateId: 'dg-1', title: null, description: null, openUrl: 'https://www.canva.cn/design/dg-1', hasPreview: true },
        { index: 2, candidateId: 'dg-2', title: null, description: null, openUrl: null, hasPreview: false }
      ]
    })
  })

  it('maps Canva China design compositions to safe open links', () => {
    expect(mapCandidateList({
      job: {
        id: 'job-cn',
        status: 'success',
        result: {
          design_compositions: [
            { url: 'https://www.canva.cn/design/one', thumbnail: { url: 'https://www.canva.cn/thumb/one' } },
            { url: 'https://khsj.cn/short-two', thumbnail: { url: 'https://www.canva.cn/thumb/two' } },
            { url: 'https://attacker.example/design/three', thumbnail: { url: 'https://attacker.example/thumb/three' } }
          ]
        }
      }
    })).toEqual({
      jobId: 'job-cn',
      status: 'success',
      selectionMode: 'open_url',
      items: [
        { index: 1, candidateId: null, title: null, description: null, openUrl: 'https://www.canva.cn/design/one', hasPreview: true },
        { index: 2, candidateId: null, title: null, description: null, openUrl: 'https://khsj.cn/short-two', hasPreview: true },
        { index: 3, candidateId: null, title: null, description: null, openUrl: null, hasPreview: true }
      ]
    })
  })
})
