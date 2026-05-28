import type {
  AgentChatRequest,
  AgentToolDefinition,
  AgentToolInvocation,
  RemoteChatMessage,
} from '../../../shared/agent'
import { getSettings } from '../stores/settings'
import { buildMemoryContextForPrompt } from '../memory/prompt'
import { buildSystemPrompt } from './prompt'
import { executeToolCall, getToolDefinitions, type LocalToolExecutionContext } from './tools'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  remoteTranscript?: RemoteChatMessage[]
}

export interface AgentRunOptions extends LocalToolExecutionContext {
  history: ConversationTurn[]
  userInput: string
  onToolFinished?: (event: { toolCall: AgentToolInvocation; result: unknown }) => void
}

export interface AgentRunResult {
  assistantMessage: string
  assistantRemoteTranscript?: RemoteChatMessage[]
}

const MAX_HISTORY_MESSAGES = 20
const MAX_TOOL_ROUNDS = 6
const BASE_TOOL_NAMES = [
  'get_today_nutrition',
  'get_diet_log',
  'get_week_summary',
  'search_recipe',
  'get_recipe_detail',
  'get_recipes_by_category',
  'get_settings',
  'add_meal',
  'add_custom_food_meal',
  'remove_meal_item',
  'update_settings',
  'recommend_recipe',
  'analyze_nutrition_balance',
  'navigate_to',
  'get_user_rhythm_summary',
] as const
const TOOL_NAME_SET = new Set<string>(BASE_TOOL_NAMES)
const TOOL_GROUPS: Array<{
  name: string
  patterns: RegExp[]
  toolNames: string[]
}> = [
  {
    name: 'planning',
    patterns: [
      /计划|plan|目标|偏差|补餐|减餐|提醒|周报|drift|gap|remaining|剩余|差值|超标/i,
    ],
    toolNames: [
      'get_current_plan',
      'check_today_plan_gap',
      'suggest_plan_adjustment',
      'record_adjustment_response',
      'get_proactive_event_history',
      'update_reminder_preferences',
    ],
  },
  {
    name: 'memory',
    patterns: [
      /记住|记忆|memory|偏好|过敏|忌口|长期|事实|档案|habit|allergy|preference|节奏|习惯|规律|记录情况|作息/i,
    ],
    toolNames: [
      'remember',
      'recall',
      'forget',
      'list_user_facts',
      'update_memory_confidence',
      'get_user_rhythm_summary',
    ],
  },
  {
    name: 'knowledge',
    patterns: [
      /知识库|knowledge|指南|guideline|营养数据库|nutrition|食物|food|高蛋白|低脂|低卡|criteria/i,
    ],
    toolNames: [
      'search_knowledgebase',
      'lookup_food_nutrition',
      'find_foods_by_criteria',
      'get_guideline_advice',
    ],
  },
  {
    name: 'calibration',
    patterns: [
      /校准|calibration|审核|审计|热量修正|菜谱数据|recipe data|validate recipe|数据治理/i,
    ],
    toolNames: [
      'validate_recipe_library',
      'estimate_recipe_nutrition',
      'list_recipe_calibrations',
      'review_recipe_calibration',
    ],
  },
]

function buildToolMap(tools: AgentToolDefinition[]): Map<string, AgentToolDefinition> {
  return new Map(
    tools.map((tool) => [
      tool.function.name,
      tool,
    ]),
  )
}

function selectAgentTools(params: {
  tools: AgentToolDefinition[]
  userInput: string
  history: ConversationTurn[]
  provider: string
}): AgentToolDefinition[] {
  if (params.provider !== 'custom') {
    return params.tools
  }

  const toolMap = buildToolMap(params.tools)
  const selectedNames = new Set<string>(BASE_TOOL_NAMES)
  const recentContext = params.history.slice(-4).map((item) => item.content).join('\n')
  const combinedText = `${recentContext}\n${params.userInput}`.toLowerCase()

  for (const group of TOOL_GROUPS) {
    if (group.patterns.some((pattern) => pattern.test(combinedText))) {
      for (const toolName of group.toolNames) {
        selectedNames.add(toolName)
      }
    }
  }

  return params.tools.filter((tool) => {
    const toolName = tool.function.name
    return selectedNames.has(toolName) || TOOL_NAME_SET.has(toolName)
  })
}

