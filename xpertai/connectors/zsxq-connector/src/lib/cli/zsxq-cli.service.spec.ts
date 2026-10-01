import { rmSync } from 'node:fs'
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ZsxqCliRunner, type ZsxqCliCommandResult, type ZsxqCliRunningCommand } from './zsxq-cli.runner.js'
import { ZsxqCliService } from './zsxq-cli.service.js'

class FakeZsxqCliRunner extends ZsxqCliRunner {
  readonly calls: Array<{ configDir: string; args: readonly string[] }> = []
  profileReady = false

  async verify(): Promise<void> {}

  async run(configDir: string, args: readonly string[]): Promise<ZsxqCliCommandResult> {
    this.calls.push({ configDir, args })
    if (args[0] === 'auth' && args.includes('--no-wait')) {
      await writeFile(
        join(configDir, 'device_auth_pending.json'),
        JSON.stringify({
          base_url: 'https://mcp.zsxq.com/oauth',
          client_id: 'client-12345678',
          device_code: 'device-code-1234567890',
          expires_at: Math.floor(Date.now() / 1000) + 300,
          interval: 5,
          user_code: 'ABCD1234',
          verification_uri_complete: 'https://garden.zsxq.com/device?user_code=ABCD1234'
        })
      )
      return result('{}')
    }
    if (args[0] === 'user' && this.profileReady) return result('{"user":{"user_id":"42","name":"Alice"}}')
    return result('{}', 11)
  }

  start(configDir: string, args: readonly string[]): ZsxqCliRunningCommand {
    this.calls.push({ configDir, args })
    rmSync(join(configDir, 'device_auth_pending.json'), { force: true })
    return { completion: new Promise(() => undefined), stop: jest.fn() }
  }
}

describe('ZsxqCliService', () => {
  let root: string

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('persists an isolated connection after device authorization completes', async () => {
    root = await mkdtemp(join(tmpdir(), 'xpert-zsxq-test-'))
    const runner = new FakeZsxqCliRunner()
    const service = new ZsxqCliService(runner, { enableWrites: false, cliDataRoot: root })
    const started = await service.startAuthorization()
    expect(started.authorizationUrl).toBe('https://garden.zsxq.com/device?user_code=ABCD1234')
    expect(started.pollIntervalSeconds).toBe(5)
    const authorizationPath = join(root, 'connections', started.handle, 'xpert-authorization.json')
    await expect(access(join(root, 'connections', started.handle, 'device_auth_pending.json'))).rejects.toThrow()
    expect((await stat(authorizationPath)).mode & 0o777).toBe(0o600)

    await expect(service.pollAuthorization(started.handle)).resolves.toMatchObject({
      status: 'pending',
      pollIntervalSeconds: 5
    })

    runner.profileReady = true
    await expect(service.pollAuthorization(started.handle)).resolves.toMatchObject({
      status: 'complete',
      profile: { id: '42', name: 'Alice' }
    })
    const persistedPath = join(root, 'connections', started.handle, 'xpert-connection.json')
    expect(JSON.parse(await readFile(persistedPath, 'utf8'))).toMatchObject({ version: 1, userId: '42' })
    await expect(access(authorizationPath)).rejects.toThrow()
    expect(
      runner.calls.some(
        ({ args }) => args.join(' ') === 'auth login --device-code device-code-1234567890 --no-browser --json'
      )
    ).toBe(true)
  })

  it('resumes device authorization from plugin-owned state after an API restart', async () => {
    root = await mkdtemp(join(tmpdir(), 'xpert-zsxq-test-'))
    const runner = new FakeZsxqCliRunner()
    const firstService = new ZsxqCliService(runner, { enableWrites: false, cliDataRoot: root })
    const started = await firstService.startAuthorization()
    firstService.stopAll()

    const restartedService = new ZsxqCliService(runner, { enableWrites: false, cliDataRoot: root })
    await expect(restartedService.pollAuthorization(started.handle)).resolves.toMatchObject({ status: 'pending' })
    expect(runner.calls.filter(({ args }) => args.includes('--device-code'))).toHaveLength(2)
    restartedService.stopAll()
  })
})

function result(stdout: string, exitCode = 0): ZsxqCliCommandResult {
  return { exitCode, stdout, stderr: '', timedOut: false }
}
