import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { RegistrationRecord } from './registration.entity'
import { SavedQuery } from './saved-query.entity'
import { RegistrationService } from './registration.service'
import { RegistrationSeedService } from './registration-seed.service'
import { RegistrationMiddleware } from './registration.middleware'
import { RegistrationViewProvider } from './registration-view.provider'

const REGISTRATION_ENTITIES = [RegistrationRecord, SavedQuery]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(REGISTRATION_ENTITIES)],
  entities: REGISTRATION_ENTITIES,
  providers: [RegistrationService, RegistrationSeedService, RegistrationMiddleware, RegistrationViewProvider],
  exports: [RegistrationService]
})
export class RegistrationPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${RegistrationPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${RegistrationPlugin.name} is being destroyed...`)
  }
}
