import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { BlogArticleRecord } from './entities/index.js'
import { BlogAiHelperMiddleware } from './blog-ai-helper.middleware.js'
import { BlogAiHelperService } from './blog-ai-helper.service.js'
import { BlogAiHelperViewProvider } from './blog-ai-helper-view.provider.js'

export const BLOG_AI_HELPER_ENTITIES = [BlogArticleRecord]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(BLOG_AI_HELPER_ENTITIES)],
  entities: BLOG_AI_HELPER_ENTITIES,
  providers: [BlogAiHelperService, BlogAiHelperMiddleware, BlogAiHelperViewProvider],
  exports: [BlogAiHelperService]
})
export class BlogAiHelperPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${BlogAiHelperPlugin.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${BlogAiHelperPlugin.name} is being destroyed...`)
    }
  }
}
