import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ContractServiceClient } from './client.js'
import { ContractReviewMiddleware } from './middleware.js'
import { ContractReviewViewProvider } from './view-provider.js'

@XpertServerPlugin({ providers: [ContractServiceClient, ContractReviewMiddleware, ContractReviewViewProvider], exports: [ContractServiceClient] })
export class ContractReviewPlugin {}
