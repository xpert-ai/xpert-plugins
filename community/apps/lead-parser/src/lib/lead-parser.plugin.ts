import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { LeadRecord } from './entities'
import { LeadParserMiddleware } from './lead-parser.middleware'
import { LeadParserViewProvider } from './lead-parser-view.provider'
import { LeadParserService } from './lead-parser.service'

const LEAD_PARSER_ENTITIES = [LeadRecord]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(LEAD_PARSER_ENTITIES)],
  entities: LEAD_PARSER_ENTITIES,
  providers: [LeadParserService, LeadParserMiddleware, LeadParserViewProvider],
  exports: [LeadParserService]
})
export class LeadParserPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${LeadParserPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${LeadParserPlugin.name} is being destroyed...`)
  }
}
