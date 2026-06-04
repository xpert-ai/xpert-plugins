import { createHash, randomUUID } from 'crypto'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { SitesDeployment, SitesEnvironmentVariable, SitesProject, SitesVersion } from './entities/index.js'
import { SITES_PLUGIN_NAME, WORKBENCH_BROWSER_PREVIEW_EVENT_TYPE } from './constants.js'
import type {
  CreateSitesProjectInput,
  DeploySitesVersionInput,
  SaveSitesVersionInput,
  SerializedSitesProject,
  SitesAccessMode,
  SitesEnvironmentValueInput,
  SitesHostingConfig,
  SitesScope,
  SitesSourceFile,
  SitesStorageShape,
  WorkbenchBrowserPreviewEvent
} from './types.js'

const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:3000/api/xpert-sites'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

@Injectable()
export class SitesService {
  constructor(
    @InjectRepository(SitesProject)
    private readonly projectRepository: Repository<SitesProject>,
    @InjectRepository(SitesVersion)
    private readonly versionRepository: Repository<SitesVersion>,
    @InjectRepository(SitesDeployment)
    private readonly deploymentRepository: Repository<SitesDeployment>,
    @InjectRepository(SitesEnvironmentVariable)
    private readonly environmentRepository: Repository<SitesEnvironmentVariable>
  ) {}

  async createProject(input: CreateSitesProjectInput, scope: SitesScope) {
    const name = normalizeRequiredString(input.name, 'name')
    const slug = await this.allocateSlug(scope, input.slug ?? name)
    const storageShape = input.storageShape ?? inferStorageShape(input)
    const hostingConfig = buildHostingConfig({
      projectId: undefined,
      storageShape,
      d1Binding: input.d1Binding,
      r2Binding: input.r2Binding,
      authMode: input.authMode
    })

    const project = await this.projectRepository.save(
      this.projectRepository.create({
        ...this.scopeCreate(scope),
        name,
        slug,
        description: optionalString(input.description),
        status: 'draft',
        audience: input.audience ?? 'admins_only',
        customAudience: normalizeStringArray(input.customAudience),
        storageShape,
        sourcePath: optionalString(input.sourcePath),
        hostingConfig
      })
    )

    const projectId = project.id ?? randomUUID()
    if (!project.hostingConfig?.project_id && project.id) {
      project.hostingConfig = {
        ...project.hostingConfig,
        project_id: project.id
      }
      await this.projectRepository.save(project)
    }

    return {
      ...project,
      id: project.id ?? projectId
    }
  }

