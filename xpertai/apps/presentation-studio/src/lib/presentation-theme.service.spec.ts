import JSZip from 'jszip'
import { PresentationTheme } from './entities/index.js'
import { PresentationThemeService } from './presentation-theme.service.js'

describe('PresentationThemeService package contract', () => {
  const scope = { tenantId: 'tenant-1', organizationId: 'org-1', workspaceId: 'workspace-1', xpertId: 'agent-1', userId: 'user-1' }

  function harness() {
    const theme = Object.assign(new PresentationTheme(), {
      id: 'theme-record-1', tenantId: 'tenant-1', organizationId: 'org-1', workspaceId: 'workspace-1', assistantId: 'agent-1',
      themeKey: 'theme15', name: 'External proposal', sourceType: 'pptx', status: 'prepared',
      sourceReference: {
        fileName: 'template.pptx', size: 128, sha256: 'source-sha', workspacePath: '/workspace/files/template.pptx',
        reference: {
          source: 'platform.workspace.files', filePath: 'files/template.pptx', workspacePath: '/workspace/files/template.pptx',
          catalog: 'xperts', scopeId: 'agent-1', xpertId: 'agent-1', tenantId: 'tenant-1'
        }
      },
      createdAt: new Date(), updatedAt: new Date()
    })
    const repository = {
      findOne: jest.fn().mockResolvedValue(theme),
      find: jest.fn().mockResolvedValue([theme]),
      save: jest.fn().mockImplementation(async (value) => value),
      create: jest.fn().mockImplementation((value) => Object.assign(new PresentationTheme(), value))
    }
    const workspaceFiles = {
      readRuntimeBuffer: jest.fn(),
      writeRuntimeBuffer: jest.fn().mockImplementation(async (input) => ({
        name: 'dashi-theme-generator.zip',
        filePath: 'files/presentation-studio/themes/theme-record-1/authoring/dashi-theme-generator.zip',
        workspacePath: '/workspace/files/presentation-studio/themes/theme-record-1/authoring/dashi-theme-generator.zip',
        mimeType: input.mimeType,
        size: input.buffer.length,
        reference: { source: 'platform.workspace.files', workspacePath: '/workspace/files/presentation-studio/themes/theme-record-1/authoring/dashi-theme-generator.zip' }
      })),
      uploadBuffer: jest.fn().mockResolvedValue({
        name: 'evidence.images.zip', filePath: 'files/evidence.images.zip', workspacePath: 'files/evidence.images.zip', size: 100
      })
    }
    const capabilities = { get: jest.fn().mockReturnValue(workspaceFiles) }
    return { theme, repository, workspaceFiles, service: new PresentationThemeService(repository as never, capabilities as never) }
  }

  it('registers a portable theme only after all quality gates pass', async () => {
    const { service, theme } = harness()
    const buffer = await themePackage()
    const reference = { source: 'workspace-files', workspacePath: 'files/theme15.zip' }
    await service.updateGenerationStatus(scope, theme.id, 'analyzing')
    await service.updateGenerationStatus(scope, theme.id, 'generating')
    await service.updateGenerationStatus(scope, theme.id, 'validating')

    const result = await service.registerRuntimePackage(scope, theme.id, {
      name: 'theme15.zip', mimeType: 'application/zip', size: buffer.length, buffer, reference: reference as never
    })

    expect(theme.status).toBe('ready')
    expect(theme.runtimeMetadata?.pages).toHaveLength(76)
    expect(result).toEqual(expect.objectContaining({ pageCount: 76, observedModules: 8, inferredModules: 8 }))
    await expect(service.getSandboxPackage({ type: 'custom', key: 'theme15', themeId: theme.id }, scope)).resolves.toEqual(expect.objectContaining({
      themeKey: 'theme15', sourceType: 'pptx', reference
    }))
  })

  it('registers a reuse-first package with pinned baseline capability coverage', async () => {
    const { service, theme } = harness()
    const buffer = await themePackage({}, {
      generationMode: 'reuse-first',
      observedModuleCount: 2,
      inferredModuleCount: 0,
      ownedStructureFamilies: ['cover', 'general']
    })
    await service.updateGenerationStatus(scope, theme.id, 'analyzing')
    await service.updateGenerationStatus(scope, theme.id, 'generating')
    await service.updateGenerationStatus(scope, theme.id, 'validating')

    const result = await service.registerRuntimePackage(scope, theme.id, {
      name: 'theme15.zip', buffer, reference: { source: 'workspace-files', workspacePath: 'files/theme15.zip' } as never
    })

    expect(result).toEqual(expect.objectContaining({
      generationMode: 'reuse-first', observedModules: 2, inferredModules: 0
    }))
    expect(theme.status).toBe('ready')
  })

  it('rejects missing or over-budget reuse-first policy metadata', async () => {
    const missing = harness()
    missing.theme.status = 'validating'
    const missingMode = await themePackage({}, { generationMode: undefined })
    await expect(missing.service.registerRuntimePackage(scope, missing.theme.id, {
      name: 'theme15.zip', buffer: missingMode, reference: { source: 'workspace-files', workspacePath: 'files/theme15.zip' } as never
    })).rejects.toThrow('Theme package generationMode is required')

    const overBudget = harness()
    overBudget.theme.status = 'validating'
    const tooManyOwned = await themePackage({}, {
      generationMode: 'reuse-first', observedModuleCount: 5, inferredModuleCount: 0,
      ownedStructureFamilies: ['cover', 'general']
    })
    await expect(overBudget.service.registerRuntimePackage(scope, overBudget.theme.id, {
      name: 'theme15.zip', buffer: tooManyOwned, reference: { source: 'workspace-files', workspacePath: 'files/theme15.zip' } as never
    })).rejects.toThrow('does not satisfy the reuse-first owned-module policy')
  })

  it('rejects a package with a failed render or layout gate', async () => {
    const { service, theme } = harness()
    const buffer = await themePackage({ layoutQuality: 'failed' })
    theme.status = 'validating'

    await expect(service.registerRuntimePackage(scope, theme.id, {
      name: 'theme15.zip', buffer, reference: { source: 'workspace-files', workspacePath: 'files/theme15.zip' } as never
    })).rejects.toThrow('Theme verification gate did not pass: layoutQuality')
    expect(theme.status).toBe('validating')
  })

  it('enforces the explicit generation status sequence', async () => {
    const { service, theme } = harness()

    await expect(service.updateGenerationStatus(scope, theme.id, 'generating')).rejects.toThrow('must advance from prepared to analyzing')
    await service.updateGenerationStatus(scope, theme.id, 'analyzing')
    await service.updateGenerationStatus(scope, theme.id, 'generating')
    await service.updateGenerationStatus(scope, theme.id, 'validating')
    expect(theme.status).toBe('validating')
  })

  it('lists the same machine-readable next action for Workbench-prepared themes', async () => {
    const { service } = harness()

    await expect(service.list(scope)).resolves.toEqual(expect.objectContaining({
      custom: [expect.objectContaining({
        status: 'prepared',
        sourcePath: '/workspace/files/template.pptx',
        nextAction: expect.objectContaining({
          tool: 'presentation_open_dashi_theme_generator',
          input: { themeId: 'theme-record-1' }
        })
      })]
    }))
  })

  it('packages 8 explicit image files as one prepared evidence source', async () => {
    const { service, repository, workspaceFiles } = harness()
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

    const result = await service.prepareRuntimeImageSources(scope, { name: 'Image proposal' }, Array.from({ length: 8 }, (_, index) => ({
      name: `page-${index + 1}.png`, buffer: png
    })))

    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'application/zip' }))
    expect(repository.save).toHaveBeenLastCalledWith(expect.objectContaining({ sourceType: 'images', status: 'prepared' }))
    expect(result).toEqual(expect.objectContaining({
      message: 'Theme source prepared. No background generation has started.',
      authoring: expect.objectContaining({
        nextAction: { tool: 'presentation_open_dashi_theme_generator', input: { themeId: expect.any(String) } }
      })
    }))
  })

  it('materializes the complete built-in generator in the current workspace', async () => {
    const { service, workspaceFiles } = harness()

    const result = await service.materializeGenerator(scope, 'theme-record-1', workspaceFiles as never)

    expect(result).toEqual(expect.objectContaining({
      skill: 'dashi-theme-generator',
      delivery: 'presentation-studio-plugin',
      archivePath: '/workspace/files/presentation-studio/themes/theme-record-1/authoring/dashi-theme-generator.zip',
      theme: expect.objectContaining({ id: 'theme-record-1', status: 'prepared' }),
      completionContract: {
        scaffoldIsTerminal: false,
        userManualCodingRequired: false,
        agentMustImplementOwnedModules: true,
        baselineComponentReuseAllowed: true,
        recommendedGenerationMode: 'fidelity',
        successStatus: 'ready',
        failureTool: 'presentation_report_theme_failure'
      },
      authoring: expect.objectContaining({
        themeId: 'theme-record-1',
        recommendedGenerationMode: 'fidelity',
        sourcePath: '/workspace/files/template.pptx'
      })
    }))
    expect(result.skillMarkdown).toContain('# Dashi Theme Generator')
    expect(result.skillMarkdown).toContain('presentation_open_dashi_theme_generator')
    expect(result.skillMarkdown).toContain('不是需要用户手工编码的阻塞')
    expect(result.instruction).toContain('Scaffold output is non-terminal')
    expect(workspaceFiles.writeRuntimeBuffer).toHaveBeenCalledWith(expect.objectContaining({
      catalog: 'xperts',
      scopeId: 'agent-1',
      path: 'files/presentation-studio/themes/theme-record-1/authoring/dashi-theme-generator.zip',
      mimeType: 'application/zip',
      buffer: expect.any(Buffer)
    }))
    const bundle = workspaceFiles.writeRuntimeBuffer.mock.calls[0]?.[0]?.buffer as Buffer
    expect(bundle.subarray(0, 2).toString()).toBe('PK')
    expect(bundle.length).toBeGreaterThan(30 * 1024 * 1024)
    const archive = await JSZip.loadAsync(bundle)
    expect(archive.file('dashi-theme-generator/SKILL.md')).not.toBeNull()
    expect(archive.file('dashi-theme-generator/project/package.json')).not.toBeNull()
    expect(archive.file('dashi-theme-generator/scripts/finalize-plugin-theme.mjs')).not.toBeNull()
    expect(Object.keys(archive.files).some(name => name.includes('/node_modules/'))).toBe(false)
  }, 30_000)

  it('does not materialize the generator for a theme that cannot enter authoring', async () => {
    const { service, theme, workspaceFiles } = harness()
    theme.status = 'ready'

    await expect(service.materializeGenerator(scope, theme.id!, workspaceFiles as never)).rejects.toThrow('cannot be opened from status ready')
    expect(workspaceFiles.writeRuntimeBuffer).not.toHaveBeenCalled()
  })
})

