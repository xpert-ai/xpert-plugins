jest.mock('@xpert-ai/plugin-sdk', () => ({
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES',
  SandboxJobsRuntimeCapability: { id: 'platform.sandbox.jobs' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))
import { createHash } from 'node:crypto'
import { ServiceUnavailableException } from '@nestjs/common'
import type {
  RuntimeCapabilityKey,
  SandboxJobActionHealth,
  SandboxJobRunInput,
  WorkspaceFileReference
} from '@xpert-ai/plugin-sdk'
import { MarkItDownSandboxConverter, type MarkItDownFileScope } from './convert.js'

const fileScope: MarkItDownFileScope = {
  tenantId: 'tenant',
  organizationId: 'org',
  catalog: 'knowledges',
  scopeId: 'kb'
}
const checksum = (value: Buffer) => createHash('sha256').update(value).digest('hex')
function fixture() {
  const source = Buffer.from('# Source\n\n| ID | Count |\n| 0007 | 0 |')
  const result = Buffer.from(JSON.stringify({ markdown: source.toString(), title: 'Source' }))
  const outputReference = {
    ...fileScope,
    source: 'platform.workspace.files' as const,
    filePath: 'output.json',
    workspacePath: 'output.json'
  }
  const response = {
    id: 'job',
    runtimeProfile: 'document/python-3.12/v1',
    outputs: [{ path: 'result.json', size: result.length, sha256: checksum(result), reference: outputReference }]
  }
  const jobs = {
    getActionHealth: jest.fn(
      async (): Promise<SandboxJobActionHealth> => ({
        pluginName: '@xpert-ai/plugin-markitdown',
        action: 'markitdown.convert',
        actionVersion: '1.1.0',
        available: true,
        sandboxRuntimeVersion: '1.2.1'
      })
    ),
    run: jest.fn(async (_input: SandboxJobRunInput) => response),
    cancel: jest.fn(async (_input: { jobId: string }) => ({}))
  }
  const files = {
    resolveRuntimeReference: jest.fn(async (input: WorkspaceFileReference) => ({
      ...input,
      source: 'platform.workspace.files',
      workspacePath: input.filePath
    })),
    readBuffer: jest.fn(async (input: WorkspaceFileReference) => ({
      buffer: input.filePath === 'output.json' ? result : source
    }))
  }
  const converter = new MarkItDownSandboxConverter({
    get<T>(key: RuntimeCapabilityKey<T>): T | undefined {
      // Mirrors the SDK registry's typed key boundary without loading the host in a plugin unit test.
      return (key.id === 'platform.sandbox.jobs' ? jobs : key.id === 'platform.workspace.files' ? files : undefined) as
        | T
        | undefined
    }
  })
  return { source, result, response, jobs, files, converter }
}

describe('MarkItDown Sandbox Jobs boundary', () => {
  it('uses the installed package identity for health checks and Jobs', async () => {
    const f = fixture()
    await f.converter.convert('a.md', 'md', { fileScope, stage: 'prod' })
    expect(f.jobs.getActionHealth).toHaveBeenCalledWith({
      pluginName: '@xpert-ai/plugin-markitdown',
      action: 'markitdown.convert',
      actionVersion: '1.1.0'
    })
    expect(f.jobs.run.mock.calls[0][0].scope.pluginName).toBe('@xpert-ai/plugin-markitdown')
  })

  it('returns an actionable HTTP error when the installed Action is missing', async () => {
    const f = fixture()
    f.jobs.getActionHealth.mockResolvedValue({
      ...(await f.jobs.getActionHealth()),
      available: false,
      reason: 'ACTION_MISSING'
    })
    const error = await f.converter.checkHealth().catch((error: Error) => error)
    expect(error).toBeInstanceOf(ServiceUnavailableException)
    if (!(error instanceof ServiceUnavailableException)) throw new Error('Expected HTTP 503')
    expect(error.getStatus()).toBe(503)
    expect(error.message).toMatch(/system.*plugin/i)
    expect(error.message).toContain('ACTION_MISSING')
    expect(f.jobs.run).not.toHaveBeenCalled()
  })

  it('submits scoped immutable file references instead of bytes, commands or Python paths', async () => {
    const f = fixture()
    const result = await f.converter.convert('files/source.md', 'markdown', {
      fileScope,
      documentId: 'doc',
      stage: 'prod'
    })
    expect(result.markdown).toBe(f.source.toString())
    const request = f.jobs.run.mock.calls[0][0]
    expect(request.scope).toMatchObject({ tenantId: 'tenant', businessResourceId: 'doc' })
    expect(request.payload).toEqual({ extension: 'md' })
    expect(request.files).toEqual([
      {
        reference: expect.objectContaining({ ...fileScope, filePath: 'files/source.md' }),
        targetPath: 'source.bin',
        size: f.source.length,
        sha256: checksum(f.source)
      }
    ])
    expect(JSON.stringify(request)).not.toContain('# Source')
    expect(request).not.toHaveProperty('command')
    expect(request).not.toHaveProperty('env')
    expect(request.outputs[0].destination).toMatchObject(fileScope)
  })
  it('reports an empty upload before submitting a Job', async () => {
    const f = fixture()
    f.files.readBuffer.mockResolvedValue({ buffer: Buffer.alloc(0) })
    await expect(f.converter.convert('empty.txt', 'txt', { fileScope, stage: 'prod' })).rejects.toThrow(
      'MARKITDOWN_EMPTY_FILE'
    )
    expect(f.jobs.run).not.toHaveBeenCalled()
  })
  it('removes repeated Job wrappers while retaining the exact bounded conversion code', async () => {
    const f = fixture()
    f.jobs.run.mockRejectedValue(new Error('EXPORT_OUTPUT_INVALID: EXPORT_OUTPUT_INVALID: MARKITDOWN_INVALID_DOCUMENT'))
    await expect(f.converter.convert('bad.pdf', 'pdf', { fileScope, stage: 'prod' })).rejects.toThrow(
      /^MARKITDOWN_INVALID_DOCUMENT$/
    )
  })
  it('fails closed when platform capabilities are missing', async () => {
    await expect(new MarkItDownSandboxConverter().convert('a.md', 'md', { fileScope, stage: 'prod' })).rejects.toThrow(
      'Sandbox Jobs'
    )
  })
  it('rejects missing trusted scope before accessing files', async () => {
    const f = fixture()
    await expect(f.converter.convert('a.md', 'md', { stage: 'prod' })).rejects.toThrow('file scope')
    expect(f.files.readBuffer).not.toHaveBeenCalled()
  })
  it('checks Runtime health without falling back to a host process', async () => {
    const f = fixture()
    f.jobs.getActionHealth.mockResolvedValue({
      ...(await f.jobs.getActionHealth()),
      available: false,
      reason: 'RUNTIME_UNBOUND'
    })
    await expect(f.converter.convert('a.md', 'md', { fileScope, stage: 'prod' })).rejects.toThrow('RUNTIME_UNBOUND')
    expect(f.files.readBuffer).not.toHaveBeenCalled()
    expect(f.jobs.run).not.toHaveBeenCalled()
  })
  it('rejects a changed output checksum', async () => {
    const f = fixture()
    f.response.outputs[0].sha256 = '0'.repeat(64)
    await expect(f.converter.convert('a.md', 'md', { fileScope, stage: 'prod' })).rejects.toThrow('integrity')
  })
  it('keeps idempotency within knowledge scope and source contents', async () => {
    const f = fixture()
    await f.converter.convert('a.md', 'md', { fileScope, stage: 'prod' })
    await f.converter.convert('a.md', 'md', { fileScope, stage: 'prod' })
    await f.converter.convert('a.md', 'md', { fileScope: { ...fileScope, scopeId: 'kb2' }, stage: 'prod' })
    expect(f.jobs.run.mock.calls[0][0].idempotencyKey).toBe(f.jobs.run.mock.calls[1][0].idempotencyKey)
    expect(f.jobs.run.mock.calls[0][0].idempotencyKey).not.toBe(f.jobs.run.mock.calls[2][0].idempotencyKey)
    expect(f.jobs.run.mock.calls[0][0].jobId).toBe(f.jobs.run.mock.calls[1][0].jobId)
    await f.converter.convert('a.md', 'md', { fileScope: { ...fileScope, tenantId: 'tenant2' }, stage: 'prod' })
    expect(f.jobs.run.mock.calls[0][0].jobId).not.toBe(f.jobs.run.mock.calls[3][0].jobId)
  })
  it('cancels the platform Job when aborted while running', async () => {
    const f = fixture()
    const controller = new AbortController()
    f.jobs.run.mockImplementation(async () => {
      controller.abort()
      return f.response
    })
    await expect(
      f.converter.convert('a.md', 'md', { fileScope, stage: 'prod', signal: controller.signal })
    ).rejects.toThrow()
    expect(f.jobs.cancel).toHaveBeenCalledWith({ jobId: f.jobs.run.mock.calls[0][0].jobId })
  })
  it('does not reuse conversion outputs from an older platform Runtime', async () => {
    const f = fixture()
    await f.converter.convert('a.md', 'md', { fileScope, stage: 'prod' })
    f.jobs.getActionHealth.mockResolvedValue({ ...(await f.jobs.getActionHealth()), sandboxRuntimeVersion: '1.2.2' })
    await f.converter.convert('a.md', 'md', { fileScope, stage: 'prod' })
    expect(f.jobs.run.mock.calls[0][0].idempotencyKey).not.toBe(f.jobs.run.mock.calls[1][0].idempotencyKey)
  })
})
