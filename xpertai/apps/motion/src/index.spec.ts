import {
  MOTION_AGENT_CAPABILITY,
  MOTION_FEATURE,
  MOTION_LIBRARY_CAPABILITY,
  MOTION_PLUGIN_NAME,
  MOTION_TEMPLATE_CAPABILITY,
  MOTION_WORKBENCH_CAPABILITY
} from './lib/constants.js'

describe('Motion plugin metadata', () => {
  it('registers Motion package constants and capabilities', () => {
    expect(MOTION_PLUGIN_NAME).toBe('@xpert-ai/plugin-motion')
    expect([MOTION_FEATURE, MOTION_WORKBENCH_CAPABILITY, MOTION_AGENT_CAPABILITY, MOTION_LIBRARY_CAPABILITY, MOTION_TEMPLATE_CAPABILITY]).toEqual([
      'motion',
      'motion-workbench',
      'agent-motion',
      'motion-library',
      'motion-assistant-template'
    ])
  })
})
