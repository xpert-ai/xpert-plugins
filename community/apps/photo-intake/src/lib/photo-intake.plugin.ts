import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { IntakeCase } from './intake-case.entity.js'
import { IntakePhoto } from './intake-photo.entity.js'
import { PhotoIntakeMiddleware } from './intake.middleware.js'
import { IntakeService } from './intake.service.js'
import { PhotoIntakeViewProvider } from './intake-view.provider.js'

export const ENTITIES = [IntakeCase, IntakePhoto]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [IntakeService, PhotoIntakeMiddleware, PhotoIntakeViewProvider],
  exports: [IntakeService]
})
export class PhotoIntakePlugin {}
