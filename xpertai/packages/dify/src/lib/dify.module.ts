import { ConfigModule } from '@nestjs/config'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { DifyController } from './dify.controller.js'
import { DifyService } from './dify.service.js'

@Module({
	imports: [
		RouterModule.register([{ path: '/dify', module: IntegrationDifyModule }]),
		ConfigModule,
	],
	controllers: [DifyController],
	// Strategy classes are moved to IntegrationDifyPlugin providers 
	// so they can be discovered by collectProvidersWithMetadata() during plugin installation
	providers: [DifyService],
	// Export DifyService so it can be injected into strategies registered in the parent module
	exports: [DifyService]
})
export class IntegrationDifyModule {}
