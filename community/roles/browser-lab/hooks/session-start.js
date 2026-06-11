#!/usr/bin/env node
const payload = {
  pluginRoot: process.env.XPERT_PLUGIN_ROOT || process.env.PLUGIN_ROOT || null,
  pluginData: process.env.XPERT_PLUGIN_DATA || process.env.PLUGIN_DATA || null,
  message: 'XpertAI Browser Lab session hook initialized.'
}

process.stdout.write(JSON.stringify(payload))
