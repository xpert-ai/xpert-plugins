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
import { ModelScopeIcon, ModelScopeSkillRepositoryOptions } from './types.js'

const MODELSCOPE_SKILL_SOURCE_PROVIDER = 'modelscope'
const MODELSCOPE_API_BASE_URL = 'https://www.modelscope.cn/api/v1'
const DEFAULT_BRANCH = 'master'
const INSTALL_FILE_DOWNLOAD_CONCURRENCY = 5

type ModelScopeRepositoryIdentity = {
  kind: 'skill' | 'collection'
  owner: string
  repo: string
}

type ModelScopeSkillIdentity = {
  owner: string
  repo: string
}

type ModelScopeFileEntry = {
  path: string
  type?: string
  name?: string
  size?: number
  sha?: string
  download_url?: string | null
}

type ModelScopeSkillContext = {
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

type ModelScopeCollectionSkillEntry = {
  owner: string
  repo: string
  name?: string
  description?: string
  license?: string
}

export function parseModelScopeRepositoryUrl(repoUrl: string): ModelScopeRepositoryIdentity {
  const url = new URL(repoUrl)
  const hostname = url.hostname.toLowerCase()
  if (hostname !== 'modelscope.cn' && hostname !== 'www.modelscope.cn') {
    throw new Error('Only ModelScope skill repositories or collections are supported.')
  }

  const pathSegments = url.pathname
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
  const kind = pathSegments[0] === 'collections'
    ? 'collection'
    : pathSegments[0] === 'skills'
      ? 'skill'
      : undefined
  if (!kind) {
    throw new Error('Invalid ModelScope skill repository URL.')
  }

  pathSegments.shift()
  const rawRepo = pathSegments.pop()
  const owner = pathSegments.join('/')
  const repo = rawRepo?.replace(/\.git$/, '')
  if (!owner || !repo || pathSegments.length < 1) {
    throw new Error('Invalid ModelScope skill repository URL.')
  }

  return {
    kind,
    owner,
    repo
  }
}

@Injectable()
@SkillSourceProviderStrategy(MODELSCOPE_SKILL_SOURCE_PROVIDER)
export class ModelScopeSkillSourceProvider implements ISkillSourceProvider {
  readonly type = MODELSCOPE_SKILL_SOURCE_PROVIDER
  readonly meta: TSkillSourceMeta = {
    name: MODELSCOPE_SKILL_SOURCE_PROVIDER,
    label: {
      en_US: 'ModelScope',
      zh_Hans: 'ModelScope'
    },
    icon: {
      type: 'svg',
      value: ModelScopeIcon
    },
    description: {
      en_US: 'Register skills from ModelScope Skills and collections.',
      zh_Hans: '从 ModelScope Skills 和合集注册技能。'
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
            en_US: 'The URL of the ModelScope skill repository or collection.',
            zh_Hans: 'ModelScope 技能仓库或合集地址。'
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
            en_US: 'The branch, tag, or commit ref to use. Defaults to master.',
            zh_Hans: '使用的分支、标签或提交引用。默认 master。'
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
            en_US: 'Personal access token for private ModelScope repositories.',
            zh_Hans: '用于访问 ModelScope 私有仓库的个人访问令牌。'
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
    return sourceType === MODELSCOPE_SKILL_SOURCE_PROVIDER
  }

  async listSkills(repository: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
    return scanModelScopeSkills(repository)
  }

  async installSkillPackage(index: ISkillRepositoryIndex, installDir: string): Promise<string> {
    if (!index.repository) {
      throw new Error('Skill repository context is required to fetch package.')
    }

    const options = index.repository.options as unknown as ModelScopeSkillRepositoryOptions
    const identity = parseModelScopeRepositoryUrl(options.url)
    const branch = options.branch || DEFAULT_BRANCH
    const repositoryPath = normalizeRepositoryPath(options.path)
    const skillIdentity = identity.kind === 'collection'
      ? await resolveModelScopeCollectionSkillIdentity(index.repository, identity, index.skillPath)
      : { owner: identity.owner, repo: identity.repo, skillPath: index.skillPath }
    const files = await listModelScopeSkillFiles(index.repository, skillIdentity.owner, skillIdentity.repo, branch)
    const skillPrefix = joinModelScopePath(repositoryPath, skillIdentity.skillPath)
    const selectedFiles = files.filter((file) => isFileUnderPath(file.path, skillPrefix))
    const skillRoot = identity.kind === 'collection'
      ? join(installDir, identity.owner, identity.repo, skillIdentity.owner, skillIdentity.repo, skillIdentity.skillPath)
      : join(installDir, identity.owner, identity.repo, index.skillPath)

    await mkdir(skillRoot, { recursive: true })

    try {
      await mapWithConcurrency(
        selectedFiles,
        INSTALL_FILE_DOWNLOAD_CONCURRENCY,
        async (file) => {
          const filePathInSkill = stripPathPrefix(file.path, skillPrefix)
          const targetPath = join(skillRoot, filePathInSkill)
          await mkdir(dirname(targetPath), { recursive: true })
          const content = await fetchModelScopeSkillRawFile(
            index.repository as ISkillRepository,
            skillIdentity.owner,
            skillIdentity.repo,
            file.path,
            branch
          )
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

export async function scanModelScopeSkills(repository: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
  const options = repository.options as unknown as ModelScopeSkillRepositoryOptions
  const repositoryPath = normalizeRepositoryPath(options?.path)
  const branch = options?.branch || DEFAULT_BRANCH
  const identity = parseModelScopeRepositoryUrl(options.url)
  if (identity.kind === 'collection') {
    return scanModelScopeCollectionSkills(repository, identity, repositoryPath, branch)
  }

  const files = await listModelScopeSkillFiles(repository, identity.owner, identity.repo, branch)
  const skillDirs = findSkillDirectories(files, repositoryPath)
  const context: ModelScopeSkillContext = {
    repositoryId: repository.id,
    repoUrl: options.url,
    repositoryPath,
    branch
  }

  const skills: ISkillRepositoryIndex[] = []
  for (const skillPath of skillDirs) {
    const fullSkillPath = joinModelScopePath(repositoryPath, skillPath)
    const skillMdPath = joinModelScopePath(fullSkillPath, 'SKILL.md')
    const metadata = await resolveSkillMetadata(repository, skillMdPath, branch)
    const resources = collectResources(files, repositoryPath, skillPath)

    skills.push({
      repositoryId: context.repositoryId,
      skillPath,
      skillId: skillPath || '/',
      name: metadata.name || path.posix.basename(skillPath) || '/',
      link: buildModelScopeSkillLink(context.repoUrl, context.branch, context.repositoryPath, skillPath),
      description: metadata.description,
      license: metadata.license,
      tags: [],
      version: metadata.version,
      resources
    })
  }

  return skills
}

async function scanModelScopeCollectionSkills(
  repository: ISkillRepository,
  identity: ModelScopeRepositoryIdentity,
  repositoryPath: string,
  branch: string
): Promise<ISkillRepositoryIndex[]> {
  const collectionSkills = await listModelScopeCollectionSkills(repository, identity)
  const skills: ISkillRepositoryIndex[] = []

  for (const collectionSkill of collectionSkills) {
    const files = await listModelScopeSkillFiles(repository, collectionSkill.owner, collectionSkill.repo, branch)
    const skillDirs = findSkillDirectories(files, repositoryPath)

    for (const skillPath of skillDirs) {
      const fullSkillPath = joinModelScopePath(repositoryPath, skillPath)
      const skillMdPath = joinModelScopePath(fullSkillPath, 'SKILL.md')
      const metadata = await resolveSkillMetadata(
        repository,
        skillMdPath,
        branch,
        collectionSkill
      )
      const collectionSkillPath = joinModelScopePath(collectionSkill.owner, collectionSkill.repo, skillPath)
      const resources = collectResources(files, repositoryPath, skillPath, collectionSkillPath)

      skills.push({
        repositoryId: repository.id,
        skillPath: collectionSkillPath,
        skillId: collectionSkillPath,
        name: metadata.name || collectionSkill.name || path.posix.basename(skillPath) || collectionSkill.repo,
        link: buildModelScopeSkillFileLink(collectionSkill.owner, collectionSkill.repo, branch, repositoryPath, skillPath),
        description: metadata.description || collectionSkill.description,
        license: metadata.license || collectionSkill.license,
        tags: [],
        version: metadata.version,
        resources
      })
    }
  }

  return skills
}

async function listModelScopeSkillFiles(
  repository: ISkillRepository,
  owner: string,
  repo: string,
  branch: string
): Promise<ModelScopeFileEntry[]> {
  const url = buildModelScopeApiUrl(`/skills/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/repo/files`, {
    Revision: branch
  })
  const data = await fetchModelScopeJson(repository, url)
  return normalizeModelScopeFileEntries(data)
    .map((entry) => ({
      ...entry,
      path: normalizeRepositoryPath(entry.path)
    }))
    .filter((entry) => entry.path && entry.type !== 'dir' && entry.type !== 'tree')
}

async function fetchModelScopeRawFile(repository: ISkillRepository, filePath: string, ref: string): Promise<Buffer> {
  const options = repository.options as unknown as ModelScopeSkillRepositoryOptions
  const { owner, repo } = parseModelScopeRepositoryUrl(options.url)
  return fetchModelScopeSkillRawFile(repository, owner, repo, filePath, ref)
}

async function fetchModelScopeSkillRawFile(
  repository: ISkillRepository,
  owner: string,
  repo: string,
  filePath: string,
  ref: string
): Promise<Buffer> {
  const url = buildModelScopeRawUrl(owner, repo, filePath, ref)
  const data = await fetchModelScopeJson(repository, url)
  const content = data?.Data?.Content ?? data?.data?.content ?? data?.content
  if (typeof content !== 'string') {
    throw new Error('ModelScope API error: raw file content is empty.')
  }
  return Buffer.from(content)
}

async function resolveSkillMetadata(
  repository: ISkillRepository,
  skillMdPath: string,
  ref: string,
  skillIdentity?: ModelScopeSkillIdentity
): Promise<SkillMetadata> {
  try {
    const content = (skillIdentity
      ? await fetchModelScopeSkillRawFile(repository, skillIdentity.owner, skillIdentity.repo, skillMdPath, ref)
      : await fetchModelScopeRawFile(repository, skillMdPath, ref)
    ).toString('utf8')
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

function findSkillDirectories(files: ModelScopeFileEntry[], repositoryPath: string): string[] {
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

function collectResources(
  files: ModelScopeFileEntry[],
  repositoryPath: string,
  skillPath: string,
  resourcePrefix = ''
) {
  const skillPrefix = joinModelScopePath(repositoryPath, skillPath)
  return files
    .filter((file) => isFileUnderPath(file.path, skillPrefix))
    .map((file) => {
      const resourcePath = stripPathPrefix(file.path, repositoryPath)
      return {
        name: file.name || path.posix.basename(file.path),
        path: joinModelScopePath(resourcePrefix, resourcePath),
        type: 'file',
        sha: file.sha,
        downloadUrl: file.download_url ?? null,
        size: file.size
      }
    })
}

function normalizeModelScopeFileEntries(data: any): ModelScopeFileEntry[] {
  const candidates = Array.isArray(data)
    ? data
    : data?.Data?.Files ?? data?.data?.files ?? data?.files ?? data?.file_list ?? data?.tree ?? data?.items ?? []

  if (!Array.isArray(candidates)) {
    return []
  }

  return candidates
    .map((item) => {
      if (typeof item === 'string') {
        return { path: item, type: 'file' }
      }
      return {
        path: item.Path || item.path || item.name || item.file_path,
        type: item.Type || item.type,
        name: item.Name || item.name,
        size: item.Size || item.size,
        sha: item.Sha256 || item.sha,
        download_url: item.download_url
      }
    })
    .filter((item) => typeof item.path === 'string' && item.path.trim())
}

async function listModelScopeCollectionSkills(
  repository: ISkillRepository,
  identity: ModelScopeRepositoryIdentity
): Promise<ModelScopeCollectionSkillEntry[]> {
  const pageSize = 100
  const maxPages = 50
  const skills: ModelScopeCollectionSkillEntry[] = []

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildModelScopeApiUrl('/collections', {
      Fid: `${identity.owner}/${identity.repo}`,
      PageNumber: String(page),
      PageSize: String(pageSize),
      ElementType: 'skill'
    })
    const data = await fetchModelScopeJson(repository, url)
    const result = normalizeModelScopeCollectionSkillEntries(data)
    skills.push(...result.items)

    if (skills.length >= result.total || result.items.length < pageSize) {
      break
    }
  }

  return skills
}

function normalizeModelScopeCollectionSkillEntries(data: any): {
  items: ModelScopeCollectionSkillEntry[]
  total: number
} {
  const collectionElements = data?.Data?.CollectionElements ?? data?.data?.collectionElements ?? data?.collectionElements
  const candidates = collectionElements?.CollectionElementVoList ?? collectionElements?.list ?? collectionElements?.items ?? []
  const total = collectionElements?.Total ?? collectionElements?.total ?? candidates.length

  if (!Array.isArray(candidates)) {
    return { items: [], total: 0 }
  }

  return {
    total: typeof total === 'number' ? total : candidates.length,
    items: candidates
      .filter((item) => item?.ElementType === 'skill' || item?.elementType === 'skill')
      .map((item) => {
        const info = item.ElementInfo ?? item.elementInfo ?? {}
        const owner = info.SkillPath ?? info.skillPath ?? item.ElementPath ?? item.elementPath
        const repo = info.SkillName ?? info.skillName ?? item.ElementName ?? item.elementName
        if (typeof owner !== 'string' || !owner || typeof repo !== 'string' || !repo) {
          throw new Error('ModelScope collection skill entry is missing SkillPath or SkillName.')
        }

        return {
          owner,
          repo,
          name: info.SkillDisplayName ?? info.skillDisplayName ?? repo,
          description: info.SkillDescription ?? info.skillDescription,
          license: info.SkillLicense ?? info.skillLicense
        }
      })
  }
}

function buildModelScopeSkillLink(repoUrl: string, branch: string, repositoryPath: string, skillPath: string): string {
  const { owner, repo } = parseModelScopeRepositoryUrl(repoUrl)
  return buildModelScopeSkillFileLink(owner, repo, branch, repositoryPath, skillPath)
}

function buildModelScopeSkillFileLink(
  owner: string,
  repo: string,
  branch: string,
  repositoryPath: string,
  skillPath: string
): string {
  const skillFilePath = encodeModelScopeFilePath(joinModelScopePath(repositoryPath, skillPath, 'SKILL.md'))
  return `${buildModelScopeSkillUrl(owner, repo)}/file/view/${encodeURIComponent(branch)}/${skillFilePath}`
}

function buildModelScopeSkillUrl(owner: string, repo: string) {
  return `https://www.modelscope.cn/skills/${owner}/${repo}`
}

function buildModelScopeApiUrl(apiPath: string, params: Record<string, string | undefined>) {
  const url = new URL(`${MODELSCOPE_API_BASE_URL}${apiPath}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value)
    }
  })

  return url.toString()
}

function buildModelScopeRawUrl(owner: string, repo: string, filePath: string, ref: string) {
  return buildModelScopeApiUrl(`/skills/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/repo/raw`, {
    FilePath: filePath,
    Revision: ref
  })
}

async function fetchModelScopeJson(repository: ISkillRepository, url: string): Promise<any> {
  const token = resolveModelScopeToken(repository)
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'xpert-ai-skill-installer',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  })
  await ensureModelScopeOk(response)
  const data = await response.json() as any
  if (data && data.Success === false) {
    throw new Error(`ModelScope API error: ${data.Code ?? 'unknown'}${data.Message ? ` - ${data.Message}` : ''}`)
  }
  return data
}

async function ensureModelScopeOk(response: Response) {
  if (response.ok) {
    return
  }

  let detail = ''
  try {
    detail = await response.text()
  } catch {
    detail = ''
  }

  throw new Error(`ModelScope API error: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`)
}

function resolveModelScopeToken(repository?: ISkillRepository): string | undefined {
  return (repository?.credentials as { token?: string } | undefined)?.token || process.env.MODELSCOPE_TOKEN
}

function encodeModelScopeFilePath(filePath: string) {
  return normalizeRepositoryPath(filePath)
    .split('/')
    .map(encodeURIComponent)
    .join('/')
}

function normalizeRepositoryPath(repositoryPath?: string) {
  if (!repositoryPath) {
    return ''
  }
  const normalized = repositoryPath.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  return normalized === '.' ? '' : normalized
}

function joinModelScopePath(...paths: string[]) {
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

async function resolveModelScopeCollectionSkillIdentity(
  repository: ISkillRepository,
  identity: ModelScopeRepositoryIdentity,
  skillPath: string
): Promise<ModelScopeSkillIdentity & { skillPath: string }> {
  const collectionSkills = await listModelScopeCollectionSkills(repository, identity)
  for (const collectionSkill of collectionSkills) {
    const skillRoot = joinModelScopePath(collectionSkill.owner, collectionSkill.repo)
    if (skillPath === skillRoot || isFileUnderPath(skillPath, skillRoot)) {
      return {
        owner: collectionSkill.owner,
        repo: collectionSkill.repo,
        skillPath: stripPathPrefix(skillPath, skillRoot)
      }
    }
  }

  throw new Error('Invalid ModelScope collection skill path.')
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
