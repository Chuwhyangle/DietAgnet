import type {
  AgentChatRequest,
  AgentToolInvocation,
  RemoteChatMessage,
} from '../../../shared/agent'
import { getSettings } from '../stores/settings'
import { buildSystemPrompt } from './prompt'
import { AGENT_TOOLS, executeToolCall, type LocalToolExecutionContext } from './tools'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentRunOptions extends LocalToolExecutionContext {
  history: ConversationTurn[]
  userInput: string
  onToolFinished?: (event: { toolCall: AgentToolInvocation; result: unknown }) => void
}

export interface AgentRunResult {
  assistantMessage: string
}

const MAX_HISTORY_MESSAGES = 20
const MAX_TOOL_ROUNDS = 6

function buildToolCallSignature(toolCalls: AgentToolInvocation[]): string {
  return JSON.stringify(
    toolCalls.map((toolCall) => ({
      name: toolCall.name,
      arguments: toolCall.arguments,
    })),
  )
}

function buildRemoteHistory(history: ConversationTurn[]): RemoteChatMessage[] {
  return history.slice(-MAX_HISTORY_MESSAGES).map((item) => ({
    role: item.role,
    content: item.content,
  }))
}

function stringifyToolResult(result: unknown): string {
  return JSON.stringify(result, null, 2)
}

export async function runAgentConversation(options: AgentRunOptions): Promise<AgentRunResult> {
  const settings = getSettings()
  const remoteMessages: RemoteChatMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(settings),
    },
    ...buildRemoteHistory(options.history),
    {
      role: 'user',
      content: options.userInput,
    },
  ]

  const request: AgentChatRequest = {
    settings: settings.agent,
    messages: remoteMessages,
    tools: AGENT_TOOLS,
  }
  let previousToolCallSignature: string | null = null

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await window.agent.chatCompletions(request)
    request.messages.push(response.assistantMessage)

    if (response.toolCalls.length === 0) {
      return {
        assistantMessage: response.content.trim() || '喵~ 我处理好了，不过这次没有拿到文字回复。',
      }
    }

    const currentSignature = buildToolCallSignature(response.toolCalls)
    if (previousToolCallSignature === currentSignature) {
      throw new Error('模型重复发起了同一组工具调用，当前渠道大概率不兼容完整的 tool-call 循环。')
    }
    previousToolCallSignature = currentSignature

    for (const toolCall of response.toolCalls) {
      const result = await executeToolCall(toolCall, options)
      options.onToolFinished?.({ toolCall, result })
      request.messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: stringifyToolResult(result),
      })
    }
  }

  throw new Error('工具调用轮数超出上限，请换一种说法再试一次。')
}