function buildToolCallSignature(toolCalls: AgentToolInvocation[]): string {
  return JSON.stringify(
    toolCalls.map((toolCall) => ({
      name: toolCall.name,
      arguments: toolCall.arguments,
    })),
  )
}

function buildRemoteHistory(history: ConversationTurn[]): RemoteChatMessage[] {
  return history
    .slice(-MAX_HISTORY_MESSAGES)
    .flatMap((item) => {
      if (item.role === 'assistant' && Array.isArray(item.remoteTranscript) && item.remoteTranscript.length > 0) {
        return item.remoteTranscript
      }

      return [{
        role: item.role,
        content: item.content,
      } satisfies RemoteChatMessage]
    })
}

function stringifyToolResult(result: unknown): string {
  return JSON.stringify(result, null, 2)
}

export async function runAgentConversation(options: AgentRunOptions): Promise<AgentRunResult> {
  const settings = getSettings()
  const memoryContext = await buildMemoryContextForPrompt(12, settings.language)
  const agentTools = getToolDefinitions(settings.language)
  const remoteMessages: RemoteChatMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(settings, memoryContext),
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
    tools: selectAgentTools({
      tools: agentTools,
      userInput: options.userInput,
      history: options.history,
      provider: settings.agent.provider,
    }),
  }
  let previousToolCallSignature: string | null = null
  const assistantTurnTranscript: RemoteChatMessage[] = []
  let usedToolCalls = false

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await window.agent.chatCompletions(request)
    request.messages.push(response.assistantMessage)
    assistantTurnTranscript.push(response.assistantMessage)

    if (response.toolCalls.length === 0) {
      const fallbackNote = response.toolFallback
        ? settings.language === 'zh'
          ? `\n\n（当前自定义接口拒绝了工具调用参数，本轮已自动切换为纯聊天模式${response.toolRequestMode ? `：${response.toolRequestMode}` : ''}；记录饮食、读取本地数据、动态计划建议等本地 Agent 工具能力暂时不会执行。）`
          : `\n\n(The current custom endpoint rejected tool-call parameters, so this turn automatically fell back to plain chat${response.toolRequestMode ? `: ${response.toolRequestMode}` : ''}. Local agent tools such as meal logging, local data reads, and dynamic plan suggestions did not run.)`
        : ''

      return {
        assistantMessage: `${response.content.trim() || (settings.language === 'zh' ? '喵~ 我处理好了，不过这次没有拿到文字回复。' : 'Done, but I did not receive a text reply this time.')}${fallbackNote}`,
        assistantRemoteTranscript: assistantTurnTranscript.length > 0 ? assistantTurnTranscript : undefined,
      }
    }

    usedToolCalls = true
    const currentSignature = buildToolCallSignature(response.toolCalls)
    if (previousToolCallSignature === currentSignature) {
      throw new Error(settings.language === 'zh'
        ? '模型重复发起了同一组工具调用，当前渠道大概率不兼容完整的 tool-call 循环。'
        : 'The model repeated the same tool calls. This provider is likely incompatible with the full tool-call loop.')
    }
    previousToolCallSignature = currentSignature

    for (const toolCall of response.toolCalls) {
      const result = await executeToolCall(toolCall, { ...options, language: settings.language })
      options.onToolFinished?.({ toolCall, result })
      const toolMessage: RemoteChatMessage = {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: stringifyToolResult(result),
      }
      request.messages.push(toolMessage)
      assistantTurnTranscript.push(toolMessage)
    }
  }

  throw new Error(settings.language === 'zh'
    ? '工具调用轮数超出上限，请换一种说法再试一次。'
    : 'Tool-call rounds exceeded the limit. Please rephrase and try again.')
}
