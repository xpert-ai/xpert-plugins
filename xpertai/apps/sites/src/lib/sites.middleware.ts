import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta, TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { SITES_FEATURE, SITES_ICON, SITES_MIDDLEWARE_NAME } from './constants.js'
import { SitesService } from './sites.service.js'
import type {
  CreateSitesProjectInput,
  DeploySitesVersionInput,
  PublishSitesArtifactLinkInput,
  RevokeSitesArtifactLinkInput,
  SaveSitesVersionInput,
  SitesAccessMode,
  SitesEnvironmentValueInput,
  SitesSourceReadOptions,
  SitesScope,
} from './types.js'

const accessModeSchema = z.enum(['admins_only', 'workspace_all', 'custom', 'public_link'])
const storageShapeSchema = z.enum(['static', 'd1', 'r2', 'd1_r2', 'workspace_auth', 'external_auth'])

const createProjectSchema = z.object({
  name: z.string().min(1).describe('Human-readable Sites project name.'),
  slug: z.string().optional().describe('Optional URL slug. The plugin will allocate a unique slug if needed.'),
  description: z.string().optional(),
  audience: accessModeSchema.optional().describe('Initial access mode. Defaults to admins_only.'),
  customAudience: z.array(z.string()).optional().describe('Users or groups when audience/custom access is requested.'),
  storageShape: storageShapeSchema.optional(),
  d1Binding: z.string().nullable().optional(),
  r2Binding: z.string().nullable().optional(),
  authMode: z.enum(['none', 'workspace', 'external']).optional(),
  sourcePath: z.string().optional().describe('Sandbox source directory for the site, such as /workspace/sites/my-site.'),
  prompt: z.string().optional().describe('Original user request for the site.')
})

const saveVersionSchema = z.object({
  projectId: z.string().optional().describe('Sites project id. Omit only when creating a new project by name/slug.'),
  slug: z.string().optional(),
  name: z.string().optional(),
  prompt: z.string().optional().describe('Prompt or change request used to generate the deployable artifact.'),
  title: z.string().optional(),
  description: z.string().optional(),
  sourcePath: z.string().optional().describe('Sandbox source directory to snapshot. Omit only when the project already has sourcePath.'),
  sourceCommit: z.string().optional(),
  storageShape: storageShapeSchema.optional()
})

const deployVersionSchema = z.object({
  projectId: z.string().optional(),
  versionId: z.string().optional(),
  accessMode: accessModeSchema.optional(),
  customAudience: z.array(z.string()).optional(),
  userConfirmedPublicLink: z.boolean().optional().describe('Must be true when accessMode is public_link, confirming the user explicitly requested public publishing.')
})

const createAndDeploySchema = createProjectSchema.merge(saveVersionSchema).merge(deployVersionSchema)

const publishArtifactLinkSchema = z.object({
  deploymentId: z.string().min(1),
  expiresAt: z.string().optional().describe('Optional ISO expiration time for the public Artifact link.'),
  userConfirmedPublicLink: z.literal(true).describe('Confirms the user explicitly requested a public Artifact link.')
})

const revokeArtifactLinkSchema = z.object({
  deploymentId: z.string().min(1)
})

const inspectProjectSchema = z.object({
  projectId: z.string().min(1)
})

const listProjectsSchema = z.object({
  search: z.string().optional(),
  limit: z.number().int().positive().max(200).optional()
})

const setAccessSchema = z.object({
  projectId: z.string().min(1),
  accessMode: accessModeSchema,
  customAudience: z.array(z.string()).optional(),
  userConfirmedPublicLink: z.boolean().optional().describe('Must be true when changing access to public_link.')
})

const environmentValueSchema = z.object({
  projectId: z.string().min(1),
  key: z.string().min(1),
  value: z.string().optional(),
  secret: z.boolean().optional(),
  description: z.string().optional()
})

const removeEnvironmentValueSchema = z.object({
  projectId: z.string().min(1),
  key: z.string().min(1)
})

