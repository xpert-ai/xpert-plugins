import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PACKAGE_METADATA = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')
) as {
  name: string
  version: string
  xpert: { plugin: { level: 'system' | 'tenant' | 'organization'; artifactNamespace: string } }
}

export const PLUGIN_NAME = PACKAGE_METADATA.name
export const ARTIFACT_NAMESPACE = PACKAGE_METADATA.xpert.plugin.artifactNamespace
export const FEATURE = 'resume_match'
export const VIEW_KEY = 'resume_match_workbench'
export const PROVIDER_KEY = 'resume_match_views'
export const MIDDLEWARE_NAME = 'ResumeMatchMiddleware'
export const REMOTE_ENTRY = 'resume-match'
export const TEMPLATE_KEY = 'resume-match-assistant'

export const TOOL_GET_ANALYSIS = 'resume_match_get_analysis'
export const TOOL_SAVE_RESULT = 'resume_match_save_result'
export const TOOL_MARK_FAILED = 'resume_match_mark_failed'

export const TOOL_NAMES = [
  TOOL_GET_ANALYSIS,
  TOOL_SAVE_RESULT,
  TOOL_MARK_FAILED
] as const

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const APP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect x="22" y="22" width="212" height="212" rx="52" fill="#EEF0FF"/>
  <path d="M82 52H142L180 90V194C180 202.837 172.837 210 164 210H82C73.1634 210 66 202.837 66 194V68C66 59.1634 73.1634 52 82 52Z" fill="white" stroke="#5B5BD6" stroke-width="10"/>
  <path d="M142 52V90H180" stroke="#5B5BD6" stroke-width="10" stroke-linejoin="round"/>
  <path d="M92 112H144" stroke="#A5A6F6" stroke-width="10" stroke-linecap="round"/>
  <path d="M92 140H132" stroke="#A5A6F6" stroke-width="10" stroke-linecap="round"/>
  <circle cx="160" cy="168" r="32" fill="#5B5BD6"/>
  <path d="M146 168L156 178L176 158" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

export const APP_ICON_DEFINITION = {
  type: 'svg' as const,
  value: APP_ICON,
  color: '#5b5bd6',
  alt: '简历智能匹配'
}
