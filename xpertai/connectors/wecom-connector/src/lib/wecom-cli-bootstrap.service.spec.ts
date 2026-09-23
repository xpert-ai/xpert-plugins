import { createHash } from 'node:crypto'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  PLUGIN_CONFIG_RESOLVER_TOKEN: 'PLUGIN_CONFIG_RESOLVER_TOKEN'
}))

import { WeComCliBootstrapService } from './wecom-cli-bootstrap.service.js'
import { WECOM_CLI_SKILLS_REF, WECOM_CLI_SKILLS_SHA256, WECOM_CLI_VERSION } from './types.js'

describe('WeComCliBootstrapService', () => {
  it('treats empty optional network settings as unset', () => {
    const service = new WeComCliBootstrapService()
    expect(service.resolveConfig({ proxy: '', npmRegistryUrl: '  ' })).toEqual({})
  })

  it('resolves workspace-local paths and advertises the pinned official Skills', () => {
    const service = new WeComCliBootstrapService()
    const paths = service.resolveRuntimePaths({ workspaceRoot: '/workspace-x' })
    expect(paths.binaryPath).toBe('/workspace-x/.xpert/tools/wecom-cli/bin/wecom-cli')
    expect(paths.skillsDir).toBe('/workspace-x/.xpert/skills/wecom-cli')
    const prompt = service.buildSystemPrompt(paths)
    expect(prompt).toContain('wecomcli-calendar')
    expect(prompt).toContain(`${paths.skillsDir}/wecomcli-shared/SKILL.md`)
    expect(prompt).toContain('Do not run `wecom-cli auth ...`')
  })

  it('installs the pinned CLI and verifies the full Skills archive', async () => {
    const service = new WeComCliBootstrapService()
    const backend = backendForBootstrap()
    const paths = service.resolveRuntimePaths({ workspaceRoot: '/workspace-x' })

    await service.ensureBootstrap(backend, {}, paths)

    const commands = backend.execute.mock.calls.map(([command]) => command as string)
    expect(commands.some((command) => command.includes(`@wecom/cli@'${WECOM_CLI_VERSION}'`))).toBe(true)
    expect(commands.some((command) => command.includes(WECOM_CLI_SKILLS_REF))).toBe(true)
    expect(commands.some((command) => command.includes(WECOM_CLI_SKILLS_SHA256))).toBe(true)
    expect(commands.some((command) => command.includes('--strip-components=2'))).toBe(true)
  })

  it('does not put Bot Secret in shell commands during authentication bootstrap', async () => {
    const service = new WeComCliBootstrapService()
    jest.spyOn(service, 'ensureBootstrap').mockResolvedValue()
    const backend = backendForAuth()
    const paths = service.resolveRuntimePaths({ workspaceRoot: '/workspace-x' })
    const secret = 'bot-secret-should-not-be-in-command'
    const credential = {
      connectorId: 'connector-1',
      credentials: { botId: 'bot-1', botSecret: secret }
    }

    const result = await service.ensureAuthorized(backend, credential as never, paths)

    expect(result).toEqual(expect.objectContaining({ status: 'authorized', identityType: 'bot' }))
    const commands = backend.execute.mock.calls.map(([command]) => command as string).join('\n')
    expect(commands).not.toContain(secret)
    const uploaded = backend.uploadFiles.mock.calls[0][0] as Array<[string, Buffer]>
    expect(uploaded.map(([, content]) => content.toString('utf8'))).toContain(secret)
    expect(uploaded[0][1].toString('utf8')).not.toContain(secret)
  })

  it('reuses an authorized CLI config for the same connector credential', async () => {
    const service = new WeComCliBootstrapService()
    jest.spyOn(service, 'ensureBootstrap').mockResolvedValue()
    const backend = backendForReuse()
    const paths = service.resolveRuntimePaths({ workspaceRoot: '/workspace-x' })
    const botId = 'bot-1'
    const botSecret = 'secret-1'
    const fingerprint = createHash('sha256').update(botId).update('\0').update(botSecret).digest('hex')
    backend.execute.mockImplementation(async (command: string) => {
      if (command.includes('cat') && command.includes('auth.json')) {
        return commandResult(JSON.stringify({ version: 1, fingerprint }))
      }
      if (command.includes('auth show --status')) return commandResult('authorized')
      return commandResult()
    })

    await service.ensureAuthorized(
      backend,
      { connectorId: 'connector-1', credentials: { botId, botSecret } } as never,
      paths
    )

    expect(backend.uploadFiles).not.toHaveBeenCalled()
    expect(backend.execute.mock.calls.some(([command]) => String(command).includes('auth init'))).toBe(false)
  })
})

function backendForBootstrap() {
  const execute = jest.fn().mockImplementation(async (command: string) => {
    if (command.includes('test -x')) return commandResult('', 1)
    return commandResult()
  })
  const uploadFiles = jest.fn()
  return { execute, uploadFiles, workingDirectory: '/workspace' } as unknown as MockBackend
}

function backendForAuth() {
  const execute = jest.fn().mockResolvedValue(commandResult())
  const uploadFiles = jest.fn().mockResolvedValue([
    { path: 'launcher', error: null },
    { path: 'bot-id', error: null },
    { path: 'secret', error: null }
  ])
  return { execute, uploadFiles, workingDirectory: '/workspace' } as unknown as MockBackend
}

function backendForReuse() {
  const execute = jest.fn().mockResolvedValue(commandResult())
  const uploadFiles = jest.fn()
  return { execute, uploadFiles, workingDirectory: '/workspace' } as unknown as MockBackend
}

type MockBackend = {
  execute: jest.Mock
  uploadFiles: jest.Mock
  workingDirectory: string
}

function commandResult(output = '', exitCode = 0) {
  return { output, exitCode, truncated: false }
}
