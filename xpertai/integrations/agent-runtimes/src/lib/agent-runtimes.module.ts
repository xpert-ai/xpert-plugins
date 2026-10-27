import { ProcessRuntime } from './process-runtime.js'
import { CodexRuntimeStrategy } from './codex.strategy.js'
import { PiRuntimeStrategy } from './pi.strategy.js'
import { ClaudeCodeRuntimeStrategy, ClaudeSdkLoader } from './claude.strategy.js'
import { KimiComputerRuntimeStrategy } from './kimi-computer.strategy.js'
import { CodeBuddyComputerRuntimeStrategy } from './codebuddy-computer.strategy.js'
import { ClaudeComputerRuntimeStrategy } from './claude-computer.strategy.js'
import { AgentInvocationMiddleware } from './invocation.middleware.js'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { QwenComputerRuntimeStrategy } from './qwen-computer.strategy.js'
import { CodexComputerRuntimeStrategy } from './codex-computer.strategy.js'
import { OpenCodeRuntimeStrategy } from './opencode.strategy.js'
import { RuntimeProfiles } from './managed-profiles.js'

@XpertServerPlugin({
  providers: [
    AgentInvocationMiddleware,
    RuntimeProfiles,
    ProcessRuntime,
    CodexRuntimeStrategy,
    PiRuntimeStrategy,
    ClaudeCodeRuntimeStrategy,
    ClaudeSdkLoader,
    CodexComputerRuntimeStrategy,
    QwenComputerRuntimeStrategy,
    CodeBuddyComputerRuntimeStrategy,
    ClaudeComputerRuntimeStrategy,
    KimiComputerRuntimeStrategy,
    OpenCodeRuntimeStrategy
  ]
})
export class AgentRuntimesModule {}
