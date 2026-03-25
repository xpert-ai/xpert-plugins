jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSandbox: class {},
  PLUGIN_CONFIG_RESOLVER_TOKEN: 'PLUGIN_CONFIG_RESOLVER_TOKEN'
}))

import { MarkItDownBootstrapService } from './markitdown-bootstrap.service.js'

describe('MarkItDownBootstrapService', () => {
  let service: MarkItDownBootstrapService

  beforeEach(() => {
    service = new MarkItDownBootstrapService()
  })

  describe('resolveConfig', () => {
    it('should return defaults when no config provided', () => {
      const config = service.resolveConfig()
      expect(config.version).toBe('latest')
      expect(config.skillsDir).toBe('/workspace/.xpert/skills/markitdown')
      expect(config.extras).toBe('all')
    })

    it('should merge partial config', () => {
      const config = service.resolveConfig({ version: '0.1.1' })
      expect(config.version).toBe('0.1.1')
      expect(config.skillsDir).toBe('/workspace/.xpert/skills/markitdown')
    })

    it('should override extras', () => {
      const config = service.resolveConfig({ extras: 'pdf' })
      expect(config.extras).toBe('pdf')
    })
  })

  describe('isMarkItDownCommand', () => {
    it('should detect markitdown command', () => {
      expect(service.isMarkItDownCommand('markitdown file.pdf')).toBe(true)
    })

    it('should detect markitdown in a pipeline', () => {
      expect(service.isMarkItDownCommand('cat file.html | markitdown')).toBe(true)
    })

    it('should detect markitdown with path', () => {
      expect(service.isMarkItDownCommand('markitdown /workspace/doc.docx > output.md')).toBe(true)
    })

    it('should detect markitdown with env prefixes', () => {
      expect(service.isMarkItDownCommand('env FOO=1 markitdown report.pdf')).toBe(true)
    })

    it('should not detect unrelated commands', () => {
      expect(service.isMarkItDownCommand('cat file.pdf')).toBe(false)
    })

    it('should not detect partial matches', () => {
      expect(service.isMarkItDownCommand('mymarkitdown file.pdf')).toBe(false)
    })

    it('should return false for empty input', () => {
      expect(service.isMarkItDownCommand('')).toBe(false)
    })

    it('should return false for null/undefined', () => {
      expect(service.isMarkItDownCommand(null as unknown as string)).toBe(false)
      expect(service.isMarkItDownCommand(undefined as unknown as string)).toBe(false)
    })

    it('should not match plain text mentions', () => {
      expect(service.isMarkItDownCommand('echo markitdown')).toBe(false)
      expect(service.isMarkItDownCommand('grep markitdown README.md')).toBe(false)
    })
  })

  describe('buildSystemPrompt', () => {
    it('should include markitdown references', () => {
      const prompt = service.buildSystemPrompt()
      expect(prompt).toContain('<skill>')
      expect(prompt).toContain('markitdown')
      expect(prompt).toContain('sandbox_shell')
      expect(prompt).toContain('SKILL.md')
    })

    it('should include the skills dir path', () => {
      const config = service.resolveConfig({ skillsDir: '/custom/skills' })
      const prompt = service.buildSystemPrompt(config)
      expect(prompt).toContain('/custom/skills/SKILL.md')
    })

    it('should shell-quote read commands for custom skills dirs', () => {
      const config = service.resolveConfig({ skillsDir: '/custom/skills dir' })
      const prompt = service.buildSystemPrompt(config)
      expect(prompt).toContain("cat '/custom/skills dir/SKILL.md'")
      expect(prompt).not.toContain('references/supported-formats.md')
    })
  })

  describe('ensureBootstrap', () => {
    it('should throw if backend is not available', async () => {
      await expect(service.ensureBootstrap(null as any)).rejects.toThrow(
        'Sandbox backend is not available'
      )
    })

    it('should throw if backend has no execute', async () => {
      await expect(service.ensureBootstrap({} as any)).rejects.toThrow(
        'Sandbox backend is not available'
      )
    })

    it('should skip bootstrap if stamp matches and binary exists', async () => {
      const mockBackend = {
        execute: jest.fn()
          .mockResolvedValueOnce({
            output: JSON.stringify({
              tool: 'markitdown',
              version: 'latest',
              extras: 'all',
              bootstrapVersion: 1,
              installedAt: new Date().toISOString()
            }),
            exitCode: 0
          })
          .mockResolvedValueOnce({
            output: '/usr/local/bin/markitdown',
            exitCode: 0
          })
          .mockResolvedValueOnce({
            output: '',
            exitCode: 0
          }),
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(mockBackend)
      expect(result).toEqual({ output: 'already bootstrapped', exitCode: 0, truncated: false })
      expect(mockBackend.execute).toHaveBeenCalledTimes(3)
    })

    it('should install markitdown when the binary is missing', async () => {
      const mockBackend = {
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // stamp check
          .mockResolvedValueOnce({ output: '', exitCode: 1 }) // markitdown missing
          .mockResolvedValueOnce({ output: '/usr/bin/pip3', exitCode: 0 }) // pip check
          .mockResolvedValueOnce({ output: 'Successfully installed', exitCode: 0 }) // pip install
          .mockResolvedValue({ output: '', exitCode: 0 }), // asset writes + stamp
        uploadFiles: jest.fn().mockResolvedValue([])
      }

      const result = await service.ensureBootstrap(mockBackend)
      expect(result).toEqual({ output: 'bootstrapped markitdown', exitCode: 0, truncated: false })
      // Verify pip install was called
      const installCall = mockBackend.execute.mock.calls[3][0]
      expect(installCall).toContain('pip3 install')
      expect(installCall).toContain('--break-system-packages')
      expect(installCall).toContain('markitdown')
    })

    it('should refresh assets and stamp without reinstalling when markitdown already exists but no stamp exists', async () => {
      const mockBackend = {
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // stamp check
          .mockResolvedValueOnce({ output: '/usr/local/bin/markitdown', exitCode: 0 }) // markitdown exists
          .mockResolvedValueOnce({ output: '', exitCode: 1 }) // assets missing
          .mockResolvedValue({ output: '', exitCode: 0 }), // asset writes + stamp
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(mockBackend)
      expect(result).toEqual({
        output: 'refreshed markitdown bootstrap',
        exitCode: 0,
        truncated: false
      })
      expect(mockBackend.execute.mock.calls.some(([command]) => command.includes('pip3 install'))).toBe(false)
      expect(mockBackend.execute.mock.calls.some(([command]) => command.includes('pip install'))).toBe(false)
    })

    it('should refresh assets when stamp matches but skill files are missing', async () => {
      const mockBackend = {
        execute: jest.fn()
          .mockResolvedValueOnce({
            output: JSON.stringify({
              tool: 'markitdown',
              version: 'latest',
              extras: 'all',
              bootstrapVersion: 1,
              installedAt: new Date().toISOString()
            }),
            exitCode: 0
          })
          .mockResolvedValueOnce({
            output: '/usr/local/bin/markitdown',
            exitCode: 0
          })
          .mockResolvedValueOnce({
            output: '',
            exitCode: 1
          })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(mockBackend)
      expect(result).toEqual({
        output: 'refreshed markitdown bootstrap',
        exitCode: 0,
        truncated: false
      })
    })

    it('should reinstall when extras change', async () => {
      const mockBackend = {
        execute: jest.fn()
          .mockResolvedValueOnce({
            output: JSON.stringify({
              tool: 'markitdown',
              version: 'latest',
              extras: 'all',
              bootstrapVersion: 1,
              installedAt: new Date().toISOString()
            }),
            exitCode: 0
          })
          .mockResolvedValueOnce({
            output: '/usr/local/bin/markitdown',
            exitCode: 0
          })
          .mockResolvedValueOnce({
            output: '',
            exitCode: 0
          })
          .mockResolvedValueOnce({
            output: '/usr/bin/pip3',
            exitCode: 0
          })
          .mockResolvedValueOnce({
            output: 'Successfully installed',
            exitCode: 0
          })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(mockBackend, service.resolveConfig({ extras: 'pdf' }))
      expect(result).toEqual({ output: 'bootstrapped markitdown', exitCode: 0, truncated: false })
      expect(mockBackend.execute.mock.calls[4][0]).toContain('markitdown[pdf]')
    })

    it('should throw if pip is not available', async () => {
      const mockBackend = {
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // stamp check
          .mockResolvedValueOnce({ output: '', exitCode: 1 }) // markitdown missing
          .mockResolvedValueOnce({ output: '', exitCode: 1 }), // pip check fails
        uploadFiles: jest.fn()
      }

      await expect(service.ensureBootstrap(mockBackend)).rejects.toThrow(
        'Python pip is not available'
      )
    })

    it('should throw if pip install fails', async () => {
      const mockBackend = {
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // stamp check
          .mockResolvedValueOnce({ output: '', exitCode: 1 }) // markitdown missing
          .mockResolvedValueOnce({ output: '/usr/bin/pip3', exitCode: 0 }) // pip check
          .mockResolvedValueOnce({ output: 'ERROR: No matching distribution', exitCode: 1 }), // pip install fails
        uploadFiles: jest.fn()
      }

      await expect(service.ensureBootstrap(mockBackend)).rejects.toThrow(
        'MarkItDown install failed'
      )
    })

    it('should throw if writing the stamp fails', async () => {
      const mockBackend = {
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // stamp check
          .mockResolvedValueOnce({ output: '', exitCode: 1 }) // markitdown missing
          .mockResolvedValueOnce({ output: '/usr/bin/pip3', exitCode: 0 }) // pip check
          .mockResolvedValueOnce({ output: 'Successfully installed', exitCode: 0 }) // pip install
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // asset write
          .mockResolvedValueOnce({ output: 'permission denied', exitCode: 1 }), // stamp write
        uploadFiles: jest.fn()
      }

      await expect(service.ensureBootstrap(mockBackend)).rejects.toThrow(
        'Failed to write MarkItDown bootstrap stamp'
      )
    })
  })
})
