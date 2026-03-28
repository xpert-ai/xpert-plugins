jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSandbox: class {},
  PLUGIN_CONFIG_RESOLVER_TOKEN: 'PLUGIN_CONFIG_RESOLVER_TOKEN'
}))

import {
  DEFAULT_LARK_CLI_APP_ID_PATH,
  DEFAULT_LARK_CLI_APP_SECRET_PATH,
  DEFAULT_LARK_CLI_SECRETS_DIR,
  DEFAULT_LARK_CLI_STAMP_PATH,
  LARK_CLI_BOOTSTRAP_SCHEMA_VERSION,
  LarkAuthMode
} from './lark-cli.types.js'
import { LarkBootstrapService } from './lark-bootstrap.service.js'

const DEFAULT_LARK_CLI_APP_ID_UPLOAD_PATH = '.xpert/secrets/lark_app_id'
const DEFAULT_LARK_CLI_APP_SECRET_UPLOAD_PATH = '.xpert/secrets/lark_app_secret'

describe('LarkBootstrapService', () => {
  let service: LarkBootstrapService

  beforeEach(() => {
    service = new LarkBootstrapService()
  })

  describe('resolveConfig', () => {
    it('returns defaults when no config is provided', () => {
      const config = service.resolveConfig()
      expect(config).toEqual({ authMode: LarkAuthMode.USER })
    })

    it('accepts user mode config', () => {
      const config = service.resolveConfig({ authMode: LarkAuthMode.USER })
      expect(config.authMode).toBe(LarkAuthMode.USER)
    })

    it('accepts bot mode config with credentials', () => {
      const config = service.resolveConfig({
        authMode: LarkAuthMode.BOT,
        appId: 'cli_test_app_id',
        appSecret: 'test_app_secret'
      })
      expect(config.authMode).toBe(LarkAuthMode.BOT)
      expect(config.appId).toBe('cli_test_app_id')
      expect(config.appSecret).toBe('test_app_secret')
    })
  })

  describe('buildSystemPrompt', () => {
    it('includes the skill description and Lark CLI guidance', () => {
      const prompt = service.buildSystemPrompt()
      expect(prompt).toContain('<skill>')
      expect(prompt).toContain('Lark CLI')
      expect(prompt).toContain('/workspace/.xpert/skills/lark-cli/')
      expect(prompt).toContain('lark-cli calendar +agenda')
      expect(prompt).toContain('lark-cli im +messages-send')
    })

    it('lists available skills', () => {
      const prompt = service.buildSystemPrompt()
      expect(prompt).toContain('lark-shared')
      expect(prompt).toContain('lark-calendar')
      expect(prompt).toContain('lark-im')
      expect(prompt).toContain('lark-doc')
    })
  })

  describe('isLarkCliCommand', () => {
    it('detects direct lark-cli execution', () => {
      expect(service.isLarkCliCommand('lark-cli calendar +agenda')).toBe(true)
    })

    it('detects lark-cli with various prefixes', () => {
      expect(service.isLarkCliCommand('lark-cli im +messages-send --chat-id "oc_xxx"')).toBe(true)
    })

    it('detects lark-cli in compound commands', () => {
      expect(service.isLarkCliCommand('echo "test" && lark-cli calendar +agenda')).toBe(true)
      expect(service.isLarkCliCommand('lark-cli auth status || echo "not logged in"')).toBe(true)
    })

    it('does not match unrelated commands', () => {
      expect(service.isLarkCliCommand('echo "lark-cli"')).toBe(false)
      expect(service.isLarkCliCommand('cat lark-cli.txt')).toBe(false)
    })
  })

  describe('syncBotCredentials', () => {
    it('removes credentials when authMode is user', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false })
      }

      await service.syncBotCredentials(backend as any, { authMode: LarkAuthMode.USER })

      expect(backend.execute).toHaveBeenCalledWith(`rm -f '${DEFAULT_LARK_CLI_APP_ID_PATH}'`)
      expect(backend.execute).toHaveBeenCalledWith(`rm -f '${DEFAULT_LARK_CLI_APP_SECRET_PATH}'`)
    })

    it('uploads bot credentials when authMode is bot', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false }),
        uploadFiles: jest.fn()
          .mockResolvedValueOnce([{ path: DEFAULT_LARK_CLI_APP_ID_UPLOAD_PATH, error: null }])
          .mockResolvedValueOnce([{ path: DEFAULT_LARK_CLI_APP_SECRET_UPLOAD_PATH, error: null }])
      }

      await service.syncBotCredentials(backend as any, {
        authMode: LarkAuthMode.BOT,
        appId: 'cli_test_id',
        appSecret: 'test_secret'
      })

      expect(backend.execute).toHaveBeenCalledWith(
        expect.stringContaining(`mkdir -p '${DEFAULT_LARK_CLI_SECRETS_DIR}'`)
      )
      expect(backend.uploadFiles).toHaveBeenCalledTimes(2)
    })

    it('throws when secure upload is unavailable for bot mode', async () => {
      const backend = {
        execute: jest.fn().mockResolvedValue({ output: '', exitCode: 0, truncated: false })
      }

      await expect(
        service.syncBotCredentials(backend as any, {
          authMode: LarkAuthMode.BOT,
          appId: 'cli_test_id',
          appSecret: 'test_secret'
        })
      ).rejects.toThrow('secure file uploads')
    })
  })

  describe('ensureBootstrap', () => {
    it('throws if backend is not available', async () => {
      await expect(service.ensureBootstrap(null as any)).rejects.toThrow(
        'Sandbox backend is not available'
      )
    })

    it('throws when node is missing', async () => {
      const backend = {
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
      }

      await expect(service.ensureBootstrap(backend as any)).rejects.toThrow(
        'Node.js is not available in the sandbox'
      )
    })

    it('skips bootstrap when stamp matches and skills are present', async () => {
      const backend = {
        execute: jest.fn()
          .mockResolvedValueOnce({
            output: JSON.stringify({
              tool: 'lark-cli',
              bootstrapVersion: LARK_CLI_BOOTSTRAP_SCHEMA_VERSION,
              installedAt: new Date().toISOString()
            }),
            exitCode: 0
          })
          .mockResolvedValueOnce({ output: '/usr/bin/node', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
      }

      const result = await service.ensureBootstrap(backend as any)
      expect(result).toEqual({ output: 'already bootstrapped', exitCode: 0, truncated: false })
      expect(backend.execute).toHaveBeenCalledTimes(3)
    })

    it('installs lark-cli when bootstrap is needed', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/node', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(backend as any)

      expect(result.exitCode).toBe(0)
      expect(backend.execute).toHaveBeenCalledWith(
        expect.stringContaining('npm install -g @larksuite/cli')
      )
      expect(backend.execute).toHaveBeenCalledWith(
        expect.stringContaining(DEFAULT_LARK_CLI_STAMP_PATH)
      )
    })
  })
})
