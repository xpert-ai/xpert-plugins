import { normalizeMermaidSourceForExcalidrawConversion } from './mermaid-source-normalization.js'

describe('normalizeMermaidSourceForExcalidrawConversion', () => {
  it('replaces escaped newlines inside ordinary node labels', () => {
    const source = `graph TB
  subgraph APP["应用层"]
    CodeXpert["Code Xpert\\n编码智能体"]
  end`

    expect(normalizeMermaidSourceForExcalidrawConversion(source)).toBe(`graph TB
  subgraph APP["应用层"]
    CodeXpert["Code Xpert / 编码智能体"]
  end`)
  })

  it('replaces escaped newlines inside subgraph and node labels', () => {
    const source = `graph TB
  subgraph APP["应用层\\n垂类智能体系统"]
    CodeXpert["Code Xpert\\n编码智能体"]
  end`

    expect(normalizeMermaidSourceForExcalidrawConversion(source)).toBe(`graph TB
  subgraph APP["应用层 / 垂类智能体系统"]
    CodeXpert["Code Xpert / 编码智能体"]
  end`)
  })

  it('replaces runtime single-backslash n inside quoted labels', () => {
    const source = String.raw`graph TB
  subgraph APP["应用层\n垂类智能体系统"]
    CodeXpert["Code Xpert\n编码智能体"]
  end`

    expect(normalizeMermaidSourceForExcalidrawConversion(source)).toBe(String.raw`graph TB
  subgraph APP["应用层 / 垂类智能体系统"]
    CodeXpert["Code Xpert / 编码智能体"]
  end`)
  })

  it('handles Mermaid source after JSON tool payload parsing', () => {
    const payload = JSON.parse(
      '{"mermaidSource":"graph TB\\n  subgraph APP[\\"应用层\\\\n垂类智能体系统\\"]\\n    CodeXpert[\\"Code Xpert\\\\n编码智能体\\"]\\n  end"}'
    )

    expect(normalizeMermaidSourceForExcalidrawConversion(payload.mermaidSource)).toBe(`graph TB
  subgraph APP["应用层 / 垂类智能体系统"]
    CodeXpert["Code Xpert / 编码智能体"]
  end`)
  })

  it('replaces literal line breaks inside quoted labels', () => {
    const source = `graph TB
  subgraph APP["应用层
    垂类智能体系统"]
    CodeXpert["Code Xpert
      编码智能体"]
  end`

    expect(normalizeMermaidSourceForExcalidrawConversion(source)).toBe(`graph TB
  subgraph APP["应用层 / 垂类智能体系统"]
    CodeXpert["Code Xpert / 编码智能体"]
  end`)
  })

  it('replaces html break tags before Mermaid conversion', () => {
    const source = `graph TB
  subgraph APP["应用层<br/>垂类智能体系统"]
    A["A<br />alpha"]
    B[Plain<br>Label]
  end`

    expect(normalizeMermaidSourceForExcalidrawConversion(source)).toBe(`graph TB
  subgraph APP["应用层 / 垂类智能体系统"]
    A["A / alpha"]
    B[Plain / Label]
  end`)
  })

  it('normalizes multiple quoted labels independently', () => {
    const source = `graph TB
  subgraph APP["应用层\\n垂类智能体系统"]
    A["A\\nalpha"]
  end
  subgraph DATA["数据层\\n本体系统"]
    B["B\\nbeta"]
  end`

    expect(normalizeMermaidSourceForExcalidrawConversion(source)).toBe(`graph TB
  subgraph APP["应用层 / 垂类智能体系统"]
    A["A / alpha"]
  end
  subgraph DATA["数据层 / 本体系统"]
    B["B / beta"]
  end`)
  })
})