  async saveVersion(input: SaveSitesVersionInput, scope: SitesScope) {
    const project = await this.resolveProjectForVersion(input, scope)
    const versionNumber = (await this.versionRepository.count({ where: this.scopedWhere(scope, { projectId: project.id }) })) + 1
    const files = sanitizeSourceFiles(input.files?.length ? input.files : generateSiteFiles(project, input))
    const previewHtml = buildPreviewHtml(files, project, input)
    const artifactDigest = digest(JSON.stringify({ files, previewHtml }))
    const status = previewHtml.trim() ? 'saved' : 'build_failed'

    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...this.scopeCreate(scope),
        projectId: project.id,
        versionNumber,
        title: optionalString(input.title) ?? `Version ${versionNumber}`,
        description: optionalString(input.description),
        prompt: optionalString(input.prompt),
        sourceCommit: optionalString(input.sourceCommit) ?? `sites-${artifactDigest.slice(0, 12)}`,
        storageShape: input.storageShape ?? project.storageShape ?? 'static',
        status,
        files,
        previewHtml,
        artifactDigest,
        buildLogs:
          status === 'saved'
            ? `Built ${files.length} file(s) into a Worker-compatible static artifact.`
            : 'Build did not produce HTML.'
      })
    )

    await this.projectRepository.save({
      ...project,
      status: status === 'saved' ? 'version_saved' : project.status
    })

    return version
  }

  async deployVersion(input: DeploySitesVersionInput, scope: SitesScope) {
    if (!input.projectId && !input.versionId) {
      throw new BadRequestException('projectId or versionId is required')
    }
    const version = input.versionId
      ? await this.resolveVersion(scope, input.versionId)
      : await this.findLatestVersion(scope, input.projectId)
    const project = await this.resolveProject(scope, input.projectId ?? version.projectId)
    if (version.projectId !== project.id) {
      throw new BadRequestException('Version does not belong to the selected Sites project')
    }
    if (version.status !== 'saved') {
      throw new BadRequestException('Only saved versions can be deployed')
    }

    const envFingerprint = await this.computeEnvironmentFingerprint(scope, project.id)
    const accessMode = input.accessMode ?? project.audience ?? 'admins_only'
    const deployment = await this.deploymentRepository.save(
      this.deploymentRepository.create({
        ...this.scopeCreate(scope),
        projectId: project.id,
        versionId: version.id,
        deploymentUrl: this.buildDeploymentUrl(project.slug, version.versionNumber),
        status: 'deployed',
        accessMode,
        customAudience: normalizeStringArray(input.customAudience) ?? project.customAudience,
        environmentFingerprint: envFingerprint,
        deployedAt: new Date()
      })
    )

    await this.projectRepository.save({
      ...project,
      status: 'deployed',
      audience: accessMode,
      customAudience: deployment.customAudience,
      currentDeploymentId: deployment.id,
      currentDeploymentUrl: deployment.deploymentUrl
    })

    return deployment
  }

  async createAndDeploy(input: CreateSitesProjectInput & SaveSitesVersionInput & DeploySitesVersionInput, scope: SitesScope) {
    const project =
      input.projectId || input.slug
        ? await this.resolveProjectForVersion(input, scope)
        : await this.createProject(
            {
              name: input.name ?? input.title ?? 'Untitled Site',
              slug: input.slug,
              description: input.description,
              audience: input.accessMode,
              customAudience: input.customAudience,
              storageShape: input.storageShape,
              d1Binding: input.d1Binding,
              r2Binding: input.r2Binding,
              authMode: input.authMode,
              sourcePath: input.sourcePath,
              prompt: input.prompt
            },
            scope
          )
    const version = await this.saveVersion(
      {
        projectId: project.id,
        prompt: input.prompt,
        title: input.title,
        description: input.description,
        files: input.files,
        sourceCommit: input.sourceCommit,
        storageShape: input.storageShape
      },
      scope
    )
    const deployment = await this.deployVersion(
      {
        projectId: project.id,
        versionId: version.id,
        accessMode: input.accessMode,
        customAudience: input.customAudience
      },
      scope
    )
    return { project, version, deployment }
  }

  async listProjects(scope: SitesScope, input: { search?: string; limit?: number } = {}) {
    const projects = await this.projectRepository.find({
      where: this.scopedWhere(scope),
      order: { updatedAt: 'DESC' },
      take: Math.min(Math.max(input.limit ?? 50, 1), 200)
    })
    const search = input.search?.trim().toLowerCase()
    const filtered = search
      ? projects.filter((project) =>
          [project.name, project.slug, project.description].some((value) => value?.toLowerCase().includes(search))
        )
      : projects

    const [versionCounts, deploymentCounts] = await Promise.all([
      this.countByProject(scope, this.versionRepository),
      this.countByProject(scope, this.deploymentRepository)
    ])

    return filtered.map((project) => serializeProject(project, versionCounts.get(project.id ?? '') ?? 0, deploymentCounts.get(project.id ?? '') ?? 0))
  }

  async inspectProject(scope: SitesScope, projectId?: string) {
    const project = await this.resolveProject(scope, projectId)
    const [versions, deployments, environmentValues] = await Promise.all([
      this.versionRepository.find({
        where: this.scopedWhere(scope, { projectId: project.id }),
        order: { versionNumber: 'DESC' }
      }),
      this.deploymentRepository.find({
        where: this.scopedWhere(scope, { projectId: project.id }),
        order: { createdAt: 'DESC' }
      }),
      this.environmentRepository.find({
        where: this.scopedWhere(scope, { projectId: project.id }),
        order: { key: 'ASC' }
      })
    ])

    return {
      project: serializeProject(project, versions.length, deployments.length),
      versions: versions.map(serializeVersion),
      deployments: deployments.map(serializeDeployment),
      environmentValues: environmentValues.map(serializeEnvironmentValue)
    }
  }

  async getViewData(scope: SitesScope, input: { projectId?: string; search?: string; limit?: number } = {}) {
    const projects = await this.listProjects(scope, input)
    const selectedProjectId = input.projectId
    const detail = selectedProjectId ? await this.inspectProject(scope, selectedProjectId) : undefined
    return {
      items: projects,
      total: projects.length,
      summary: {
        mode: detail ? 'project' : 'list',
        stats: summarizeProjects(projects),
        selectedProjectId
      },
      meta: detail ?? {
        project: null,
        versions: [],
        deployments: [],
        environmentValues: []
      }
    }
  }

  async setAccess(scope: SitesScope, projectId: string, accessMode: SitesAccessMode, customAudience?: string[]) {
    const project = await this.resolveProject(scope, projectId)
    const normalizedAudience = normalizeStringArray(customAudience)
    const savedProject = await this.projectRepository.save({
      ...project,
      audience: accessMode,
      customAudience: normalizedAudience ?? project.customAudience
    })
    if (savedProject.currentDeploymentId) {
      const deployment = await this.deploymentRepository.findOne({
        where: this.scopedWhere(scope, { id: savedProject.currentDeploymentId })
      })
      if (deployment) {
        await this.deploymentRepository.save({
          ...deployment,
          accessMode,
          customAudience: normalizedAudience ?? deployment.customAudience
        })
      }
    }
    return savedProject
  }

  async upsertEnvironmentValue(scope: SitesScope, input: SitesEnvironmentValueInput) {
    const project = await this.resolveProject(scope, input.projectId)
    const key = normalizeEnvironmentKey(input.key)
    const existing = await this.environmentRepository.findOne({
      where: this.scopedWhere(scope, {
        projectId: project.id,
        key
      })
    })
    return this.environmentRepository.save(
      this.environmentRepository.create({
        ...existing,
        ...this.scopeCreate(scope),
        projectId: project.id,
        key,
        value: input.value ?? existing?.value ?? '',
        secret: input.secret ?? existing?.secret ?? false,
        description: optionalString(input.description) ?? existing?.description
      })
    )
  }

  async removeEnvironmentValue(scope: SitesScope, projectId: string, key: string) {
    const project = await this.resolveProject(scope, projectId)
    const normalizedKey = normalizeEnvironmentKey(key)
    await this.environmentRepository.delete(this.scopedWhere(scope, { projectId: project.id, key: normalizedKey }))
    return { projectId: project.id, key: normalizedKey, removed: true }
  }

  async archiveProject(scope: SitesScope, projectId: string) {
    const project = await this.resolveProject(scope, projectId)
    return this.projectRepository.save({
      ...project,
      status: 'archived'
    })
  }

  async findDeploymentSite(deploymentIdOrSlug: string) {
    const deployment = UUID_PATTERN.test(deploymentIdOrSlug)
      ? await this.deploymentRepository.findOne({
          where: { id: deploymentIdOrSlug }
        })
      : null
    const projects = deployment
      ? []
      : await this.projectRepository.find({
          where: { slug: deploymentIdOrSlug },
          select: ['id']
        })
    const projectIds = projects.map((project) => project.id).filter((id): id is string => !!id)
    const deploymentRecord =
      deployment ??
      (projectIds.length
        ? await this.deploymentRepository.findOne({
            where: { projectId: In(projectIds) },
            order: { createdAt: 'DESC' }
          })
        : null)
    if (!deploymentRecord) {
      throw new NotFoundException('Sites deployment was not found')
    }
    const version = await this.versionRepository.findOne({ where: { id: deploymentRecord.versionId } })
    if (!version?.previewHtml) {
      throw new NotFoundException('Sites deployment artifact was not found')
    }
    return {
      deployment: serializeDeployment(deploymentRecord),
      html: version.previewHtml
    }
  }

  private async resolveProjectForVersion(input: SaveSitesVersionInput, scope: SitesScope) {
    if (input.projectId) {
      return this.resolveProject(scope, input.projectId)
    }
    if (input.slug) {
      const project = await this.projectRepository.findOne({
        where: this.scopedWhere(scope, { slug: slugify(input.slug) })
      })
      if (project) {
        return project
      }
    }
    return this.createProject(
      {
        name: input.name ?? input.title ?? 'Untitled Site',
        slug: input.slug,
        description: input.description,
        storageShape: input.storageShape,
        prompt: input.prompt
      },
      scope
    )
  }

  private async resolveProject(scope: SitesScope, projectId: string | undefined) {
    const id = projectId?.trim()
    if (!id) {
      throw new BadRequestException('projectId is required')
    }
    const project = await this.projectRepository.findOne({ where: this.scopedWhere(scope, { id }) })
    if (!project) {
      throw new NotFoundException('Sites project was not found')
    }
    return project
  }

  private async resolveVersion(scope: SitesScope, versionId: string | undefined) {
    const id = versionId?.trim()
    if (!id) {
      throw new BadRequestException('versionId is required')
    }
    const version = await this.versionRepository.findOne({ where: this.scopedWhere(scope, { id }) })
    if (!version) {
      throw new NotFoundException('Sites version was not found')
    }
    return version
  }

  private async findLatestVersion(scope: SitesScope, projectId: string | undefined) {
    const version = await this.versionRepository.findOne({
      where: this.scopedWhere(scope, { projectId }),
      order: { versionNumber: 'DESC' }
    })
    if (!version) {
      throw new NotFoundException('No saved Sites version is available')
    }
    return version
  }

  private async allocateSlug(scope: SitesScope, value: string) {
    const baseSlug = slugify(value)
    let slug = baseSlug
    let suffix = 2
    while (await this.projectRepository.findOne({ where: this.scopedWhere(scope, { slug }) })) {
      slug = `${baseSlug}-${suffix++}`
    }
    return slug
  }

  private async computeEnvironmentFingerprint(scope: SitesScope, projectId: string | undefined) {
    const values = await this.environmentRepository.find({
      where: this.scopedWhere(scope, { projectId }),
      order: { key: 'ASC' }
    })
    return digest(JSON.stringify(values.map((item) => ({ key: item.key, secret: item.secret, value: item.secret ? 'secret' : item.value }))))
  }

  private async countByProject<T extends { projectId?: string }>(scope: SitesScope, repository: Repository<T>) {
    const rows = await repository.find({ where: this.scopedWhere(scope) as any })
    return rows.reduce<Map<string, number>>((acc, row) => {
      if (row.projectId) {
        acc.set(row.projectId, (acc.get(row.projectId) ?? 0) + 1)
      }
      return acc
    }, new Map())
  }

  private buildDeploymentUrl(slug: string | undefined, versionNumber: number | undefined) {
    const path = encodeURIComponent(slug ?? 'site')
    const version = versionNumber ? `?v=${versionNumber}` : ''
    return `${getPublicBaseUrl()}/${path}${version}`
  }

  private scopedWhere(scope: SitesScope, extra: Record<string, unknown> = {}) {
    return {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined,
      assistantId: scope.assistantId,
      ...extra
    }
  }

  private scopeCreate(scope: SitesScope) {
    return {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined,
      createdById: scope.userId ?? undefined,
      assistantId: scope.assistantId ?? undefined,
      conversationId: scope.conversationId ?? undefined
    }
  }
}

