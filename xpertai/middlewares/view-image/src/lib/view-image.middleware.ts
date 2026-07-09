import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  BaseSandbox,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  Runtime
} from '@xpert-ai/plugin-sdk'
import { ViewImageIcon } from './types.js'
import {
  VIEW_IMAGE_MIDDLEWARE_NAME,
  type ViewImageMiddlewareConfig,
  ViewImageMiddlewareConfigFormSchema
} from './view-image.types.js'
import { ViewImageService } from './view-image.service.js'

@Injectable()
@AgentMiddlewareStrategy(VIEW_IMAGE_MIDDLEWARE_NAME)
export class ViewImageMiddleware implements IAgentMiddlewareStrategy<Partial<ViewImageMiddlewareConfig>> {
  constructor(private readonly viewImageService: ViewImageService) {}

  meta: TAgentMiddlewareMeta = {
    name: VIEW_IMAGE_MIDDLEWARE_NAME,
    label: {
      en_US: 'View Image',
      zh_Hans: '看图中间件'
    },
    description: {
      en_US:
        'Adds an on-demand `view_image` tool that loads sandbox image files and temporarily injects them into the next model call.',
      zh_Hans:
        '提供按需调用的 `view_image` 工具，用于读取 sandbox 中的图片文件，并在下一次模型调用时临时注入图片。'
    },
    icon: {
      type: 'svg',
      value: ViewImageIcon
    },
    configSchema: ViewImageMiddlewareConfigFormSchema
  }

  createMiddleware(
    options: Partial<ViewImageMiddlewareConfig>,
    _context: IAgentMiddlewareContext
  ): AgentMiddleware {
    const config = this.viewImageService.resolveMiddlewareConfig(options)
    const viewImageTool = this.viewImageService.createTool(config)

    return {
      name: VIEW_IMAGE_MIDDLEWARE_NAME,
      tools: [viewImageTool],
      wrapModelCall: async (request, handler) => {
        const backend = getSandboxBackend(request.runtime)
        if (!backend) {
          return handler(request)
        }

        const prepared = await this.viewImageService.prepareModelRequest(request, backend, config)
        try {
          return await handler(prepared.request)
        } finally {
          this.viewImageService.finalizePreparedBatches(prepared.cleanupKeys)
        }
      }
    }
  }
}

function getSandboxBackend(runtime: Runtime | undefined) {
  const backend = runtime?.configurable?.sandbox?.backend
  if (backend && typeof (backend as BaseSandbox).downloadFiles === 'function') {
    return backend as BaseSandbox
  }
  return null
}
