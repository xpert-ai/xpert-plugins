import { ConfigModule } from '@nestjs/config'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { DifyController } from './dify.controller.js'
import { DifyService } from './dify.service.js'
import { DifyKnowledgeStrategy } from './dify-knowledge.strategy.js'
import { DifyIntegrationStrategy } from './dify-integration.strategy.js'

@Module({
	imports: [
		RouterModule.register([{ path: '/dify', module: IntegrationDifyModule }]),
		ConfigModule,
	],
	controllers: [DifyController],
	providers: [DifyService, DifyIntegrationStrategy, DifyKnowledgeStrategy],
	exports: []
})
export class IntegrationDifyModule {}
