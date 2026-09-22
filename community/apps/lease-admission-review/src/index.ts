import 'reflect-metadata'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ReviewCase, ReviewEvent } from './lib/entities'
import { ReviewService } from './lib/service'
import { ReviewMiddleware } from './lib/middleware'
import { ReviewView } from './lib/view'
import { FEATURE, ICON, NAMESPACE, PLUGIN_NAME } from './lib/constants'
import { templates } from './lib/templates'
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([ReviewCase, ReviewEvent])],
  entities: [ReviewCase, ReviewEvent],
  providers: [ReviewService, ReviewMiddleware, ReviewView]
})
class LeaseAdmissionReviewPlugin {}
const plugin: XpertPlugin = {
  meta: {
    name: PLUGIN_NAME,
    version: '0.2.1',
    level: 'system',
    artifactNamespace: NAMESPACE,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [FEATURE]
      }
    },
    category: 'middleware',
    displayName: '准入资料核验',
    description:
      'Evidence candidates, human confirmation, and durable review records.',
    icon: ICON,
    author: 'Community'
  },
  templates,
  register() {
    return { module: LeaseAdmissionReviewPlugin, global: true }
  }
}
export = plugin
