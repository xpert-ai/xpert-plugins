import { excalidrawTemplates } from './excalidraw.templates.js'

describe('excalidraw assistant template', () => {
  it('declares common assistant middleware dependencies and usage guidance', () => {
    const template = excalidrawTemplates[0]

    expect(template.description).toEqual({
      en_US:
        'A data-xpert drawing assistant template for flowcharts, architecture diagrams, wireframes, and freeform whiteboards.',
      zh_Hans: '面向流程图、架构图、线框图和自由白板的 data-xpert 绘图助手模板。'
    })
    expect(template.dslContent).toContain('zh_Hans: 面向流程图、架构图、线框图和自由白板的 Agentic Drawing 助手')

    expect(template.dependencies?.plugins).toEqual(
      expect.arrayContaining([
        '@xpert-ai/plugin-excalidraw',
        '@xpert-ai/plugin-web-tools'
      ])
    )
    expect(template.dependencies?.skills).toEqual([
      {
        componentKey: 'excalidraw-agent-skill',
        targetAgentKey: 'Agent_Excalidraw'
      }
    ])
    expect(template.dependencies?.skills).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ componentKey: 'index' })
      ])
    )
    expect(template.dependencies?.plugins).not.toContain('@xpert-ai/plugin-long-term-memory')
    expect(template.dslContent).toContain('@xpert-ai/plugin-web-tools')
    expect(template.dslContent).not.toContain('@xpert-ai/plugin-long-term-memory')
    expect(template.dslContent).toContain('skillsMiddleware')
    expect(template.dslContent).toContain('WebTools')
    expect(template.dslContent).toContain('XpertFileMemoryMiddleware')
    expect(template.dslContent).not.toContain('LongTermMemoryMiddleware')
    expect(template.dslContent).toContain('SandboxShell')
    expect(template.dslContent).toContain('Agent_Excalidraw/Middleware_Skills')
    expect(template.dslContent).toContain('Agent_Excalidraw/Middleware_WebTools')
    expect(template.dslContent).toContain('Agent_Excalidraw/Middleware_XpertMemory')
    expect(template.dslContent).toContain('Agent_Excalidraw/Middleware_SandboxShell')
    expect(template.dslContent).toContain('read_skill_file')
    expect(template.dslContent).toContain('web_search/web_fetch')
    expect(template.dslContent).toContain('Xpert Memory')
    expect(template.dslContent).toContain('memory_search')
    expect(template.dslContent).toContain('memory_get')
    expect(template.dslContent).toContain('memory_write')
    expect(template.dslContent).toContain('sandbox_shell')
    expect(template.dslContent).toContain('Excalidraw middleware tools remain the system of record')
  })

  it('keeps the technical DiagramIR assistant opt-in with one engine middleware and one technical skill', () => {
    const template = excalidrawTemplates[1]

    expect(template.key).toBe('excalidraw-technical-diagram-assistant')
    expect(template.dependencies.skills).toEqual([
      { componentKey: 'excalidraw-agent-skill', targetAgentKey: 'Agent_Excalidraw_Technical_Diagram' },
      { componentKey: 'technical-diagram', targetAgentKey: 'Agent_Excalidraw_Technical_Diagram' }
    ])
    expect(template.dslContent).toContain('ExcalidrawDiagramEngineMiddleware')
    expect(template.dslContent).not.toContain('ExcalidrawArtifactTemplateMiddleware')
    expect(template.dslContent).not.toContain('ExcalidrawDiagramIrMiddleware')
    expect(template.dslContent).not.toContain('ExcalidrawDiagramQualityMiddleware')
    expect(template.dslContent).toContain('excalidraw_template_list')
    expect(template.dslContent).toContain('excalidraw_diagram_create_preview')
    expect(excalidrawTemplates[0].dslContent).not.toContain('ExcalidrawDiagramEngineMiddleware')
  })
})
