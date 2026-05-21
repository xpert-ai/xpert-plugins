import type {
  ISkillRepository,
  ISkillRepositoryIndex,
  TSkillSourceMeta
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ISkillSourceProvider, SkillSourceProviderStrategy } from '@xpert-ai/plugin-sdk'
import { mkdir, rm, writeFile } from 'fs/promises'
import { dirname, join, relative } from 'path'
import path from 'path'
import { GitCodeIcon, GitCodeSkillRepositoryOptions } from './types.js'

const GITCODE_SKILL_SOURCE_PROVIDER = 'gitcode'
const GITCODE_API_BASE_URL = 'https://api.gitcode.com/api/v5'
const DEFAULT_BRANCH = 'main'
const INSTALL_FILE_DOWNLOAD_CONCURRENCY = 5

type GitCodeRepositoryIdentity = {
  owner: string
  repo: string
  normalizedRepoUrl: string
}

type GitCodeFileEntry = {
  path: string
  type?: string
  name?: string
  size?: number
  sha?: string
  download_url?: string | null
}

type GitCodeSkillContext = {
  repositoryId: string
  repoUrl: string
  repositoryPath: string
  branch: string
}

type SkillMetadata = {
  name?: string
  description?: string
  license?: string
  version?: string
}

export function parseGitCodeRepositoryUrl(repoUrl: string): GitCodeRepositoryIdentity {
  const url = new URL(repoUrl)
  if (url.hostname.toLowerCase() !== 'gitcode.com') {
    throw new Error('Only GitCode repositories are supported.')
  }

  const pathSegments = url.pathname
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
  const rawRepo = pathSegments.pop()
  const owner = pathSegments.join('/')
  const repo = rawRepo?.replace(/\.git$/, '')
  if (!owner || !repo || pathSegments.length < 1) {
    throw new Error('Invalid GitCode repository URL.')
  }

  return {
    owner,
    repo,
    normalizedRepoUrl: `https://gitcode.com/${owner}/${repo}`
  }
}

@Injectable()
@SkillSourceProviderStrategy(GITCODE_SKILL_SOURCE_PROVIDER)
export class GitCodeSkillSourceProvider implements ISkillSourceProvider {
  readonly type = GITCODE_SKILL_SOURCE_PROVIDER
  readonly meta: TSkillSourceMeta = {
    name: GITCODE_SKILL_SOURCE_PROVIDER,
    label: {
      en_US: 'GitCode',
      zh_Hans: 'GitCode'
    },
    icon: {
      type: 'svg',
      value: GitCodeIcon
    },
    description: {
      en_US: 'Register skills from a GitCode repository.',
      zh_Hans: '从 GitCode 仓库注册技能。'
    },
    configSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          title: {
            en_US: 'Repository URL',
            zh_Hans: '仓库地址'
          },
          description: {
            en_US: 'The URL of the GitCode repository containing the skills.',
            zh_Hans: '包含技能的 GitCode 仓库地址。'
          }
        },
        path: {
          type: 'string',
          title: {
            en_US: 'Skills Path',
            zh_Hans: '技能路径'
          },
          description: {
            en_US: 'The path within the repository where the skills are located.',
            zh_Hans: '仓库中技能所在的路径。'
          }
        },
        branch: {
          type: 'string',
          title: {
            en_US: 'Branch',
            zh_Hans: '分支'
          },
          description: {
            en_US: 'The branch, tag, or commit ref to use. Defaults to main.',
            zh_Hans: '使用的分支、标签或提交引用。默认 main。'
          }
        }
      },
      required: ['url']
    },
    credentialSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          title: {
            en_US: 'Personal Access Token',
            zh_Hans: '个人访问令牌'
          },
          description: {
            en_US: 'Personal access token for private GitCode repositories.',
            zh_Hans: '用于访问 GitCode 私有仓库的个人访问令牌。'
          },
          'x-ui': {
            component: 'password'
          }
        }
      },
      required: []
    }
  }

  canHandle(sourceType: string): boolean {
    return sourceType === GITCODE_SKILL_SOURCE_PROVIDER
  }

  async listSkills(repository: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
    return scanGitCodeSkills(repository)
  }

  async installSkillPackage(index: ISkillRepositoryIndex, installDir: string): Promise<string> {
    if (!index.repository) {
      throw new Error('Skill repository context is required to fetch package.')
    }

    const options = index.repository.options as unknown as GitCodeSkillRepositoryOptions
    const { owner, repo } = parseGitCodeRepositoryUrl(options.url)
    const branch = options.branch || DEFAULT_BRANCH
    const repositoryPath = normalizeRepositoryPath(options.path)
    const files = await listGitCodeFiles(index.repository)
    const skillPrefix = joinGitCodePath(repositoryPath, index.skillPath)
    const selectedFiles = files.filter((file) => isFileUnderPath(file.path, skillPrefix))
    const skillRoot = join(installDir, owner, repo, index.skillPath)

    await mkdir(skillRoot, { recursive: true })

    try {
      await mapWithConcurrency(
        selectedFiles,
        INSTALL_FILE_DOWNLOAD_CONCURRENCY,
        async (file) => {
          const filePathInSkill = stripPathPrefix(file.path, skillPrefix)
          const targetPath = join(skillRoot, filePathInSkill)
          await mkdir(dirname(targetPath), { recursive: true })
          const content = await fetchGitCodeRawFile(index.repository as ISkillRepository, file.path, branch)
          await writeFile(targetPath, content)
        }
      )
      return relative(installDir, skillRoot)
    } catch (error) {
      await rm(skillRoot, { recursive: true, force: true })
      throw error
    }
  }

  async uninstallSkillPackage(packagePath: string): Promise<void> {
    if (!packagePath) {
      return
    }
    await rm(packagePath, { recursive: true, force: true })
  }
}

