jest.mock('@xpert-ai/plugin-sdk', () => ({
  SkillSourceProviderStrategy: () => () => undefined
}))

import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  GitCodeSkillSourceProvider,
  parseGitCodeRepositoryUrl,
  scanGitCodeSkills
} from './gitcode.strategy.js'

describe('GitCode skill source provider', () => {
  const originalFetch = globalThis.fetch
  const tempDirs: string[] = []
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    globalThis.fetch = fetchMock as any
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch as any
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
    jest.clearAllMocks()
  })

  it('parses GitCode repository URLs and strips .git suffix', () => {
    expect(parseGitCodeRepositoryUrl('https://gitcode.com/acme/skills-repo.git')).toEqual({
      owner: 'acme',
      repo: 'skills-repo',
      normalizedRepoUrl: 'https://gitcode.com/acme/skills-repo'
    })
  })

  it('parses nested GitCode namespace repository URLs', () => {
    expect(parseGitCodeRepositoryUrl('https://gitcode.com/GitHub_Trending/skills13/skills')).toEqual({
      owner: 'GitHub_Trending/skills13',
      repo: 'skills',
      normalizedRepoUrl: 'https://gitcode.com/GitHub_Trending/skills13/skills'
    })
  })

  it('rejects non-GitCode repository URLs', () => {
    expect(() => parseGitCodeRepositoryUrl('https://github.com/acme/skills-repo')).toThrow(
      'Only GitCode repositories are supported.'
    )
  })

  it('scans nested skills, parses metadata, builds links, and passes token to GitCode API', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const parsed = new URL(url)
      expect(parsed.searchParams.get('access_token')).toBe('secret-token')

      if (url.startsWith('https://api.gitcode.com/api/v5/repos/acme/skills-repo/file_list')) {
        expect(parsed.searchParams.get('ref')).toBe('develop')
        return jsonResponse({
          files: [
            { path: 'packages/skills/weather/SKILL.md', type: 'file' },
            { path: 'packages/skills/weather/scripts/run.py', type: 'file' },
            { path: 'packages/skills/not-a-skill/readme.md', type: 'file' }
          ]
        })
      }

      if (url.startsWith('https://api.gitcode.com/api/v5/repos/acme/skills-repo/raw/packages%2Fskills%2Fweather%2FSKILL.md')) {
        expect(parsed.searchParams.get('ref')).toBe('develop')
        return textResponse(
          [
            '---',
            'name: Weather Skill',
            'description: Forecast helper',
            'license: MIT',
            'version: 1.2.3',
            '---',
            '',
            '# Weather Skill'
          ].join('\n')
        )
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await scanGitCodeSkills(
      {
        id: 'repo-1',
        name: 'acme/skills-repo',
        provider: 'gitcode',
        options: {
          url: 'https://gitcode.com/acme/skills-repo',
          path: 'packages/skills',
          branch: 'develop'
        },
        credentials: {
          token: 'secret-token'
        }
      } as any
    )

    expect(result).toEqual([
      expect.objectContaining({
        repositoryId: 'repo-1',
        skillPath: 'weather',
        skillId: 'weather',
        name: 'Weather Skill',
        link: 'https://gitcode.com/acme/skills-repo/blob/develop/packages/skills/weather/SKILL.md',
        description: 'Forecast helper',
        license: 'MIT',
        tags: [],
        version: '1.2.3',
        resources: [
          expect.objectContaining({
            name: 'SKILL.md',
            path: 'weather/SKILL.md',
            type: 'file'
          }),
          expect.objectContaining({
            name: 'run.py',
            path: 'weather/scripts/run.py',
            type: 'file'
          })
        ]
      })
    ])
  })

  it('installs selected skill package files under owner/repo/skillPath', async () => {
    const installDir = await mkdtemp(join(tmpdir(), 'gitcode-skill-install-'))
    tempDirs.push(installDir)

    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://api.gitcode.com/api/v5/repos/acme/skills-repo/file_list')) {
        return jsonResponse({
          files: [
            { path: 'skills/weather/SKILL.md', type: 'file' },
            { path: 'skills/weather/scripts/run.py', type: 'file' },
            { path: 'skills/other/SKILL.md', type: 'file' }
          ]
        })
      }

      if (url.includes('/raw/skills%2Fweather%2FSKILL.md')) {
        return textResponse('# Weather Skill')
      }

      if (url.includes('/raw/skills%2Fweather%2Fscripts%2Frun.py')) {
        return textResponse('print("weather")')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const provider = new GitCodeSkillSourceProvider()
    const relativePath = await provider.installSkillPackage(
      {
        repositoryId: 'repo-1',
        skillPath: 'weather',
        skillId: 'weather',
        repository: {
          id: 'repo-1',
          name: 'acme/skills-repo',
          provider: 'gitcode',
          options: {
            url: 'https://gitcode.com/acme/skills-repo',
            path: 'skills'
          }
        }
      } as any,
      installDir
    )

    expect(relativePath).toBe('acme/skills-repo/weather')
    await expect(readFile(join(installDir, relativePath, 'SKILL.md'), 'utf8')).resolves.toBe('# Weather Skill')
    await expect(readFile(join(installDir, relativePath, 'scripts/run.py'), 'utf8')).resolves.toBe('print("weather")')
  })

  it('limits concurrent downloads when installing a large skill package', async () => {
    const installDir = await mkdtemp(join(tmpdir(), 'gitcode-large-skill-install-'))
    tempDirs.push(installDir)
    let activeRawRequests = 0
    let maxActiveRawRequests = 0

    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://api.gitcode.com/api/v5/repos/acme/skills-repo/file_list')) {
        return jsonResponse({
          files: Array.from({ length: 7 }, (_, index) => ({
            path: `skills/weather/file-${index}.txt`,
            type: 'file'
          }))
        })
      }

      if (url.includes('/raw/skills%2Fweather%2Ffile-')) {
        activeRawRequests += 1
        maxActiveRawRequests = Math.max(maxActiveRawRequests, activeRawRequests)
        await delay(10)
        activeRawRequests -= 1
        return textResponse('content')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const provider = new GitCodeSkillSourceProvider()
    await provider.installSkillPackage(
      {
        repositoryId: 'repo-1',
        skillPath: 'weather',
        skillId: 'weather',
        repository: {
          id: 'repo-1',
          name: 'acme/skills-repo',
          provider: 'gitcode',
          options: {
            url: 'https://gitcode.com/acme/skills-repo',
            path: 'skills'
          }
        }
      } as any,
      installDir
    )

    expect(maxActiveRawRequests).toBeLessThanOrEqual(5)
  })

  it('does not index nested skill directories when a parent directory already contains SKILL.md', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://api.gitcode.com/api/v5/repos/acme/skills-repo/file_list')) {
        return jsonResponse({
          files: [
            { path: 'SKILL.md', type: 'file' },
            { path: 'nested/SKILL.md', type: 'file' }
          ]
        })
      }

      if (url.includes('/raw/SKILL.md')) {
        return textResponse('# Root Skill')
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await scanGitCodeSkills({
      id: 'repo-1',
      name: 'acme/skills-repo',
      provider: 'gitcode',
      options: {
        url: 'https://gitcode.com/acme/skills-repo'
      }
    } as any)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(
      expect.objectContaining({
        skillPath: '',
        skillId: '/'
      })
    )
  })

  it('exposes an icon for source strategy display', () => {
    const provider = new GitCodeSkillSourceProvider()

    expect(provider.meta.icon).toEqual(
      expect.objectContaining({
        type: 'svg',
        value: expect.stringContaining('<svg')
      })
    )
  })
})

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
    text: async () => JSON.stringify(data)
  }
}

function textResponse(data: string) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => data,
    json: async () => JSON.parse(data)
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
