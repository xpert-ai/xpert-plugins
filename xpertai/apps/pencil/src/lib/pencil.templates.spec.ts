import { pencilTemplates } from './pencil.templates.js'

describe('pencil assistant template', () => {
  it('connects the Pencil and common visual-workflow middleware', () => {
    const template = pencilTemplates[0]

    expect(template.dependencies?.plugins).toEqual(
      expect.arrayContaining(['@xpert-ai/plugin-pencil', '@xpert-ai/plugin-view-image'])
    )
    expect(template.dependencies?.skills).toEqual([
      {
        componentKey: 'pencil-agent-skill',
        targetAgentKey: 'Agent_Pencil'
      }
    ])
    expect(template.dslContent).toContain('provider: PencilMiddleware')
    expect(template.dslContent).toContain('provider: ViewImageMiddleware')
    expect(template.dslContent).toContain('provider: skillsMiddleware')
    expect(template.dslContent).toContain('provider: WebTools')
    expect(template.dslContent).toContain('provider: SandboxShell')
    expect(template.dslContent).toContain('Agent_Pencil/Middleware_Pencil')
    expect(template.dslContent).toContain('Agent_Pencil/Middleware_ViewImage')
    expect(template.dslContent).toContain('Agent_Pencil/Middleware_Skills')
    expect(template.dslContent).toContain('Agent_Pencil/Middleware_WebTools')
    expect(template.dslContent).toContain('Agent_Pencil/Middleware_SandboxShell')
  })

  it('instructs the assistant to return the tool-produced share link', () => {
    const template = pencilTemplates[0]

    expect(template.dslContent).toContain('pencil_publish_artifact_link')
    expect(template.dslContent).toContain('Return the shareUrl to the user')
  })
})