async function themePackage(verificationPatch: Record<string, string> = {}, packagePatch: Record<string, unknown> = {}) {
  const zip = new JSZip()
  const verification = {
    generatedCapabilities: 'passed', palette: 'passed', ownedRender: 'passed', renderContract: 'passed', layoutQuality: 'passed',
    ...verificationPatch
  }
  const pages = Array.from({ length: 76 }, (_, index) => ({
    key: `theme15_page${String(index + 1).padStart(3, '0')}`, themeKey: 'theme15', pageNumber: index + 1,
    layout: `THEME15-${String(index + 1).padStart(3, '0')}`, slot: index === 0 ? 'cover' : 'general', label: `Page ${index + 1}`,
    controls: [], defaultProps: {}
  }))
  const layouts = Object.fromEntries(pages.map((page) => [page.key, { key: page.key, themePack: 'theme15', controls: [] }]))
  zip.file('package.json', JSON.stringify({
    schema: 'xpert.presentation-theme-package/v1', themeKey: 'theme15', sourceType: 'pptx', adapterMode: 'pptx-slide-tree',
    pageCount: 76, observedModuleCount: 8, inferredModuleCount: 8,
    structureFamilies: ['cover', 'general', 'metrics', 'media', 'comparison', 'timeline', 'relationship', 'table', 'statement'],
    ownedStructureFamilies: ['cover', 'general', 'metrics', 'media', 'comparison', 'timeline', 'relationship', 'table', 'statement'],
    generationMode: 'fidelity', policyVersion: 2, paletteMode: 'strict', verification, ...packagePatch
  }))
  zip.file('metadata.json', JSON.stringify({
    schema: 'xpert.presentation-theme-runtime/v1', theme: { key: 'theme15', label: 'External proposal' }, pages
  }))
  zip.file('layout-manifest.json', JSON.stringify({ layouts }))
  zip.file('runtime/imported-theme-runtime.js', 'globalThis.DeckJsxRuntime = {};')
  zip.file('runtime/theme.module.mjs', 'export const runtimePages = [];')
  return zip.generateAsync({ type: 'nodebuffer' })
}
