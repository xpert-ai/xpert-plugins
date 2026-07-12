import { presentationStudioTemplates } from './presentation-studio.templates.js'

describe('Presentation Studio assistant template', () => {
  it('instructs the agent to batch inspections and honor exact array item contracts', () => {
    const dsl = presentationStudioTemplates[0]?.dslContent ?? ''

    expect(dsl).toContain('accepts at most 8 layouts per call')
    expect(dsl.toLowerCase()).toContain('items may contain only allowedkeys')
    expect(dsl).toContain('presentation-studio-agent-v2')
  })
})
