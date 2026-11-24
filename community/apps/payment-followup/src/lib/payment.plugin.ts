import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { PaymentCase } from './payment.entity'
import { PaymentService } from './payment.service'
import { PaymentMiddleware } from './payment.middleware'
import { PaymentViewProvider } from './payment-view.provider'
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([PaymentCase])],
  entities: [PaymentCase],
  providers: [PaymentService, PaymentMiddleware, PaymentViewProvider]
})
export class PaymentPlugin {}