type SitesDeploymentPreviewEventInput = {
  project?: { id?: string; slug?: string }
  version?: { id?: string; versionNumber?: number }
  deployment?: {
    id?: string
    projectId?: string
    versionId?: string
    deploymentUrl?: string
    status?: string
    accessMode?: string
  }
  url?: string
  displayUrl?: string
  deploymentUrl?: string
  projectId?: string
  versionId?: string
  deploymentId?: string
  slug?: string
  versionNumber?: number
  status?: string
  accessMode?: string
}

export function buildSitesDeploymentPreviewEvent(
  input: SitesDeploymentPreviewEventInput
): WorkbenchBrowserPreviewEvent | null {
  const url =
    optionalString(input.url) ??
    optionalString(input.displayUrl) ??
    optionalString(input.deploymentUrl) ??
    optionalString(input.deployment?.deploymentUrl)
  if (!url) {
    return null
  }

  const projectId = optionalString(input.projectId) ?? optionalString(input.deployment?.projectId) ?? optionalString(input.project?.id)
  const versionId = optionalString(input.versionId) ?? optionalString(input.deployment?.versionId) ?? optionalString(input.version?.id)
  const deploymentId = optionalString(input.deploymentId) ?? optionalString(input.deployment?.id)
  const slug = optionalString(input.slug) ?? optionalString(input.project?.slug)
  const versionNumber =
    typeof input.versionNumber === 'number'
      ? input.versionNumber
      : typeof input.version?.versionNumber === 'number'
        ? input.version.versionNumber
        : undefined
  const status = optionalString(input.status) ?? optionalString(input.deployment?.status)
  const accessMode = optionalString(input.accessMode) ?? optionalString(input.deployment?.accessMode)

  return {
    type: WORKBENCH_BROWSER_PREVIEW_EVENT_TYPE,
    source: SITES_PLUGIN_NAME,
    url,
    displayUrl: url,
    ...(projectId ? { projectId } : {}),
    ...(versionId ? { versionId } : {}),
    ...(deploymentId ? { deploymentId } : {}),
    ...(slug ? { slug } : {}),
    ...(versionNumber ? { versionNumber } : {}),
    ...(status ? { status: status as WorkbenchBrowserPreviewEvent['status'] } : {}),
    ...(accessMode ? { accessMode: accessMode as WorkbenchBrowserPreviewEvent['accessMode'] } : {})
  }
}

