jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSandbox: class {}
}))

import { ZipUnzipBootstrapService } from './zip-unzip-bootstrap.service.js'

describe('ZipUnzipBootstrapService', () => {
  let service: ZipUnzipBootstrapService

  beforeEach(() => {
    service = new ZipUnzipBootstrapService()
  })

  describe('resolveConfig', () => {
    it('should return an empty config when no config is provided', () => {
      const config = service.resolveConfig()

      expect(config).toEqual({})
    })
  })

  describe('command detection', () => {
    it('detects zip commands', () => {
      expect(service.isZipCommand('zip archive.zip file.txt')).toBe(true)
      expect(service.isZipCommand('FOO=bar zip archive.zip file.txt')).toBe(true)
      expect(service.isZipCommand('cat manifest | zip archive.zip -@')).toBe(true)
      expect(service.isZipCommand('/usr/bin/zip archive.zip file.txt')).toBe(true)
    })

    it('detects unzip commands', () => {
      expect(service.isUnzipCommand('unzip archive.zip -d output')).toBe(true)
      expect(service.isUnzipCommand('env LANG=C /usr/bin/unzip -l archive.zip')).toBe(true)
    })

    it('does not mistake archive file names for commands', () => {
      expect(service.isZipUnzipCommand('ls archive.zip')).toBe(false)
      expect(service.isZipUnzipCommand('printf "zip -r archive.zip dir\\n"')).toBe(false)
    })

    it('detects interactive zip password prompts', () => {
      expect(service.isInteractiveZipPasswordCommand('zip -e secure.zip file.txt')).toBe(true)
      expect(service.isInteractiveZipPasswordCommand('zip -er secure.zip folder/')).toBe(true)
      expect(service.isInteractiveZipPasswordCommand('zip -P secret secure.zip file.txt')).toBe(false)
      expect(service.isInteractiveZipPasswordCommand('unzip -P secret secure.zip')).toBe(false)
    })
  })

  describe('buildSystemPrompt', () => {
    it('includes sandbox_shell, SKILL.md, and reference guidance', () => {
      const prompt = service.buildSystemPrompt()

      expect(prompt).toContain('sandbox_shell')
      expect(prompt).toContain('/workspace/.xpert/skills/zip-unzip/SKILL.md')
      expect(prompt).toContain('/workspace/.xpert/skills/zip-unzip/references/common-workflows.md')
      expect(prompt).toContain('Do not use `zip -e`')
      expect(prompt).toContain('unzip -o')
      expect(prompt).toContain('unzip -n')
    })
  })

  describe('ensureBootstrap', () => {
    it('throws if backend is not available', async () => {
      await expect(service.ensureBootstrap(null as any)).rejects.toThrow(
        'Sandbox backend is not available'
      )
    })

    it('skips bootstrap when the stamp matches and both binaries exist', async () => {
      const mockBackend = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({
            output: JSON.stringify({
              tool: 'zip-unzip',
              packages: ['zip', 'unzip'],
              bootstrapVersion: 1,
              installedAt: new Date().toISOString()
            }),
            exitCode: 0
          })
          .mockResolvedValueOnce({ output: '/usr/bin/zip', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/unzip', exitCode: 0 }),
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(mockBackend)

      expect(result).toEqual({ output: 'already bootstrapped', exitCode: 0, truncated: false })
      expect(mockBackend.execute).toHaveBeenCalledTimes(3)
    })

    it('refreshes assets when binaries exist but the stamp is missing', async () => {
      const mockBackend = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/zip', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/unzip', exitCode: 0 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(mockBackend)

      expect(result).toEqual({
        output: 'bootstrapped zip/unzip',
        exitCode: 0,
        truncated: false
      })
      expect(mockBackend.execute).toHaveBeenCalled()
    })

    it('reinstalls when the stamp exists but a binary is missing', async () => {
      const mockBackend = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({
            output: JSON.stringify({
              tool: 'zip-unzip',
              packages: ['zip', 'unzip'],
              bootstrapVersion: 1
            }),
            exitCode: 0
          })
          .mockResolvedValueOnce({ output: '/usr/bin/zip', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValueOnce({ output: '/usr/bin/apt', exitCode: 0 })
          .mockResolvedValueOnce({ output: 'installed', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/zip', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/unzip', exitCode: 0 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(mockBackend)

      expect(result).toEqual({
        output: 'refreshed zip/unzip bootstrap',
        exitCode: 0,
        truncated: false
      })
      expect(mockBackend.execute.mock.calls[4][0]).toContain(
        'DEBIAN_FRONTEND=noninteractive apt update && DEBIAN_FRONTEND=noninteractive apt install -y zip unzip'
      )
    })

    it('throws if apt is not available when installation is needed', async () => {
      const mockBackend = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 }),
        uploadFiles: jest.fn()
      }

      await expect(service.ensureBootstrap(mockBackend)).rejects.toThrow('missing `apt`')
    })

    it('throws if apt install fails', async () => {
      const mockBackend = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValueOnce({ output: '/usr/bin/apt', exitCode: 0 })
          .mockResolvedValueOnce({ output: 'boom', exitCode: 1 }),
        uploadFiles: jest.fn()
      }

      await expect(service.ensureBootstrap(mockBackend)).rejects.toThrow('zip/unzip install failed')
    })

    it('throws if writing skill assets fails', async () => {
      const mockBackend = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/zip', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/unzip', exitCode: 0 }),
        uploadFiles: jest.fn().mockResolvedValue([
          {
            path: 'skills/zip-unzip/SKILL.md',
            error: 'write failed'
          }
        ])
      }

      await expect(service.ensureBootstrap(mockBackend as any)).rejects.toThrow(
        'Failed to write Zip/Unzip skill asset /workspace/.xpert/skills/zip-unzip/SKILL.md'
      )
    })
  })
})
