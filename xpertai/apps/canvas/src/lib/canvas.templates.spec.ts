import { canvasTemplates } from './canvas.templates.js'

describe('canvas assistant template', () => {
  it('declares view-image middleware dependency for snapshot inspection', () => {
    const template = canvasTemplates[0]

    expect(template.dependencies?.plugins).toEqual(expect.arrayContaining(['@xpert-ai/plugin-canvas', '@xpert-ai/plugin-view-image']))
    expect(template.dslContent).toContain('@xpert-ai/plugin-view-image')
    expect(template.dslContent).toContain('ViewImageMiddleware')
    expect(template.dslContent).toContain('canvasSnapshotImagePath')
    expect(template.dslContent).toContain('view_image')
  })
})