export async function scanGitCodeSkills(repository: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
  const options = repository.options as unknown as GitCodeSkillRepositoryOptions
  const repositoryPath = normalizeRepositoryPath(options?.path)
  const branch = options?.branch || DEFAULT_BRANCH
  const files = await listGitCodeFiles(repository)
  const skillDirs = findSkillDirectories(files, repositoryPath)
  const context: GitCodeSkillContext = {
    repositoryId: repository.id,
    repoUrl: options.url,
    repositoryPath,
    branch
  }

  const skills: ISkillRepositoryIndex[] = []
  for (const skillPath of skillDirs) {
    const fullSkillPath = joinGitCodePath(repositoryPath, skillPath)
    const skillMdPath = joinGitCodePath(fullSkillPath, 'SKILL.md')
    const metadata = await resolveSkillMetadata(repository, skillMdPath, branch)
    const resources = collectResources(files, repositoryPath, skillPath)

    skills.push({
      repositoryId: context.repositoryId,
      skillPath,
      skillId: skillPath || '/',
      name: metadata.name || path.posix.basename(skillPath) || '/',
      link: buildGitCodeSkillLink(context.repoUrl, context.branch, context.repositoryPath, skillPath),
      description: metadata.description,
      license: metadata.license,
      tags: [],
      version: metadata.version,
      resources
    })
  }

  return skills
}

async function listGitCodeFiles(repository: ISkillRepository): Promise<GitCodeFileEntry[]> {
  const options = repository.options as unknown as GitCodeSkillRepositoryOptions
  const { owner, repo } = parseGitCodeRepositoryUrl(options.url)
  const url = buildGitCodeApiUrl(repository, `/repos/${encodeURIComponent(owner)}/${repo}/file_list`, {
    ref: options.branch || DEFAULT_BRANCH,
    recursive: '1'
  })
  const data = await fetchGitCodeJson(repository, url)
  return normalizeGitCodeFileEntries(data)
    .map((entry) => ({
      ...entry,
      path: normalizeRepositoryPath(entry.path)
    }))
    .filter((entry) => entry.path && entry.type !== 'dir' && entry.type !== 'tree')
}

async function fetchGitCodeRawFile(repository: ISkillRepository, filePath: string, ref: string): Promise<Buffer> {
  const options = repository.options as unknown as GitCodeSkillRepositoryOptions
  const { owner, repo } = parseGitCodeRepositoryUrl(options.url)
  const url = buildGitCodeRawUrl(repository, owner, repo, filePath, ref)
  const response = await fetch(url)
  await ensureGitCodeOk(response)
  if (typeof response.arrayBuffer === 'function') {
    return Buffer.from(await response.arrayBuffer())
  }
  return Buffer.from(await response.text())
}

async function resolveSkillMetadata(repository: ISkillRepository, skillMdPath: string, ref: string): Promise<SkillMetadata> {
  try {
    const content = (await fetchGitCodeRawFile(repository, skillMdPath, ref)).toString('utf8')
    return parseSkillMetadata(content)
  } catch {
    return {}
  }
}

function parseSkillMetadata(content: string): SkillMetadata {
  const frontMatterMatch = content.match(/^---\s*([\s\S]*?)\s*---/)
  if (!frontMatterMatch) {
    return {}
  }

  const metadata: Record<string, string> = {}
  for (const rawLine of frontMatterMatch[1].split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) {
      continue
    }

    const key = line.slice(0, colonIndex).trim()
    let value = line.slice(colonIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    metadata[key] = value
  }

  return metadata
}

