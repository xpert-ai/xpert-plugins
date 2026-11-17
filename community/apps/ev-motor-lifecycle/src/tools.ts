import { Inject } from '@nestjs/common'
import { XpertToolProvider, XpertTool, type XpertBusinessToolContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { roles, middleware, agentKey, t, type Role } from './process.js'
import { keys, workbench } from './catalog.js'
import { MotorRuntime } from './runtime.js'
import { pending } from './domain.js'
const submission = z
  .object({ operationId: z.string().uuid(), assessment: z.string().trim().min(5).max(1500) })
  .strict()
const result = z.object({ accepted: z.boolean() })
function specialist(r: Exclude<Role, 'coordinator'>) {
  const mw = middleware(r)
  @XpertToolProvider({
    provider: mw + '_tools',
    componentKey: mw.replaceAll('_', '-') + '-tools',
    name: roles[r],
    description: roles[r],
    defaultMiddleware: mw,
    middlewares: [
      {
        provider: mw,
        meta: {
          name: mw,
          label: t(r, roles[r]),
          description: t(r, roles[r]),
          features: [mw, workbench, 'project.tasks'],
          configSchema: { type: 'object', properties: {} },
        },
      },
    ],
  })
  class Specialist {
    constructor(@Inject(MotorRuntime) readonly runtime: MotorRuntime) {}
    @XpertTool({
      name: mw + '_submit',
      title: roles[r],
      description: 'Submit the assessment for this assigned native pipeline execution.',
      middleware: mw,
      inputSchema: submission,
      outputSchema: result,
    })
    submit(i: z.infer<typeof submission>, c: XpertBusinessToolContext) {
      return this.runtime.submit(r, i.operationId, i.assessment, c)
    }
  }
  return Specialist
}
const cm = middleware('coordinator')
@XpertToolProvider({
  provider: cm + '_tools',
  componentKey: 'ev-motor-coordinator-tools',
  name: roles.coordinator,
  description: 'Read motor order progress',
  defaultMiddleware: cm,
  middlewares: [
    {
      provider: cm,
      meta: {
        name: cm,
        label: t('Coordinator', roles.coordinator),
        description: t('Coordinator', roles.coordinator),
        features: [cm, workbench, 'project.tasks'],
        configSchema: { type: 'object', properties: {} },
      },
    },
  ],
})
export class CoordinatorTools {
  constructor(private runtime: MotorRuntime) {}
  @XpertTool({
    name: cm + '_read',
    title: '读取电机订单',
    description: 'List the current user’s sample orders and next steps.',
    middleware: cm,
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ orders: z.array(z.object({ code: z.string(), next: z.string() })) }),
  })
  async read(_i: Record<string, never>, c: XpertBusinessToolContext) {
    if (!c.organizationId || !c.principal.userId || c.agentKey !== agentKey('coordinator'))
      throw Error('organization_user_required')
    const rows = await this.runtime.store.list({
      tenantId: c.tenantId,
      organizationId: c.organizationId,
      userId: c.principal.userId,
    })
    return { orders: rows.map((e) => ({ code: e.data.code, next: pending(e.data)?.title ?? '已结束' })) }
  }
}
export const toolProviders = [CoordinatorTools, ...keys.filter((r) => r !== 'coordinator').map(specialist)]
