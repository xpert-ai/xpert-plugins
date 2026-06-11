#!/usr/bin/env node
const payload = {
  ok: true,
  message: 'XpertAI Browser Lab pre-tool hook reviewed the tool request.'
}

process.stdout.write(JSON.stringify(payload))
