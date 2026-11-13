import 'reflect-metadata'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  DELIVERY_WORKBENCH_KEY,
  PLUGIN_ARTIFACT_NAMESPACE,
  PLUGIN_PACKAGE_ARTIFACT_NAMESPACE,
  PLUGIN_LEVEL,
  PLUGIN_NAME,
  PLUGIN_VERSION
} from './lib/constants'
import { SupplierDeliveryFollowupPlugin } from './lib/supplier-delivery-followup.plugin'
import { SupplierDeliveryFollowupMiddleware } from './lib/supplier-delivery-followup.middleware'
import { SupplierDeliveryFollowupViewProvider } from './lib/supplier-delivery-followup-view.provider'
import { deliveryTargetAppMeta, supplierDeliveryTemplates } from './lib/supplier-delivery-followup.templates'

const plugin = {
  meta: {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    level: PLUGIN_LEVEL,
    artifactNamespace: PLUGIN_PACKAGE_ARTIFACT_NAMESPACE,
    category: 'middleware',
    author: 'Community contributors',
    displayName: {
      en_US: 'Supplier Delivery Follow-up',
      zh_Hans: '供应商交期跟单'
    },
    description: 'Evidence-backed supplier delivery proposals for human review.',
    targetApps: ['xpert', 'data-xpert'],
    targetAppMeta: deliveryTargetAppMeta
  },
  templates: supplierDeliveryTemplates,
  onInit(context) {
    const middleware = context.resolve<SupplierDeliveryFollowupMiddleware>(SupplierDeliveryFollowupMiddleware)
    context.logger.log(`Registered middleware: ${middleware.meta.name}; tools: ${middleware.getToolNames().join(', ')}`)
    context.logger.log(`Registered templates: ${supplierDeliveryTemplates.map((template) => template.key).join(', ')}`)
    context.resolve<SupplierDeliveryFollowupViewProvider>(SupplierDeliveryFollowupViewProvider)
    context.logger.log(`Registered view provider: ${DELIVERY_WORKBENCH_KEY}`)
  },
  register() {
    return { module: SupplierDeliveryFollowupPlugin }
  }
} satisfies XpertPlugin

export default plugin
export { plugin, PLUGIN_ARTIFACT_NAMESPACE }
export { SupplierDeliveryFollowupService, PARSE_TIMEOUT_MS } from './lib/supplier-delivery-followup.service'
export { SupplierDeliveryFollowupViewProvider } from './lib/supplier-delivery-followup-view.provider'
export { OrderLine, SupplierReply, ChangeProposal, DeliveryChangeLog } from './lib/entities'
export { DeliveryDomainError } from './lib/domain-error'
export type { DeliveryErrorCode } from './lib/domain-error'
export { DEMO_ORDER_LINES, DEMO_REPLIES } from './lib/demo-data'
export type * from './lib/types'
