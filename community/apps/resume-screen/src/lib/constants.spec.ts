import {
  RESUME_SCREEN_MIDDLEWARE_TOOL_NAMES,
  RESUME_SCREEN_PLUGIN_NAME,
  RESUME_SCREEN_PROVIDER_KEY,
  RESUME_SCREEN_SAVE_TOOL_NAME
} from './constants'

describe('resume-screen constants', () => {
  it('exposes plugin identity', () => {
    expect(RESUME_SCREEN_PLUGIN_NAME).toBe('@xpert-ai/plugin-resume-screen')
    expect(RESUME_SCREEN_PROVIDER_KEY).toBe('resume_screen')
  })

  it('exposes exactly three agent tools', () => {
    expect(RESUME_SCREEN_MIDDLEWARE_TOOL_NAMES).toHaveLength(3)
    expect(RESUME_SCREEN_MIDDLEWARE_TOOL_NAMES).toContain(RESUME_SCREEN_SAVE_TOOL_NAME)
  })
})