function getPublicBaseUrl() {
  return (process.env['XPERT_SITES_PUBLIC_BASE_URL'] ?? DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '')
}

function normalizeRequiredString(value: string | undefined, field: string) {
  const normalized = value?.trim()
  if (!normalized) {
    throw new BadRequestException(`${field} is required`)
  }
  return normalized
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function slugify(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || `site-${randomUUID().slice(0, 8)}`
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }
  const items = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
  return items.length ? Array.from(new Set(items)) : undefined
}

function normalizeEnvironmentKey(value: string) {
  const key = value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  if (!key) {
    throw new BadRequestException('Environment key is required')
  }
  return key
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function inferStorageShape(input: CreateSitesProjectInput): SitesStorageShape {
  if (input.storageShape) return input.storageShape
  if (input.d1Binding && input.r2Binding) return 'd1_r2'
  if (input.d1Binding) return 'd1'
  if (input.r2Binding) return 'r2'
  if (input.authMode === 'workspace') return 'workspace_auth'
  if (input.authMode === 'external') return 'external_auth'
  return 'static'
}

function buildHostingConfig(input: {
  projectId?: string
  storageShape: SitesStorageShape
  d1Binding?: string | null
  r2Binding?: string | null
  authMode?: 'none' | 'workspace' | 'external'
}): SitesHostingConfig {
  return {
    project_id: input.projectId,
    d1: input.d1Binding ?? (input.storageShape === 'd1' || input.storageShape === 'd1_r2' ? 'DB' : null),
    r2: input.r2Binding ?? (input.storageShape === 'r2' || input.storageShape === 'd1_r2' ? 'BUCKET' : null),
    auth: input.authMode ?? (input.storageShape === 'workspace_auth' ? 'workspace' : input.storageShape === 'external_auth' ? 'external' : 'none')
  }
}

function sanitizeSourceFiles(files: SitesSourceFile[]) {
  const normalized = files
    .map((file) => ({
      path: optionalString(file.path) ?? 'index.html',
      content: typeof file.content === 'string' ? file.content : '',
      language: optionalString(file.language),
      role: file.role
    }))
    .filter((file) => file.content.trim())
  if (!normalized.length) {
    throw new BadRequestException('At least one source file with content is required')
  }
  return normalized
}

function generateSiteFiles(project: SitesProject, input: SaveSitesVersionInput): SitesSourceFile[] {
  const title = escapeHtml(input.title ?? project.name ?? 'Untitled Site')
  const prompt = input.prompt?.trim() || project.description || 'A focused internal site created by the Sites plugin.'
  const theme = pickTheme(prompt)
  const cards = extractCards(prompt)
  const statePanel = project.storageShape && project.storageShape !== 'static'
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="site-shell">
      <section class="hero">
        <p class="eyebrow">${escapeHtml(storageShapeLabel(project.storageShape))}</p>
        <h1>${title}</h1>
        <p class="lead">${escapeHtml(prompt.slice(0, 260))}</p>
        <div class="hero-actions">
          <a href="#workspace" class="button primary">Open workspace</a>
          <a href="#status" class="button secondary">Deployment status</a>
        </div>
      </section>
      <section id="workspace" class="workspace">
        ${cards
          .map(
            (card, index) => `<article class="panel">
          <span class="panel-index">${String(index + 1).padStart(2, '0')}</span>
          <h2>${escapeHtml(card.title)}</h2>
          <p>${escapeHtml(card.body)}</p>
        </article>`
          )
          .join('\n        ')}
      </section>
      <section id="status" class="status">
        <div>
          <p class="eyebrow">Production deployment</p>
          <h2>${escapeHtml(project.name ?? 'Site')} is live</h2>
          <p>This version was saved first, then deployed from the approved artifact.</p>
        </div>
        ${
          statePanel
            ? `<div class="state-box">
          <strong>Storage bindings</strong>
          <span>D1: ${escapeHtml(project.hostingConfig?.d1 ?? 'not requested')}</span>
          <span>R2: ${escapeHtml(project.hostingConfig?.r2 ?? 'not requested')}</span>
        </div>`
            : ''
        }
      </section>
    </main>
    <script src="./app.js"></script>
  </body>
</html>`
  const css = `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: ${theme.background};
  color: #172026;
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; }
.site-shell { min-height: 100vh; }
.hero {
  min-height: 68vh;
  display: grid;
  align-content: center;
  gap: 22px;
  padding: clamp(32px, 6vw, 88px);
  background:
    linear-gradient(115deg, rgba(255,255,255,.92), rgba(255,255,255,.58)),
    linear-gradient(135deg, ${theme.primary}, ${theme.secondary});
}
.eyebrow { margin: 0; text-transform: uppercase; letter-spacing: .08em; font-size: 12px; font-weight: 700; color: ${theme.accent}; }
h1 { max-width: 980px; margin: 0; font-size: clamp(42px, 8vw, 96px); line-height: .95; letter-spacing: 0; }
.lead { max-width: 760px; margin: 0; font-size: clamp(18px, 2.3vw, 25px); line-height: 1.45; color: #31424f; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0 18px; border-radius: 8px; text-decoration: none; font-weight: 700; }
.button.primary { color: white; background: #172026; }
.button.secondary { color: #172026; border: 1px solid rgba(23,32,38,.24); background: rgba(255,255,255,.62); }
.workspace { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1px; background: #d9e1e7; padding: 1px; }
.panel { min-height: 240px; display: grid; align-content: start; gap: 18px; padding: 28px; background: #ffffff; }
.panel-index { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: ${theme.primary}; color: #102027; font-weight: 800; }
.panel h2, .status h2 { margin: 0; font-size: clamp(24px, 3vw, 36px); letter-spacing: 0; }
.panel p, .status p { margin: 0; color: #51616d; line-height: 1.6; }
.status { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 360px); gap: 24px; align-items: center; padding: clamp(32px, 6vw, 76px); background: #f7fafc; }
.state-box { display: grid; gap: 10px; padding: 22px; border: 1px solid #d6e0e8; border-radius: 8px; background: white; }
@media (max-width: 720px) {
  .status { grid-template-columns: 1fr; }
  .hero { min-height: 72vh; }
}`
  const js = `document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'))
    if (!target) return
    event.preventDefault()
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})`
  return [
    { path: 'index.html', content: html, language: 'html', role: 'entry' },
    { path: 'styles.css', content: css, language: 'css', role: 'style' },
    { path: 'app.js', content: js, language: 'javascript', role: 'script' }
  ]
}

function buildPreviewHtml(files: SitesSourceFile[], project: SitesProject, input: SaveSitesVersionInput) {
  const index = files.find((file) => file.path.endsWith('index.html')) ?? files[0]
  let html = index.content
  const cssFiles = files.filter((file) => file.path.endsWith('.css'))
  const jsFiles = files.filter((file) => file.path.endsWith('.js'))
  for (const file of cssFiles) {
    html = html.replace(new RegExp(`<link[^>]+href=["']\\./?${escapeRegExp(file.path)}["'][^>]*>`, 'g'), `<style>\n${file.content}\n</style>`)
  }
  for (const file of jsFiles) {
    html = html.replace(new RegExp(`<script[^>]+src=["']\\./?${escapeRegExp(file.path)}["'][^>]*>\\s*</script>`, 'g'), `<script>\n${file.content}\n</script>`)
  }
  if (!html.includes('</body>')) {
    html += `\n<!-- ${escapeHtml(input.prompt ?? project.name ?? 'Sites deployment')} -->`
  }
  return html
}

function pickTheme(prompt: string) {
  const lower = prompt.toLowerCase()
  if (lower.includes('game') || lower.includes('score')) {
    return { primary: '#a7f3d0', secondary: '#fef08a', accent: '#047857', background: '#f8fafc' }
  }
  if (lower.includes('dashboard') || lower.includes('operations')) {
    return { primary: '#bfdbfe', secondary: '#d9f99d', accent: '#1d4ed8', background: '#f8fafc' }
  }
  if (lower.includes('portfolio') || lower.includes('showcase')) {
    return { primary: '#fde68a', secondary: '#bae6fd', accent: '#b45309', background: '#fffdf5' }
  }
  return { primary: '#c7d2fe', secondary: '#bbf7d0', accent: '#4338ca', background: '#f8fafc' }
}

function extractCards(prompt: string) {
  const sentences = prompt
    .split(/[.;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  const fallback = [
    'Create and review a saved version before publishing.',
    'Track the intended audience and access mode for each deployment.',
    'Keep runtime values outside the source artifact.'
  ]
  return (sentences.length ? sentences : fallback).slice(0, 4).map((sentence, index) => ({
    title: ['Experience', 'Workflow', 'Data', 'Launch'][index] ?? `Part ${index + 1}`,
    body: sentence
  }))
}

function storageShapeLabel(shape: SitesStorageShape | undefined) {
  if (shape === 'd1') return 'D1 durable data'
  if (shape === 'r2') return 'R2 file storage'
  if (shape === 'd1_r2') return 'D1 and R2 storage'
  if (shape === 'workspace_auth') return 'Workspace authenticated'
  if (shape === 'external_auth') return 'Authentication enabled'
  return 'Static site'
}

function serializeProject(project: SitesProject, versionCount = 0, deploymentCount = 0): SerializedSitesProject {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    status: project.status,
    audience: project.audience,
    customAudience: project.customAudience,
    storageShape: project.storageShape,
    hostingConfig: project.hostingConfig,
    currentDeploymentId: project.currentDeploymentId,
    currentDeploymentUrl: project.currentDeploymentUrl,
    versionCount,
    deploymentCount,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt
  }
}

function serializeVersion(version: SitesVersion) {
  return {
    id: version.id,
    projectId: version.projectId,
    versionNumber: version.versionNumber,
    title: version.title,
    description: version.description,
    prompt: version.prompt,
    sourceCommit: version.sourceCommit,
    storageShape: version.storageShape,
    status: version.status,
    artifactDigest: version.artifactDigest,
    buildLogs: version.buildLogs,
    files: version.files?.map((file) => ({ ...file, contentPreview: file.content.slice(0, 240), contentLength: file.content.length, content: undefined })),
    createdAt: version.createdAt,
    updatedAt: version.updatedAt
  }
}

function serializeDeployment(deployment: SitesDeployment) {
  return {
    id: deployment.id,
    projectId: deployment.projectId,
    versionId: deployment.versionId,
    deploymentUrl: deployment.deploymentUrl,
    status: deployment.status,
    accessMode: deployment.accessMode,
    customAudience: deployment.customAudience,
    environmentFingerprint: deployment.environmentFingerprint,
    deployedAt: deployment.deployedAt,
    errorMessage: deployment.errorMessage,
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt
  }
}

function serializeEnvironmentValue(value: SitesEnvironmentVariable) {
  return {
    id: value.id,
    projectId: value.projectId,
    key: value.key,
    value: value.secret ? '********' : value.value,
    secret: value.secret,
    description: value.description,
    updatedAt: value.updatedAt,
    createdAt: value.createdAt
  }
}

function summarizeProjects(projects: SerializedSitesProject[]) {
  return {
    total: projects.length,
    deployed: projects.filter((project) => project.status === 'deployed').length,
    saved: projects.filter((project) => project.status === 'version_saved').length,
    draft: projects.filter((project) => project.status === 'draft').length
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
