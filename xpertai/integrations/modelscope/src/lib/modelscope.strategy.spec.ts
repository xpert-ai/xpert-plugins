jest.mock('@xpert-ai/plugin-sdk', () => ({
  SkillSourceProviderStrategy: () => () => undefined
}))

import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ModelScopeSkillSourceProvider,
  parseModelScopeRepositoryUrl,
  scanModelScopeSkills
} from './modelscope.strategy.js'

describe('ModelScope skill source provider', () => {
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

  it('parses ModelScope skill repository URLs and strips .git suffix', () => {
    expect(parseModelScopeRepositoryUrl('https://www.modelscope.cn/skills/@inference-sh/web-search.git')).toEqual({
      kind: 'skill',
      owner: '@inference-sh',
      repo: 'web-search'
    })
  })

  it('parses nested ModelScope namespace skill repository URLs', () => {
    expect(parseModelScopeRepositoryUrl('https://modelscope.cn/skills/groups/team/skills')).toEqual({
      kind: 'skill',
      owner: 'groups/team',
      repo: 'skills'
    })
  })

  it('parses ModelScope collection URLs', () => {
    expect(parseModelScopeRepositoryUrl('https://www.modelscope.cn/collections/MiniMax/MiniMax-Office-skills')).toEqual({
      kind: 'collection',
      owner: 'MiniMax',
      repo: 'MiniMax-Office-skills'
    })
  })

  it('rejects non-ModelScope skill repository URLs', () => {
    expect(() => parseModelScopeRepositoryUrl('https://github.com/acme/skills-repo')).toThrow(
      'Only ModelScope skill repositories or collections are supported.'
    )
    expect(() => parseModelScopeRepositoryUrl('https://www.modelscope.cn/models/acme/skills-repo')).toThrow(
      'Invalid ModelScope skill repository URL.'
    )
  })

  it('scans nested skills, parses metadata, builds links, and passes token to ModelScope API', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const parsed = new URL(url)
      expect(init?.headers).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer secret-token'
        })
      )

      if (url.startsWith('https://www.modelscope.cn/api/v1/skills/%40inference-sh/web-search/repo/files')) {
        expect(parsed.searchParams.get('Revision')).toBe('develop')
        return jsonResponse({
          Success: true,
          Data: {
            Files: [
              { Path: 'packages/skills/weather/SKILL.md', Type: 'blob', Name: 'SKILL.md', Size: 120, Sha256: 'sha-1' },
              { Path: 'packages/skills/weather/scripts/run.py', Type: 'blob', Name: 'run.py' },
              { Path: 'packages/skills/not-a-skill/readme.md', Type: 'blob', Name: 'readme.md' }
            ]
          }
        })
      }

      if (url.startsWith('https://www.modelscope.cn/api/v1/skills/%40inference-sh/web-search/repo/raw')) {
        expect(parsed.searchParams.get('Revision')).toBe('develop')
        expect(parsed.searchParams.get('FilePath')).toBe('packages/skills/weather/SKILL.md')
        return jsonResponse({
          Success: true,
          Data: {
            Content: [
              '---',
              'name: Weather Skill',
              'description: Forecast helper',
              'license: MIT',
              'version: 1.2.3',
              '---',
              '',
              '# Weather Skill'
            ].join('\n')
          }
        })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await scanModelScopeSkills(
      {
        id: 'repo-1',
        name: 'acme/skills-repo',
        provider: 'modelscope',
        options: {
          url: 'https://www.modelscope.cn/skills/@inference-sh/web-search',
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
        link: 'https://www.modelscope.cn/skills/@inference-sh/web-search/file/view/develop/packages/skills/weather/SKILL.md',
        description: 'Forecast helper',
        license: 'MIT',
        tags: [],
        version: '1.2.3',
        resources: [
          expect.objectContaining({
            name: 'SKILL.md',
            path: 'weather/SKILL.md',
            type: 'file',
            sha: 'sha-1',
            size: 120
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
    const installDir = await mkdtemp(join(tmpdir(), 'modelscope-skill-install-'))
    tempDirs.push(installDir)

    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://www.modelscope.cn/api/v1/skills/%40inference-sh/web-search/repo/files')) {
        return jsonResponse({
          Success: true,
          Data: {
            Files: [
              { Path: 'skills/weather/SKILL.md', Type: 'blob' },
              { Path: 'skills/weather/scripts/run.py', Type: 'blob' },
              { Path: 'skills/other/SKILL.md', Type: 'blob' }
            ]
          }
        })
      }

      if (url.includes('/repo/raw') && url.includes('FilePath=skills%2Fweather%2FSKILL.md')) {
        return jsonResponse({ Success: true, Data: { Content: '# Weather Skill' } })
      }

      if (url.includes('/repo/raw') && url.includes('FilePath=skills%2Fweather%2Fscripts%2Frun.py')) {
        return jsonResponse({ Success: true, Data: { Content: 'print("weather")' } })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const provider = new ModelScopeSkillSourceProvider()
    const relativePath = await provider.installSkillPackage(
      {
        repositoryId: 'repo-1',
        skillPath: 'weather',
        skillId: 'weather',
        repository: {
          id: 'repo-1',
          name: 'acme/skills-repo',
          provider: 'modelscope',
          options: {
            url: 'https://www.modelscope.cn/skills/@inference-sh/web-search',
            path: 'skills'
          }
        }
      } as any,
      installDir
    )

    expect(relativePath).toBe('@inference-sh/web-search/weather')
    await expect(readFile(join(installDir, relativePath, 'SKILL.md'), 'utf8')).resolves.toBe('# Weather Skill')
    await expect(readFile(join(installDir, relativePath, 'scripts/run.py'), 'utf8')).resolves.toBe('print("weather")')
  })

  it('scans ModelScope collection skill entries and indexes their skill repositories', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const parsed = new URL(url)

      if (url.startsWith('https://www.modelscope.cn/api/v1/collections')) {
        expect(parsed.searchParams.get('Fid')).toBe('MiniMax/MiniMax-Office-skills')
        expect(parsed.searchParams.get('ElementType')).toBe('skill')
        return jsonResponse({
          Success: true,
          Data: {
            CollectionElements: {
              Total: 2,
              CollectionElementVoList: [
                {
                  ElementType: 'skill',
                  ElementPath: '@MiniMax-AI',
                  ElementName: 'pptx-generator',
                  ElementInfo: {
                    SkillPath: '@MiniMax-AI',
                    SkillName: 'pptx-generator',
                    SkillDisplayName: 'PPTX Generator',
                    SkillDescription: 'Generate decks',
                    SkillLicense: 'Apache-2.0'
                  }
                },
                {
                  ElementType: 'skill',
                  ElementPath: '@MiniMax-AI',
                  ElementName: 'minimax-docx',
                  ElementInfo: {
                    SkillPath: '@MiniMax-AI',
                    SkillName: 'minimax-docx',
                    SkillDisplayName: 'DOCX Skill'
                  }
                }
              ]
            }
          }
        })
      }

      if (url.startsWith('https://www.modelscope.cn/api/v1/skills/%40MiniMax-AI/pptx-generator/repo/files')) {
        return jsonResponse({
          Success: true,
          Data: {
            Files: [
              { Path: 'SKILL.md', Type: 'blob', Name: 'SKILL.md', Sha256: 'pptx-sha' },
              { Path: 'scripts/build.py', Type: 'blob', Name: 'build.py' }
            ]
          }
        })
      }

      if (url.startsWith('https://www.modelscope.cn/api/v1/skills/%40MiniMax-AI/minimax-docx/repo/files')) {
        return jsonResponse({
          Success: true,
          Data: {
            Files: [
              { Path: 'SKILL.md', Type: 'blob', Name: 'SKILL.md' }
            ]
          }
        })
      }

      if (url.startsWith('https://www.modelscope.cn/api/v1/skills/%40MiniMax-AI/pptx-generator/repo/raw')) {
        return jsonResponse({
          Success: true,
          Data: {
            Content: [
              '---',
              'name: ModelScope PPTX',
              'description: Create pptx files',
              'version: 0.1.0',
              '---'
            ].join('\n')
          }
        })
      }

      if (url.startsWith('https://www.modelscope.cn/api/v1/skills/%40MiniMax-AI/minimax-docx/repo/raw')) {
        return jsonResponse({ Success: true, Data: { Content: '# DOCX Skill' } })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await scanModelScopeSkills({
      id: 'repo-collection',
      name: 'MiniMax/MiniMax-Office-skills',
      provider: 'modelscope',
      options: {
        url: 'https://www.modelscope.cn/collections/MiniMax/MiniMax-Office-skills'
      }
    } as any)

    expect(result).toEqual([
      expect.objectContaining({
        repositoryId: 'repo-collection',
        skillPath: '@MiniMax-AI/pptx-generator',
        skillId: '@MiniMax-AI/pptx-generator',
        name: 'ModelScope PPTX',
        link: 'https://www.modelscope.cn/skills/@MiniMax-AI/pptx-generator/file/view/master/SKILL.md',
        description: 'Create pptx files',
        version: '0.1.0',
        resources: [
          expect.objectContaining({
            name: 'SKILL.md',
            path: '@MiniMax-AI/pptx-generator/SKILL.md',
            sha: 'pptx-sha'
          }),
          expect.objectContaining({
            name: 'build.py',
            path: '@MiniMax-AI/pptx-generator/scripts/build.py'
          })
        ]
      }),
      expect.objectContaining({
        skillPath: '@MiniMax-AI/minimax-docx',
        skillId: '@MiniMax-AI/minimax-docx',
        name: 'DOCX Skill'
      })
    ])
  })

  it('installs selected collection skill package files under collection and skill repository path', async () => {
    const installDir = await mkdtemp(join(tmpdir(), 'modelscope-collection-skill-install-'))
    tempDirs.push(installDir)

    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://www.modelscope.cn/api/v1/collections')) {
        return jsonResponse({
          Success: true,
          Data: {
            CollectionElements: {
              Total: 1,
              CollectionElementVoList: [
                {
                  ElementType: 'skill',
                  ElementInfo: {
                    SkillPath: '@MiniMax-AI',
                    SkillName: 'pptx-generator'
                  }
                }
              ]
            }
          }
        })
      }

      if (url.startsWith('https://www.modelscope.cn/api/v1/skills/%40MiniMax-AI/pptx-generator/repo/files')) {
        return jsonResponse({
          Success: true,
          Data: {
            Files: [
              { Path: 'SKILL.md', Type: 'blob' },
              { Path: 'scripts/build.py', Type: 'blob' }
            ]
          }
        })
      }

      if (url.includes('/repo/raw') && url.includes('FilePath=SKILL.md')) {
        return jsonResponse({ Success: true, Data: { Content: '# PPTX Skill' } })
      }

      if (url.includes('/repo/raw') && url.includes('FilePath=scripts%2Fbuild.py')) {
        return jsonResponse({ Success: true, Data: { Content: 'print("pptx")' } })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const provider = new ModelScopeSkillSourceProvider()
    const relativePath = await provider.installSkillPackage(
      {
        repositoryId: 'repo-collection',
        skillPath: '@MiniMax-AI/pptx-generator',
        skillId: '@MiniMax-AI/pptx-generator',
        repository: {
          id: 'repo-collection',
          name: 'MiniMax/MiniMax-Office-skills',
          provider: 'modelscope',
          options: {
            url: 'https://www.modelscope.cn/collections/MiniMax/MiniMax-Office-skills'
          }
        }
      } as any,
      installDir
    )

    expect(relativePath).toBe('MiniMax/MiniMax-Office-skills/@MiniMax-AI/pptx-generator')
    await expect(readFile(join(installDir, relativePath, 'SKILL.md'), 'utf8')).resolves.toBe('# PPTX Skill')
    await expect(readFile(join(installDir, relativePath, 'scripts/build.py'), 'utf8')).resolves.toBe('print("pptx")')
  })

  it('limits concurrent downloads when installing a large skill package', async () => {
    const installDir = await mkdtemp(join(tmpdir(), 'modelscope-large-skill-install-'))
    tempDirs.push(installDir)
    let activeRawRequests = 0
    let maxActiveRawRequests = 0

    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://www.modelscope.cn/api/v1/skills/%40inference-sh/web-search/repo/files')) {
        return jsonResponse({
          Success: true,
          Data: {
            Files: Array.from({ length: 7 }, (_, index) => ({
              Path: `skills/weather/file-${index}.txt`,
              Type: 'blob'
            }))
          }
        })
      }

      if (url.includes('/repo/raw') && url.includes('FilePath=skills%2Fweather%2Ffile-')) {
        activeRawRequests += 1
        maxActiveRawRequests = Math.max(maxActiveRawRequests, activeRawRequests)
        await delay(10)
        activeRawRequests -= 1
        return jsonResponse({ Success: true, Data: { Content: 'content' } })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const provider = new ModelScopeSkillSourceProvider()
    await provider.installSkillPackage(
      {
        repositoryId: 'repo-1',
        skillPath: 'weather',
        skillId: 'weather',
        repository: {
          id: 'repo-1',
          name: 'acme/skills-repo',
          provider: 'modelscope',
          options: {
            url: 'https://www.modelscope.cn/skills/@inference-sh/web-search',
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
      if (url.startsWith('https://www.modelscope.cn/api/v1/skills/%40inference-sh/web-search/repo/files')) {
        return jsonResponse({
          Success: true,
          Data: {
            Files: [
              { Path: 'SKILL.md', Type: 'blob' },
              { Path: 'nested/SKILL.md', Type: 'blob' }
            ]
          }
        })
      }

      if (url.includes('/repo/raw') && url.includes('FilePath=SKILL.md')) {
        return jsonResponse({ Success: true, Data: { Content: '# Root Skill' } })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const result = await scanModelScopeSkills({
      id: 'repo-1',
      name: 'acme/skills-repo',
      provider: 'modelscope',
      options: {
        url: 'https://www.modelscope.cn/skills/@inference-sh/web-search'
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
    const provider = new ModelScopeSkillSourceProvider()

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
