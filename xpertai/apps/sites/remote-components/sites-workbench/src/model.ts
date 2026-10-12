import { z } from 'zod/v3'
export const accessSchema = z.enum(['admins_only', 'workspace_all', 'custom', 'public_link'])
export const projectSchema = z.object({ id: z.string(), name: z.string(), slug: z.string(), description: z.string().nullish(), status: z.string(), audience: accessSchema, currentDeploymentId: z.string().nullish(), currentDeploymentUrl: z.string().nullish(), updatedAt: z.string(), latestVersionId: z.string().nullish(), latestVersionNumber: z.number().nullish(), deployedVersionId: z.string().nullish() })
export const versionSchema = z.object({ id: z.string(), versionNumber: z.number(), title: z.string().nullish(), description: z.string().nullish(), createdAt: z.string(), artifactDigest: z.string().nullish() })
export const deploymentSchema = z.object({ id: z.string(), versionId: z.string(), deploymentUrl: z.string().nullish(), status: z.string(), accessMode: accessSchema, deployedAt: z.string().nullish(), artifactLinkId: z.string().nullish() })
export const detailSchema = z.object({ project: projectSchema, versions: z.array(versionSchema), deployments: z.array(deploymentSchema), environmentValues: z.array(z.object({ key: z.string(), value: z.string().nullish(), secret: z.boolean() })) })
export type Project = z.infer<typeof projectSchema>
export type Detail = z.infer<typeof detailSchema>
export type Access = z.infer<typeof accessSchema>
export type Tab = 'preview' | 'versions' | 'settings'
export const tabSchema = z.enum(['preview', 'versions', 'settings'])
// The source runs only inside a nested opaque-origin frame. CSP precedes every
// user-controlled byte; saved HTML cannot connect to the host or read its session.
export function isolatedHtml(html: string) {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https:; img-src data: https:; font-src data: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'">${html}`
}
