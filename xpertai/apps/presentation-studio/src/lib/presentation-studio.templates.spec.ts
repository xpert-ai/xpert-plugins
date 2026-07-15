import { presentationStudioTemplates } from './presentation-studio.templates.js'

describe('Presentation Studio assistant template', () => {
  it('instructs the agent to batch inspections and honor exact array item contracts', () => {
    const dsl = presentationStudioTemplates[0]?.dslContent ?? ''

    expect(dsl).toContain('accepts at most 8 layouts per call')
    expect(dsl.toLowerCase()).toContain('items may contain only allowedkeys')
    expect(dsl).toContain('presentation-studio-agent-v2')
  })

  it('connects the presentation and common middlewares to the Agent', () => {
    const dsl = presentationStudioTemplates[0]?.dslContent ?? ''
    const middlewareKeys = [
      'Middleware_PresentationStudio',
      'Middleware_Skills',
      'Middleware_WebTools',
      'Middleware_SandboxFile',
      'Middleware_SandboxShell',
      'Middleware_LoopGuard',
      'Middleware_ModelRetry',
      'Middleware_ViewImage'
    ]
    const providers = [
      'PresentationStudioMiddleware',
      'skillsMiddleware',
      'WebTools',
      'SandboxFile',
      'SandboxShell',
      'LoopGuardMiddleware',
      'ModelRetryMiddleware',
      'ViewImageMiddleware'
    ]

    expect(dsl).toContain('provider: docker-sandbox')
    for (const provider of providers) expect(dsl).toContain(`provider: ${provider}`)
    for (const middlewareKey of middlewareKeys) {
      expect(dsl).toContain(`key: Agent_PresentationStudio/${middlewareKey}`)
      expect(dsl).toContain('from: Agent_PresentationStudio')
      expect(dsl).toContain(`to: ${middlewareKey}`)
    }
  })
})
