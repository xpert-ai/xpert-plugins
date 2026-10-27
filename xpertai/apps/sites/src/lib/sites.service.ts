import { mutateSiteCatalog, siteCatalogRevision } from './sites-catalog-lifecycle.js'
import { readProjectSiteSource, initializeProjectSiteSource, stageProjectSiteRestore } from './sites-project-source.js'
import { buildSitesDeploymentPreviewEvent, buildArtifactLinkAccess, artifactLinkPresentation, assertPublicLinkConfirmed, normalizeRequiredString, optionalString, slugify, normalizeStringArray, normalizeEnvironmentKey, digest, buildHostingConfig, summarizeProjects } from './sites-utils.js'
export { buildSitesDeploymentPreviewEvent } from './sites-utils.js'
import { assertSitesProject, sitesWhere } from './sites-project-access.js'
import { serializeProject, serializeVersion, serializeDeployment, serializeEnvironmentValue } from './sites-serialization.js'
import { buildPreviewHtml } from './sites-bundle.js'
import { encryptEnvironment, SITES_CONFIG } from './sites-secrets.js'
import type { SitesPluginConfig } from './sites.config.js'
import { readSandboxSourceFiles, sanitizeSourceFiles } from './sites-source.js'
import { createHash, randomUUID } from 'crypto'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, ILike } from 'typeorm'
import {
  ArtifactsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import type {
  ArtifactLinkAccessInput,
  ArtifactsApi,
  RuntimeCapabilityRegistry,
  WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { SitesDeployment, SitesEnvironmentVariable, SitesProject, SitesVersion } from './entities/index.js'
import { SITES_PLUGIN_NAME, WORKBENCH_BROWSER_PREVIEW_EVENT_TYPE } from './constants.js'
import type {
  CreateSitesProjectInput,
  DeploySitesVersionInput,
  PublishSitesArtifactLinkInput,
  RevokeSitesArtifactLinkInput,
  SaveSitesVersionInput,
  SerializedSitesProject,
  SitesAccessMode,
  SitesEnvironmentValueInput,
  SitesHostingConfig,
  SitesScope,
  SitesSourceReadOptions,
  SitesStorageShape,
  WorkbenchBrowserPreviewEvent
} from './types.js'

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
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistry,
    @Optional() @Inject(SITES_CONFIG) private readonly pluginConfig?: SitesPluginConfig
  ) {}

  async createProject(input: CreateSitesProjectInput, scope: SitesScope) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'write')
    const name = normalizeRequiredString(input.name, 'name')
    const slug = await this.allocateSlug(scope, input.slug ?? name)
    const storageShape = input.storageShape ?? 'static'
    if (storageShape !== 'static' || input.d1Binding || input.r2Binding || (input.authMode && input.authMode !== 'none')) throw new BadRequestException('Only static hosting is supported')
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
        audience: input.audience ?? this.pluginConfig?.defaultAccessMode ?? 'admins_only',
        customAudience: normalizeStringArray(input.customAudience),
        storageShape,
        sourcePath: optionalString(input.sourcePath),
        hostingConfig
      })
    )

    const projectId = project.id ?? randomUUID()
    if (scope.hostProjectId) {
      project.sourcePath = await initializeProjectSiteSource(this.runtimeCapabilities, scope, projectId)
      await this.projectRepository.save(project)
    }
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
    await assertSitesProject(this.runtimeCapabilities, scope, 'write')
    const project = await this.resolveProjectForVersion(input, scope)
    if (input.sourceCommit && !/^[a-f0-9]{40,64}$/i.test(input.sourceCommit)) throw new BadRequestException('sourceCommit must be a verified Git commit hash')

    return this.projectRepository.manager.transaction(async manager => {
    const projects = manager.getRepository(SitesProject), versions = manager.getRepository(SitesVersion)
    const locked = await projects.findOne({ where: this.scopedWhere(scope, { id: project.id }), lock: { mode: 'pessimistic_write' } })
    if (!locked) throw new NotFoundException('Sites project not found')
    if (locked.status === 'archived') throw new BadRequestException('SITES_ARCHIVED')
    const latest = await versions.findOne({ where: this.scopedWhere(scope, { projectId: project.id }), order: { versionNumber: 'DESC' } })
    if (scope.hostProjectId && (input.expectedVersionId === undefined || (latest?.id ?? null) !== input.expectedVersionId)) throw new ConflictException('SITES_VERSION_CONFLICT')
    const source = scope.hostProjectId ? await readProjectSiteSource(this.runtimeCapabilities, scope, project.id!, locked.sourcePath) : await readSandboxSourceFiles(input.sourcePath ?? project.sourcePath, sourceOptions)
    const files = sanitizeSourceFiles(source.files)
    const previewHtml = await buildPreviewHtml(files)
    const artifactDigest = digest(JSON.stringify({ files, previewHtml }))
    const status = previewHtml.trim() ? 'saved' : 'build_failed'

    const versionNumber = (latest?.versionNumber ?? 0) + 1
    const version = await versions.save(
      versions.create({
        ...this.scopeCreate(scope),
        projectId: project.id,
        versionNumber,
        title: optionalString(input.title) ?? `Version ${versionNumber}`,
        description: optionalString(input.description),
        prompt: optionalString(input.prompt),
        sourceCommit: optionalString(input.sourceCommit),
        storageShape: input.storageShape ?? project.storageShape ?? 'static',
        status,
        files,
        previewHtml,
        artifactDigest,
        buildLogs:
          status === 'saved'
            ? `Built ${files.length} file(s) into a self-contained static HTML artifact.`
            : 'Build did not produce HTML.'
      })
    )

    await projects.save({
      ...locked,
      sourcePath: source.sourcePath,
      status: status === 'saved' ? 'version_saved' : project.status
    })

    return version
    })
  }

  async deployVersion(input: DeploySitesVersionInput, scope: SitesScope) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'manage')
    if (!input.projectId && !input.versionId) {
      throw new BadRequestException('projectId or versionId is required')
    }
    const version = input.versionId
      ? await this.resolveVersion(scope, input.versionId)
      : await this.findLatestVersion(scope, input.projectId)
    const resolved = await this.resolveProject(scope, input.projectId ?? version.projectId)
    return this.withActiveProject(scope, resolved.id!, async (project, projects) => {
    if (version.projectId !== project.id) {
      throw new BadRequestException('Version does not belong to the selected Sites project')
    }
    if (version.status !== 'saved') {
      throw new BadRequestException('Only saved versions can be deployed')
    }

    const envFingerprint = await this.computeEnvironmentFingerprint(scope, project.id)
    const accessMode = input.accessMode ?? project.audience ?? 'admins_only'
    assertPublicLinkConfirmed(accessMode, input.userConfirmedPublicLink)
    const previousDeployment = project.currentDeploymentId
      ? await this.deploymentRepository.findOne({
          where: this.scopedWhere(scope, { id: project.currentDeploymentId })
        })
      : null
    let deployment = await this.deploymentRepository.save(
      this.deploymentRepository.create({
        ...this.scopeCreate(scope),
        projectId: project.id,
        versionId: version.id,
        deploymentUrl: '',
        status: 'pending',
        accessMode,
        customAudience: normalizeStringArray(input.customAudience) ?? project.customAudience,
        environmentFingerprint: envFingerprint,
      })
    )
    try {
    deployment = await this.attachPlatformArtifactToDeployment(
      project,
      version,
      deployment,
      scope,
      previousDeployment,
      input.userConfirmedPublicLink
    )

    await projects.save({
      ...project,
      status: 'deployed',
      audience: accessMode,
      customAudience: deployment.customAudience,
      currentDeploymentId: deployment.id,
      currentDeploymentUrl: deployment.deploymentUrl
    })

    deployment = await this.deploymentRepository.save({ ...deployment, status: 'deployed', deployedAt: new Date() })
    return deployment
    } catch (error) {
      await this.deploymentRepository.save({ ...deployment, status: 'failed', errorMessage: 'Deployment failed. Check the runtime and deployment history before retrying.' })
      throw error
    }
    })
  }

  async createAndDeploy(
    input: CreateSitesProjectInput & SaveSitesVersionInput & DeploySitesVersionInput,
    scope: SitesScope,
    sourceOptions?: SitesSourceReadOptions
  ) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'manage')
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
        expectedVersionId: input.expectedVersionId,
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
        customAudience: input.customAudience,
        userConfirmedPublicLink: input.userConfirmedPublicLink
      },
      scope
    )
    return { project, version, deployment }
  }

  async listProjects(scope: SitesScope, input: { search?: string; limit?: number } = {}) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'read')
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
    await assertSitesProject(this.runtimeCapabilities, scope, 'read')
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

  async getViewData(scope: SitesScope, input: { projectId?: string; search?: string; limit?: number; page?: number; versionId?: string; preview?: boolean } = {}) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'read')
    if (input.preview && input.projectId) {
      const project = await this.resolveProject(scope, input.projectId)
      const version = input.versionId ? await this.resolveVersion(scope, input.versionId) : await this.versionRepository.findOne({ where: this.scopedWhere(scope, { projectId: project.id }), order: { versionNumber: 'DESC' } })
      if (version && version.projectId !== project.id) throw new BadRequestException('Version does not belong to project')
      return { items: [], meta: { previewHtml: version?.previewHtml ?? '', versionId: version?.id } }
    }
    const page = Math.max(1, input.page ?? 1), pageSize = Math.min(30, Math.max(1, input.limit ?? 6))
    const term = input.search?.trim()
    const where = term ? ['name', 'slug'].map(key => this.scopedWhere(scope, { [key]: ILike('%' + term + '%') })) : this.scopedWhere(scope)
    const [rows, total] = await this.projectRepository.findAndCount({ where, order: { updatedAt: 'DESC' }, skip: (page - 1) * pageSize, take: pageSize })
    const items = await Promise.all(rows.map(async project => {
      const [latest, deployed] = await Promise.all([
        this.versionRepository.findOne({ where: this.scopedWhere(scope, { projectId: project.id }), order: { versionNumber: 'DESC' } }),
        project.currentDeploymentId ? this.deploymentRepository.findOne({ where: this.scopedWhere(scope, { id: project.currentDeploymentId }) }) : null
      ])
      return { ...serializeProject(project), latestVersionId: latest?.id, latestVersionNumber: latest?.versionNumber, deployedVersionId: deployed?.versionId }
    }))
    const detail = input.projectId ? await this.inspectProject(scope, input.projectId) : null
    return { items, total, page, pageSize, meta: detail ?? { project: null, versions: [], deployments: [], environmentValues: [] } }
  }

  async restoreVersion(scope: SitesScope, projectId: string, versionId: string, expectedVersionId?: string | null) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'write')
    const source = await this.resolveVersion(scope, versionId)
    if (source.projectId !== projectId) throw new BadRequestException('Version does not belong to project')
    return this.projectRepository.manager.transaction(async manager => {
      const projects = manager.getRepository(SitesProject), versions = manager.getRepository(SitesVersion)
      const project = await projects.findOne({ where: this.scopedWhere(scope, { id: projectId }), lock: { mode: 'pessimistic_write' } })
      if (!project) throw new NotFoundException('Sites project not found')
      const latest = await versions.findOne({ where: this.scopedWhere(scope, { projectId }), order: { versionNumber: 'DESC' } })
      if (project.status === 'archived') throw new BadRequestException('SITES_ARCHIVED')
      if (scope.hostProjectId && (expectedVersionId === undefined || (latest?.id ?? null) !== expectedVersionId)) throw new ConflictException('SITES_VERSION_CONFLICT')
      const sourcePath = scope.hostProjectId
        ? await stageProjectSiteRestore(this.runtimeCapabilities, scope, projectId, sanitizeSourceFiles(source.files))
        : project.sourcePath
      const copy = await versions.save(versions.create({ ...this.scopeCreate(scope), projectId, versionNumber: (latest?.versionNumber ?? 0) + 1, title: 'Restore v' + source.versionNumber, status: 'saved', files: source.files, previewHtml: source.previewHtml, artifactDigest: source.artifactDigest, storageShape: source.storageShape, buildLogs: 'Restored saved source; live deployment unchanged.' }))
      await projects.save({ ...project, sourcePath, status: 'version_saved' })
      return serializeVersion(copy)
    })
  }

  async setAccess(
    scope: SitesScope,
    projectId: string,
    accessMode: SitesAccessMode,
    customAudience?: string[],
    userConfirmedPublicLink?: boolean
  ) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'manage')
    assertPublicLinkConfirmed(accessMode, userConfirmedPublicLink)
    return this.withActiveProject(scope, projectId, async (project, projects) => {
    const normalizedAudience = normalizeStringArray(customAudience)
    let updatedDeployment: SitesDeployment | null = null
    if (project.currentDeploymentId) {
      const deployment = await this.deploymentRepository.findOne({
        where: this.scopedWhere(scope, { id: project.currentDeploymentId })
      })
      if (deployment) {
        updatedDeployment = await this.updateDeploymentArtifactLink(
          deployment,
          accessMode,
          normalizedAudience ?? deployment.customAudience,
          userConfirmedPublicLink
        )
        updatedDeployment = await this.deploymentRepository.save({
          ...updatedDeployment,
          accessMode,
          customAudience: normalizedAudience ?? deployment.customAudience
        })
      }
    }
    return projects.save({
      ...project,
      audience: accessMode,
      customAudience: normalizedAudience ?? project.customAudience,
      currentDeploymentUrl: updatedDeployment?.deploymentUrl ?? project.currentDeploymentUrl
    })
    })
  }

  async upsertEnvironmentValue(scope: SitesScope, input: SitesEnvironmentValueInput) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'manage')
    const project = await this.resolveProject(scope, input.projectId)
    const key = normalizeEnvironmentKey(input.key)
    const existing = await this.environmentRepository.findOne({
      where: this.scopedWhere(scope, {
        projectId: project.id,
        key
      })
    })
    const secret = input.secret ?? existing?.secret ?? false
    if (existing?.secret && !secret && input.value === undefined) throw new BadRequestException('A new value is required to change a secret into a non-secret')
    const value = input.value ?? existing?.value ?? ''
    const protectedValue = secret && (input.value !== undefined || existing?.valueEncoding !== 'aes-256-gcm-v1')
      ? encryptEnvironment(value, this.pluginConfig?.environmentEncryptionKey, scope, project.id!, key) : value
    const saved = await this.environmentRepository.save(
      this.environmentRepository.create({
        ...existing,
        ...this.scopeCreate(scope),
        projectId: project.id,
        key,
        value: protectedValue,
        secret,
        valueEncoding: secret ? 'aes-256-gcm-v1' : 'plain',
        description: optionalString(input.description) ?? existing?.description
      })
    )
    return serializeEnvironmentValue(saved)
  }

  async removeEnvironmentValue(scope: SitesScope, projectId: string, key: string) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'manage')
    const project = await this.resolveProject(scope, projectId)
    const normalizedKey = normalizeEnvironmentKey(key)
    await this.environmentRepository.delete(this.scopedWhere(scope, { projectId: project.id, key: normalizedKey }))
    return { projectId: project.id, key: normalizedKey, removed: true }
  }

  async publishArtifactLink(input: PublishSitesArtifactLinkInput, scope: SitesScope) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'manage')
    assertPublicLinkConfirmed('public_link', input.userConfirmedPublicLink)
    const deployment = await this.resolveDeployment(scope, input.deploymentId)
    return this.withActiveProject(scope, deployment.projectId!, async (project, projects) => {
    const updated = await this.updateDeploymentArtifactLink(
      deployment,
      'public_link',
      deployment.customAudience,
      true,
      input.expiresAt
    )
    await this.deploymentRepository.save({ ...updated, accessMode: 'public_link' })
    await projects.save({
      ...project,
      audience: 'public_link',
      currentDeploymentUrl: updated.deploymentUrl
    })
    return serializeDeployment({ ...updated, accessMode: 'public_link' })
    })
  }

  async revokeArtifactLink(input: RevokeSitesArtifactLinkInput, scope: SitesScope) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'manage')
    const deployment = await this.resolveDeployment(scope, input.deploymentId)
    const artifactLinkId = normalizeRequiredString(deployment.artifactLinkId ?? undefined, 'artifactLinkId')
    const revoked = await this.requireArtifacts().revokeArtifactLink(artifactLinkId)
    const savedDeployment = await this.deploymentRepository.save({
      ...deployment,
      artifactLinkId: null,
      deploymentUrl: '',
      accessMode: 'admins_only'
    })
    const project = await this.resolveProject(scope, deployment.projectId)
    if (project.currentDeploymentId === deployment.id) {
      await this.projectRepository.save({
        ...project,
        audience: 'admins_only',
        currentDeploymentUrl: null
      })
    }
    return {
      deployment: serializeDeployment(savedDeployment),
      artifactLink: revoked
    }
  }

  async archiveProject(scope: SitesScope, projectId: string) {
    await assertSitesProject(this.runtimeCapabilities, scope, 'manage')
    const project = await this.resolveProject(scope, projectId)
    if (scope.hostProjectId && this.runtimeCapabilities) {
      const source = await readProjectSiteSource(this.runtimeCapabilities, scope, projectId, project.sourcePath)
      await mutateSiteCatalog(this.runtimeCapabilities, this.projectRepository, scope, projectId, siteCatalogRevision(project, source), { action: 'trash' })
      return this.resolveProject(scope, projectId)
    }
    if (project.currentDeploymentId) {
      const deployment = await this.deploymentRepository.findOne({
        where: this.scopedWhere(scope, { id: project.currentDeploymentId })
      })
      if (deployment?.artifactId) {
        await this.requireArtifacts().archiveArtifact(deployment.artifactId)
      }
    }
    return this.projectRepository.save({
      ...project,
      status: 'archived'
    })
  }


  private async withActiveProject<T>(scope: SitesScope, id: string, work: (project: SitesProject, projects: Repository<SitesProject>) => Promise<T>): Promise<T> {
    return this.projectRepository.manager.transaction(async manager => {
      const projects = manager.getRepository(SitesProject)
      const project = await projects.findOneOrFail({ where: this.scopedWhere(scope, { id }), lock: { mode: 'pessimistic_write' } })
      if (project.status === 'archived') throw new BadRequestException('SITES_ARCHIVED')
      return work(project, projects)
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

  private async resolveDeployment(scope: SitesScope, deploymentId: string | undefined) {
    const id = normalizeRequiredString(deploymentId, 'deploymentId')
    const deployment = await this.deploymentRepository.findOne({ where: this.scopedWhere(scope, { id }) })
    if (!deployment) {
      throw new NotFoundException('Sites deployment was not found')
    }
    return deployment
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
    return digest(JSON.stringify(values.map((item) => ({ key: item.key, secret: item.secret, value: item.value }))))
  }

  private async attachPlatformArtifactToDeployment(
    project: SitesProject,
    version: SitesVersion,
    deployment: SitesDeployment,
    scope: SitesScope,
    previousDeployment: SitesDeployment | null,
    userConfirmedPublicLink?: boolean
  ) {
    const workspaceFiles = this.requireWorkspaceFiles()
    const artifacts = this.requireArtifacts()
    if (!version.previewHtml || !deployment.id) {
      throw new BadRequestException('A saved HTML version and deployment id are required to create a Sites Artifact')
    }

    const tenantId = normalizeRequiredString(scope.tenantId, 'tenantId')
    const organizationId = optionalString(scope.organizationId)
    const userId = optionalString(scope.userId)
    const fileName = `${slugify(project.slug ?? project.name ?? 'site')}-${version.versionNumber ?? 'version'}-${deployment.id}.html`
    // Project scope takes precedence; the host resolves Assistant volume isolation.
    const workspaceScope = scope.hostProjectId
      ? { catalog: 'projects' as const, scopeId: scope.hostProjectId, projectId: scope.hostProjectId }
      : scope.assistantId
        ? { xpertId: scope.assistantId }
        : { catalog: 'users' as const, scopeId: normalizeRequiredString(userId, 'userId') }
    const written = await workspaceFiles.writeRuntimeBuffer({
      tenantId,
      organizationId,
      userId,
      ...workspaceScope,
      folder: 'sites/deployments',
      fileName,
      originalName: fileName,
      mimeType: 'text/html',
      buffer: Buffer.from(version.previewHtml, 'utf8'),
      metadata: {
        pluginName: SITES_PLUGIN_NAME,
        sitesProjectId: project.id,
        sitesVersionId: version.id,
        sitesDeploymentId: deployment.id
      }
    })

    const artifact = await artifacts.createArtifact({
      scope: {
        tenantId,
        organizationId,
        userId: scope.hostProjectId ? null : userId,
        projectId: scope.hostProjectId,
        xpertId: scope.hostProjectId ? undefined : scope.assistantId
      },
      source: {
        pluginName: SITES_PLUGIN_NAME,
        resourceType: 'sites_project',
        resourceId: normalizeRequiredString(project.id, 'projectId')
      },
      kind: 'site',
      title: version.title ?? project.name,
      description: version.description ?? project.description,
      metadata: {
        projectSlug: project.slug
      }
    })

    const { version: artifactVersion } = await artifacts.ensureArtifactVersion({
      idempotencyKey: normalizeRequiredString(version.id, 'versionId'),
      artifactId: artifact.id,
      workspaceFileRef: written.reference,
      mimeType: 'text/html',
      fileName,
      title: version.title ?? project.name,
      description: version.description ?? project.description,
      size: written.size,
      sha256: createHash('sha256').update(version.previewHtml).digest('hex'),
      sourceVersionId: version.id,
      checksum: version.artifactDigest,
      setCurrent: false,
      metadata: {
        projectSlug: project.slug,
        versionNumber: version.versionNumber
      }
    })

    const access = buildArtifactLinkAccess(
      deployment.accessMode,
      deployment.customAudience,
      userConfirmedPublicLink
    )
    const platformLink = previousDeployment?.artifactLinkId
      ? await artifacts.updateArtifactLinkAccess(previousDeployment.artifactLinkId, {
          versionMode: 'version',
          artifactVersionId: artifactVersion.id,
          access,
          presentation: artifactLinkPresentation()
        })
      : await artifacts.createArtifactLink({
          artifactId: artifact.id,
          versionMode: 'version',
          artifactVersionId: artifactVersion.id,
          access,
          presentation: artifactLinkPresentation(),
          metadata: {
            projectSlug: project.slug
          }
        })

    return this.deploymentRepository.save({
      ...deployment,
      deploymentUrl: platformLink.publicUrl,
      artifactId: artifact.id,
      artifactVersionId: artifactVersion.id,
      artifactLinkId: platformLink.id
    })
  }

  private async updateDeploymentArtifactLink(
    deployment: SitesDeployment,
    accessMode: SitesAccessMode,
    customAudience?: string[],
    userConfirmedPublicLink?: boolean,
    expiresAt?: string | Date | null
  ) {
    const artifacts = this.requireArtifacts()
    const artifactId = normalizeRequiredString(deployment.artifactId ?? undefined, 'artifactId')
    const access = buildArtifactLinkAccess(
      accessMode,
      customAudience,
      userConfirmedPublicLink,
      expiresAt
    )
    const platformLink = deployment.artifactLinkId
      ? await artifacts.updateArtifactLinkAccess(deployment.artifactLinkId, {
          versionMode: 'version',
          artifactVersionId: deployment.artifactVersionId,
          access,
          presentation: artifactLinkPresentation()
        })
      : await artifacts.createArtifactLink({
          artifactId,
          versionMode: 'version',
          artifactVersionId: deployment.artifactVersionId,
          access,
          presentation: artifactLinkPresentation(),
          metadata: {
            sitesDeploymentId: deployment.id,
            sitesProjectId: deployment.projectId
          }
        })
    return {
      ...deployment,
      deploymentUrl: platformLink.publicUrl,
      artifactLinkId: platformLink.id
    }
  }

  private requireArtifacts(): ArtifactsApi {
    const artifacts = this.runtimeCapabilities?.get(ArtifactsRuntimeCapability)
    if (!artifacts) {
      throw new BadRequestException('Sites requires the platform.artifacts runtime capability')
    }
    return artifacts
  }

  private requireWorkspaceFiles(): WorkspaceFilesApi {
    const workspaceFiles = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) {
      throw new BadRequestException('Sites requires the platform.workspace.files runtime capability')
    }
    return workspaceFiles
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

  private scopedWhere(scope: SitesScope, extra: Record<string, unknown> = {}) {
    return { ...sitesWhere(scope), ...extra }
  }

  async buildDeploymentPreviewEvent(input: { deployment: SitesDeployment; project?: SitesProject; version?: SitesVersion }) {
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
        url: deployment.deploymentUrl,
        displayUrl: deployment.deploymentUrl
      })
    }

    return buildSitesDeploymentPreviewEvent({
      project,
      version,
      deployment,
      url: deployment.deploymentUrl,
      displayUrl: deployment.deploymentUrl
    })
  }

  private scopeCreate(scope: SitesScope) {
    return {
      tenantId: normalizeRequiredString(scope.tenantId, 'tenantId'),
      organizationId: normalizeRequiredString(scope.organizationId ?? undefined, 'organizationId'),
      createdById: normalizeRequiredString(scope.userId, 'userId'),
      hostProjectId: scope.hostProjectId,
      assistantId: scope.hostProjectId ? scope.assistantId : normalizeRequiredString(scope.assistantId, 'assistantId'),
      conversationId: scope.conversationId ?? undefined
    }
  }

}
