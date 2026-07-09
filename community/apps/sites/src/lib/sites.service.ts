import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { posix } from 'path'
import { TextDecoder } from 'util'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import type { IUser } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { SitesDeployment, SitesEnvironmentVariable, SitesProject, SitesShareLink, SitesVersion } from './entities/index.js'
import { SITES_PLUGIN_NAME, WORKBENCH_BROWSER_PREVIEW_EVENT_TYPE } from './constants.js'
import type {
  CreateSitesProjectInput,
  DeploySitesVersionInput,
  CreateSitesShareLinkInput,
  ListSitesShareLinksInput,
  RevokeSitesShareLinkInput,
  SaveSitesVersionInput,
  SerializedSitesShareLink,
  SerializedSitesProject,
  SitesAccessMode,
  SitesEnvironmentValueInput,
  SitesHostingConfig,
  SitesSandboxFileInfo,
  SitesScope,
  SitesSourceFile,
  SitesSourceReadOptions,
  SitesStorageShape,
  WorkbenchBrowserPreviewEvent
} from './types.js'

const DEFAULT_BACKEND_BASE_URL = 'http://localhost:3000'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SITES_SHARE_TOKEN_PARAM = 'token'
const SITE_SOURCE_MAX_FILES = 100
const SITE_SOURCE_MAX_FILE_BYTES = 512 * 1024
const SITE_SOURCE_MAX_TOTAL_BYTES = 5 * 1024 * 1024
const SITE_SOURCE_ALLOWED_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.svg',
  '.txt',
  '.md',
  '.webmanifest'
])
const SITE_SOURCE_EXCLUDED_SEGMENTS = new Set([
  '.git',
  '.cache',
  '.next',
  '.nuxt',
  '.turbo',
  '.vite',
  'coverage',
  'node_modules'
])

