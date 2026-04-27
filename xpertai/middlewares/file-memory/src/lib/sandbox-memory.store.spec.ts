jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  SandboxBackendProtocol: class {},
  resolveSandboxBackend: jest.fn()
}))

import { SandboxMemoryStore } from './sandbox-memory.store.js'

describe('SandboxMemoryStore', () => {
  it('treats a missing directory as an empty markdown listing', async () => {
    const backend = {
      id: 'backend-1',
      workingDirectory: '/tmp/workspace',
      globInfo: jest.fn().mockRejectedValue(new Error("Path '.xpert/memory/xperts/x1/private/feedback' not found"))
    }

    const store = new SandboxMemoryStore(backend as any, null)

    await expect(store.listMarkdownFiles('xperts/x1/private/feedback')).resolves.toEqual([])
    expect(backend.globInfo).toHaveBeenCalledWith('*.md', '.xpert/memory/xperts/x1/private/feedback')
  })

  it('keeps propagating non-missing directory errors', async () => {
    const backend = {
      id: 'backend-1',
      workingDirectory: '/tmp/workspace',
      globInfo: jest.fn().mockRejectedValue(new Error('permission denied'))
    }

    const store = new SandboxMemoryStore(backend as any, null)

    await expect(store.listMarkdownFiles('xperts/x1/private/feedback')).rejects.toThrow('permission denied')
  })
})
