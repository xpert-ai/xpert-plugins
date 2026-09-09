import type { I18nObject, PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { EXCALIDRAW_ICON } from './constants.js'

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

/** The host owns organization setup; this contribution contains no instance IDs or credentials. */
export const excalidrawApp = {
  type: 'app',
  name: 'excalidraw',
  displayName: 'Excalidraw',
  description: text(
    'Create editable diagrams with AI, collaborate on the canvas, and share reviewed versions.',
    '用 AI 创作可编辑图形，在画布中协作，并分享经过审阅的版本。'
  ),
  icon: { type: 'svg', value: EXCALIDRAW_ICON, color: '#6965DB' },
  color: '#6965DB',
  tags: ['excalidraw', 'diagrams', 'collaboration', 'mcp'],
  appConfig: {
    scope: 'organization',
    assistantTemplateKey: 'excalidraw-assistant',
    workspace: {
      mode: 'dedicated',
      name: text('Excalidraw Workspace', 'Excalidraw 绘图工作空间'),
      description: text(
        'Shared organization workspace for diagram creation, canvas review, and drawing history.',
        '用于图形创作、画布审阅和版本管理的组织共享工作空间。'
      ),
      sharing: 'organization'
    },
    modelRequirements: { primary: true },
    presentation: {
      tagline: text('From an idea to an editable diagram', '让想法成为可以继续编辑的图形'),
      longDescription: text(
        'Describe a flowchart, architecture, wireframe, or whiteboard to the Drawing Assistant, then refine the same scene in Excalidraw Workbench. The plugin also includes technical diagram templates, quality checks, and native MCP tools with interactive previews for external clients.',
        '向绘图助手描述流程、架构、线框图或白板想法，再在 Excalidraw 工作台中继续完善同一份场景。插件还提供技术图模板、质量检查，以及供外部客户端使用的原生 MCP 工具和交互预览。'
      ),
      developer: 'XpertAI',
      screenshots: ['./assets/screenshots/excalidraw-workbench.png'],
      features: [
        {
          key: 'editable-drawings',
          title: text('AI drawing and canvas collaboration', 'AI 绘图与画布协作'),
          description: text(
            'Create with natural language and refine elements together in the live Excalidraw canvas.',
            '用自然语言生成图形，与同事在实时同步的 Excalidraw 画布中调整元素。'
          )
        },
        {
          key: 'versions-and-sharing',
          title: text('Versions, exports, and sharing', '版本、导出与分享'),
          description: text(
            'Save checkpoints, restore earlier versions, export JSON/SVG/PNG, and publish revocable public Artifact links.',
            '保存检查点、恢复历史版本、导出 JSON/SVG/PNG，并发布可撤销的公开 Artifact 链接。'
          )
        },
        {
          key: 'technical-diagrams',
          title: text('Technical diagram templates', '技术图模板'),
          description: text(
            'Use the separately available Technical Diagram Assistant template for DiagramIR layout, validation, and visual review.',
            '按需使用独立提供的技术图助手模板，完成 DiagramIR 布局、校验与视觉审核。'
          )
        },
        {
          key: 'native-mcp',
          title: text('Native MCP tools and previews', '原生 MCP 工具与预览'),
          description: text(
            'Connect an authorized MCP client to create, convert, and preview drawings without opening Workbench.',
            '连接已授权的 MCP 客户端，无需打开工作台即可创建、转换和预览图形。'
          )
        }
      ],
      useCases: [
        text('Flowcharts and process reviews', '流程图与业务流程审阅'),
        text('System architecture and data flows', '系统架构与数据流'),
        text('Wireframes and team whiteboards', '线框图与团队白板')
      ],
      dataScope: text(
        'The application workspace is shared within the current organization. Authorized MCP clients can access drawings across that organization. Tools run directly under the application policy, including public sharing; links can be revoked.',
        '应用工作空间在当前组织内共享。已授权的 MCP 客户端可访问当前组织内的图形。工具按应用策略直接执行，包括公开分享；已发布的链接可以撤销。'
      ),
      initializationSummary: text(
        'Xpert creates a dedicated organization workspace, installs the Drawing Assistant and its dependencies, and publishes its chat entry. An organization-visible language model is required.',
        'Xpert 将创建组织专用工作空间，安装绘图助手及其依赖，并发布对话入口。初始化需要组织内可用的语言模型。'
      ),
      initializationSteps: [
        text('Create the shared drawing workspace', '创建共享绘图工作空间'),
        text('Install the Drawing Assistant and its dependencies', '安装绘图助手及其依赖'),
        text('Publish the Assistant chat entry', '发布助手对话入口')
      ]
    },
    entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution
