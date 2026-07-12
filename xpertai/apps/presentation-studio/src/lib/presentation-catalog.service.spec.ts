import { createHash } from 'node:crypto'
import { PresentationCatalogService } from './presentation-catalog.service.js'

describe('Presentation catalog', () => {
  const service = new PresentationCatalogService()

  it('loads the complete DashiAI catalog', async () => {
    await expect(service.stats()).resolves.toEqual({ themes: 12, layouts: 1020 })
  })

  it('queries and inspects layout contracts through upstream workflow code', async () => {
    const search = await service.searchLayouts({ theme: 'theme02', role: 'cover', limit: 3, seed: 'test' })
    expect(search.count).toBe(3)
    const layouts = search.layouts
    expect(Array.isArray(layouts)).toBe(true)
    const first = Array.isArray(layouts) && layouts[0] && typeof layouts[0] === 'object' && !Array.isArray(layouts[0])
      ? layouts[0].layout
      : null
    expect(typeof first).toBe('string')
    const inspected = await service.inspectLayouts([String(first)])
    expect(inspected.layout).toBe(first)
  })

  it('exposes strict array-item authoring contracts for inspected layouts', async () => {
    const inspected = await service.inspectLayouts(['theme01_page013'])

    expect(inspected.inspectionLimits).toEqual(expect.objectContaining({ maximumLayoutsPerCall: 8 }))
    expect(inspected.authoringContract).toEqual(expect.objectContaining({
      strictArrayItems: true,
      arrayItemContracts: {
        topics: {
          allowedKeys: ['label'],
          allowedPaths: ['topics[].label'],
          itemShape: { label: 'string' }
        }
      }
    }))
  })

  it('strictly validates authored props while accepting portable asset references', async () => {
    await expect(service.validateLayoutProps('theme01_page001', {
      titleTop: 'Agentic',
      titleBottom: 'Presentation Studio'
    })).resolves.toEqual({ warnings: [] })
    await expect(service.validateLayoutProps('theme04_page057', {
      images: ['asset://7cfacfb6-808a-4c11-b7b0-1c14ec1e18e5'],
      slotLabels: ['产品界面'],
      mediaCount: 1
    })).resolves.toEqual({ warnings: [] })
    await expect(service.validateLayoutProps('theme01_page001', { arbitraryHtml: '<iframe>' }))
      .rejects.toThrow('Unknown prop')
    await expect(service.validateLayoutProps('theme01_page001', { titleTop: '<script>alert(1)</script>' }))
      .rejects.toThrow('HTML')
    await expect(service.validateLayoutProps('theme04_page057', {
      images: ['../../secret.png'], slotLabels: ['unsafe'], mediaCount: 1
    })).rejects.toThrow('media source')
  })

  it('accepts the inspected topic item shape and reports mismatches without duplicate wrappers', async () => {
    await expect(service.validateLayoutProps('theme01_page013', {
      topics: [
        { label: '图纸解析' },
        { label: '物料识别' },
        { label: 'BOM 生成' }
      ],
      topicCount: 3
    })).resolves.toEqual({ warnings: [] })

    await expect(service.validateLayoutProps('theme01_page013', {
      topics: [{ label: '图纸解析', desc: 'unknown nested field', en: 'Drawing parsing' }],
      topicCount: 1
    })).rejects.toThrow('props.topics[0].desc: unknown nested prop; expected label')

    await service.validateLayoutProps('theme01_page013', {
      topics: [{ label: '图纸解析', desc: 'unknown nested field' }],
      topicCount: 1
    }).catch((error: Error) => {
      expect(error.message).not.toContain('slide 1 layout theme01_page013 field props')
    })
  })

  it('loads one verified native theme runtime and inlines its local assets', async () => {
    const runtime = await service.loadNativeThemeRuntime('theme03')
    expect(runtime.protocolVersion).toBe(1)
    expect(Object.keys(runtime.layouts)).toHaveLength(77)
    expect(runtime.script).not.toContain('"assets/3d/')
    expect(runtime.script).toContain('data:image/png;base64,')
    expect(createHash('sha256').update(runtime.script).digest('hex')).toBe(runtime.runtimeChecksum)
  })
})