function findSkillDirectories(files: GitCodeFileEntry[], repositoryPath: string): string[] {
  const directories = files
    .map((file) => file.path)
    .filter((filePath) => path.posix.basename(filePath).toLowerCase() === 'skill.md')
    .filter((filePath) => isFileUnderPath(filePath, repositoryPath))
    .map((filePath) => stripPathPrefix(path.posix.dirname(filePath), repositoryPath))
    .sort((a, b) => a.length - b.length)

  const selected: string[] = []
  for (const directory of directories) {
    if (!selected.some((parent) => parent === '' || isFileUnderPath(directory, parent))) {
      selected.push(directory)
    }
  }
  return selected
}

function collectResources(files: GitCodeFileEntry[], repositoryPath: string, skillPath: string) {
  const skillPrefix = joinGitCodePath(repositoryPath, skillPath)
  return files
    .filter((file) => isFileUnderPath(file.path, skillPrefix))
    .map((file) => {
      const resourcePath = stripPathPrefix(file.path, repositoryPath)
      return {
        name: file.name || path.posix.basename(file.path),
        path: resourcePath,
        type: 'file',
        sha: file.sha,
        downloadUrl: file.download_url ?? null,
        size: file.size
      }
    })
}

function normalizeGitCodeFileEntries(data: any): GitCodeFileEntry[] {
  const candidates = Array.isArray(data)
    ? data
    : data?.files ?? data?.file_list ?? data?.tree ?? data?.items ?? data?.data ?? []

  if (!Array.isArray(candidates)) {
    return []
  }

  return candidates
    .map((item) => {
      if (typeof item === 'string') {
        return { path: item, type: 'file' }
      }
      return {
        path: item.path || item.name || item.file_path,
        type: item.type,
        name: item.name,
        size: item.size,
        sha: item.sha,
        download_url: item.download_url
      }
    })
    .filter((item) => typeof item.path === 'string' && item.path.trim())
}

function buildGitCodeSkillLink(repoUrl: string, branch: string, repositoryPath: string, skillPath: string): string {
  const { normalizedRepoUrl } = parseGitCodeRepositoryUrl(repoUrl)
  const skillFilePath = joinGitCodePath(repositoryPath, skillPath, 'SKILL.md')
  return `${normalizedRepoUrl}/blob/${branch}/${skillFilePath}`
}

function buildGitCodeApiUrl(repository: ISkillRepository, apiPath: string, params: Record<string, string | undefined>) {
  const url = new URL(`${GITCODE_API_BASE_URL}${apiPath}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value)
    }
  })

  const token = resolveGitCodeToken(repository)
  if (token) {
    url.searchParams.set('access_token', token)
  }

  return url.toString()
}

function buildGitCodeRawUrl(repository: ISkillRepository, owner: string, repo: string, filePath: string, ref: string) {
  const url = new URL(`${GITCODE_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${repo}/raw/`)
  url.pathname += encodeURIComponent(filePath)
  url.searchParams.set('ref', ref)

  const token = resolveGitCodeToken(repository)
  if (token) {
    url.searchParams.set('access_token', token)
  }

  return url.toString()
}

async function fetchGitCodeJson(repository: ISkillRepository, url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'xpert-ai-skill-installer'
    }
  })
  await ensureGitCodeOk(response)
  return response.json()
}

async function ensureGitCodeOk(response: Response) {
  if (response.ok) {
    return
  }

  let detail = ''
  try {
    detail = await response.text()
  } catch {
    detail = ''
  }

  throw new Error(`GitCode API error: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`)
}

function resolveGitCodeToken(repository?: ISkillRepository): string | undefined {
  return (repository?.credentials as { token?: string } | undefined)?.token || process.env.GITCODE_TOKEN
}

function normalizeRepositoryPath(repositoryPath?: string) {
  if (!repositoryPath) {
    return ''
  }
  const normalized = repositoryPath.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  return normalized === '.' ? '' : normalized
}

function joinGitCodePath(...paths: string[]) {
  return paths
    .map(normalizeRepositoryPath)
    .filter(Boolean)
    .join('/')
}

function isFileUnderPath(filePath: string, parentPath: string) {
  const normalizedFilePath = normalizeRepositoryPath(filePath)
  const normalizedParentPath = normalizeRepositoryPath(parentPath)
  if (!normalizedParentPath) {
    return true
  }
  return normalizedFilePath === normalizedParentPath || normalizedFilePath.startsWith(`${normalizedParentPath}/`)
}

function stripPathPrefix(filePath: string, parentPath: string) {
  const normalizedFilePath = normalizeRepositoryPath(filePath)
  const normalizedParentPath = normalizeRepositoryPath(parentPath)
  if (!normalizedParentPath) {
    return normalizedFilePath
  }
  if (normalizedFilePath === normalizedParentPath) {
    return ''
  }
  return normalizedFilePath.slice(normalizedParentPath.length + 1)
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<void>
): Promise<void> {
  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        await mapper(items[index], index)
      }
    })
  )
}
