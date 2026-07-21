import { presentationStudioTemplates } from './presentation-studio.templates.js'

describe('Presentation Studio assistant template', () => {
  it('instructs the agent to batch inspections and honor exact array item contracts', () => {
    const dsl = presentationStudioTemplates[0]?.dslContent ?? ''

    expect(dsl).toContain('accepts at most 8 layouts per call')
    expect(dsl.toLowerCase()).toContain('items may contain only allowedkeys')
    expect(dsl).toContain('presentation-studio-agent-v7')
    expect(dsl).toContain('presentation-studio-loop-guard-middleware-v3')
    expect(dsl).toContain('presentation_prepare_theme')
    expect(dsl).toContain('presentation_open_dashi_theme_generator')
    expect(dsl).toContain('presentation_update_theme_progress')
    expect(dsl).toContain('presentation_register_theme')
    expect(dsl).toContain('model: qwen3-vl-plus')
    expect(dsl).toContain('recursionLimit: 300')
    expect(dsl).toContain('hardLimit: 2')
    expect(dsl).toContain('may be issued at most once with the exact same')
    expect(dsl).toContain('never only the first page image')
    expect(dsl).toContain('exactly one primary inspection per image')
    expect(dsl).toContain('never feed its output back as input')
    expect(dsl).toContain('Do not guess')
    expect(dsl).toContain('retryAllErrors: false')
    expect(dsl).toContain('onFailure: error')
    expect(dsl).toContain('does not start a background job')
    expect(presentationStudioTemplates[0]?.dependencies?.skills).toBeUndefined()
    expect(dsl).not.toContain('skillsMiddleware')
  })

  it('connects the presentation and common middlewares to the Agent', () => {
    const dsl = presentationStudioTemplates[0]?.dslContent ?? ''
    const middlewareKeys = [
      'Middleware_PresentationStudio',
      'Middleware_WebTools',
      'Middleware_SandboxFile',
      'Middleware_SandboxShell',
      'Middleware_LoopGuard',
      'Middleware_ModelRetry',
      'Middleware_ViewImage'
    ]
    const providers = [
      'PresentationStudioMiddleware',
      'WebTools',
      'SandboxFile',
      'SandboxShell',
      'LoopGuardMiddleware',
      'ModelRetryMiddleware',
      'ViewImageMiddleware'
    ]

    expect(dsl).toContain('provider: docker-sandbox')
    expect(dsl).toContain('themes:scaffold-owned is an internal non-terminal authoring state')
    expect(dsl).toContain('Never tell the user that manual JSX implementation')
    expect(dsl).toContain('generationMode discriminator')
    expect(dsl).toContain('prefer reuse-first')
    expect(dsl).toContain('Theme generation ends only when registration')
    for (const provider of providers) expect(dsl).toContain(`provider: ${provider}`)
    for (const middlewareKey of middlewareKeys) {
      expect(dsl).toContain(`key: Agent_PresentationStudio/${middlewareKey}`)
      expect(dsl).toContain('from: Agent_PresentationStudio')
      expect(dsl).toContain(`to: ${middlewareKey}`)
    }
  })
})
