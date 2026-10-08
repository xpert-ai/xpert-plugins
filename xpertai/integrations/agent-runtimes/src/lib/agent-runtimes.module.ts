import { KimiComputerRuntimeStrategy } from './kimi-computer.strategy.js'
import { CodeBuddyComputerRuntimeStrategy } from './codebuddy-computer.strategy.js'
import { ClaudeComputerRuntimeStrategy } from './claude-computer.strategy.js'
import { AgentInvocationMiddleware } from './invocation.middleware.js'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { QwenComputerRuntimeStrategy } from './qwen-computer.strategy.js'
import { CodexComputerRuntimeStrategy } from './codex-computer.strategy.js'
import { CodexRuntimeStrategy } from './codex.strategy.js'
import { PiRuntimeStrategy } from './pi.strategy.js'
import { ClaudeCodeRuntimeStrategy, ClaudeSdkLoader } from './claude.strategy.js'
import { OpenCodeRuntimeStrategy } from './opencode.strategy.js'
import { ProcessRuntime } from './process-runtime.js'

@XpertServerPlugin({
  providers: [
    AgentInvocationMiddleware,
    ProcessRuntime,
    CodexRuntimeStrategy,
    CodexComputerRuntimeStrategy,
    QwenComputerRuntimeStrategy,
    CodeBuddyComputerRuntimeStrategy,
    ClaudeComputerRuntimeStrategy,
    KimiComputerRuntimeStrategy,
    PiRuntimeStrategy,
    ClaudeCodeRuntimeStrategy,
    ClaudeSdkLoader,
    OpenCodeRuntimeStrategy
  ]
})
export class AgentRuntimesModule {}
