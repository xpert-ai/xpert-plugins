const { TextEncoder, TextDecoder } = require('node:util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

const v8 = require('node:v8')
global.structuredClone = value => v8.deserialize(v8.serialize(value))
