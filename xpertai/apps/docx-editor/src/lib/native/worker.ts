import { parentPort, workerData } from 'node:worker_threads'
import { automate } from './automation.js'
import type { EngineInput } from './ai-schema.js'
try { parentPort?.postMessage({ result: automate(workerData as EngineInput) }) }
catch (error) { parentPort?.postMessage({ error: error instanceof Error ? error.message : 'docx.processing_failed' }) }
