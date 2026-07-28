import {
  presentationStudioPromptWorkflows,
  presentationStudioTemplates
} from './presentation-studio.templates.js'

describe('Presentation Studio assistant template', () => {
  it('instructs the agent to batch inspections and honor exact array item contracts', () => {
    const dsl = presentationStudioTemplates[0]?.dslContent ?? ''

    expect(dsl).toContain('accepts at most 8 layouts per call')
    expect(dsl.toLowerCase()).toContain('items may contain only allowedkeys')
    expect(dsl).toContain('presentation-studio-agent-v2')
    expect(dsl).toContain('presentation_list_theme_previews')
    expect(dsl).toContain('description is immediately followed by its own preview image')
    expect(dsl).toContain('你有哪些生成ppt的主题')
    expect(dsl).toContain('Before any user-facing answer that lists, counts, names, describes, compares')
    expect(dsl).toContain('text-only preliminary theme answer')
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

  it('declares the workspace prompt workflows used to start presentation tasks', () => {
    const expectedArgsHints: Record<string, string> = {
      'presentation-create': '{"topic_or_material":"...","audience":"...","page_count":10,"goal":"..."}',
      'presentation-refine': '{"deck_id":"...","requirements":"..."}',
      'presentation-export': '{"deck_id":"...","formats":["html","pdf","pptx"]}',
      'presentation-share': '{"deck_id":"..."}'
    }
    expect(presentationStudioPromptWorkflows.map(({ name }) => name)).toEqual([
      'presentation-create',
      'presentation-refine',
      'presentation-export',
      'presentation-share'
    ])
    expect(presentationStudioTemplates[0]?.promptWorkflows).toBe(presentationStudioPromptWorkflows)

    for (const workflow of presentationStudioPromptWorkflows) {
      expect(workflow.name).toMatch(/^[a-z0-9][a-z0-9_-]{0,63}$/)
      expect(workflow.category).toBe('presentation')
      expect(workflow.visibility).toBe('team')
      expect(workflow.argsHint).toBe(expectedArgsHints[workflow.name])
      expect(workflow.label).toMatch(/[\u4e00-\u9fff]/)
      expect(workflow.description).toMatch(/[\u4e00-\u9fff]/)
      expect(workflow.template).toContain('请使用用户输入的语言输出。')
      expect(workflow.template.match(/\{\{\s*([^}]+?)\s*\}\}/g)).toEqual(['{{args}}'])
    }
    expect(presentationStudioPromptWorkflows[3]?.template).toContain('最终回复只返回工具产生的 shareUrl')
  })
})