@Injectable()
@AgentMiddlewareStrategy(SITES_MIDDLEWARE_NAME)
export class SitesMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly service: SitesService) {}

  meta: TAgentMiddlewareMeta = {
    name: SITES_MIDDLEWARE_NAME,
    label: {
      en_US: 'Sites',
      zh_Hans: 'Sites 站点'
    },
    description: {
      en_US: 'Adds tools for creating Sites projects, saving deployable versions, deploying approved versions, and managing access.',
      zh_Hans: '提供创建 Sites 项目、保存可部署版本、发布已批准版本和管理访问权限的工具。'
    },
    icon: {
      type: 'svg',
      value: SITES_ICON,
      color: '#4f46e5'
    },
    features: [SITES_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    const createProjectTool = tool(
      async (input: z.infer<typeof createProjectSchema>) => {
        const project = await this.service.createProject(input as CreateSitesProjectInput, scope)
        return stringify({
          message:
            'Sites project was created. Next call sites_save_version to create a reviewable deployment candidate, then sites_deploy_version after approval.',
          projectId: project.id,
          slug: project.slug,
          status: project.status,
          hostingConfig: project.hostingConfig
        })
      },
      {
        name: 'sites_create_project',
        description:
          'Create a Sites project with access mode, storage bindings, hosting metadata, and an optional sandbox sourcePath. This does not publish a production deployment.',
        schema: createProjectSchema
      }
    )

    const saveVersionTool = tool(
      async (input: z.infer<typeof saveVersionSchema>, config) => {
        const version = await this.service.saveVersion(input as SaveSitesVersionInput, scope, sourceReadOptionsFromConfig(config))
        return stringify({
          message:
            'Sites version was saved as a reviewable deployment candidate. Inspect it before calling sites_deploy_version.',
          projectId: version.projectId,
          versionId: version.id,
          versionNumber: version.versionNumber,
          sourceCommit: version.sourceCommit,
          artifactDigest: version.artifactDigest,
          status: version.status
        })
      },
      {
        name: 'sites_save_version',
        description:
          'Snapshot source files from a sandbox sourcePath and save a deployable Sites version without making it live. Create and edit source files with SandboxFile tools first; do not pass source code to this tool.',
        schema: saveVersionSchema
      }
    )

    const deployVersionTool = tool(
      async (input: z.infer<typeof deployVersionSchema>) => {
        const deployment = await this.service.deployVersion(input, scope)
        const event = await this.service.buildDeploymentPreviewEvent({ deployment })
        return stringify({
          message: 'Sites version was deployed as a platform Artifact. Use deploymentUrl as the access link.',
          projectId: deployment.projectId,
          versionId: deployment.versionId,
          deploymentId: deployment.id,
          deploymentUrl: deployment.deploymentUrl,
          artifactId: deployment.artifactId,
          artifactVersionId: deployment.artifactVersionId,
          artifactLinkId: deployment.artifactLinkId,
          status: deployment.status,
          accessMode: deployment.accessMode,
          ...(event ? { event } : {})
        })
      },
      {
        name: 'sites_deploy_version',
        description:
          'Deploy a saved Sites version as a platform Artifact and return deploymentUrl plus Artifact identifiers. Only call this after the saved candidate is approved.',
        schema: deployVersionSchema
      }
    )

    const createAndDeployTool = tool(
      async (input: z.infer<typeof createAndDeploySchema>, config) => {
        const result = await this.service.createAndDeploy(
          input as CreateSitesProjectInput & SaveSitesVersionInput & DeploySitesVersionInput,
          scope,
          sourceReadOptionsFromConfig(config)
        )
        const event = await this.service.buildDeploymentPreviewEvent(result)
        return stringify({
          message: 'Sites project was created, versioned, and deployed as a platform Artifact. Use deploymentUrl as the access link.',
          projectId: result.project.id,
          slug: result.project.slug,
          versionId: result.version.id,
          versionNumber: result.version.versionNumber,
          deploymentId: result.deployment.id,
          deploymentUrl: result.deployment.deploymentUrl,
          artifactId: result.deployment.artifactId,
          artifactVersionId: result.deployment.artifactVersionId,
          artifactLinkId: result.deployment.artifactLinkId,
          accessMode: result.deployment.accessMode,
          ...(event ? { event } : {})
        })
      },
      {
        name: 'sites_create_and_deploy',
        description:
          'Convenience tool for explicit deploy requests: create a project, snapshot sandbox source files, save a version, deploy it as a platform Artifact, and return deploymentUrl. Create and edit source files with SandboxFile tools before calling this.',
        schema: createAndDeploySchema
      }
    )

    const publishArtifactLinkTool = tool(
      async (input: z.infer<typeof publishArtifactLinkSchema>) => {
        const deployment = await this.service.publishArtifactLink(input as PublishSitesArtifactLinkInput, scope)
        return stringify({
          message: 'Sites Artifact was published with a public link.',
          deploymentId: deployment.id,
          deploymentUrl: deployment.deploymentUrl,
          artifactId: deployment.artifactId,
          artifactVersionId: deployment.artifactVersionId,
          artifactLinkId: deployment.artifactLinkId
        })
      },
      {
        name: 'sites_publish_artifact_link',
        description: 'Explicitly publish an existing Sites deployment as a public Artifact link. userConfirmedPublicLink must be true.',
        schema: publishArtifactLinkSchema
      }
    )

    const revokeArtifactLinkTool = tool(
      async (input: z.infer<typeof revokeArtifactLinkSchema>) => {
        const result = await this.service.revokeArtifactLink(input as RevokeSitesArtifactLinkInput, scope)
        return stringify({
          message: 'Sites Artifact link was revoked.',
          ...result
        })
      },
      {
        name: 'sites_revoke_artifact_link',
        description: 'Revoke the platform Artifact link for an existing Sites deployment.',
        schema: revokeArtifactLinkSchema
      }
    )

    const listProjectsTool = tool(
      async (input: z.infer<typeof listProjectsSchema>) => {
        const projects = await this.service.listProjects(scope, input)
        return stringify({
          message: 'Sites projects were listed.',
          total: projects.length,
          projects
        })
      },
      {
        name: 'sites_list_projects',
        description: 'List Sites projects visible to the current assistant workspace.',
        schema: listProjectsSchema
      }
    )

    const inspectProjectTool = tool(
      async (input: z.infer<typeof inspectProjectSchema>) => {
        const detail = await this.service.inspectProject(scope, input.projectId)
        return stringify({
          message: 'Sites project details were loaded.',
          ...detail
        })
      },
      {
        name: 'sites_inspect_project',
        description: 'Inspect a Sites project, its saved versions, deployments, and hosted environment values.',
        schema: inspectProjectSchema
      }
    )

    const setAccessTool = tool(
      async (input: z.infer<typeof setAccessSchema>) => {
        const project = await this.service.setAccess(
          scope,
          input.projectId,
          input.accessMode as SitesAccessMode,
          input.customAudience,
          input.userConfirmedPublicLink
        )
        return stringify({
          message: 'Sites access mode was updated.',
          projectId: project.id,
          accessMode: project.audience,
          customAudience: project.customAudience
        })
      },
      {
        name: 'sites_set_access',
        description: 'Change a Sites project and current Artifact link access mode. Public access requires explicit user confirmation.',
        schema: setAccessSchema
      }
    )

    const upsertEnvironmentTool = tool(
      async (input: z.infer<typeof environmentValueSchema>) => {
        const value = await this.service.upsertEnvironmentValue(scope, input as SitesEnvironmentValueInput)
        return stringify({
          message: 'Sites hosted environment value was saved. Redeploy an approved version for the new value to take effect.',
          projectId: value.projectId,
          key: value.key,
          secret: value.secret
        })
      },
      {
        name: 'sites_upsert_environment_value',
        description:
          'Add or update a hosted environment value for a Sites project. Do not put secret values in source files.',
        schema: environmentValueSchema
      }
    )

    const removeEnvironmentTool = tool(
      async (input: z.infer<typeof removeEnvironmentValueSchema>) => {
        return stringify(await this.service.removeEnvironmentValue(scope, input.projectId, input.key))
      },
      {
        name: 'sites_remove_environment_value',
        description: 'Remove a hosted environment value from a Sites project.',
        schema: removeEnvironmentValueSchema
      }
    )

    const checkDeploymentStatusTool = tool(
      async (input: z.infer<typeof inspectProjectSchema>) => {
        const detail = await this.service.inspectProject(scope, input.projectId)
        const deployment = detail.deployments[0]
        return stringify({
          message: deployment ? 'Latest Sites deployment status was loaded.' : 'No Sites deployment exists for this project.',
          projectId: input.projectId,
          deployment
        })
      },
      {
        name: 'sites_check_deployment_status',
        description: 'Return the latest deployment status and permission-controlled deploymentUrl for a Sites project.',
        schema: inspectProjectSchema
      }
    )

    return {
      name: SITES_MIDDLEWARE_NAME,
      tools: [
        createProjectTool,
        saveVersionTool,
        deployVersionTool,
        createAndDeployTool,
        publishArtifactLinkTool,
        revokeArtifactLinkTool,
        listProjectsTool,
        inspectProjectTool,
        setAccessTool,
        upsertEnvironmentTool,
        removeEnvironmentTool,
        checkDeploymentStatusTool
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): SitesScope {
  return {
    tenantId: context.tenantId ?? RequestContext.currentTenantId(),
    userId: context.userId ?? RequestContext.currentUserId(),
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}

function stringify(result: unknown) {
  return JSON.stringify(result)
}

function sourceReadOptionsFromConfig(config: unknown): SitesSourceReadOptions {
  const configurable = (config as { configurable?: TAgentRunnableConfigurable } | undefined)?.configurable
  const sandbox = configurable?.sandbox
  const sandboxBackend = sandbox?.backend as SitesSourceReadOptions['sandboxBackend'] | undefined
  return {
    sandboxBackend,
    workingDirectory: sandboxBackend?.workingDirectory || sandbox?.workingDirectory
  }
}
