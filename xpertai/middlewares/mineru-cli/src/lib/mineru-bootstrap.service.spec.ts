jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSandbox: class {},
  PLUGIN_CONFIG_RESOLVER_TOKEN: 'PLUGIN_CONFIG_RESOLVER_TOKEN'
}))

import {
  DEFAULT_MINERU_CLI_SECRETS_DIR,
  DEFAULT_MINERU_CLI_STAMP_PATH,
  DEFAULT_MINERU_CLI_TOKEN_PATH,
  MINERU_CLI_BOOTSTRAP_SCHEMA_VERSION
} from './mineru-cli.types.js'
import { MinerUBootstrapService } from './mineru-bootstrap.service.js'

const DEFAULT_MINERU_CLI_TOKEN_UPLOAD_PATH = '.xpert/secrets/mineru_token'
const PROJECT_MINERU_CLI_TOKEN_UPLOAD_PATH = '../.xpert/secrets/mineru_token'

describe('MinerUBootstrapService', () => {
  let service: MinerUBootstrapService

  beforeEach(() => {
    delete process.env['MINERU_TOKEN']
    service = new MinerUBootstrapService()
  })

  describe('resolveConfig', () => {
    it('returns defaults when no config is provided', () => {
      const config = service.resolveConfig()
      expect(config).toEqual({ apiToken: undefined })
    })

    it('uses MINERU_TOKEN from the environment by default', () => {
      process.env['MINERU_TOKEN'] = 'env-token'
      service = new MinerUBootstrapService()

      const config = service.resolveConfig()
      expect(config.apiToken).toBe('env-token')
    })

    it('lets middleware options override env defaults', () => {
      process.env['MINERU_TOKEN'] = 'env-token'
      service = new MinerUBootstrapService()

      const config = service.resolveConfig({ apiToken: 'option-token' })
      expect(config.apiToken).toBe('option-token')
    })

    it('ignores deprecated skillsDir overrides', () => {
      const config = service.resolveConfig({
        apiToken: 'option-token',
        skillsDir: '/custom/skills'
      } as any)

      expect(config).toEqual({ apiToken: 'option-token' })
    })
  })

  describe('buildSystemPrompt', () => {
    it('includes the skill description and secure token guidance', () => {
      const prompt = service.buildSystemPrompt()
      expect(prompt).toContain('<skill>')
      expect(prompt).toContain('Convert documents')
      expect(prompt).toContain('/workspace/.xpert/skills/mineru-cli/SKILL.md')
      expect(prompt).toContain('/workspace/.xpert/skills/mineru-cli/scripts/mineru.py')
      expect(prompt).toContain('securely provisioned inside the sandbox')
    })
  })

  describe('isMinerUCommand', () => {
    it('detects direct python3 mineru script execution', () => {
      expect(
        service.isMinerUCommand('python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./report.pdf')
      ).toBe(true)
    })

    it('detects env-prefixed mineru script execution', () => {
      expect(
        service.isMinerUCommand('env LANG=C python /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --url https://example.com/a.pdf')
      ).toBe(true)
    })

    it('detects mineru script execution after supported python interpreter flags', () => {
      expect(
        service.isMinerUCommand(
          'env -i LANG=C python3 -u -X utf8 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./report.pdf'
        )
      ).toBe(true)
    })

    it('does not match unrelated python scripts', () => {
      expect(service.isMinerUCommand('python3 ./other.py')).toBe(false)
    })

    it('does not match file arguments that mention mineru.py', () => {
      expect(service.isMinerUCommand('cat /workspace/.xpert/skills/mineru-cli/scripts/mineru.py')).toBe(false)
    })

    it('does not match wrapper scripts that receive mineru.py as an argument', () => {
      expect(
        service.isMinerUCommand(
          'python3 ./wrapper.py /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./report.pdf'
        )
      ).toBe(false)
    })

    it('does not match module-mode python invocations that mention mineru.py later', () => {
      expect(
        service.isMinerUCommand(
          'python3 -m helper /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./report.pdf'
        )
      ).toBe(false)
    })

    it('does not match command-string python invocations that mention mineru.py later', () => {
      expect(
        service.isMinerUCommand(
          'python3 -c "print(\'helper\')" /workspace/.xpert/skills/mineru-cli/scripts/mineru.py --file ./report.pdf'
        )
      ).toBe(false)
    })
  })

  describe('syncApiTokenSecret', () => {
    it('uploads the managed token file without exposing the token in execute commands', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
        uploadFiles: jest.fn().mockResolvedValue([{ path: DEFAULT_MINERU_CLI_TOKEN_UPLOAD_PATH, error: null }])
      }

      await service.syncApiTokenSecret(backend as any, service.resolveConfig({ apiToken: 'secret-token' }))

      expect(backend.execute).toHaveBeenNthCalledWith(
        1,
        `mkdir -p '${DEFAULT_MINERU_CLI_SECRETS_DIR}' && chmod 700 '${DEFAULT_MINERU_CLI_SECRETS_DIR}'`
      )
      expect(backend.execute).toHaveBeenNthCalledWith(2, `chmod 600 '${DEFAULT_MINERU_CLI_TOKEN_PATH}'`)
      expect(backend.uploadFiles).toHaveBeenCalledTimes(1)

      const [[uploadedPath, uploadedContent]] = backend.uploadFiles.mock.calls[0][0]
      expect(uploadedPath).toBe(DEFAULT_MINERU_CLI_TOKEN_UPLOAD_PATH)
      expect(Buffer.from(uploadedContent).toString('utf8')).toBe('secret-token')

      const executedCommands = backend.execute.mock.calls.map(([command]) => command as string).join('\n')
      expect(executedCommands).not.toContain('secret-token')
    })

    it('uploads the managed token file relative to the backend working directory', async () => {
      const backend = {
        workingDirectory: '/workspace/project-a',
        execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
        uploadFiles: jest.fn().mockResolvedValue([{ path: PROJECT_MINERU_CLI_TOKEN_UPLOAD_PATH, error: null }])
      }

      await service.syncApiTokenSecret(backend as any, service.resolveConfig({ apiToken: 'secret-token' }))

      const [[uploadedPath]] = backend.uploadFiles.mock.calls[0][0]
      expect(uploadedPath).toBe(PROJECT_MINERU_CLI_TOKEN_UPLOAD_PATH)
      expect(backend.execute).toHaveBeenNthCalledWith(2, `chmod 600 '${DEFAULT_MINERU_CLI_TOKEN_PATH}'`)
    })

    it('falls back to the absolute token path when backend workingDirectory is unavailable', async () => {
      const backend = {
        execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
        uploadFiles: jest.fn().mockResolvedValue([{ path: DEFAULT_MINERU_CLI_TOKEN_PATH, error: null }])
      }

      await service.syncApiTokenSecret(backend as any, service.resolveConfig({ apiToken: 'secret-token' }))

      const [[uploadedPath]] = backend.uploadFiles.mock.calls[0][0]
      expect(uploadedPath).toBe(DEFAULT_MINERU_CLI_TOKEN_PATH)
    })

    it('removes the managed token file when upload fails after preparing the secret directory', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0, truncated: false })
          .mockResolvedValueOnce({ output: '', exitCode: 0, truncated: false }),
        uploadFiles: jest.fn().mockResolvedValue([{ path: DEFAULT_MINERU_CLI_TOKEN_UPLOAD_PATH, error: 'invalid_path' }])
      }

      await expect(
        service.syncApiTokenSecret(backend as any, service.resolveConfig({ apiToken: 'secret-token' }))
      ).rejects.toThrow(`Failed to upload MinerU API token file: ${DEFAULT_MINERU_CLI_TOKEN_PATH}`)

      expect(backend.execute).toHaveBeenNthCalledWith(2, `rm -f '${DEFAULT_MINERU_CLI_TOKEN_PATH}'`)
    })

    it('removes the uploaded token file when chmod fails after upload', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0, truncated: false })
          .mockResolvedValueOnce({ output: 'chmod failed', exitCode: 1, truncated: false })
          .mockResolvedValueOnce({ output: '', exitCode: 0, truncated: false }),
        uploadFiles: jest.fn().mockResolvedValue([{ path: DEFAULT_MINERU_CLI_TOKEN_UPLOAD_PATH, error: null }])
      }

      await expect(
        service.syncApiTokenSecret(backend as any, service.resolveConfig({ apiToken: 'secret-token' }))
      ).rejects.toThrow('Failed to lock down MinerU API token file: chmod failed')

      expect(backend.execute).toHaveBeenNthCalledWith(
        3,
        `rm -f '${DEFAULT_MINERU_CLI_TOKEN_PATH}'`
      )
    })

    it('surfaces cleanup failure when chmod fails after upload', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0, truncated: false })
          .mockResolvedValueOnce({ output: 'chmod failed', exitCode: 1, truncated: false })
          .mockResolvedValueOnce({ output: 'rm failed', exitCode: 1, truncated: false }),
        uploadFiles: jest.fn().mockResolvedValue([{ path: DEFAULT_MINERU_CLI_TOKEN_UPLOAD_PATH, error: null }])
      }

      await expect(
        service.syncApiTokenSecret(backend as any, service.resolveConfig({ apiToken: 'secret-token' }))
      ).rejects.toThrow(
        'Failed to lock down MinerU API token file: chmod failed; cleanup failed: rm failed'
      )

      expect(backend.execute).toHaveBeenNthCalledWith(
        3,
        `rm -f '${DEFAULT_MINERU_CLI_TOKEN_PATH}'`
      )
    })

    it('throws when a token is configured but secure upload is unavailable', async () => {
      const backend = {
        execute: jest.fn()
      }

      await expect(
        service.syncApiTokenSecret(backend as any, service.resolveConfig({ apiToken: 'secret-token' }))
      ).rejects.toThrow('secure file uploads')
    })

    it('removes the managed token file when apiToken is absent', async () => {
      const backend = {
        execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false })
      }

      await service.syncApiTokenSecret(backend as any)

      expect(backend.execute).toHaveBeenCalledWith(`rm -f '${DEFAULT_MINERU_CLI_TOKEN_PATH}'`)
    })
  })

  describe('ensureBootstrap', () => {
    it('throws if backend is not available', async () => {
      await expect(service.ensureBootstrap(null as any)).rejects.toThrow(
        'Sandbox backend is not available'
      )
    })

    it('throws when python3 is missing', async () => {
      const backend = {
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
      }

      await expect(service.ensureBootstrap(backend as any)).rejects.toThrow(
        'Python 3 is not available in the sandbox'
      )
    })

    it('skips bootstrap when stamp matches and assets are present', async () => {
      const backend = {
        execute: jest.fn()
          .mockResolvedValueOnce({
            output: JSON.stringify({
              tool: 'mineru-cli',
              bootstrapVersion: MINERU_CLI_BOOTSTRAP_SCHEMA_VERSION,
              installedAt: new Date().toISOString()
            }),
            exitCode: 0
          })
          .mockResolvedValueOnce({ output: '/usr/bin/python3', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
      }

      const result = await service.ensureBootstrap(backend as any)
      expect(result).toEqual({ output: 'already bootstrapped', exitCode: 0, truncated: false })
      expect(backend.execute).toHaveBeenCalledTimes(3)
    })

    it('writes assets and stamp when bootstrap is needed', async () => {
      const backend = {
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/python3', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(backend as any)

      expect(result.exitCode).toBe(0)
      expect(backend.execute).toHaveBeenCalledWith(
        expect.stringContaining(DEFAULT_MINERU_CLI_STAMP_PATH)
      )
      expect(backend.execute).toHaveBeenCalledWith(expect.stringContaining('mkdir -p'))
      expect(backend.execute).toHaveBeenCalledWith(expect.stringContaining('__XPERT_MINERU_EOF__'))

      const executedCommands = backend.execute.mock.calls.map(([command]) => command as string)
      const scriptWriteCommand = executedCommands.find((command) =>
        command.includes("> '/workspace/.xpert/skills/mineru-cli/scripts/mineru.py'") &&
        command.includes('__XPERT_MINERU_EOF__')
      )

      expect(scriptWriteCommand).toContain('upload_url = extract_upload_url(file_urls[0])')
      expect(scriptWriteCommand).toContain('upload_headers = extract_upload_headers(file_urls[0])')
      expect(scriptWriteCommand).toContain('put_signed_file(upload_url, file_data, headers=upload_headers)')
      expect(scriptWriteCommand).not.toContain('/extract/task/batch')
    })
  })
})