type SandboxSourceCandidate = {
  absolutePath: string
  relativePath: string
  size?: number
}

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
    private readonly environmentRepository: Repository<SitesEnvironmentVariable>,
    @InjectRepository(SitesShareLink)
    private readonly shareLinkRepository: Repository<SitesShareLink>
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

  async saveVersion(input: SaveSitesVersionInput, scope: SitesScope, sourceOptions?: SitesSourceReadOptions) {
    const project = await this.resolveProjectForVersion(input, scope)
    const versionNumber = (await this.versionRepository.count({ where: this.scopedWhere(scope, { projectId: project.id }) })) + 1
    const source = await readSandboxSourceFiles(input.sourcePath ?? project.sourcePath, sourceOptions)
    const files = sanitizeSourceFiles(source.files)
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
      sourcePath: source.sourcePath,
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

  async createAndDeploy(
    input: CreateSitesProjectInput & SaveSitesVersionInput & DeploySitesVersionInput,
    scope: SitesScope,
    sourceOptions?: SitesSourceReadOptions
  ) {
    const project =
      input.projectId || input.slug
        ? await this.resolveProjectForVersion(input, scope)
        : await this.createProject(
            {
              name: input.name ?? input.title ?? 'Untitled Site',
              slug: input.slug,
              description: input.description,
              audience: input.accessMode ?? input.audience,
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
        sourcePath: input.sourcePath ?? project.sourcePath,
        sourceCommit: input.sourceCommit,
        storageShape: input.storageShape
      },
      scope,
      sourceOptions
    )
    const deployment = await this.deployVersion(
      {
        projectId: project.id,
        versionId: version.id,
        accessMode: input.accessMode ?? input.audience,
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

    const serialized = filtered.map((project) =>
      serializeProject(project, versionCounts.get(project.id ?? '') ?? 0, deploymentCounts.get(project.id ?? '') ?? 0)
    )
    return serialized
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

    const serializedProject = serializeProject(project, versions.length, deployments.length)

    return {
      project: serializedProject,
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

  async createDeploymentShareLink(input: CreateSitesShareLinkInput, scope: SitesScope) {
    const deployment = await this.resolveDeploymentForShare(input.deploymentId, scope)
    const token = createSitesShareToken()
    const shareLink = await this.shareLinkRepository.save(
      this.shareLinkRepository.create({
        ...this.shareScopeCreate(scope, deployment),
        projectId: normalizeRequiredString(deployment.projectId, 'projectId'),
        versionId: normalizeRequiredString(deployment.versionId, 'versionId'),
        deploymentId: normalizeRequiredString(deployment.id, 'deploymentId'),
        tokenHash: hashSitesShareToken(token),
        label: optionalString(input.label),
        status: 'active',
        expiresAt: normalizeShareLinkExpiresAt(input),
        accessCount: 0
      })
    )

    return {
      shareLink: serializeShareLink(shareLink),
      token,
      previewUrl: buildSitesShareUrl(shareLink.id, token)
    }
  }

  async revokeShareLink(input: RevokeSitesShareLinkInput, scope: SitesScope) {
    const shareLink = await this.resolveShareLink(scope, input.shareLinkId)
    const revoked = await this.shareLinkRepository.save({
      ...shareLink,
      status: 'revoked',
      revokedById: scope.userId ?? shareLink.revokedById,
      revokedAt: new Date(),
      revokedReason: optionalString(input.reason) ?? shareLink.revokedReason
    })
    return serializeShareLink(revoked)
  }

  async listShareLinks(input: ListSitesShareLinksInput, scope: SitesScope) {
    const where = this.scopedWhere(scope, {
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
      ...(input.status ? { status: input.status } : {})
    })
    const shareLinks = await this.shareLinkRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(input.limit ?? 50, 1), 200)
    })
    return shareLinks.map(serializeShareLink)
  }

  async findSharedDeploymentSite(shareLinkId: string, token: string | undefined) {
    const id = normalizeRequiredString(shareLinkId, 'shareLinkId')
    const normalizedToken = normalizeRequiredString(token, SITES_SHARE_TOKEN_PARAM)
    const shareLink = await this.shareLinkRepository.findOne({ where: { id } })
    if (!shareLink || !isActiveShareLink(shareLink) || !safeEqualString(hashSitesShareToken(normalizedToken), shareLink.tokenHash ?? '')) {
      throw new UnauthorizedException('Sites share link is invalid or expired')
    }

    const [deployment, version] = await Promise.all([
      this.deploymentRepository.findOne({ where: { id: shareLink.deploymentId } }),
      this.versionRepository.findOne({ where: { id: shareLink.versionId } })
    ])
    if (
      !deployment ||
      !version?.previewHtml ||
      deployment.id !== shareLink.deploymentId ||
      deployment.versionId !== shareLink.versionId ||
      deployment.projectId !== shareLink.projectId
    ) {
      throw new NotFoundException('Sites shared deployment was not found')
    }

    await this.shareLinkRepository.save({
      ...shareLink,
      accessCount: (shareLink.accessCount ?? 0) + 1,
      lastAccessedAt: new Date()
    })

    return {
      deployment: serializeDeployment(deployment),
      shareLink: serializeShareLink(shareLink),
      html: version.previewHtml
    }
  }

  async archiveProject(scope: SitesScope, projectId: string) {
    const project = await this.resolveProject(scope, projectId)
    return this.projectRepository.save({
      ...project,
      status: 'archived'
    })
  }

  async findDeploymentSite(deploymentIdOrSlug: string) {
    const deploymentRecords = await this.findDeploymentCandidates(deploymentIdOrSlug)
    if (!deploymentRecords.length) {
      throw new NotFoundException('Sites deployment was not found')
    }

    const accessContext = resolveCurrentSitesAccessContext()
    for (const deploymentRecord of deploymentRecords) {
      const [project, version] = await Promise.all([
        this.projectRepository.findOne({ where: { id: deploymentRecord.projectId } }),
        this.versionRepository.findOne({ where: { id: deploymentRecord.versionId } })
      ])
      if (!project || !version?.previewHtml) {
        continue
      }
      if (!canAccessDeployment(project, deploymentRecord, accessContext)) {
        continue
      }
      return {
        deployment: serializeDeployment(deploymentRecord),
        html: version.previewHtml
      }
    }

    if (!accessContext.userId) {
      throw new UnauthorizedException('Login is required to access this Sites deployment')
    }
    throw new ForbiddenException('You do not have access to this Sites deployment')
  }

  private async findDeploymentCandidates(deploymentIdOrSlug: string) {
    const normalized = normalizeRequiredString(deploymentIdOrSlug, 'deploymentIdOrSlug')
    if (UUID_PATTERN.test(normalized)) {
      const deployment = await this.deploymentRepository.findOne({ where: { id: normalized } })
      return deployment ? [deployment] : []
    }

    const projects = await this.projectRepository.find({
      where: { slug: normalized },
      select: ['id']
    })
    const projectIds = projects.map((project) => project.id).filter((id): id is string => !!id)
    if (!projectIds.length) {
      return []
    }

    return this.deploymentRepository.find({
      where: { projectId: In(projectIds) },
      order: { createdAt: 'DESC' }
    })
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

  private async resolveDeploymentForShare(deploymentId: string | undefined, scope: SitesScope) {
    const id = normalizeRequiredString(deploymentId, 'deploymentId')
    const deployment = await this.deploymentRepository.findOne({ where: this.scopedWhere(scope, { id }) })
    if (!deployment) {
      throw new NotFoundException('Sites deployment was not found')
    }
    return deployment
  }

  private async resolveShareLink(scope: SitesScope, shareLinkId: string | undefined) {
    const id = normalizeRequiredString(shareLinkId, 'shareLinkId')
    const shareLink = await this.shareLinkRepository.findOne({ where: this.scopedWhere(scope, { id }) })
    if (!shareLink) {
      throw new NotFoundException('Sites share link was not found')
    }
    return shareLink
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
      tenantId: normalizeRequiredString(scope.tenantId, 'tenantId'),
      organizationId: normalizeRequiredString(scope.organizationId ?? undefined, 'organizationId'),
      assistantId: scope.assistantId,
      ...extra
    }
  }

  async buildDeploymentPreviewEvent(input: { deployment: SitesDeployment; project?: SitesProject; version?: SitesVersion; previewUrl?: string }) {
    const deployment = input.deployment
    if (!deployment) {
      return null
    }
    const [project, version] = await Promise.all([
      input.project ? Promise.resolve(input.project) : this.projectRepository.findOne({ where: { id: deployment.projectId } }),
      input.version ? Promise.resolve(input.version) : this.versionRepository.findOne({ where: { id: deployment.versionId } })
    ])

    if (!project || !version) {
      return buildSitesDeploymentPreviewEvent({
        deployment,
        url: input.previewUrl,
        previewUrl: input.previewUrl,
        displayUrl: input.previewUrl ?? deployment.deploymentUrl
      })
    }

    return buildSitesDeploymentPreviewEvent({
      project,
      version,
      deployment,
      url: input.previewUrl ?? deployment.deploymentUrl,
      previewUrl: input.previewUrl,
      displayUrl: input.previewUrl ?? deployment.deploymentUrl
    })
  }

  private scopeCreate(scope: SitesScope) {
    return {
      tenantId: normalizeRequiredString(scope.tenantId, 'tenantId'),
      organizationId: normalizeRequiredString(scope.organizationId ?? undefined, 'organizationId'),
      createdById: scope.userId ?? undefined,
      assistantId: scope.assistantId ?? undefined,
      conversationId: scope.conversationId ?? undefined
    }
  }

  private shareScopeCreate(scope: SitesScope, deployment: SitesDeployment) {
    return {
      tenantId: normalizeRequiredString(scope.tenantId ?? deployment.tenantId, 'tenantId'),
      organizationId: normalizeRequiredString(scope.organizationId ?? deployment.organizationId, 'organizationId'),
      createdById: scope.userId ?? deployment.createdById,
      assistantId: scope.assistantId ?? deployment.assistantId,
      conversationId: scope.conversationId ?? deployment.conversationId
    }
  }
}

type SitesAccessContext = {
  user: IUser | null
  userId: string | null
  tenantId: string | null
  organizationId: string | null
  organizationIds: Set<string>
  audienceKeys: Set<string>
  canCrossOrganizations: boolean
  isAdmin: boolean
}

function resolveCurrentSitesAccessContext(): SitesAccessContext {
  const user = RequestContext.currentUser() ?? null
  const userId = optionalString(RequestContext.currentUserId()) ?? optionalString(user?.id) ?? null
  const tenantId = optionalString(RequestContext.currentTenantId()) ?? optionalString(user?.tenantId) ?? null
  const organizationId = optionalString(RequestContext.getOrganizationId()) ?? null
  const organizationIds = collectOrganizationIds(user, organizationId)
  const audienceKeys = collectAudienceKeys(user, organizationIds)
  const canCrossOrganizations =
    safeHasRoles([RolesEnum.SUPER_ADMIN]) ||
    safeHasAnyPermission([PermissionsEnum.SUPER_ADMIN_EDIT, PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.ALL_ORG_EDIT])
  const isAdmin =
    canCrossOrganizations ||
    safeHasRoles([RolesEnum.ADMIN]) ||
    safeHasAnyPermission([
      PermissionsEnum.ORG_USERS_VIEW,
      PermissionsEnum.ORG_USERS_EDIT
    ])

  return {
    user,
    userId,
    tenantId,
    organizationId,
    organizationIds,
    audienceKeys,
    canCrossOrganizations,
    isAdmin
  }
}

function canAccessDeployment(project: SitesProject, deployment: SitesDeployment, context: SitesAccessContext) {
  if (!context.userId) {
    return false
  }

  const sameTenant = belongsToSameTenant(project, deployment, context)
  if (!sameTenant) {
    return false
  }

  const sameOrganization = belongsToSameOrganization(project, deployment, context)
  const owner = isDeploymentOwner(project, deployment, context)
  const admin = context.isAdmin && sameOrganization
  const accessMode = deployment.accessMode ?? project.audience ?? 'admins_only'

  if (accessMode === 'workspace_all') {
    return sameOrganization
  }

  if (accessMode === 'custom') {
    return owner || admin || (sameOrganization && matchesCustomAudience(project, deployment, context))
  }

  return owner || admin
}

function belongsToSameTenant(project: SitesProject, deployment: SitesDeployment, context: SitesAccessContext) {
  const tenantId = optionalString(deployment.tenantId) ?? optionalString(project.tenantId)
  return !tenantId || context.tenantId === tenantId
}

function belongsToSameOrganization(project: SitesProject, deployment: SitesDeployment, context: SitesAccessContext) {
  const organizationId = optionalString(deployment.organizationId) ?? optionalString(project.organizationId)
  if (!organizationId) {
    return true
  }
  return context.organizationId === organizationId || context.organizationIds.has(organizationId) || context.canCrossOrganizations
}

function isDeploymentOwner(project: SitesProject, deployment: SitesDeployment, context: SitesAccessContext) {
  return !!context.userId && [project.createdById, deployment.createdById].some((value) => optionalString(value) === context.userId)
}

function matchesCustomAudience(project: SitesProject, deployment: SitesDeployment, context: SitesAccessContext) {
  const audience = [...(project.customAudience ?? []), ...(deployment.customAudience ?? [])]
  if (!audience.length) {
    return false
  }
  return audience.some((item) => context.audienceKeys.has(normalizeAudienceKey(item)))
}

function collectOrganizationIds(user: IUser | null, currentOrganizationId: string | null) {
  const organizationIds = new Set<string>()
  if (currentOrganizationId) {
    organizationIds.add(currentOrganizationId)
  }

  const organizations = Array.isArray(user?.organizations) ? user.organizations : []
  for (const membership of organizations) {
    if (membership && membership.isActive !== false && membership.organizationId) {
      organizationIds.add(membership.organizationId)
    }
  }
  return organizationIds
}

function collectAudienceKeys(user: IUser | null, organizationIds: Set<string>) {
  const keys = new Set<string>()
  addAudienceKey(keys, user?.id)
  addAudienceKey(keys, user?.email)
  addAudienceKey(keys, user?.username)
  addAudienceKey(keys, user?.employeeId)
  addAudienceKey(keys, user?.roleId)

  if (user?.id) addAudienceKey(keys, `user:${user.id}`)
  if (user?.email) addAudienceKey(keys, `email:${user.email}`)
  if (user?.username) addAudienceKey(keys, `username:${user.username}`)
  if (user?.employeeId) addAudienceKey(keys, `employee:${user.employeeId}`)
  if (user?.roleId) addAudienceKey(keys, `role:${user.roleId}`)
  if (user?.role?.name) {
    addAudienceKey(keys, user.role.name)
    addAudienceKey(keys, `role:${user.role.name}`)
  }

  for (const organizationId of organizationIds) {
    addAudienceKey(keys, organizationId)
    addAudienceKey(keys, `org:${organizationId}`)
    addAudienceKey(keys, `organization:${organizationId}`)
  }

  for (const group of readUserGroups(user)) {
    if (typeof group === 'string') {
      addAudienceKey(keys, group)
      addAudienceKey(keys, `group:${group}`)
      continue
    }
    if (group && typeof group === 'object') {
      const record = group as Record<string, unknown>
      const id = optionalString(record['id']) ?? optionalString(record['groupId']) ?? optionalString(record['userGroupId'])
      const name = optionalString(record['name'])
      addAudienceKey(keys, id)
      addAudienceKey(keys, name)
      if (id) addAudienceKey(keys, `group:${id}`)
      if (name) addAudienceKey(keys, `group:${name}`)
    }
  }

  return keys
}

function readUserGroups(user: IUser | null): unknown[] {
  const record = user as Record<string, unknown> | null
  const values = [record?.['groups'], record?.['userGroups'], record?.['groupIds'], record?.['userGroupIds']]
  return values.flatMap((value) => (Array.isArray(value) ? value : []))
}

function addAudienceKey(keys: Set<string>, value: unknown) {
  const key = normalizeAudienceKey(value)
  if (key) {
    keys.add(key)
  }
}

function normalizeAudienceKey(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : ''
}

function safeHasRoles(roles: RolesEnum[]) {
  try {
    return RequestContext.hasRoles(roles)
  } catch {
    return false
  }
}

function safeHasAnyPermission(permissions: PermissionsEnum[]) {
  try {
    return RequestContext.hasAnyPermission(permissions)
  } catch {
    return false
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
  previewUrl?: string
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
  const previewUrl = optionalString(input.previewUrl)
  const url =
    previewUrl ??
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
    displayUrl: optionalString(input.displayUrl) ?? previewUrl ?? url,
    ...(previewUrl ? { previewUrl } : {}),
    ...(projectId ? { projectId } : {}),
    ...(versionId ? { versionId } : {}),
    ...(deploymentId ? { deploymentId } : {}),
    ...(slug ? { slug } : {}),
    ...(versionNumber ? { versionNumber } : {}),
    ...(status ? { status: status as WorkbenchBrowserPreviewEvent['status'] } : {}),
    ...(accessMode ? { accessMode: accessMode as WorkbenchBrowserPreviewEvent['accessMode'] } : {})
  }
}

function buildSitesShareUrl(shareLinkId: string | undefined, token: string) {
  const url = new URL(`${getPublicBaseUrl()}/share/${encodeURIComponent(normalizeRequiredString(shareLinkId, 'shareLinkId'))}`)
  url.searchParams.set(SITES_SHARE_TOKEN_PARAM, token)
  return url.toString()
}

function createSitesShareToken() {
  return randomBytes(32).toString('base64url')
}

function hashSitesShareToken(token: string) {
  return digest(normalizeRequiredString(token, SITES_SHARE_TOKEN_PARAM))
}

function isActiveShareLink(shareLink: SitesShareLink) {
  if (shareLink.status !== 'active') {
    return false
  }
  if (!shareLink.expiresAt) {
    return true
  }
  const expiresAt = shareLink.expiresAt instanceof Date ? shareLink.expiresAt : new Date(shareLink.expiresAt)
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now()
}

function safeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function getPublicBaseUrl() {
  return buildSitesPublicBaseUrl(process.env['API_BASE_URL'] ?? DEFAULT_BACKEND_BASE_URL)
}

function buildSitesPublicBaseUrl(backendBaseUrl: string) {
  const raw = normalizeRequiredString(backendBaseUrl, 'API_BASE_URL')
  const parsed = new URL(raw.startsWith('//') ? `http:${raw}` : raw)
  const pathname = parsed.pathname.replace(/\/+$/, '')
  parsed.pathname = `${pathname.endsWith('/api') ? pathname.slice(0, -4) : pathname}/api/xpert-sites`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/+$/, '')
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

function normalizeShareLinkExpiresAt(input: Pick<CreateSitesShareLinkInput, 'expiresAt' | 'noExpiry'>) {
  if (input.noExpiry || input.expiresAt === null || input.expiresAt === undefined) {
    return null
  }
  const expiresAt = input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt)
  if (Number.isNaN(expiresAt.getTime())) {
    throw new BadRequestException('expiresAt must be a valid date')
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new BadRequestException('expiresAt must be in the future')
  }
  return expiresAt
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

async function readSandboxSourceFiles(sourcePathInput: string | undefined, sourceOptions?: SitesSourceReadOptions) {
  const backend = sourceOptions?.sandboxBackend
  if (!backend) {
    throw new BadRequestException(
      'Sandbox backend is required to save a Sites version. Create source files with SandboxFile tools, then call Sites with sourcePath.'
    )
  }

  const workingDirectory = sourceOptions?.workingDirectory ?? backend.workingDirectory
  const sourcePath = resolveSandboxSourcePath(sourcePathInput, workingDirectory)
  const entries = await collectSandboxSourceEntries(backend, sourcePath)
  const files = selectSandboxSourceFiles(entries, sourcePath, workingDirectory)
  const downloads = await Promise.resolve(backend.downloadFiles(files.map((file) => file.absolutePath)))
  const downloadsByPath = new Map(downloads.map((download) => [normalizeSandboxPath(download.path), download]))
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let totalBytes = 0

  const sourceFiles = files.map((file) => {
    const download = downloadsByPath.get(normalizeSandboxPath(file.absolutePath))
    if (!download || download.error || download.content == null) {
      throw new BadRequestException(`Unable to read Sites source file "${file.relativePath}": ${download?.error ?? 'missing_content'}`)
    }
    const content = decodeSourceContent(download.content, decoder, file.relativePath)
    const size = Buffer.byteLength(content, 'utf8')
    if (size > SITE_SOURCE_MAX_FILE_BYTES) {
      throw new BadRequestException(`Sites source file "${file.relativePath}" exceeds the ${SITE_SOURCE_MAX_FILE_BYTES} byte limit`)
    }
    totalBytes += size
    if (totalBytes > SITE_SOURCE_MAX_TOTAL_BYTES) {
      throw new BadRequestException(`Sites source directory exceeds the ${SITE_SOURCE_MAX_TOTAL_BYTES} byte total limit`)
    }
    return {
      path: file.relativePath,
      content,
      language: inferSourceLanguage(file.relativePath),
      role: inferSourceRole(file.relativePath)
    } satisfies SitesSourceFile
  })

  return {
    sourcePath,
    files: sourceFiles
  }
}

async function collectSandboxSourceEntries(backend: SitesSourceReadOptions['sandboxBackend'], sourcePath: string) {
  if (!backend) {
    return []
  }

  const batches = await Promise.all([
    Promise.resolve(backend.globInfo('*', sourcePath)),
    Promise.resolve(backend.globInfo('**/*', sourcePath))
  ])
  const entriesByPath = new Map<string, SitesSandboxFileInfo>()
  for (const entry of batches.flat()) {
    const key = `${normalizeSandboxPath(entry.path)}:${entry.is_dir ? 'dir' : 'file'}`
    if (!entriesByPath.has(key)) {
      entriesByPath.set(key, entry)
    }
  }
  return [...entriesByPath.values()]
}

function selectSandboxSourceFiles(entries: SitesSandboxFileInfo[], sourcePath: string, workingDirectory?: string) {
  const selected = entries
    .filter((entry) => !entry.is_dir)
    .map((entry): SandboxSourceCandidate | undefined => resolveSandboxSourceCandidate(entry, sourcePath, workingDirectory))
    .filter((entry): entry is SandboxSourceCandidate => Boolean(entry))
    .filter((entry) => isSupportedSourceFile(entry.relativePath))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  if (!selected.length) {
    throw new BadRequestException(
      'Sites sourcePath does not contain supported static source files. Create a root index.html plus optional .css, .js, .mjs, .json, .svg, .txt, .md, or .webmanifest files under sourcePath.'
    )
  }
  if (selected.length > SITE_SOURCE_MAX_FILES) {
    throw new BadRequestException(`Sites sourcePath contains ${selected.length} supported files; the limit is ${SITE_SOURCE_MAX_FILES}`)
  }
  const oversized = selected.find((entry) => typeof entry.size === 'number' && entry.size > SITE_SOURCE_MAX_FILE_BYTES)
  if (oversized) {
    throw new BadRequestException(`Sites source file "${oversized.relativePath}" exceeds the ${SITE_SOURCE_MAX_FILE_BYTES} byte limit`)
  }
  if (!selected.some((entry) => entry.relativePath === 'index.html')) {
    throw new BadRequestException('Sites sourcePath must contain a root index.html file')
  }
  return selected
}

function resolveSandboxSourceCandidate(
  entry: SitesSandboxFileInfo,
  sourcePath: string,
  workingDirectory?: string
): SandboxSourceCandidate | undefined {
  const normalizedPath = normalizeSandboxPath(entry.path)
  let absolutePath: string
  let relativePath: string | undefined

  if (posix.isAbsolute(normalizedPath)) {
    absolutePath = normalizedPath
    relativePath = relativeSandboxPath(absolutePath, sourcePath)
  } else {
    const workingRoot = optionalString(workingDirectory)
    if (workingRoot) {
      const resolvedFromWorkingRoot = posix.resolve(normalizeSandboxPath(workingRoot), normalizedPath)
      const relativeFromWorkingRoot = relativeSandboxPath(resolvedFromWorkingRoot, sourcePath)
      if (relativeFromWorkingRoot) {
        absolutePath = resolvedFromWorkingRoot
        relativePath = relativeFromWorkingRoot
        return typeof entry.size === 'number' ? { absolutePath, relativePath, size: entry.size } : { absolutePath, relativePath }
      }
    }
    try {
      relativePath = normalizeArtifactPath(normalizedPath)
      absolutePath = posix.join(sourcePath, relativePath)
    } catch {
      return undefined
    }
  }

  if (!relativePath) {
    return undefined
  }

  return typeof entry.size === 'number' ? { absolutePath, relativePath, size: entry.size } : { absolutePath, relativePath }
}

function resolveSandboxSourcePath(sourcePathInput: string | undefined, workingDirectory?: string) {
  const sourcePath = optionalString(sourcePathInput)
  if (!sourcePath) {
    throw new BadRequestException('sourcePath is required to save a Sites version')
  }

  const normalizedSourcePath = normalizeSandboxPath(sourcePath)
  if (posix.isAbsolute(normalizedSourcePath)) {
    return posix.normalize(normalizedSourcePath)
  }

  const normalizedWorkingDirectory = optionalString(workingDirectory)
  if (!normalizedWorkingDirectory) {
    throw new BadRequestException('Relative sourcePath requires a sandbox working directory')
  }
  const workingRoot = posix.normalize(normalizeSandboxPath(normalizedWorkingDirectory))
  const resolved = posix.resolve(workingRoot, normalizedSourcePath)
  const relativeToWorkingRoot = posix.relative(workingRoot, resolved)
  if (relativeToWorkingRoot === '..' || relativeToWorkingRoot.startsWith('../')) {
    throw new BadRequestException('sourcePath must stay inside the sandbox working directory')
  }
  return resolved
}

function relativeSandboxPath(filePath: string, sourcePath: string) {
  const relativePath = posix.relative(normalizeSandboxPath(sourcePath), normalizeSandboxPath(filePath))
  if (!relativePath || relativePath === '.' || relativePath === '..' || relativePath.startsWith('../')) {
    return undefined
  }
  return normalizeArtifactPath(relativePath)
}

function normalizeSandboxPath(value: string) {
  return posix.normalize(value.replace(/\\/g, '/'))
}

function normalizeArtifactPath(value: string) {
  const normalized = posix.normalize(value.replace(/\\/g, '/').replace(/^\.\/+/, ''))
  if (!normalized || normalized === '.' || posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
    throw new BadRequestException(`Invalid Sites source file path "${value}"`)
  }
  return normalized
}

function isSupportedSourceFile(relativePath: string) {
  const segments = relativePath.split('/')
  if (segments.some((segment) => SITE_SOURCE_EXCLUDED_SEGMENTS.has(segment))) {
    return false
  }
  return SITE_SOURCE_ALLOWED_EXTENSIONS.has(posix.extname(relativePath).toLowerCase())
}

function decodeSourceContent(content: Uint8Array | ArrayBuffer | string, decoder: TextDecoder, relativePath: string) {
  if (typeof content === 'string') {
    assertTextSource(content, relativePath)
    return content
  }
  try {
    const text = decoder.decode(content instanceof Uint8Array ? content : new Uint8Array(content))
    assertTextSource(text, relativePath)
    return text
  } catch {
    throw new BadRequestException(`Sites source file "${relativePath}" must be valid UTF-8 text`)
  }
}

function assertTextSource(content: string, relativePath: string) {
  if (content.includes('\u0000')) {
    throw new BadRequestException(`Sites source file "${relativePath}" appears to be binary; only text static assets are supported`)
  }
}

function inferSourceLanguage(path: string) {
  const extension = posix.extname(path).toLowerCase()
  if (extension === '.html') return 'html'
  if (extension === '.css') return 'css'
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return 'javascript'
  if (extension === '.json' || extension === '.webmanifest') return 'json'
  if (extension === '.svg') return 'svg'
  if (extension === '.md') return 'markdown'
  return 'text'
}

function inferSourceRole(path: string): SitesSourceFile['role'] {
  const extension = posix.extname(path).toLowerCase()
  if (path === 'index.html') return 'entry'
  if (extension === '.css') return 'style'
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return 'script'
  if (extension === '.json' || extension === '.webmanifest') return 'config'
  return 'asset'
}

function sanitizeSourceFiles(files: SitesSourceFile[]) {
  const normalized = files
    .map((file) => ({
      path: normalizeArtifactPath(optionalString(file.path) ?? 'index.html'),
      content: typeof file.content === 'string' ? file.content : '',
      language: optionalString(file.language),
      role: file.role
    }))
    .filter((file) => file.content.trim())
  if (!normalized.length) {
    throw new BadRequestException('At least one source file with content is required')
  }
  if (!normalized.some((file) => file.path === 'index.html')) {
    throw new BadRequestException('Sites sourcePath must contain a root index.html file')
  }
  return normalized
}

function buildPreviewHtml(files: SitesSourceFile[], project: SitesProject, input: SaveSitesVersionInput) {
  const index = files.find((file) => file.path === 'index.html') ?? files[0]
  let html = index.content
  const cssFiles = files.filter((file) => file.path.endsWith('.css'))
  const jsFiles = files.filter((file) => ['.js', '.mjs', '.cjs'].some((extension) => file.path.endsWith(extension)))
  for (const file of cssFiles) {
    html = html.replace(
      new RegExp(`<link\\b(?=[^>]*\\bhref=["']${staticFileReferencePattern(file.path)}["'])[^>]*>`, 'g'),
      `<style>\n${file.content}\n</style>`
    )
  }
  for (const file of jsFiles) {
    html = html.replace(
      new RegExp(`<script\\b(?=[^>]*\\bsrc=["']${staticFileReferencePattern(file.path)}["'])[^>]*>\\s*</script>`, 'g'),
      `<script>\n${file.content}\n</script>`
    )
  }
  if (!html.includes('</body>')) {
    html += `\n<!-- ${escapeHtml(input.prompt ?? project.name ?? 'Sites deployment')} -->`
  }
  return html
}

function staticFileReferencePattern(path: string) {
  return `(?:\\./|/)?${escapeRegExp(path)}(?:[?#][^"']*)?`
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
    sourcePath: project.sourcePath,
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

function serializeShareLink(shareLink: SitesShareLink): SerializedSitesShareLink {
  return {
    id: shareLink.id,
    projectId: shareLink.projectId,
    versionId: shareLink.versionId,
    deploymentId: shareLink.deploymentId,
    label: shareLink.label,
    status: shareLink.status,
    expiresAt: shareLink.expiresAt,
    accessCount: shareLink.accessCount,
    lastAccessedAt: shareLink.lastAccessedAt,
    revokedById: shareLink.revokedById,
    revokedAt: shareLink.revokedAt,
    revokedReason: shareLink.revokedReason,
    updatedAt: shareLink.updatedAt,
    createdAt: shareLink.createdAt
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
