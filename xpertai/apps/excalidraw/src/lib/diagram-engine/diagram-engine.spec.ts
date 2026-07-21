import { BadRequestException } from '@nestjs/common'
import { normalizeExcalidrawScene } from '../excalidraw-scene.validation.js'
import {
  ArtifactTemplateCatalogService,
  BUILTIN_DIAGRAM_TEMPLATES,
  DiagramArtifactTemplateAdapter
} from './artifact-template-catalog.service.js'
import { parseDiagramIr } from './diagram.schema.js'
import { DiagramLayoutService, DiagramRoutingService } from './diagram-layout.service.js'
import { DiagramCompilerService, DiagramPreviewService, DiagramValidationService } from './diagram-rendering.service.js'

function createEngine() {
  const adapter = new DiagramArtifactTemplateAdapter()
  const catalog = new ArtifactTemplateCatalogService(adapter)
  const routing = new DiagramRoutingService()
  const layout = new DiagramLayoutService(routing)
  const validation = new DiagramValidationService()
  const compiler = new DiagramCompilerService(layout, validation)
  return { adapter, catalog, layout, compiler }
}

describe('Excalidraw DiagramEngine reference implementation', () => {
  it('publishes ten unique, safe, bilingual, schema-valid built-in templates', () => {
    const { catalog } = createEngine()
    const descriptors = catalog.list()

    expect(descriptors).toHaveLength(10)
    expect(new Set(descriptors.map(({ key, version }) => `${key}@${version}`)).size).toBe(10)
    for (const descriptor of descriptors) {
      expect(descriptor.preview?.assetPath).toMatch(/^assets\/diagram-templates\/[a-z0-9-]+\.svg$/)
      expect(descriptor.title.en_US).toBeTruthy()
      expect(descriptor.title.zh_Hans).toBeTruthy()
      const definition = catalog.get(descriptor.key, descriptor.version)
      expect(definition.examples.map((example) => example.locale).sort()).toEqual(['en_US', 'zh_Hans'])
      expect(() => catalog.validate(definition)).not.toThrow()
    }
  })

  it('returns readable template parameter errors and never evaluates template expressions', () => {
    const { catalog } = createEngine()
    expect(() => catalog.instantiate('rag-pipeline', '1.0.0', { title: '' })).toThrow(BadRequestException)
    expect(() => catalog.instantiate('rag-pipeline', '1.0.0', {
      title: 'RAG',
      expression: '${process.exit(1)}'
    })).toThrow(/must NOT have additional properties/)
  })

  it.each(BUILTIN_DIAGRAM_TEMPLATES.map((template) => [template.descriptor.key, template] as const))(
    'deterministically lays out and compiles %s into a valid Excalidraw scene',
    (_key, template) => {
      const { adapter, compiler } = createEngine()
      const ir = adapter.instantiate(template, template.defaults)
      const first = compiler.compile(ir)
      const second = compiler.compile(ir)

      expect(second.resolved).toEqual(first.resolved)
      expect(second.elements).toEqual(first.elements)
      if (!first.report.valid) throw new Error(JSON.stringify(first.report.issues))
      expect(first.svg).toContain('<svg')
      expect(first.svg).not.toMatch(/(?:href|src)=["']https?:\/\//)
      expect(first.svg).not.toMatch(/@import|url\(["']?https?:\/\//)
      expect(() => normalizeExcalidrawScene({
        elements: first.elements,
        appState: first.appState,
        files: first.files
      }, { context: template.descriptor.key })).not.toThrow()
    }
  )

  it('rejects duplicate ids and broken references at the DiagramIR boundary', () => {
    const base = structuredClone(BUILTIN_DIAGRAM_TEMPLATES[0].payload.base)
    base.nodes.push({ ...base.nodes[0] })
    expect(() => parseDiagramIr(base)).toThrow(/Duplicate node id/)

    const missing = structuredClone(BUILTIN_DIAGRAM_TEMPLATES[0].payload.base)
    missing.edges[0].target.nodeId = 'missing-node'
    expect(() => parseDiagramIr(missing)).toThrow(/unknown target node/)
  })

  it('applies a managed Excalidraw font family to every compiled text element', () => {
    const { adapter, compiler } = createEngine()
    const ir = adapter.instantiate(BUILTIN_DIAGRAM_TEMPLATES[0], BUILTIN_DIAGRAM_TEMPLATES[0].defaults)
    ir.appearance.fontFamilyId = 3

    const textElements = compiler.compile(parseDiagramIr(ir)).elements.filter((element) => element.type === 'text')

    expect(textElements.length).toBeGreaterThan(0)
    expect(textElements.every((element) => element.fontFamily === 3)).toBe(true)
  })

  it('renders SVG to PNG and writes both artifacts to workspace-scoped quality paths', async () => {
    const { adapter, compiler } = createEngine()
    const ir = adapter.instantiate(BUILTIN_DIAGRAM_TEMPLATES[0], {
      ...BUILTIN_DIAGRAM_TEMPLATES[0].defaults,
      title: '分层技术架构'
    })
    const compiled = compiler.compile(ir)
    const writes: Array<{ path: string; mimeType: string; buffer: Buffer }> = []
    const workspaceFiles = {
      writeRuntimeBuffer: jest.fn(async (input: { path: string; mimeType: string; buffer: Buffer }) => {
        writes.push(input)
        return {
          filePath: input.path,
          workspacePath: input.path,
          reference: { path: input.path },
          size: input.buffer.length
        }
      })
    }

    const result = await new DiagramPreviewService().createPreview(workspaceFiles as never, {
      drawingId: 'drawing-1',
      qualityRunId: 'quality-run-1',
      attempt: 0,
      svg: compiled.svg
    })

    expect(writes.map((item) => item.path)).toEqual([
      'files/excalidraw/diagrams/drawing-1/quality/quality-run-1/preview-0.svg',
      'files/excalidraw/diagrams/drawing-1/quality/quality-run-1/preview-0.png'
    ])
    expect(writes[0].buffer.toString('utf8')).toContain('<svg')
    expect(writes[0].buffer.toString('utf8')).toContain('Noto Sans SC')
    expect(writes[0].buffer.toString('utf8')).toContain('分层技术架构')
    expect(writes[1].buffer.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(result.png.size).toBeGreaterThan(100)
  })
})
