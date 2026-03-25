jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSandbox: class {}
}))

import { ZipUnzipBootstrapService } from './zip-unzip-bootstrap.service.js'

const APT_LOCK_ERROR =
  'E: Could not get lock /var/lib/apt/lists/lock. It is held by process 1234 (apt)'
const BOOTSTRAP_LOCK_TIMEOUT_OUTPUT =
  '__ZIP_UNZIP_BOOTSTRAP_LOCK_TIMEOUT__ timed out waiting for zip/unzip bootstrap lock'

function success(output = '') {
  return { output, exitCode: 0 }
}

function failure(output = 'boom', exitCode = 1) {
  return { output, exitCode }
}

function createBackend() {
  return {
    execute: jest.fn(),
    uploadFiles: jest.fn().mockResolvedValue([])
  }
}

function getLockedInstallCommands(backend: ReturnType<typeof createBackend>) {
  return backend.execute.mock.calls
    .map(([command]) => command)
    .filter(
      (command): command is string =>
        typeof command === 'string' && command.includes('apt-get install -y zip unzip')
    )
}

describe('ZipUnzipBootstrapService', () => {
  let service: ZipUnzipBootstrapService

  beforeEach(() => {
    service = new ZipUnzipBootstrapService()
  })

  afterEach(() => {
    jest.restoreAllMocks()
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
    it('wraps the embedded skill description in skill tags and points to the sandbox skill file', () => {
      const prompt = service.buildSystemPrompt()

      expect(prompt).toBe(`<skill>
Use this skill whenever the user wants to compress or decompress files with zip or unzip inside the Xpert sandbox. Trigger when they mention creating zip archives, extracting zip files, listing archive contents, testing integrity, excluding files during compression, password-based extraction, or split zip archives.

Before your first use, read the skill file at \`/workspace/.xpert/skills/zip-unzip/SKILL.md\` with \`cat /workspace/.xpert/skills/zip-unzip/SKILL.md\`.
</skill>`)
    })
  })

  describe('ensureBootstrap', () => {
    it('throws if backend is not available', async () => {
      await expect(service.ensureBootstrap(null as any)).rejects.toThrow(
        'Sandbox backend is not available'
      )
    })

    it('skips bootstrap when the stamp matches and both binaries exist', async () => {
      const mockBackend = createBackend()
      mockBackend.execute
        .mockResolvedValueOnce(
          success(
            JSON.stringify({
              tool: 'zip-unzip',
              packages: ['zip', 'unzip'],
              bootstrapVersion: 1,
              installedAt: new Date().toISOString()
            })
          )
        )
        .mockResolvedValueOnce(success('/usr/bin/zip'))
        .mockResolvedValueOnce(success('/usr/bin/unzip'))

      const result = await service.ensureBootstrap(mockBackend)

      expect(result).toEqual({ output: 'already bootstrapped', exitCode: 0, truncated: false })
      expect(mockBackend.execute).toHaveBeenCalledTimes(3)
    })

    it('refreshes assets when binaries exist but the stamp is missing', async () => {
      const mockBackend = createBackend()
      mockBackend.execute
        .mockResolvedValueOnce(success(''))
        .mockResolvedValueOnce(success('/usr/bin/zip'))
        .mockResolvedValueOnce(success('/usr/bin/unzip'))
        .mockResolvedValue(success(''))

      const result = await service.ensureBootstrap(mockBackend)

      expect(result).toEqual({
        output: 'bootstrapped zip/unzip',
        exitCode: 0,
        truncated: false
      })
      expect(mockBackend.uploadFiles).not.toHaveBeenCalled()
      expect(mockBackend.execute).toHaveBeenCalled()
    })

    it('reinstalls when the stamp exists but a binary is missing', async () => {
      const mockBackend = createBackend()
      mockBackend.execute
        .mockResolvedValueOnce(
          success(
            JSON.stringify({
              tool: 'zip-unzip',
              packages: ['zip', 'unzip'],
              bootstrapVersion: 1
            })
          )
        )
        .mockResolvedValueOnce(success('/usr/bin/zip'))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(success('/usr/bin/apt-get'))
        .mockResolvedValueOnce(success('installed'))
        .mockResolvedValueOnce(success('/usr/bin/zip'))
        .mockResolvedValueOnce(success('/usr/bin/unzip'))
        .mockResolvedValue(success(''))

      const result = await service.ensureBootstrap(mockBackend)

      expect(result).toEqual({
        output: 'refreshed zip/unzip bootstrap',
        exitCode: 0,
        truncated: false
      })
      expect(getLockedInstallCommands(mockBackend)).toHaveLength(1)
      expect(getLockedInstallCommands(mockBackend)[0]).toContain(
        'DEBIAN_FRONTEND=noninteractive apt-get install -y zip unzip'
      )
      expect(getLockedInstallCommands(mockBackend)[0]).toContain(
        '/workspace/.xpert/.zip-unzip-bootstrap.lock'
      )
    })

    it('throws if apt-get is not available when installation is needed', async () => {
      const mockBackend = createBackend()
      mockBackend.execute
        .mockResolvedValueOnce(success(''))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(failure('', 1))

      await expect(service.ensureBootstrap(mockBackend)).rejects.toThrow('missing `apt-get`')
    })

    it('retries when apt-get fails with an apt lock and then succeeds', async () => {
      const sleepSpy = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined)
      const mockBackend = createBackend()
      mockBackend.execute
        .mockResolvedValueOnce(success(''))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(success('/usr/bin/apt-get'))
        .mockResolvedValueOnce(failure(APT_LOCK_ERROR, 100))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(success('installed'))
        .mockResolvedValueOnce(success('/usr/bin/zip'))
        .mockResolvedValueOnce(success('/usr/bin/unzip'))
        .mockResolvedValue(success(''))

      const result = await service.ensureBootstrap(mockBackend)

      expect(result).toEqual({
        output: 'bootstrapped zip/unzip',
        exitCode: 0,
        truncated: false
      })
      expect(sleepSpy).toHaveBeenCalledWith(2000)
      expect(getLockedInstallCommands(mockBackend)).toHaveLength(2)
    })

    it('reuses binaries that appear before the next retry', async () => {
      const sleepSpy = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined)
      const mockBackend = createBackend()
      mockBackend.execute
        .mockResolvedValueOnce(success(''))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(success('/usr/bin/apt-get'))
        .mockResolvedValueOnce(failure(APT_LOCK_ERROR, 100))
        .mockResolvedValueOnce(success('/usr/bin/zip'))
        .mockResolvedValueOnce(success('/usr/bin/unzip'))
        .mockResolvedValueOnce(success('/usr/bin/zip'))
        .mockResolvedValueOnce(success('/usr/bin/unzip'))
        .mockResolvedValue(success(''))

      const result = await service.ensureBootstrap(mockBackend)

      expect(result).toEqual({
        output: 'bootstrapped zip/unzip',
        exitCode: 0,
        truncated: false
      })
      expect(sleepSpy).toHaveBeenCalledWith(2000)
      expect(getLockedInstallCommands(mockBackend)).toHaveLength(1)
    })

    it('does not retry on non-retryable install errors', async () => {
      const sleepSpy = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined)
      const mockBackend = createBackend()
      mockBackend.execute
        .mockResolvedValueOnce(success(''))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(success('/usr/bin/apt-get'))
        .mockResolvedValueOnce(failure('E: Unable to locate package zip', 100))

      await expect(service.ensureBootstrap(mockBackend)).rejects.toThrow(
        'zip/unzip install failed on attempt 1 with a non-retryable error'
      )
      expect(sleepSpy).not.toHaveBeenCalled()
      expect(getLockedInstallCommands(mockBackend)).toHaveLength(1)
    })

    it('rechecks binaries inside the bootstrap lock before running apt-get', async () => {
      const mockBackend = createBackend()
      mockBackend.execute
        .mockResolvedValueOnce(
          success(
            JSON.stringify({
              tool: 'zip-unzip',
              packages: ['zip', 'unzip'],
              bootstrapVersion: 1
            })
          )
        )
        .mockResolvedValueOnce(success('/usr/bin/zip'))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(success('/usr/bin/apt-get'))
        .mockResolvedValueOnce(success('zip/unzip already available inside bootstrap lock'))
        .mockResolvedValueOnce(success('/usr/bin/zip'))
        .mockResolvedValueOnce(success('/usr/bin/unzip'))
        .mockResolvedValue(success(''))

      const result = await service.ensureBootstrap(mockBackend)

      expect(result).toEqual({
        output: 'refreshed zip/unzip bootstrap',
        exitCode: 0,
        truncated: false
      })
      expect(getLockedInstallCommands(mockBackend)).toHaveLength(1)
      expect(getLockedInstallCommands(mockBackend)[0]).toContain(
        'command -v zip >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1'
      )
    })

    it('throws after retryable apt lock failures exhaust all retries', async () => {
      const sleepSpy = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined)
      const mockBackend = createBackend()
      mockBackend.execute.mockImplementation(async (command: string) => {
        if (command.startsWith('cat ')) {
          return success('')
        }
        if (command === 'which zip 2>/dev/null') {
          return failure('', 1)
        }
        if (command === 'which unzip 2>/dev/null') {
          return failure('', 1)
        }
        if (command === 'which apt-get 2>/dev/null') {
          return success('/usr/bin/apt-get')
        }
        if (command.includes('apt-get install -y zip unzip')) {
          return failure(APT_LOCK_ERROR, 100)
        }

        return success('')
      })

      await expect(service.ensureBootstrap(mockBackend)).rejects.toThrow(
        'zip/unzip install failed after 7 attempts (6 retries) due to apt lock'
      )
      expect(sleepSpy).toHaveBeenCalledTimes(6)
      expect(getLockedInstallCommands(mockBackend)).toHaveLength(7)
    })

    it('throws a clear error when the bootstrap lock times out', async () => {
      const sleepSpy = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined)
      const mockBackend = createBackend()
      mockBackend.execute
        .mockResolvedValueOnce(success(''))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(failure('', 1))
        .mockResolvedValueOnce(success('/usr/bin/apt-get'))
        .mockResolvedValueOnce(failure(BOOTSTRAP_LOCK_TIMEOUT_OUTPUT, 97))

      await expect(service.ensureBootstrap(mockBackend)).rejects.toThrow(
        'zip/unzip bootstrap lock timed out after waiting 120 seconds'
      )
      expect(sleepSpy).not.toHaveBeenCalled()
    })

    it('throws if writing skill assets fails', async () => {
      const mockBackend = createBackend()
      mockBackend.execute
        .mockResolvedValueOnce(success(''))
        .mockResolvedValueOnce(success('/usr/bin/zip'))
        .mockResolvedValueOnce(success('/usr/bin/unzip'))
        .mockResolvedValueOnce(failure('write failed', 1))

      await expect(service.ensureBootstrap(mockBackend as any)).rejects.toThrow(
        'Failed to write Zip/Unzip skill asset /workspace/.xpert/skills/zip-unzip/SKILL.md: write failed'
      )
    })
  })
})
