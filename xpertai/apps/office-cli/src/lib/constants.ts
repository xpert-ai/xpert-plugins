import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'

export const OFFICE_CLI_PLUGIN_NAME = '@xpert-ai/plugin-office-cli'
export const OFFICE_CLI_ARTIFACT_NAMESPACE = 'office_cli'
export const OFFICE_CLI_FEATURE = 'office-cli'
export const OFFICE_CLI_WORKBENCH_CAPABILITY = 'office-cli-workbench'
export const OFFICE_CLI_AGENT_CAPABILITY = 'office-cli-agent-editing'
export const OFFICE_CLI_RENDERING_CAPABILITY = 'office-cli-native-rendering'
export const OFFICE_CLI_VERSIONING_CAPABILITY = 'office-cli-file-versioning'
export const OFFICE_CLI_MIDDLEWARE_NAME = 'OfficeCLIMiddleware'
export const OFFICE_CLI_PROVIDER_KEY = 'office-cli-view-provider'
export const OFFICE_CLI_TEMPLATE_PROVIDER_KEY = 'office-cli-template-provider'
export const OFFICE_CLI_VIEW_KEY = 'office_cli'
export const OFFICE_CLI_REMOTE_ENTRY_KEY = 'office-cli-workbench'
export const OFFICE_CLI_ASSISTANT_TEMPLATE_KEY = 'office-cli-assistant'
export const OFFICE_CLI_AGENT_KEY = 'Agent_OfficeCLI'
export const OFFICE_CLI_WORKSPACE_FILES_RUNTIME_CAPABILITY = 'platform.workspace.files'
export const OFFICE_CLI_RELEASE_VERSION = 'v1.0.142'

export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const PROJECT_DETAIL_SECTIONS_SLOT = 'detail.sections'

export const OFFICE_CLI_DOCUMENT_FORMATS = ['docx', 'xlsx', 'pptx'] as const
export const OFFICE_CLI_GUIDANCE_SKILLS = [
  'word',
  'academic-paper',
  'excel',
  'financial-model',
  'data-dashboard',
  'pptx',
  'pitch-deck',
  'morph-ppt',
  'morph-ppt-3d'
] as const
export const OFFICE_CLI_READ_COMMANDS = [
  'view',
  'get',
  'query',
  'validate',
  'dump',
  'raw',
  'help'
] as const
export const OFFICE_CLI_WRITE_COMMANDS = [
  'set',
  'add',
  'import',
  'remove',
  'move',
  'swap',
  'raw-set',
  'add-part',
  'batch',
  'merge',
  'refresh'
] as const
export const OFFICE_CLI_TOOL_NAMES = [
  'officecli_create_document',
  'officecli_list_documents',
  'officecli_read_document',
  'officecli_execute',
  'officecli_get_versions',
  'officecli_restore_version',
  'officecli_get_file',
  'officecli_help',
  'officecli_load_skill',
  'officecli_apply_word_design'
] as const

export function officeCliTable(key: string) {
  return pluginArtifactTableName(OFFICE_CLI_ARTIFACT_NAMESPACE, key)
}

export const OFFICE_CLI_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="OfficeCLI"><rect x="6" y="6" width="52" height="52" rx="14" fill="#e5484d"/><path d="M18 18h20l8 8v20H18z" fill="#fff" opacity=".96"/><path d="M38 18v10h10" fill="none" stroke="#e5484d" stroke-width="3"/><path d="M24 34h16M24 40h12" stroke="#e5484d" stroke-width="3" stroke-linecap="round"/></svg>`

export const OFFICE_CLI_MIME_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
} as const

export const OFFICE_CLI_RELEASE_ASSETS = {
  'linux-x64': {
    name: 'officecli-linux-x64',
    sha256: 'f78563abc13cf70dcd420644019d2f11dc36ea2957ac738613a6911d652b5541'
  },
  'linux-arm64': {
    name: 'officecli-linux-arm64',
    sha256: '260cdccd27f2e25902e9436e5e971c0ca5348ae3d36a54a3fbd794c452ba13f7'
  },
  'linux-alpine-x64': {
    name: 'officecli-linux-alpine-x64',
    sha256: 'e0f9aa822c79ca49ce14724adb20e6a3483f263db6fbb69a6a303e4f59a84346'
  },
  'linux-alpine-arm64': {
    name: 'officecli-linux-alpine-arm64',
    sha256: '4c47ae4ce1047baa81e586d99149428874cb4eecc110928ff4684c885d029ba3'
  },
  'darwin-x64': {
    name: 'officecli-mac-x64',
    sha256: 'd2d27d8203ec8fc178a6a55eb4ce0ca63696e4ceddb7f85eab359da77f343a91'
  },
  'darwin-arm64': {
    name: 'officecli-mac-arm64',
    sha256: '684ce214bb8d750003d521eea044a9199bcbdb870817dba5d3191b35715ea38c'
  },
  'win32-x64': {
    name: 'officecli-win-x64.exe',
    sha256: '676e0acee691288968a31b9832299ad05599e83140e801c382b6fc4509622fe2'
  },
  'win32-arm64': {
    name: 'officecli-win-arm64.exe',
    sha256: '0926428513e15f2d1c6eb726a07b141f7f31d60360226daa7526e518213d3578'
  }
} as const
