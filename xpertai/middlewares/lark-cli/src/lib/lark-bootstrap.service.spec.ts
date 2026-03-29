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

    it('merges plugin config with middleware config', () => {
      const serviceWithResolver = new LarkBootstrapService({
        resolve: jest.fn().mockReturnValue({
          proxy: 'http://proxy.example.com:7890',
          npmRegistryUrl: 'https://registry.npmmirror.com'
        })
      } as any)

      const config = serviceWithResolver.resolveConfig({
        authMode: LarkAuthMode.BOT,
        appId: 'cli_test_app_id',
        appSecret: 'test_app_secret'
      })

      expect(config).toEqual({
        authMode: LarkAuthMode.BOT,
        appId: 'cli_test_app_id',
        appSecret: 'test_app_secret',
        proxy: 'http://proxy.example.com:7890',
        npmRegistryUrl: 'https://registry.npmmirror.com'
      })
    })

    it('normalizes empty strings for download config fields', () => {
      const serviceWithResolver = new LarkBootstrapService({
        resolve: jest.fn().mockReturnValue({
          proxy: 'http://proxy.example.com:7890',
          npmRegistryUrl: 'https://registry.npmmirror.com'
        })
      } as any)

      const config = serviceWithResolver.resolveConfig({
        authMode: LarkAuthMode.USER,
        proxy: '',
        npmRegistryUrl: ''
      })

      expect(config.authMode).toBe(LarkAuthMode.USER)
      expect(config.proxy).toBeUndefined()
      expect(config.npmRegistryUrl).toBeUndefined()
    })

    it('accepts user mode config with download overrides', () => {
      const config = service.resolveConfig({
        authMode: LarkAuthMode.USER,
        proxy: 'http://proxy.example.com:7890',
        npmRegistryUrl: 'https://registry.npmmirror.com'
      })

      expect(config.authMode).toBe(LarkAuthMode.USER)
      expect(config.proxy).toBe('http://proxy.example.com:7890')
      expect(config.npmRegistryUrl).toBe('https://registry.npmmirror.com')
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

    it('skips bootstrap when stamp matches, binary exists, and skills are present', async () => {
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
          .mockResolvedValueOnce({ output: '/usr/bin/lark-cli', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
      }

      const result = await service.ensureBootstrap(backend as any)
      expect(result).toEqual({ output: 'already bootstrapped', exitCode: 0, truncated: false })
      expect(backend.execute).toHaveBeenCalledTimes(4)
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

    it('includes proxy in npm install and curl download when configured', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/node', exitCode: 0 
  describe('checkAuthStatus', () => {
    it('throws if backend is not available', async () => {
      await expect(service.checkAuthStatus(null as any)).rejects.toThrow(
        'Sandbox backend is not available'
      )
    })

    it('parses JSON auth status output', async () => {
      const backend = {
        execute: jest.fn().mockResolvedValue({
          output: JSON.stringify({
            loggedIn: true,
            identityType: 'user',
            tokenValid: true,
            expiresAt: '2025-12-31T23:59:59Z',
            scopes: ['calendar:calendar:readonly']
          }),
          exitCode: 0
        })
      }

      const status = await service.checkAuthStatus(backend as any)
      expect(status.loggedIn).toBe(true)
      expect(status.identityType).toBe('user')
      expect(status.tokenValid).toBe(true)
      expect(status.expiresAt).toBe('2025-12-31T23:59:59Z')
    })

    it('parses text auth status output as fallback', async () => {
      const backend = {
        execute: jest.fn().mockResolvedValue({
          output: 'Logged in\nUser identity\nToken valid until 2025-12-31',
          exitCode: 0
        })
      }

      const status = await service.checkAuthStatus(backend as any)
      expect(status.loggedIn).toBe(true)
      expect(status.identityType).toBe('user')
    })
  })

  describe('buildAuthEnsureResponse', () => {
    it('returns error response when backend is not available', async () => {
      const response = await service.buildAuthEnsureResponse(null, { authMode: LarkAuthMode.USER })
      
      expect(response.configExists).toBe(true)
      expect(response.configValid).toBe(true)
      expect(response.isLoggedIn).toBe(false)
      expect(response.message).toContain('Sandbox backend not available')
    })

    it('returns user mode response with authorization URL when not logged in', async () => {
      // Mock a fully bootstrapped environment
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({ 
            output: JSON.stringify({
              tool: 'lark-cli',
              bootstrapVersion: LARK_CLI_BOOTSTRAP_SCHEMA_VERSION,
              installedAt: new Date().toISOString()
            }),
            exitCode: 0 
          }) // stamp check - already bootstrapped
          .mockResolvedValueOnce({ output: '/usr/bin/node', exitCode: 0 }) // node check
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // skills check (lark-shared exists)
          .mockResolvedValueOnce({ output: JSON.stringify({ loggedIn: false, identityType: 'none' }), exitCode: 0 }) // auth status
          .mockResolvedValueOnce({ 
            output: JSON.stringify({ 
              authorization_url: 'https://example.com/auth',
              device_code: 'ABC123'
            }), 
            exitCode: 0 
          }) // initiate login
      }

      const response = await service.buildAuthEnsureResponse(backend as any, { authMode: LarkAuthMode.USER })
      
      expect(response.authMode).toBe(LarkAuthMode.USER)
      expect(response.isLoggedIn).toBe(false)
      // The authorization URL should be extracted from the login response
      expect(response.authorizationUrl).toBeTruthy()
    })

    it('returns bot mode response with successful auth', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // stamp check
          .mockResolvedValueOnce({ output: '/usr/bin/node', exitCode: 0 }) // node check
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // skills check
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // mkdir secrets
          .mockResolvedValueOnce({ output: '', exitCode: 0 }) // chmod
          .mockResolvedValueOnce({ output: JSON.stringify({ loggedIn: true, identityType: 'bot', tokenValid: true }), exitCode: 0 }), // auth status
        uploadFiles: jest.fn()
          .mockResolvedValueOnce([{ path: '.xpert/secrets/lark_app_id', error: null }])
          .mockResolvedValueOnce([{ path: '.xpert/secrets/lark_app_secret', error: null }])
      }

      const response = await service.buildAuthEnsureResponse(backend as any, {
        authMode: LarkAuthMode.BOT,
        appId: 'cli_test_id',
        appSecret: 'test_secret'
      })
      
      expect(response.authMode).toBe(LarkAuthMode.BOT)
      expect(response.configValid).toBe(true)
    })
  })

  describe('waitForUserLogin', () => {
    it('throws if backend is not available', async () => {
      await expect(service.waitForUserLogin(null as any, 'ABC123')).rejects.toThrow(
        'Sandbox backend is not available'
      )
    })

    it('returns success when login completes', async () => {
      const backend = {
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '{"status":"pending"}', exitCode: 0 })
          .mockResolvedValueOnce({ output: '{"status":"success", "logged_in": true}', exitCode: 0 })
      }

      const response = await service.waitForUserLogin(backend as any, 'ABC123', 10)
      
      expect(response.success).toBe(true)
      expect(response.identityType).toBe('user')
    })
  })
})          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }
      const config = service.resolveConfig({
        authMode: LarkAuthMode.USER,
        proxy: 'http://proxy.example.com:7890'
      })

      await service.ensureBootstrap(backend as any, config)

      const installCommand = findCommand(backend.execute.mock.calls, 'npm install -g @larksuite/cli')
      const curlCommand = findCommand(backend.execute.mock.calls, 'curl -sSL')

      expect(installCommand).toContain("--proxy 'http://proxy.example.com:7890'")
      expect(installCommand).toContain("--https-proxy 'http://proxy.example.com:7890'")
      expect(curlCommand).toContain("--proxy 'http://proxy.example.com:7890'")
    })

    it('includes npm registry only in npm install when configured', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/node', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }
      const config = service.resolveConfig({
        authMode: LarkAuthMode.USER,
        npmRegistryUrl: 'https://registry.npmmirror.com'
      })

      await service.ensureBootstrap(backend as any, config)

      const installCommand = findCommand(backend.execute.mock.calls, 'npm install -g @larksuite/cli')
      const curlCommand = findCommand(backend.execute.mock.calls, 'curl -sSL')

      expect(installCommand).toContain("--registry 'https://registry.npmmirror.com'")
      expect(curlCommand).not.toContain('--registry')
    })

    it('shell-quotes proxy and npm registry when both are configured', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/node', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }
      const config = service.resolveConfig({
        authMode: LarkAuthMode.USER,
        proxy: 'http://user:pass@proxy.example.com:7890',
        npmRegistryUrl: 'https://registry.npmmirror.com/lark'
      })

      await service.ensureBootstrap(backend as any, config)

      const installCommand = findCommand(backend.execute.mock.calls, 'npm install -g @larksuite/cli')
      const curlCommand = findCommand(backend.execute.mock.calls, 'curl -sSL')

      expect(installCommand).toContain("--registry 'https://registry.npmmirror.com/lark'")
      expect(installCommand).toContain("--proxy 'http://user:pass@proxy.example.com:7890'")
      expect(installCommand).toContain("--https-proxy 'http://user:pass@proxy.example.com:7890'")
      expect(curlCommand).toContain("--proxy 'http://user:pass@proxy.example.com:7890'")
    })

    it('reinstalls when proxy changes', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({
            output: JSON.stringify({
              tool: 'lark-cli',
              proxy: 'http://old-proxy.example.com:7890',
              bootstrapVersion: LARK_CLI_BOOTSTRAP_SCHEMA_VERSION,
              installedAt: new Date().toISOString()
            }),
            exitCode: 0
          })
          .mockResolvedValueOnce({ output: '/usr/bin/node', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/lark-cli', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }
      const config = service.resolveConfig({
        authMode: LarkAuthMode.USER,
        proxy: 'http://new-proxy.example.com:7890'
      })

      const result = await service.ensureBootstrap(backend as any, config)

      expect(result).toEqual({ output: 'bootstrapped lark cli', exitCode: 0, truncated: false })
      expect(findCommand(backend.execute.mock.calls, 'npm install -g @larksuite/cli')).toContain(
        "--proxy 'http://new-proxy.example.com:7890'"
      )
    })

    it('reinstalls when npm registry changes', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({
            output: JSON.stringify({
              tool: 'lark-cli',
              npmRegistryUrl: 'https://registry.npmjs.org',
              bootstrapVersion: LARK_CLI_BOOTSTRAP_SCHEMA_VERSION,
              installedAt: new Date().toISOString()
            }),
            exitCode: 0
          })
          .mockResolvedValueOnce({ output: '/usr/bin/node', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/lark-cli', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }
      const config = service.resolveConfig({
        authMode: LarkAuthMode.USER,
        npmRegistryUrl: 'https://registry.npmmirror.com'
      })

      const result = await service.ensureBootstrap(backend as any, config)

      expect(result).toEqual({ output: 'bootstrapped lark cli', exitCode: 0, truncated: false })
      expect(findCommand(backend.execute.mock.calls, 'npm install -g @larksuite/cli')).toContain(
        "--registry 'https://registry.npmmirror.com'"
      )
    })

    it('reinstalls when the binary is missing even if stamp matches', async () => {
      const backend = {
        workingDirectory: '/workspace',
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
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(backend as any)

      expect(result).toEqual({
        output: 'refreshed lark cli bootstrap',
        exitCode: 0,
        truncated: false
      })
      expect(findCommand(backend.execute.mock.calls, 'npm install -g @larksuite/cli')).toContain(
        'npm install -g @larksuite/cli'
      )
    })

    it('reinstalls when skills are missing even if stamp matches', async () => {
      const backend = {
        workingDirectory: '/workspace',
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
          .mockResolvedValueOnce({ output: '/usr/bin/lark-cli', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }

      const result = await service.ensureBootstrap(backend as any)

      expect(result).toEqual({
        output: 'refreshed lark cli bootstrap',
        exitCode: 0,
        truncated: false
      })
      expect(findCommand(backend.execute.mock.calls, 'npm install -g @larksuite/cli')).toContain(
        'npm install -g @larksuite/cli'
      )
    })

    it('writes stamp with proxy and npm registry config', async () => {
      const backend = {
        workingDirectory: '/workspace',
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0 })
          .mockResolvedValueOnce({ output: '/usr/bin/node', exitCode: 0 })
          .mockResolvedValueOnce({ output: '', exitCode: 1 })
          .mockResolvedValue({ output: '', exitCode: 0 }),
        uploadFiles: jest.fn()
      }
      const config = service.resolveConfig({
        authMode: LarkAuthMode.USER,
        proxy: 'http://proxy.example.com:7890',
        npmRegistryUrl: 'https://registry.npmmirror.com'
      })

      await service.ensureBootstrap(backend as any, config)

      const stampCommand = findCommand(backend.execute.mock.calls, DEFAULT_LARK_CLI_STAMP_PATH)
      const echoMatch = stampCommand.match(/echo '(.+)' >/)

      expect(echoMatch).not.toBeNull()
      const stampData = JSON.parse(echoMatch![1])
      expect(stampData.proxy).toBe('http://proxy.example.com:7890')
      expect(stampData.npmRegistryUrl).toBe('https://registry.npmmirror.com')
      expect(stampData.bootstrapVersion).toBe(LARK_CLI_BOOTSTRAP_SCHEMA_VERSION)
    })
  })
})

function findCommand(calls: Array<[unknown]>, pattern: string) {
  const match = calls.find(([command]) =>
    typeof command === 'string' && command.includes(pattern)
  )

  if (!match) {
    throw new Error(`Expected command containing "${pattern}" but none was found.`)
  }

  return match[0] as string
}
