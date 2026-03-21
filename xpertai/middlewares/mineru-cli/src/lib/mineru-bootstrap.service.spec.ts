jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSandbox: class {},
  PLUGIN_CONFIG_RESOLVER_TOKEN: 'PLUGIN_CONFIG_RESOLVER_TOKEN'
}))

import { MinerUBootstrapService } from './mineru-bootstrap.service.js'
import {
  DEFAULT_MINERU_SECRET_ENV_PATH,
  DEFAULT_MINERU_SKILLS_DIR,
  DEFAULT_MINERU_STAMP_PATH,
  DEFAULT_MINERU_WRAPPER_PATH,
  MINERU_BOOTSTRAP_SCHEMA_VERSION,
  MINERU_SKILLS_VERSION
} from './mineru.types.js'
import { getSkillAssets } from './skills/index.js'

describe('MinerUBootstrapService', () => {
  const baseConfig = {
    apiKey: 'secret-token',
    skillsDir: DEFAULT_MINERU_SKILLS_DIR,
    wrapperPath: DEFAULT_MINERU_WRAPPER_PATH
  }

  it('merges plugin config and middleware config', () => {
    const service = new MinerUBootstrapService({
      resolve: jest.fn().mockReturnValue({
        apiKey: 'plugin-token',
        skillsDir: '/legacy/skills',
        wrapperPath: '/legacy/bin/mineru'
      })
    } as any)

    const config = service.resolveConfig({
      apiKey: 'middleware-token',
      wrapperPath: '/custom/bin/mineru'
    })

    expect(config.apiKey).toBe('middleware-token')
    expect(config.skillsDir).toBe('/legacy/skills')
    expect(config.wrapperPath).toBe('/custom/bin/mineru')
  })

  it('computes a stable secret fingerprint', () => {
    const service = new MinerUBootstrapService()
    expect(service.computeSecretFingerprint('abc')).toMatch(/^sha256:/)
    expect(service.computeSecretFingerprint('abc')).toBe(service.computeSecretFingerprint('abc'))
  })

  it('writes assets, secret env, wrapper, and stamp on first bootstrap', async () => {
    const service = new MinerUBootstrapService({
      resolve: jest.fn().mockReturnValue(baseConfig)
    } as any)

    const execute = jest.fn()
      .mockResolvedValueOnce({ output: '/usr/bin/python3\n', exitCode: 0, truncated: false })
      .mockResolvedValueOnce({ output: '', exitCode: 0, truncated: false })
      .mockResolvedValue({ output: '', exitCode: 0, truncated: false })

    await service.ensureBootstrap({ execute } as any, baseConfig)

    const allCalls = execute.mock.calls.map(([cmd]: [string]) => cmd)
    const skillAssets = getSkillAssets(DEFAULT_MINERU_SKILLS_DIR)

    expect(execute).toHaveBeenCalledTimes(2 + skillAssets.length + 3)
    expect(allCalls.some((cmd) => cmd.includes('/workspace/.xpert/skills/mineru/SKILL.md'))).toBe(true)
    expect(allCalls.some((cmd) => cmd.includes(DEFAULT_MINERU_SECRET_ENV_PATH))).toBe(true)
    expect(allCalls.some((cmd) => cmd.includes(DEFAULT_MINERU_WRAPPER_PATH))).toBe(true)
    expect(allCalls.some((cmd) => cmd.includes(DEFAULT_MINERU_STAMP_PATH))).toBe(true)
  })

  it('skips bootstrap when stamp, wrapper, runner, and python are available', async () => {
    const service = new MinerUBootstrapService({
      resolve: jest.fn().mockReturnValue(baseConfig)
    } as any)

    const execute = jest.fn()
      .mockResolvedValueOnce({ output: '/usr/bin/python3\n', exitCode: 0, truncated: false })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          bootstrapVersion: MINERU_BOOTSTRAP_SCHEMA_VERSION,
          skillsVersion: MINERU_SKILLS_VERSION,
          secretFingerprint: service.computeSecretFingerprint(baseConfig.apiKey)
        }),
        exitCode: 0,
        truncated: false
      })
      .mockResolvedValueOnce({ output: 'ok\n', exitCode: 0, truncated: false })

    const result = await service.ensureBootstrap({ execute } as any, baseConfig)

    expect(result).toEqual({ output: 'already bootstrapped', exitCode: 0, truncated: false })
    expect(execute).toHaveBeenCalledTimes(3)
  })

  it('re-bootstraps when the api key fingerprint changes', async () => {
    const service = new MinerUBootstrapService({
      resolve: jest.fn().mockReturnValue(baseConfig)
    } as any)

    const execute = jest.fn()
      .mockResolvedValueOnce({ output: '/usr/bin/python3\n', exitCode: 0, truncated: false })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          bootstrapVersion: MINERU_BOOTSTRAP_SCHEMA_VERSION,
          skillsVersion: MINERU_SKILLS_VERSION,
          secretFingerprint: service.computeSecretFingerprint('different')
        }),
        exitCode: 0,
        truncated: false
      })
      .mockResolvedValue({ output: '', exitCode: 0, truncated: false })

    await service.ensureBootstrap({ execute } as any, baseConfig)

    const allCalls = execute.mock.calls.map(([cmd]: [string]) => cmd)
    expect(allCalls.some((cmd) => cmd.includes(DEFAULT_MINERU_SECRET_ENV_PATH))).toBe(true)
    expect(allCalls.some((cmd) => cmd.includes(DEFAULT_MINERU_WRAPPER_PATH))).toBe(true)
  })

  it('throws when python3 is unavailable', async () => {
    const service = new MinerUBootstrapService({
      resolve: jest.fn().mockReturnValue(baseConfig)
    } as any)

    await expect(
      service.ensureBootstrap(
        {
          execute: jest.fn().mockResolvedValueOnce({ output: '', exitCode: 1, truncated: false })
        } as any,
        baseConfig
      )
    ).rejects.toThrow('Python 3 is not available in the sandbox')
  })

  it('builds a system prompt that references the skill files and wrapper usage', () => {
    const service = new MinerUBootstrapService()
    const prompt = service.buildSystemPrompt(baseConfig)

    expect(prompt).toContain('The `mineru` command is available in the sandbox')
    expect(prompt).toContain('/workspace/.xpert/skills/mineru/SKILL.md')
    expect(prompt).toContain('Do not export API keys manually')
  })

  it('detects mineru commands and rewrites them to the wrapper path', () => {
    const service = new MinerUBootstrapService()

    expect(service.isMinerUCommand('mineru --file ./a.pdf --output ./out')).toBe(true)
    expect(service.isMinerUCommand('/tmp/mineru --file ./a.pdf --output ./out')).toBe(true)
    expect(service.isMinerUCommand('ls -la')).toBe(false)
    expect(service.rewriteCommand('mineru --file ./a.pdf --output ./out', '/wrapper/mineru')).toBe(
      '/wrapper/mineru --file ./a.pdf --output ./out'
    )
    expect(service.rewriteCommand('/tmp/mineru --file ./a.pdf --output ./out', '/wrapper/mineru')).toBe(
      '/wrapper/mineru --file ./a.pdf --output ./out'
    )
    expect(
      service.rewriteCommand('/wrapper/mineru --file ./a.pdf --output ./out', '/wrapper/mineru')
    ).toBe('/wrapper/mineru --file ./a.pdf --output ./out')
  })
})
