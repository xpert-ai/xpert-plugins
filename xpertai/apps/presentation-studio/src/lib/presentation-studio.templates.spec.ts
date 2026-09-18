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
      'presentation-create': '请输入主题或材料、目标受众、页数和演示目标。',
      'presentation-refine': '请说明要优化哪份演示稿，以及文案、排版或内容上的修改要求。',
      'presentation-export': '请指定演示稿及导出格式（HTML、PDF 或 PPTX）；不指定演示稿时使用当前演示稿。',
      'presentation-share': '请指定要分享的演示稿；不填写时使用当前演示稿。'
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

  it('ships valid, editable scenario arguments with every contributed workflow', () => {
    for (const workflow of presentationStudioPromptWorkflows) {
      expect(workflow.scenarios.length).toBeGreaterThan(0)
      expect(workflow.scenarios.length).toBeLessThanOrEqual(20)
      expect(new Set(workflow.scenarios.map(({ id }) => id)).size).toBe(workflow.scenarios.length)

      for (const scenario of workflow.scenarios) {
        expect(scenario.id).toMatch(/^[a-z0-9][a-z0-9-]{0,99}$/)
        expect(scenario.label.trim().length).toBeGreaterThan(0)
        expect(scenario.label.length).toBeLessThanOrEqual(120)
        expect(scenario.args.trim().length).toBeGreaterThan(0)
        expect(scenario.args.length).toBeLessThanOrEqual(20000)
        expect(scenario.args).not.toContain('{{args}}')

        const draft = workflow.template.replace('{{args}}', () => scenario.args)
        expect(draft).toContain(scenario.args)
        expect(draft).not.toContain('{{args}}')
        expect(draft).toContain('请使用用户输入的语言输出。')
      }
    }
  })

  it('offers presentation-specific scenarios for each operation', () => {
    const [create, refine, exportWorkflow, share] = presentationStudioPromptWorkflows

    expect(create.scenarios.map(({ label }) => label)).toEqual([
      '工作汇报 PPT', 'AI 趋势 PPT', '年终总结 PPT', '产品介绍 PPT', '项目复盘 PPT'
    ])
    expect(create.scenarios.find(({ id }) => id === 'ai-trends')?.args).toContain('来源和日期')
    expect(refine.scenarios.map(({ label }) => label)).toEqual(['精简文案', '优化排版', '检查完整性'])
    for (const format of ['HTML', 'PDF', 'PPTX']) {
      const scenario = exportWorkflow.scenarios.find(({ label }) => label === `导出 ${format}`)
      expect(scenario?.args).toContain(`仅导出为 ${format}`)
    }
    expect(share.scenarios.map(({ label }) => label)).toEqual(['生成分享链接'])
    for (const scenario of share.scenarios) {
      expect(share.template.replace('{{args}}', () => scenario.args))
        .toContain('最终回复只返回工具产生的 shareUrl')
    }
  })
})
