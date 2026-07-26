import {
  createStoryProjectSchema,
  reportStoryFailureSchema,
  searchStoryProjectsSchema,
  updateStoryProjectSchema
} from './story-agent-tool.schemas.js'

const projectId = 'a67dfaf5-f3bc-44c6-b3be-e2f01135b7c1'

describe('Story Studio Agent tool schemas', () => {
  it('accepts a bounded project create contract', () => {
    expect(
      createStoryProjectSchema.parse({
        operationId: 'create:project:001',
        title: 'Moonlit Courier',
        premise: 'A courier delivers memories across a flooded city.',
        productionFormat: 'vertical_short',
        aspectRatio: '9:16',
        targetDurationSeconds: 90,
        tags: ['fantasy', 'short'],
        changeSummary: 'Created the approved project brief'
      })
    ).toMatchObject({
      title: 'Moonlit Courier',
      productionFormat: 'vertical_short'
    })
  })

  it('rejects unknown fields and unbounded pagination', () => {
    expect(() =>
      createStoryProjectSchema.parse({
        operationId: 'create:project:002',
        title: 'Unsafe',
        changeSummary: 'Attempted unsafe create',
        arbitraryPayload: { accepted: true }
      })
    ).toThrow()
    expect(() =>
      searchStoryProjectsSchema.parse({ pageSize: 51 })
    ).toThrow()
  })

  it('requires a revision and at least one field for updates', () => {
    expect(() =>
      updateStoryProjectSchema.parse({
        projectId,
        operationId: 'update:project:001',
        baseRevision: 1,
        changeSummary: 'No actual change'
      })
    ).toThrow('At least one project field must change.')
    expect(() =>
      updateStoryProjectSchema.parse({
        projectId,
        operationId: 'update:project:002',
        title: 'Missing revision',
        changeSummary: 'Changed title'
      })
    ).toThrow()
  })

  it('requires stable snake_case failure codes', () => {
    const base = {
      projectId,
      operationId: 'failure:project:001',
      baseRevision: 3,
      errorMessage: 'The source could not be parsed.',
      recoverable: true,
      changeSummary: 'Recorded source parsing failure'
    }
    expect(() =>
      reportStoryFailureSchema.parse({
        ...base,
        failureCode: 'Source Parse Failed'
      })
    ).toThrow()
    expect(
      reportStoryFailureSchema.parse({
        ...base,
        failureCode: 'source_parse_failed'
      }).failureCode
    ).toBe('source_parse_failed')
  })
})
