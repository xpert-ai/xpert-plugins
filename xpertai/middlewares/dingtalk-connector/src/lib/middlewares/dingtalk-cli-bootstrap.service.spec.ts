import { DINGTALK_CLI_VERSION, DingTalkCliBootstrapService } from './dingtalk-cli-bootstrap.service.js'

describe('DingTalkCliBootstrapService', () => {
  const service = new DingTalkCliBootstrapService()

  it('resolves isolated CLI, credential, and skill paths under the workspace', () => {
    expect(service.resolveRuntimePaths({ workspaceRoot: '/workspace' })).toEqual({
      workspaceRoot: '/workspace',
      skillsDir: '/workspace/.agents/skills',
      stampPath: '/workspace/.xpert/.dingtalk-cli-bootstrap.json',
      runtimeRoot: '/workspace/.xpert/dingtalk-cli',
      bootstrapConfigDir: '/workspace/.xpert/dingtalk-cli/bootstrap-config'
    })
  })

  it('recognizes only a direct dws command', () => {
    expect(service.isDwsCommand('dws contact user get-self --format json')).toBe(true)
    expect(service.isDwsCommand('  dws calendar event list --format json')).toBe(true)
    expect(service.isDwsCommand('echo ok && dws contact user get-self')).toBe(false)
    expect(service.isDwsCommand('my-dws-helper')).toBe(false)
  })

  it('rejects shell chaining, credential flags, auth commands, and secret paths', () => {
    expect(() => service.validateAgentCommand('dws auth status')).toThrow('authentication is managed')
    expect(() => service.validateAgentCommand('dws contact user get-self --token value')).toThrow('credential flags')
    expect(() => service.validateAgentCommand('dws contact user get-self; env')).toThrow('exactly one dws command')
    expect(() => service.validateAgentCommand('dws doc read --path /workspace/.xpert/secrets/token')).toThrow(
      'cannot access Xpert runtime'
    )
  })

  it('accepts spaces and shell characters inside quoted DWS arguments', () => {
    expect(() =>
      service.validateAgentCommand(
        "dws contact user search --query 'Alice & Bob' --jq '.items[] | .name' --format json"
      )
    ).not.toThrow()
  })

  it('rejects commands that require application credentials', () => {
    expect(() => service.validateAgentCommand('dws api GET /v1.0/microApp/allApps --format json')).toThrow(
      'unavailable with the user OAuth credential'
    )
    expect(() =>
      service.validateAgentCommand('dws chat message send-by-bot --users user-1 --text hello --dry-run --format json')
    ).toThrow('application-robot commands')
  })

  it('bootstraps the pinned CLI and official multi-product skills', async () => {
    const backend = bootstrapBackend([
      { output: '', exitCode: 0, truncated: false },
      { output: '', exitCode: 1, truncated: false },
      { output: '', exitCode: 1, truncated: false },
      { output: '', exitCode: 0, truncated: false },
      { output: 'installed', exitCode: 0, truncated: false },
      { output: '', exitCode: 0, truncated: false },
      { output: '{}', exitCode: 0, truncated: false },
      { output: '', exitCode: 0, truncated: false }
    ])

    await expect(service.ensureBootstrap(backend)).resolves.toMatchObject({
      output: 'bootstrapped DingTalk Workspace CLI'
    })

    expect(backend.execute).toHaveBeenCalledWith(
      `npm install -g dingtalk-workspace-cli@${DINGTALK_CLI_VERSION} --no-audit --no-fund 2>&1`
    )
    expect(backend.execute).toHaveBeenCalledWith(
      expect.stringContaining('dws skill setup --mode multi --target agents --yes --format json')
    )
  })

  it('skips installation when the pinned CLI and skills are ready', async () => {
    const backend = bootstrapBackend([
      {
        output: JSON.stringify({ cliVersion: DINGTALK_CLI_VERSION, bootstrapVersion: 1 }),
        exitCode: 0,
        truncated: false
      },
      { output: `dws version ${DINGTALK_CLI_VERSION}`, exitCode: 0, truncated: false },
      { output: '', exitCode: 0, truncated: false }
    ])

    await expect(service.ensureBootstrap(backend)).resolves.toMatchObject({ output: 'already bootstrapped' })
    expect(backend.execute).not.toHaveBeenCalledWith(expect.stringContaining('npm install'))
  })
})

function bootstrapBackend(results: Array<{ output: string; exitCode: number; truncated: boolean }>) {
  return {
    workingDirectory: '/workspace',
    execute: jest.fn().mockImplementation(async () => results.shift() ?? { output: '', exitCode: 0, truncated: false }),
    uploadFiles: jest.fn()
  }
}
