export type AgentProvider = 'deepseek' | 'qwen' | 'custom'

export interface AgentProviderPreset {
  id: AgentProvider
  name: string
  description: string
  defaultBaseUrl: string
  defaultModel: string
}

export const AGENT_PROVIDER_PRESETS: Record<AgentProvider, AgentProviderPreset> = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: '默认走 DeepSeek 的 OpenAI 兼容 Chat Completions 接口。',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
  },
  qwen: {
    id: 'qwen',
    name: '通义千问',
    description: '默认走阿里云百炼的 OpenAI 兼容 Chat Completions 接口。',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
  },
  custom: {
    id: 'custom',
    name: '自定义兼容接口',
    description: '适用于其他兼容 OpenAI Chat Completions 的模型服务。',
    defaultBaseUrl: '',
    defaultModel: '',
  },
}

export interface AgentConnectionSettings {
  provider: AgentProvider
  apiBaseUrl: string
  model: string
  toolCompatibility: AgentToolCompatibilityMode
}

export type AgentToolCompatibilityMode =
  | 'auto'
  | 'openai_tools'
  | 'openai_tools_no_choice'
  | 'legacy_functions'
  | 'plain_chat'

export type ResolvedToolCompatibilityMode = Exclude<AgentToolCompatibilityMode, 'auto'>

export const DEFAULT_AGENT_SETTINGS: AgentConnectionSettings = {
  provider: 'deepseek',
  apiBaseUrl: AGENT_PROVIDER_PRESETS.deepseek.defaultBaseUrl,
  model: AGENT_PROVIDER_PRESETS.deepseek.defaultModel,
  toolCompatibility: 'auto',
}

export function normalizeAgentSettings(
  settings?: Partial<AgentConnectionSettings> | null,
): AgentConnectionSettings {
  const provider = settings?.provider ?? DEFAULT_AGENT_SETTINGS.provider
  const preset = AGENT_PROVIDER_PRESETS[provider]
  const apiBaseUrl = settings?.apiBaseUrl?.trim() ?? ''
  const model = settings?.model?.trim() ?? ''
  const usePresetDefaults = provider !== 'custom'

  return {
    provider,
    apiBaseUrl: apiBaseUrl || (usePresetDefaults ? preset.defaultBaseUrl : ''),
    model: model || (usePresetDefaults ? preset.defaultModel : ''),
    toolCompatibility: settings?.toolCompatibility ?? DEFAULT_AGENT_SETTINGS.toolCompatibility,
  }
}

export interface AgentToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface RemoteToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string | Record<string, unknown>
  }
}

export type RemoteChatRole = 'system' | 'user' | 'assistant' | 'tool' | 'function'

export interface RemoteChatMessage {
  role: RemoteChatRole
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: RemoteToolCall[]
  reasoning_content?: string | null
  function_call?: {
    name?: string
    arguments?: string | Record<string, unknown>
  }
}

export interface AgentToolInvocation {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface AgentChatRequest {
  settings: AgentConnectionSettings
  messages: RemoteChatMessage[]
  tools: AgentToolDefinition[]
  temperature?: number
  maxTokens?: number
}

export interface AgentChatResponse {
  content: string
  toolCalls: AgentToolInvocation[]
  assistantMessage: RemoteChatMessage
  model?: string
  usage?: AgentTokenUsage
  toolFallback?: boolean
  toolRequestMode?: ResolvedToolCompatibilityMode
}

export interface ApiKeyStatusResponse {
  configured: boolean
}

export interface SaveApiKeyRequest {
  provider: AgentProvider
  apiKey: string
}

export type AgentRequestPurpose = 'chat' | 'diagnostics'

export interface AgentTokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface AgentUsageRecord {
  id: string
  timestamp: string
  provider: AgentProvider
  providerName: string
  model: string
  purpose: AgentRequestPurpose
  endpoint: string
  usage: AgentTokenUsage
  usageAvailable: boolean
}

export interface AgentUsageModelSummary {
  key: string
  provider: AgentProvider
  providerName: string
  model: string
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AgentUsageStatsResponse {
  totalCalls: number
  chatCalls: number
  diagnosticCalls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  usageAvailableCalls: number
  firstRecordedAt?: string
  latestRecordedAt?: string
  byModel: AgentUsageModelSummary[]
  recentRecords: AgentUsageRecord[]
}

export interface DesktopNotificationRequest {
  title: string
  body: string
  silent?: boolean
  urgency?: 'normal' | 'critical' | 'low'
  /** Target page to navigate to when the notification is clicked */
  page?: 'diet-log' | 'chat' | 'home'
}

export interface DesktopNotificationResponse {
  supported: boolean
  shown: boolean
  reason?: string
}

export type AgentErrorCode =
  | 'auth_failed'
  | 'endpoint_unreachable'
  | 'model_not_found'
  | 'tool_calls_unsupported'
  | 'timeout'
  | 'invalid_response'
  | 'bad_request'
  | 'unknown'

export interface AgentErrorInfo {
  code: AgentErrorCode
  message: string
  status?: number
  retryable?: boolean
}

export type AgentDiagnosticStatus = 'success' | 'failed' | 'warning' | 'not_run'

export interface AgentDiagnosticResult {
  status: AgentDiagnosticStatus
  title: string
  message: string
  finishReason?: string | null
  preview?: string
  toolCallsCount?: number
  toolRequestMode?: ResolvedToolCompatibilityMode
  error?: AgentErrorInfo
}

export interface AgentDiagnosticsResponse {
  provider: AgentProvider
  providerName: string
  endpoint: string
  resolvedEndpoint: string
  model: string
  apiKeyConfigured: boolean
  checkedAt: string
  plainChat: AgentDiagnosticResult
  toolCall: AgentDiagnosticResult
}

export interface AgentBridge {
  getApiKeyStatus(provider: AgentProvider): Promise<ApiKeyStatusResponse>
  saveApiKey(request: SaveApiKeyRequest): Promise<ApiKeyStatusResponse>
  clearApiKey(provider: AgentProvider): Promise<ApiKeyStatusResponse>
  chatCompletions(request: AgentChatRequest): Promise<AgentChatResponse>
  runDiagnostics(settings: AgentConnectionSettings): Promise<AgentDiagnosticsResponse>
  getUsageStats(): Promise<AgentUsageStatsResponse>
  clearUsageStats(): Promise<AgentUsageStatsResponse>
  showNotification(request: DesktopNotificationRequest): Promise<DesktopNotificationResponse>
}
