import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { IntakeEntity } from './intake.entity'
import { IntakeService } from './intake.service'
import { IntakeViewProvider } from './intake-view.provider'
import { IntakeMiddleware } from './intake.middleware'

@XpertServerPlugin({ imports: [TypeOrmModule.forFeature([IntakeEntity])], entities: [IntakeEntity], providers: [IntakeService, IntakeViewProvider, IntakeMiddleware] })
export class IntakePlugin {}
