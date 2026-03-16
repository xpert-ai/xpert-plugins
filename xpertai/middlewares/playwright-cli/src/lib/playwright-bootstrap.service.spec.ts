jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSandbox: class {},
  PLUGIN_CONFIG_RESOLVER_TOKEN: 'PLUGIN_CONFIG_RESOLVER_TOKEN'
}))

import { PlaywrightBootstrapService } from './playwright-bootstrap.service.js'
import {
  DEFAULT_PLAYWRIGHT_MANAGED_CONFIG_PATH,
  DEFAULT_PLAYWRIGHT_CLI_VERSION,
  DEFAULT_PLAYWRIGHT_SKILLS_DIR,
  DEFAULT_PLAYWRIGHT_STAMP_PATH,
  PLAYWRIGHT_BOOTSTRAP_SCHEMA_VERSION
} from './playwright.types.js'
import { getSkillAssets } from './skills/index.js'

describe('PlaywrightBootstrapService', () => {
  it('resolves default config when no plugin resolver is provided', () => {
    const service = new PlaywrightBootstrapService()
    const config = service.resolveConfig()

    expect(config.cliVersion).toBe(DEFAULT_PLAYWRIGHT_CLI_VERSION)
    expect(config.skillsDir).toBe(DEFAULT_PLAYWRIGHT_SKILLS_DIR)
  })

  it('merges plugin config with defaults', () => {
    const service = new PlaywrightBootstrapService({
      resolve: jest.fn().mockReturnValue({
        cliVersion: '0.1.0',
        skillsDir: '/custom/skills'
      })
    } as any)
    const config = service.resolveConfig()

    expect(config.cliVersion).toBe('0.1.0')
    expect(config.skillsDir).toBe('/custom/skills')
  })

  it('lets middleware config override legacy plugin config', () => {
    const service = new PlaywrightBootstrapService({
      resolve: jest.fn().mockReturnValue({
        cliVersion: '0.1.0',
        skillsDir: '/legacy/skills'
      })
    } as any)
    const config = service.resolveConfig({
      cliVersion: '0.2.0',
      skillsDir: '/middleware/skills'
    })

    expect(config.cliVersion).toBe('0.2.0')
    expect(config.skillsDir).toBe('/middleware/skills')
  })

  it('installs @playwright/cli globally and writes skill assets via execute (absolute paths)', async () => {
    const service = new PlaywrightBootstrapService({
      resolve: jest.fn().mockReturnValue({
        cliVersion: '0.1.1',
        skillsDir: '/workspace/.xpert/skills/playwright-cli'
      })
    } as any)

    const skillAssets = getSkillAssets('/workspace/.xpert/skills/playwright-cli')
    const bootstrapAssetCount = skillAssets.length + 1
    // Absolute paths bypass uploadFiles and fall back to execute-based writes
    const execute = jest.fn()
      // stamp check
      .mockResolvedValueOnce({ output: '', exitCode: 0, truncated: false })
      // npm install
      .mockResolvedValueOnce({ output: 'added 1 package', exitCode: 0, truncated: false })
      // browser install
      .mockResolvedValueOnce({ output: 'chromium installed', exitCode: 0, truncated: false })
      // skill asset writes + stamp write
      .mockResolvedValue({ output: '', exitCode: 0, truncated: false })

    await service.ensureBootstrap({ execute } as any)

    // Verify npm install command
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("npm install -g @playwright/cli@'0.1.1'")
    )

    // Verify browser install command
    expect(execute).toHaveBeenNthCalledWith(
      3,
      'playwright-cli install chromium'
    )

    // stamp check + npm install + browser install + bootstrap asset writes + stamp write
    expect(execute).toHaveBeenCalledTimes(3 + bootstrapAssetCount + 1)

    // Verify bootstrap asset writes contain the expected paths
    const allCalls = execute.mock.calls.map(([cmd]: [string]) => cmd)
    expect(allCalls.some((cmd: string) => cmd.includes('/workspace/.xpert/skills/playwright-cli/SKILL.md'))).toBe(true)
    expect(allCalls.some((cmd: string) => cmd.includes('/workspace/.xpert/skills/playwright-cli/references/tracing.md'))).toBe(true)
    expect(allCalls.some((cmd: string) => cmd.includes(DEFAULT_PLAYWRIGHT_MANAGED_CONFIG_PATH))).toBe(true)
    expect(allCalls.some((cmd: string) => cmd.includes('"browserName": "chromium"'))).toBe(true)
    expect(allCalls.some((cmd: string) => cmd.includes('"channel": "chromium"'))).toBe(true)

    // Verify stamp is written
    const lastCall = allCalls[allCalls.length - 1]
    expect(lastCall).toContain(DEFAULT_PLAYWRIGHT_STAMP_PATH)
  })

  it('skips bootstrap when stamp matches current version and CLI binary exists', async () => {
    const service = new PlaywrightBootstrapService({
      resolve: jest.fn().mockReturnValue({
        cliVersion: '0.1.1',
        skillsDir: DEFAULT_PLAYWRIGHT_SKILLS_DIR
      })
    } as any)

    const execute = jest.fn()
      // stamp check
      .mockResolvedValueOnce({
        output: JSON.stringify({
          cliVersion: '0.1.1',
          bootstrapVersion: PLAYWRIGHT_BOOTSTRAP_SCHEMA_VERSION
        }),
        exitCode: 0,
        truncated: false
      })
      // which playwright-cli
      .mockResolvedValueOnce({
        output: '/usr/local/bin/playwright-cli',
        exitCode: 0,
        truncated: false
      })

    const result = await service.ensureBootstrap({ execute } as any)

    expect(result).toEqual({ output: 'already bootstrapped', exitCode: 0, truncated: false })
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenNthCalledWith(2, 'which playwright-cli 2>/dev/null')
  })

  it('refreshes managed bootstrap assets when the stamp is from an older schema version', async () => {
    const service = new PlaywrightBootstrapService({
      resolve: jest.fn().mockReturnValue({
        cliVersion: '0.1.1',
        skillsDir: DEFAULT_PLAYWRIGHT_SKILLS_DIR
      })
    } as any)

    const skillAssets = getSkillAssets(DEFAULT_PLAYWRIGHT_SKILLS_DIR)
    const bootstrapAssetCount = skillAssets.length + 1
    const execute = jest.fn()
      // stamp check - version matches, but bootstrapVersion is missing
      .mockResolvedValueOnce({
        output: JSON.stringify({ cliVersion: '0.1.1' }),
        exitCode: 0,
        truncated: false
      })
      // which playwright-cli
      .mockResolvedValueOnce({
        output: '/usr/local/bin/playwright-cli',
        exitCode: 0,
        truncated: false
      })
      // bootstrap asset writes + stamp write
      .mockResolvedValue({ output: '', exitCode: 0, truncated: false })

    const result = await service.ensureBootstrap({ execute } as any)

    expect(result).toEqual({ output: 'already bootstrapped', exitCode: 0, truncated: false })
    expect(execute).toHaveBeenCalledTimes(2 + bootstrapAssetCount + 1)

    const allCalls = execute.mock.calls.map(([cmd]: [string]) => cmd)
    expect(allCalls.some((cmd: string) => cmd.includes(DEFAULT_PLAYWRIGHT_MANAGED_CONFIG_PATH))).toBe(true)
    expect(allCalls.some((cmd: string) => cmd.includes('"channel": "chromium"'))).toBe(true)
    expect(allCalls.some((cmd: string) => cmd.includes(DEFAULT_PLAYWRIGHT_STAMP_PATH))).toBe(true)
    expect(allCalls.some((cmd: string) => cmd.includes('npm install -g @playwright/cli'))).toBe(false)
  })

  it('re-bootstraps when stamp matches but CLI binary is missing (container restarted)', async () => {
    const service = new PlaywrightBootstrapService({
      resolve: jest.fn().mockReturnValue({
        cliVersion: '0.1.1',
        skillsDir: DEFAULT_PLAYWRIGHT_SKILLS_DIR
      })
    } as any)

    const execute = jest.fn()
      // stamp check - version matches
      .mockResolvedValueOnce({
        output: JSON.stringify({
          cliVersion: '0.1.1',
          bootstrapVersion: PLAYWRIGHT_BOOTSTRAP_SCHEMA_VERSION
        }),
        exitCode: 0,
        truncated: false
      })
      // which playwright-cli - not found
      .mockResolvedValueOnce({ output: '', exitCode: 1, truncated: false })
      // npm install
      .mockResolvedValueOnce({ output: 'added 1 package', exitCode: 0, truncated: false })
      // browser install
      .mockResolvedValueOnce({ output: 'chromium installed', exitCode: 0, truncated: false })
      // skill asset writes + stamp write
      .mockResolvedValue({ output: '', exitCode: 0, truncated: false })

    await service.ensureBootstrap({ execute } as any)

    // Should have proceeded to re-install
    expect(execute).toHaveBeenNthCalledWith(3, expect.stringContaining('npm install -g @playwright/cli'))
  })

  it('re-bootstraps when stamp has a different version', async () => {
    const service = new PlaywrightBootstrapService({
      resolve: jest.fn().mockReturnValue({
        cliVersion: '0.2.0',
        skillsDir: DEFAULT_PLAYWRIGHT_SKILLS_DIR
      })
    } as any)

    const execute = jest.fn()
      .mockResolvedValueOnce({ output: JSON.stringify({ cliVersion: '0.1.1' }), exitCode: 0, truncated: false })
      .mockResolvedValueOnce({ output: 'added 1 package', exitCode: 0, truncated: false })
      // browser install
      .mockResolvedValueOnce({ output: 'chromium installed', exitCode: 0, truncated: false })
      // skill asset writes + stamp write
      .mockResolvedValue({ output: '', exitCode: 0, truncated: false })

    await service.ensureBootstrap({ execute } as any)

    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("npm install -g @playwright/cli@'0.2.0'")
    )
  })

  it('throws when CLI install fails', async () => {
    const service = new PlaywrightBootstrapService({
      resolve: jest.fn().mockReturnValue({
        cliVersion: '0.1.1',
        skillsDir: DEFAULT_PLAYWRIGHT_SKILLS_DIR
      })
    } as any)

    await expect(
      service.ensureBootstrap({
        execute: jest.fn()
          .mockResolvedValueOnce({ output: '', exitCode: 0, truncated: false })
          .mockResolvedValueOnce({ output: 'ERR! 404', exitCode: 1, truncated: false }),
        uploadFiles: jest.fn()
      } as any)
    ).rejects.toThrow('Playwright CLI install failed: ERR! 404')
  })

  it('builds system prompt referencing playwright-cli and skills dir', () => {
    const service = new PlaywrightBootstrapService({
      resolve: jest.fn().mockReturnValue({
        cliVersion: '0.1.1',
        skillsDir: '/workspace/.xpert/skills/playwright-cli'
      })
    } as any)

    const prompt = service.buildSystemPrompt()
    expect(prompt).toContain('playwright-cli')
    expect(prompt).toContain('sandbox_shell')
    expect(prompt).toContain('/workspace/.xpert/skills/playwright-cli/SKILL.md')
    expect(prompt).toContain('/workspace/.xpert/skills/playwright-cli/references/')
    expect(prompt).toContain(DEFAULT_PLAYWRIGHT_MANAGED_CONFIG_PATH)
  })

  it('detects playwright-cli commands correctly', () => {
    const service = new PlaywrightBootstrapService()

    expect(service.isPlaywrightCommand('playwright-cli navigate https://example.com')).toBe(true)
    expect(service.isPlaywrightCommand('npx playwright-cli screenshot --url https://example.com')).toBe(true)
    expect(service.isPlaywrightCommand('npx @playwright/cli navigate https://example.com')).toBe(true)
    expect(service.isPlaywrightCommand('npm test')).toBe(false)
    expect(service.isPlaywrightCommand('ls -la')).toBe(false)
    expect(service.isPlaywrightCommand('')).toBe(false)
  })

  it('detects playwright-cli open commands correctly', () => {
    const service = new PlaywrightBootstrapService()

    expect(service.isPlaywrightOpenCommand('playwright-cli open')).toBe(true)
    expect(service.isPlaywrightOpenCommand('playwright-cli open https://example.com')).toBe(true)
    expect(service.isPlaywrightOpenCommand('playwright-cli open --browser=chrome')).toBe(true)
    expect(service.isPlaywrightOpenCommand('playwright-cli -s=session1 open https://example.com')).toBe(true)
    expect(service.isPlaywrightOpenCommand('npx @playwright/cli open https://example.com')).toBe(true)
    expect(service.isPlaywrightOpenCommand('playwright-cli goto https://example.com')).toBe(false)
    expect(service.isPlaywrightOpenCommand('playwright-cli click e5')).toBe(false)
    expect(service.isPlaywrightOpenCommand('playwright-cli snapshot')).toBe(false)
    expect(service.isPlaywrightOpenCommand('ls -la')).toBe(false)
    expect(service.isPlaywrightOpenCommand('')).toBe(false)
  })

  it('injects the managed Chromium config for open commands without browser or config flags', () => {
    const service = new PlaywrightBootstrapService()

    expect(service.injectManagedConfig('playwright-cli open https://example.com')).toBe(
      `playwright-cli open https://example.com --config='${DEFAULT_PLAYWRIGHT_MANAGED_CONFIG_PATH}'`
    )
    expect(service.injectManagedConfig('npx playwright-cli open')).toBe(
      `npx playwright-cli open --config='${DEFAULT_PLAYWRIGHT_MANAGED_CONFIG_PATH}'`
    )
  })

  it('does not inject the managed config when browser or config is already specified', () => {
    const service = new PlaywrightBootstrapService()

    expect(service.injectManagedConfig('playwright-cli open --browser=firefox')).toBe(
      'playwright-cli open --browser=firefox'
    )
    expect(service.injectManagedConfig('playwright-cli open --config=/tmp/custom.json')).toBe(
      'playwright-cli open --config=/tmp/custom.json'
    )
  })

  it('throws when sandbox backend is not available', async () => {
    const service = new PlaywrightBootstrapService()

    await expect(
      service.ensureBootstrap(null as any)
    ).rejects.toThrow('Sandbox backend is not available')
  })

  it('falls back to execute-based write when uploadFiles is not available', async () => {
    const service = new PlaywrightBootstrapService({
      resolve: jest.fn().mockReturnValue({
        cliVersion: '0.1.1',
        skillsDir: '/workspace/.xpert/skills/playwright-cli'
      })
    } as any)

    const skillAssets = getSkillAssets('/workspace/.xpert/skills/playwright-cli')
    const bootstrapAssetCount = skillAssets.length + 1
    const execute = jest.fn()
      // stamp check
      .mockResolvedValueOnce({ output: '', exitCode: 0, truncated: false })
      // npm install
      .mockResolvedValueOnce({ output: 'ok', exitCode: 0, truncated: false })
      // browser install
      .mockResolvedValueOnce({ output: 'chromium installed', exitCode: 0, truncated: false })
      // write skill assets (one per asset) + stamp
      .mockResolvedValue({ output: '', exitCode: 0, truncated: false })

    await service.ensureBootstrap({ execute } as any)

    // stamp check + npm install + browser install + bootstrap asset writes + stamp write
    expect(execute).toHaveBeenCalledTimes(3 + bootstrapAssetCount + 1)
  })
})
