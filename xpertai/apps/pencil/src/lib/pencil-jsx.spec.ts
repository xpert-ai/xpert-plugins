import { diagnosePencilRenderError, normalizePencilCoreToolArgs, normalizePencilRenderJsx } from './pencil-jsx.js'

describe('Pencil JSX normalization', () => {
  it('maps flow row and col values to OpenPencil flex props', () => {
    const jsx = '<Frame name="Webpage" flow="col"><Frame name="Nav" flow={"row"} align="CENTER" justify="SPACE_BETWEEN" strokeW={2} /></Frame>'

    expect(normalizePencilRenderJsx(jsx)).toBe(
      '<Frame name="Webpage" flex="col"><Frame name="Nav" flex="row" align="center" justify="between" strokeWidth={2} /></Frame>'
    )
  })

  it('does not rewrite flow when flex is already present or flow is a text direction', () => {
    const jsx = '<Frame flex="row" flow="rtl"><Text flow="rtl" text="Title" /></Frame>'

    expect(normalizePencilRenderJsx(jsx)).toBe(jsx)
  })

  it('normalizes only render tool args', () => {
    const args = normalizePencilCoreToolArgs('render', {
      jsx: '<Frame flow="vertical" />',
      parent_id: 'page-1'
    })

    expect(args).toEqual({
      jsx: '<Frame flex="col" />',
      parent_id: 'page-1'
    })
    expect(normalizePencilCoreToolArgs('get_node', { jsx: '<Frame flow="col" />' })).toEqual({
      jsx: '<Frame flow="col" />'
    })
  })

  it('maps renderer-prefixed parser positions back to a bounded JSX code frame', () => {
    const source = '<Frame>\n  <Text text="Broken"\n</Frame>'
    const diagnostic = diagnosePencilRenderError(new Error('Unexpected token (11:22)'), source)

    expect(diagnostic).toEqual(
      expect.objectContaining({
        code: 'JSX_PARSE_ERROR',
        line: 2,
        column: 22,
        sourceLength: source.length
      })
    )
    expect(diagnostic.snippet).toContain('2 |   <Text text="Broken"')
  })
})
