import { SandboxJobsRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { PRESENTATION_CONFIG_DEFAULTS } from './presentation-config.service.js'
import { PresentationRendererService } from './presentation-renderer.service.js'
import {
  PRESENTATION_SANDBOX_ACTION_VERSION,
  PRESENTATION_SANDBOX_JOB_TIMEOUT_MS
} from './constants.js'

describe('PresentationRendererService export capabilities', () => {
  function createRenderer(options?: {
    workers?: number
    jobs?: boolean
    health?: { available: boolean; reason?: 'RUNTIME_UNBOUND' | 'PROVIDER_UNAVAILABLE'; message?: string }
  }) {
    const workers = options?.workers ?? 1
    const jobs = {
      getActionHealth: jest.fn(async () => ({
        pluginName: 'presentation-studio',
        action: 'presentation.export',
        actionVersion: PRESENTATION_SANDBOX_ACTION_VERSION,
        runtimeProfile: 'browser/playwright-1.61/v1',
        sandboxRuntimeVersion: '1.0.0',
        available: true,
        ...options?.health
      })),
      run: jest.fn(async () => ({
        id: 'sandbox-job-1',
        attempt: 1,
        runtimeProfile: 'browser/playwright-1.61/v1',
        sandboxRuntimeVersion: '1.0.0',
        outputs: [{ path: 'presentation.pptx' }]
      }))
    }
    const runtimeCapabilities = {
      get: jest.fn((key) => key === SandboxJobsRuntimeCapability && options?.jobs !== false ? jobs : undefined)
    }
    const managedQueue = {
      getExecutionPoolHealth: jest.fn(async () => ({
        executionPool: 'sandbox-browser' as const,
        available: workers > 0,
        workerCount: workers,
        ...(workers > 0 ? {} : { warning: 'No active sandbox-browser worker.' })
      }))
    }
    const renderer = new PresentationRendererService(
      {} as never,
      { get: () => PRESENTATION_CONFIG_DEFAULTS } as never,
      runtimeCapabilities as never,
      managedQueue as never
    )
    return { renderer, jobs, managedQueue }
  }

  it('enables PDF and PPTX by default when the platform capabilities are healthy', async () => {
    const { renderer } = createRenderer()

    await expect(renderer.getExportCapabilities()).resolves.toEqual(expect.objectContaining({
      backend: 'sandbox-job',
      html: { available: true },
      pdf: { available: true },
      pptx: { available: true }
    }))
  })

  it('returns a worker warning instead of requiring a feature switch', async () => {
    const { renderer } = createRenderer({ workers: 0 })

    await expect(renderer.getExportCapabilities()).resolves.toEqual(expect.objectContaining({
      html: { available: true },
      pdf: expect.objectContaining({ available: false, reason: 'WORKER_UNAVAILABLE' }),
      pptx: expect.objectContaining({ available: false, reason: 'WORKER_UNAVAILABLE' })
    }))
  })

  it('warns when Sandbox Jobs is unavailable while keeping HTML available', async () => {
    const { renderer } = createRenderer({ jobs: false })

    const capabilities = await renderer.getExportCapabilities()
    expect(capabilities).toEqual(expect.objectContaining({
      html: { available: true },
      pdf: expect.objectContaining({ available: false, reason: 'PROVIDER_UNAVAILABLE' }),
      pptx: expect.objectContaining({ available: false, reason: 'PROVIDER_UNAVAILABLE' })
    }))
    expect(capabilities.pdf.message).toContain('OSS base deployment intentionally does not include')
    expect(capabilities.pdf.message).toContain('Pro includes the Docker Provider worker')
  })

  it('explains how OSS and Pro deployments can satisfy a missing Runtime Binding', async () => {
    const { renderer } = createRenderer({
      health: { available: false, reason: 'RUNTIME_UNBOUND', message: 'No compatible Binding is installed.' }
    })

    const capabilities = await renderer.getExportCapabilities()
    expect(capabilities.pdf).toMatchObject({ available: false, reason: 'RUNTIME_UNBOUND' })
    expect(capabilities.pdf.message).toContain('Runtime worker is online')
    expect(capabilities.pdf.message).toContain('Pro supplies the Docker Binding')
    expect(capabilities.html.available).toBe(true)
  })

  it('explains the OSS deployment boundary when no worker heartbeat exists', async () => {
    const { renderer } = createRenderer({
      health: { available: false, reason: 'PROVIDER_UNAVAILABLE', message: 'No active Runtime health heartbeat.' }
    })

    const capabilities = await renderer.getExportCapabilities()
    expect(capabilities.pdf).toMatchObject({ available: false, reason: 'PROVIDER_UNAVAILABLE' })
    expect(capabilities.pdf.message).toContain('OSS base deployment intentionally does not include')
    expect(capabilities.pdf.message).toContain('HTML remains available')
  })

  it('budgets enough Sandbox Job time for a maximum-size PPTX export', async () => {
    const { renderer, jobs } = createRenderer()

    await renderer.exportVersionInSandbox({
      exportId: 'export-1',
      checksum: 'checksum-1',
      version: {
        deckId: 'deck-1',
        versionNumber: 1,
        source: 'system',
        deckSpec: {
          title: 'Maximum deck',
          goal: 'Verify the sandbox timeout budget',
          themePack: 'theme02',
          pageCount: 1,
          slides: [{ id: 'slide-1', layout: 'theme02_page001', status: 'active', props: {} }]
        },
        editorState: {
          slideOrder: ['slide-1'],
          skippedSlides: [],
          deletedSlides: [],
          duplicatedSlides: [],
          text: {},
          props: { 'slide-1': {} },
          preview: {}
        },
        checksum: 'checksum-1',
        rendererVersion: 'test',
        upstreamCommit: 'test',
        yjsUpdateCount: 0
      },
      assets: [],
      kind: 'pptx',
      title: 'Maximum deck',
      fileName: 'maximum-deck.pptx',
      tenantId: 'tenant-1',
      organizationId: 'organization-1',
      userId: 'user-1',
      destination: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        catalog: 'projects',
        projectId: 'project-1',
        folder: 'files/presentation-studio'
      }
    })

    expect(jobs.run).toHaveBeenCalledWith(expect.objectContaining({
      actionVersion: PRESENTATION_SANDBOX_ACTION_VERSION,
      timeoutMs: PRESENTATION_SANDBOX_JOB_TIMEOUT_MS
    }))
  })
})
