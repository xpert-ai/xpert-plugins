import { canvasTemplates } from './canvas.templates.js'

const assistantDescription = [
  '  description:',
  '    en_US: Agentic visual canvas assistant for infinite whiteboards, AI image slots, annotation workflows, and moodboards',
  '    zh_Hans: 面向无限白板、AI 图片占位框、标注工作流和情绪板的智能体式可视化画布助手'
].join('\n')

const agentDescription = [
  '      description:',
  '        en_US: Agentic visual canvas assistant for infinite whiteboards, AI image slots, annotation workflows, and moodboards',
  '        zh_Hans: 面向无限白板、AI 图片占位框、标注工作流和情绪板的智能体式可视化画布助手'
].join('\n')

describe('canvas assistant template', () => {
  it('declares view-image and Seedream dependencies for visual generation workflows', () => {
    const template = canvasTemplates[0]

    expect(template.description).toBe(
      '面向 data-xpert 的可视化画布助手模板，支持无限白板、AI 图片占位框、基于标注的修改和情绪板创作。'
    )
    expect(template.dependencies?.plugins).toEqual(
      expect.arrayContaining(['@xpert-ai/plugin-canvas', '@xpert-ai/plugin-view-image', '@xpert-ai/plugin-volcengine'])
    )
    expect(template.dependencies?.toolsets).toEqual([
      {
        pluginName: '@xpert-ai/plugin-volcengine',
        provider: 'seedream_aigc',
        templateNodeKey: '9e7f0f3d-1f0d-4c59-9f14-7012dc2a0f4c',
        targetAgentKey: 'Agent_Canvas',
        instanceName: 'Seedream AIGC'
      }
    ])
    expect(template.dslContent).toContain('@xpert-ai/plugin-view-image')
    expect(template.dslContent).toContain('@xpert-ai/plugin-volcengine')
    expect(template.dslContent).toContain('ViewImageMiddleware')
    expect(template.dslContent).toContain('skillsMiddleware')
    expect(template.dslContent).toContain('WebTools')
    expect(template.dslContent).toContain('SandboxShell')
    expect(template.dslContent).toContain('Agent_Canvas/Middleware_Skills')
    expect(template.dslContent).toContain('Agent_Canvas/Middleware_WebTools')
    expect(template.dslContent).toContain('Agent_Canvas/Middleware_SandboxShell')
    expect(template.dslContent).toContain('read_skill_file')
    expect(template.dslContent).toContain('web_search/web_fetch')
    expect(template.dslContent).toContain('sandbox_shell')
    expect(template.dslContent).toContain('canvasSnapshotImagePath')
    expect(template.dslContent).toContain('view_image')
    expect(template.dslContent).toContain('seedream_aigc')
    expect(template.dslContent).toContain('9e7f0f3d-1f0d-4c59-9f14-7012dc2a0f4c')
    expect(template.dslContent).toContain('seedream_text_to_image')
    expect(template.dslContent).toContain('3:4=1728x2304')
    expect(template.dslContent).toContain('workspaceFilePath')
    expect(template.dslContent).toContain('canvasInsertionTargetJson')
    expect(template.dslContent).toContain('target')
    expect(template.dslContent).toContain('Do not')
    expect(template.dslContent).toContain('call canvas_create_document for image insertion')
    expect(template.dslContent).toContain('canvas_insert_image updates the current Canvas working copy')
    expect(template.dslContent).not.toContain('workspaceCatalog')
    expect(template.dslContent).not.toContain('workspaceScopeId')
  })

  it('localizes the installed assistant descriptions', () => {
    const template = canvasTemplates[0]

    expect(template.dslContent).toContain(assistantDescription)
    expect(template.dslContent).toContain(agentDescription)
  })
})
