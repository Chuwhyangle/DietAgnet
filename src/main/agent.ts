import { app, BrowserWindow, ipcMain, Notification, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import {
  AGENT_PROVIDER_PRESETS,
  normalizeAgentSettings,
  type AgentToolDefinition,
  type AgentChatRequest,
  type AgentChatResponse,
  type AgentConnectionSettings,
  type AgentDiagnosticResult,
  type AgentDiagnosticsResponse,
  type AgentErrorCode,
  type AgentErrorInfo,
  type AgentRequestPurpose,
  type AgentTokenUsage,
  type AgentUsageModelSummary,
  type AgentUsageRecord,
  type AgentUsageStatsResponse,
  type AgentProvider,
  type ApiKeyStatusResponse,
  type DesktopNotificationRequest,
  type DesktopNotificationResponse,
  type RemoteChatMessage,
  type RemoteToolCall,
  type ResolvedToolCompatibilityMode,
  type SaveApiKeyRequest,
} from '../shared/agent'

const CHANNELS = {
  getApiKeyStatus: 'agent:get-api-key-status',
  saveApiKey: 'agent:save-api-key',
  clearApiKey: 'agent:clear-api-key',
  chatCompletions: 'agent:chat-completions',
  runDiagnostics: 'agent:run-diagnostics',
  getUsageStats: 'agent:get-usage-stats',
  clearUsageStats: 'agent:clear-usage-stats',
  showNotification: 'agent:show-notification',
} as const

interface SecureConfigFile {
  version: 1
  encrypted: true
  apiKeys: Partial<Record<AgentProvider, string>>
}

interface UsageStatsFile {
  version: 1
  records: AgentUsageRecord[]
}

interface RemoteChatCompletionResponse {
  id?: string
  model?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  choices?: Array<{
    finish_reason?: string | null
    message?: {
      role?: 'assistant'
      content?: string | null | Array<{ text?: string | { value?: string }; type?: string }>
      reasoning_content?: string | null | Array<{ text?: string | { value?: string }; type?: string }>
      tool_calls?: RemoteToolCall[]
      function_call?: {
        name?: string
        arguments?: string | Record<string, unknown>
      }
    }
  }>
  error?: {
    message?: string
  }
}

interface RequestExecutionResult {
  payload: RemoteChatCompletionResponse
}

const MAX_USAGE_RECORDS = 500
const customToolCompatibilityCache = new Map<string, ResolvedToolCompatibilityMode>()

class AgentRequestError extends Error {
  info: AgentErrorInfo

  constructor(info: AgentErrorInfo) {
    super(info.message)
    this.name = 'AgentRequestError'
    this.info = info
  }
}

function getSecureConfigPath(): string {
  return join(app.getPath('userData'), 'secure-config.json')
}

function getUsageStatsPath(): string {
  return join(app.getPath('userData'), 'agent-usage-stats.json')
}

function readUsageRecords(): AgentUsageRecord[] {
  const statsPath = getUsageStatsPath()
  if (!existsSync(statsPath)) {
    return []
  }

  try {
    const raw = readFileSync(statsPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<UsageStatsFile>
    return Array.isArray(parsed.records) ? parsed.records : []
  } catch (error) {
    console.error('Failed to read usage stats:', error)
    return []
  }
}

function writeUsageRecords(records: AgentUsageRecord[]): void {
  const statsPath = getUsageStatsPath()
  mkdirSync(dirname(statsPath), { recursive: true })
  writeFileSync(
    statsPath,
    JSON.stringify(
      {
        version: 1,
        records: records.slice(0, MAX_USAGE_RECORDS),
      } satisfies UsageStatsFile,
      null,
      2,
    ),
    'utf8',
  )
}

function normalizeUsage(usage: RemoteChatCompletionResponse['usage']): AgentTokenUsage {
  if (!usage) {
    return {}
  }

  return {
    promptTokens: usage.prompt_tokens ?? usage.promptTokens,
    completionTokens: usage.completion_tokens ?? usage.completionTokens,
    totalTokens: usage.total_tokens ?? usage.totalTokens,
  }
}

function hasUsageData(usage: AgentTokenUsage): boolean {
  return [usage.promptTokens, usage.completionTokens, usage.totalTokens].some((value) => typeof value === 'number')
}

function recordUsage(params: {
  settings: AgentConnectionSettings
  purpose: AgentRequestPurpose
  endpoint: string
  payload: RemoteChatCompletionResponse
}): void {
  const usage = normalizeUsage(params.payload.usage)
  const model = params.payload.model || params.settings.model
  const record: AgentUsageRecord = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    provider: params.settings.provider,
    providerName: AGENT_PROVIDER_PRESETS[params.settings.provider].name,
    model,
    purpose: params.purpose,
    endpoint: params.endpoint,
    usage,
    usageAvailable: hasUsageData(usage),
  }

  writeUsageRecords([record, ...readUsageRecords()].slice(0, MAX_USAGE_RECORDS))
}

function buildUsageStats(records = readUsageRecords()): AgentUsageStatsResponse {
  const byModel = new Map<string, AgentUsageModelSummary>()
  const totals = records.reduce(
    (summary, record) => {
      const promptTokens = record.usage.promptTokens ?? 0
      const completionTokens = record.usage.completionTokens ?? 0
      const totalTokens = record.usage.totalTokens ?? promptTokens + completionTokens
      const modelKey = `${record.provider}:${record.model}`
      const modelSummary = byModel.get(modelKey) ?? {
        key: modelKey,
        provider: record.provider,
        providerName: record.providerName,
        model: record.model,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }

      modelSummary.calls += 1
      modelSummary.promptTokens += promptTokens
      modelSummary.completionTokens += completionTokens
      modelSummary.totalTokens += totalTokens
      byModel.set(modelKey, modelSummary)

      summary.totalCalls += 1
      summary.chatCalls += record.purpose === 'chat' ? 1 : 0
      summary.diagnosticCalls += record.purpose === 'diagnostics' ? 1 : 0
      summary.promptTokens += promptTokens
      summary.completionTokens += completionTokens
      summary.totalTokens += totalTokens
      summary.usageAvailableCalls += record.usageAvailable ? 1 : 0

      return summary
    },
    {
      totalCalls: 0,
      chatCalls: 0,
      diagnosticCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      usageAvailableCalls: 0,
    },
  )

  return {
    ...totals,
    firstRecordedAt: records.length > 0 ? records[records.length - 1].timestamp : undefined,
    latestRecordedAt: records[0]?.timestamp,
    byModel: Array.from(byModel.values()).sort((left, right) => right.calls - left.calls),
    recentRecords: records.slice(0, 20),
  }
}

function showDesktopNotification(request: DesktopNotificationRequest): DesktopNotificationResponse {
  if (!Notification.isSupported()) {
    return {
      supported: false,
      shown: false,
      reason: 'system_notifications_not_supported',
    }
  }

  const title = request.title.trim()
  const body = request.body.trim()

  if (!title || !body) {
    return {
      supported: true,
      shown: false,
      reason: 'empty_notification',
    }
  }

  const notification = new Notification({
    title,
    body,
    silent: request.silent,
    urgency: request.urgency,
  })

  notification.on('click', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) {
        window.restore()
      }
      window.show()
      window.focus()

      // Route to the target page if specified
      if (request.page) {
        window.webContents.send('coaching:notification-clicked', request.page)
      }
    }
  })

  notification.show()

  return {
    supported: true,
    shown: true,
  }
}

function ensureEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统不支持安全加密存储，暂时无法保存 API Key。')
  }
}

function readSecureConfig(): SecureConfigFile {
  ensureEncryptionAvailable()

  const configPath = getSecureConfigPath()
  if (!existsSync(configPath)) {
    return {
      version: 1,
      encrypted: true,
      apiKeys: {},
    }
  }

  try {
    const raw = readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw) as SecureConfigFile
    return {
      version: 1,
      encrypted: true,
      apiKeys: parsed.apiKeys ?? {},
    }
  } catch (error) {
    console.error('Failed to read secure config:', error)
    return {
      version: 1,
      encrypted: true,
      apiKeys: {},
    }
  }
}

function writeSecureConfig(config: SecureConfigFile): void {
  ensureEncryptionAvailable()

  const configPath = getSecureConfigPath()
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
}

function encryptSecret(value: string): string {
  return safeStorage.encryptString(value).toString('base64')
}

function decryptSecret(value: string): string {
  return safeStorage.decryptString(Buffer.from(value, 'base64'))
}

function getApiKey(provider: AgentProvider): string | null {
  const config = readSecureConfig()
  const storedValue = config.apiKeys[provider]
  if (storedValue) {
    try {
      return decryptSecret(storedValue)
    } catch (error) {
      console.error('Failed to decrypt API key:', error)
    }
  }

  return null
}

function saveApiKey({ provider, apiKey }: SaveApiKeyRequest): ApiKeyStatusResponse {
  const config = readSecureConfig()
  const trimmedKey = apiKey.trim()

  if (trimmedKey) {
    config.apiKeys[provider] = encryptSecret(trimmedKey)
  } else {
    delete config.apiKeys[provider]
  }

  writeSecureConfig(config)

  return {
    configured: Boolean(config.apiKeys[provider]),
  }
}

function clearApiKey(provider: AgentProvider): ApiKeyStatusResponse {
  const config = readSecureConfig()
  delete config.apiKeys[provider]
  writeSecureConfig(config)

  return { configured: false }
}

function getApiKeyStatus(provider: AgentProvider): ApiKeyStatusResponse {
  return { configured: Boolean(getApiKey(provider)) }
}

function extractTextContent(content: RemoteChatCompletionResponse['choices'][number]['message']['content']): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part?.text === 'string') {
          return part.text
        }

        if (typeof part?.text === 'object' && part?.text && 'value' in part.text) {
          return part.text.value ?? ''
        }

        return ''
      })
      .filter((text) => Boolean(text))
      .join('\n')
      .trim()
  }

  return ''
}

function normalizeToolCalls(
  message: RemoteChatCompletionResponse['choices'][number]['message'] | undefined,
): RemoteToolCall[] {
  if (!message) {
    return []
  }

  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    return message.tool_calls
  }

  if (message.function_call?.name) {
    return [
      {
        id: `function-call-${Date.now()}`,
        type: 'function',
        function: {
          name: message.function_call.name,
          arguments: message.function_call.arguments ?? '{}',
        },
      },
    ]
  }

  return []
}

function parseToolArguments(rawArguments: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!rawArguments) {
    return {}
  }

  if (typeof rawArguments === 'object') {
    return rawArguments
  }

  const trimmed = rawArguments.trim()
  if (!trimmed) {
    return {}
  }

  return JSON.parse(trimmed) as Record<string, unknown>
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function serializeFunctionArguments(rawArguments: string | Record<string, unknown> | undefined): string {
  if (!rawArguments) {
    return '{}'
  }

  if (typeof rawArguments === 'string') {
    return rawArguments
  }

  return JSON.stringify(rawArguments)
}

function normalizeMessageContent(content: string | null | undefined): string {
  return typeof content === 'string' ? content : ''
}

function extractOptionalTextContent(
  content:
    | string
    | null
    | undefined
    | Array<{ text?: string | { value?: string }; type?: string }>,
): string | null {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part?.text === 'string') {
          return part.text
        }

        if (typeof part?.text === 'object' && part?.text && 'value' in part.text) {
          return part.text.value ?? ''
        }

        return ''
      })
      .filter((item) => Boolean(item))
      .join('\n')
      .trim()

    return text || null
  }

  return null
}

function sanitizeMessagesForRemote(messages: RemoteChatMessage[]): RemoteChatMessage[] {
  return messages.map((message) => {
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: normalizeMessageContent(message.content),
        reasoning_content: message.reasoning_content ?? undefined,
        tool_calls: Array.isArray(message.tool_calls) && message.tool_calls.length > 0
          ? message.tool_calls
          : undefined,
        function_call: message.function_call,
      }
    }

    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.tool_call_id,
        content: normalizeMessageContent(message.content),
      }
    }

    if (message.role === 'function') {
      return {
        role: 'function',
        name: message.name,
        content: normalizeMessageContent(message.content),
      }
    }

    return {
      role: message.role,
      content: normalizeMessageContent(message.content),
      name: message.name,
    }
  })
}

function compactJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => compactJsonSchema(item))
  }

  if (!schema || typeof schema !== 'object') {
    return schema
  }

  const source = schema as Record<string, unknown>
  const next: Record<string, unknown> = {}

  if ('type' in source) {
    next.type = source.type
  }

  if (Array.isArray(source.enum) && source.enum.length > 0) {
    next.enum = source.enum
  }

  if (Array.isArray(source.required) && source.required.length > 0) {
    next.required = source.required
  }

  if ('items' in source) {
    next.items = compactJsonSchema(source.items)
  }

  if (
    'properties' in source &&
    source.properties &&
    typeof source.properties === 'object' &&
    !Array.isArray(source.properties)
  ) {
    next.properties = Object.fromEntries(
      Object.entries(source.properties).map(([key, value]) => [key, compactJsonSchema(value)]),
    )
  }

  if (typeof source.additionalProperties === 'boolean') {
    next.additionalProperties = source.additionalProperties
  }

  if (typeof source.minimum === 'number') {
    next.minimum = source.minimum
  }

  if (typeof source.maximum === 'number') {
    next.maximum = source.maximum
  }

  if (typeof source.minItems === 'number') {
    next.minItems = source.minItems
  }

  if (typeof source.maxItems === 'number') {
    next.maxItems = source.maxItems
  }

  return next
}

function compactToolDefinition(tool: AgentToolDefinition): AgentToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: compactJsonSchema(tool.function.parameters) as Record<string, unknown>,
    },
  }
}

function normalizeToolsForRemote(
  settings: AgentConnectionSettings,
  tools: AgentToolDefinition[] | undefined,
): AgentToolDefinition[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined
  }

  if (settings.provider !== 'custom') {
    return tools
  }

  return tools.map(compactToolDefinition)
}

function canTransformMessagesForLegacyFunctions(messages: RemoteChatMessage[]): boolean {
  return messages.every((message) => !message.tool_calls || message.tool_calls.length <= 1)
}

function transformMessagesForLegacyFunctions(messages: RemoteChatMessage[]): RemoteChatMessage[] {
  return messages
    .map((message) => {
      if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        const [firstToolCall] = message.tool_calls

        return {
          role: 'assistant',
          content: normalizeMessageContent(message.content),
          reasoning_content: message.reasoning_content ?? undefined,
          function_call: {
            name: firstToolCall.function.name,
            arguments: serializeFunctionArguments(firstToolCall.function.arguments),
          },
        }
      }

      if (message.role === 'tool') {
        return {
          role: 'function',
          name: message.name,
          content: normalizeMessageContent(message.content),
        }
      }

      return {
        ...message,
        content: normalizeMessageContent(message.content),
      }
    })
}

function resolveChatCompletionsEndpoint(baseUrl: string): string {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl.trim())

  if (/\/chat\/completions$/i.test(normalizedBaseUrl)) {
    return normalizedBaseUrl
  }

  return `${normalizedBaseUrl}/chat/completions`
}

function getToolCompatibilityCacheKey(settings: AgentConnectionSettings): string {
  return `${resolveChatCompletionsEndpoint(settings.apiBaseUrl).toLowerCase()}::${settings.model.trim().toLowerCase()}`
}

function buildAgentErrorInfo(params: {
  code: AgentErrorCode
  provider: AgentProvider
  status?: number
  responseMessage?: string
  fallbackMessage?: string
}): AgentErrorInfo {
  const { code, provider, status, responseMessage, fallbackMessage } = params
  const providerName = AGENT_PROVIDER_PRESETS[provider].name
  const remoteMessage = responseMessage?.trim()

  switch (code) {
    case 'auth_failed':
      return {
        code,
        status,
        retryable: false,
        message: `${providerName} 认证失败：API Key 无效、已过期，或当前渠道不接受这把密钥。${remoteMessage ? ` 远端返回：${remoteMessage}` : ''}`,
      }
    case 'endpoint_unreachable':
      return {
        code,
        status,
        retryable: true,
        message: `${providerName} endpoint 不可达：请检查 Base URL / Endpoint 是否正确、网络是否可用。${remoteMessage ? ` 远端返回：${remoteMessage}` : ''}`,
      }
    case 'model_not_found':
      return {
        code,
        status,
        retryable: false,
        message: `${providerName} 模型不存在：请检查当前模型名称是否正确，或该渠道是否支持这个模型。${remoteMessage ? ` 远端返回：${remoteMessage}` : ''}`,
      }
    case 'tool_calls_unsupported':
      return {
        code,
        status,
        retryable: false,
        message: `${providerName} 不支持 tool calls：当前渠道/模型可以聊天，但没有兼容当前项目需要的工具调用协议。${remoteMessage ? ` 远端返回：${remoteMessage}` : ''}`,
      }
    case 'timeout':
      return {
        code,
        status,
        retryable: true,
        message: `${providerName} 请求超时：请检查网络质量、渠道稳定性，或更换响应更快的模型。${remoteMessage ? ` 远端返回：${remoteMessage}` : ''}`,
      }
    case 'invalid_response':
      return {
        code,
        status,
        retryable: false,
        message: `${providerName} 返回了非兼容响应：当前接口不是标准的 OpenAI Chat Completions 兼容格式。${remoteMessage ? ` 远端返回：${remoteMessage}` : ''}`,
      }
    case 'bad_request':
      return {
        code,
        status,
        retryable: false,
        message: `${providerName} 请求参数无效：请检查 endpoint、model 或请求兼容性。${remoteMessage ? ` 远端返回：${remoteMessage}` : ''}`,
      }
    default:
      return {
        code: 'unknown',
        status,
        retryable: false,
        message: `${providerName} 请求失败。${remoteMessage ? ` 远端返回：${remoteMessage}` : fallbackMessage ? ` ${fallbackMessage}` : ''}`,
      }
  }
}

function detectErrorCode(params: {
  status?: number
  responseMessage?: string
  cause?: unknown
}): AgentErrorCode {
  const normalizedMessage = params.responseMessage?.toLowerCase() ?? ''
  const causeMessage = params.cause instanceof Error ? params.cause.message.toLowerCase() : ''

  if (params.cause instanceof Error && params.cause.name === 'AbortError') {
    return 'timeout'
  }

  if (
    params.status === 401 ||
    params.status === 403 ||
    /unauthorized|authentication|auth failed|invalid api key|api key|forbidden|permission denied/.test(normalizedMessage)
  ) {
    return 'auth_failed'
  }

  if (/model.*not found|unknown model|does not exist|invalid model|unsupported model|no such model/.test(normalizedMessage)) {
    return 'model_not_found'
  }

  if (/tool_calls|tool call|tool use|function call|function calling|tools not supported|unsupported tools/.test(normalizedMessage)) {
    return 'tool_calls_unsupported'
  }

  if (
    params.status === 404 ||
    /enotfound|econnrefused|fetch failed|network|tls|ssl|certificate|socket|connect|refused/.test(causeMessage)
  ) {
    return 'endpoint_unreachable'
  }

  if (params.status === 400 || params.status === 422) {
    return 'bad_request'
  }

  return 'unknown'
}

function isRemoteParamIncorrect(error: AgentRequestError): boolean {
  const message = error.info.message.toLowerCase()
  return error.info.status === 400 &&
    /param incorrect|parameter|invalid.*param|bad request|tools|tool_choice|function/.test(message)
}

function stripToolMessages(messages: RemoteChatMessage[]): RemoteChatMessage[] {
  return messages
    .filter((message) => message.role !== 'tool' && message.role !== 'function')
    .map((message) => {
      if (message.role !== 'assistant' || (!message.tool_calls && !message.function_call)) {
        return message
      }

      return {
        role: 'assistant',
        content: message.content ?? '',
      }
    })
}

function shouldRetryWithAlternateToolMode(error: AgentRequestError): boolean {
  return error.info.code === 'tool_calls_unsupported' ||
    error.info.status === 400 ||
    error.info.status === 422 ||
    isRemoteParamIncorrect(error)
}

function getToolCompatibilityCandidates(
  settings: AgentConnectionSettings,
  messages: RemoteChatMessage[],
  hasTools: boolean,
): ResolvedToolCompatibilityMode[] {
  if (!hasTools) {
    return ['plain_chat']
  }

  if (settings.provider !== 'custom') {
    return ['openai_tools']
  }

  if (settings.toolCompatibility === 'plain_chat') {
    return ['plain_chat']
  }

  const candidates: ResolvedToolCompatibilityMode[] = []
  const seen = new Set<ResolvedToolCompatibilityMode>()
  const addCandidate = (mode: ResolvedToolCompatibilityMode): void => {
    if (seen.has(mode)) {
      return
    }

    if (mode === 'legacy_functions' && !canTransformMessagesForLegacyFunctions(messages)) {
      return
    }

    seen.add(mode)
    candidates.push(mode)
  }

  if (settings.toolCompatibility !== 'auto') {
    addCandidate(settings.toolCompatibility)
    if (settings.toolCompatibility !== 'plain_chat') {
      addCandidate('plain_chat')
    }
    return candidates
  }

  const cachedMode = customToolCompatibilityCache.get(getToolCompatibilityCacheKey(settings))
  if (cachedMode && cachedMode !== 'plain_chat') {
    addCandidate(cachedMode)
  }

  addCandidate('openai_tools')
  addCandidate('openai_tools_no_choice')
  addCandidate('legacy_functions')
  addCandidate('plain_chat')

  return candidates
}

function toAgentRequestError(params: {
  provider: AgentProvider
  status?: number
  responseMessage?: string
  cause?: unknown
  fallbackMessage?: string
}): AgentRequestError {
  const code = detectErrorCode(params)
  return new AgentRequestError(
    buildAgentErrorInfo({
      code,
      provider: params.provider,
      status: params.status,
      responseMessage: params.responseMessage,
      fallbackMessage: params.fallbackMessage,
    }),
  )
}

async function readJsonPayload(response: Response): Promise<RemoteChatCompletionResponse> {
  const rawText = await response.text()

  if (!rawText.trim()) {
    return {}
  }

  try {
    return JSON.parse(rawText) as RemoteChatCompletionResponse
  } catch (error) {
    console.error('Failed to parse remote response:', error, rawText)
    throw new AgentRequestError({
      code: 'invalid_response',
      retryable: false,
      message: `模型接口返回了非 JSON 响应：${rawText.slice(0, 200)}`,
    })
  }
}

async function executeChatCompletionRequest(params: {
  settings: AgentConnectionSettings
  apiKey: string
  messages: RemoteChatMessage[]
  tools?: AgentChatRequest['tools']
  temperature?: number
  maxTokens?: number
  purpose?: AgentRequestPurpose
  toolMode?: ResolvedToolCompatibilityMode
}): Promise<RequestExecutionResult> {
  const endpoint = resolveChatCompletionsEndpoint(params.settings.apiBaseUrl)
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 45000)

  let response: Response

  try {
    const toolMode = params.toolMode ?? (params.tools && params.tools.length > 0 ? 'openai_tools' : 'plain_chat')
    const tools = normalizeToolsForRemote(params.settings, params.tools)
    const requestMessages = toolMode === 'legacy_functions'
      ? sanitizeMessagesForRemote(transformMessagesForLegacyFunctions(params.messages))
      : toolMode === 'plain_chat'
        ? sanitizeMessagesForRemote(stripToolMessages(params.messages))
        : sanitizeMessagesForRemote(params.messages)
    const body: Record<string, unknown> = {
      model: params.settings.model,
      messages: requestMessages,
    }

    if (typeof params.temperature === 'number') {
      body.temperature = params.temperature
    }

    if (typeof params.maxTokens === 'number') {
      body.max_tokens = params.maxTokens
    }

    if (toolMode === 'openai_tools' && tools) {
      body.tools = tools
      body.tool_choice = 'auto'
    } else if (toolMode === 'openai_tools_no_choice' && tools) {
      body.tools = tools
    } else if (toolMode === 'legacy_functions' && tools) {
      body.functions = tools.map((tool) => tool.function)
      body.function_call = 'auto'
    }

    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: abortController.signal,
    })
  } catch (error) {
    throw toAgentRequestError({
      provider: params.settings.provider,
      cause: error,
      fallbackMessage: '请求没有成功发出。',
    })
  } finally {
    clearTimeout(timeout)
  }

  let payload: RemoteChatCompletionResponse

  try {
    payload = await readJsonPayload(response)
  } catch (error) {
    if (error instanceof AgentRequestError) {
      throw new AgentRequestError(
        buildAgentErrorInfo({
          code: error.info.code,
          provider: params.settings.provider,
          responseMessage: error.message,
        }),
      )
    }

    throw toAgentRequestError({
      provider: params.settings.provider,
      cause: error,
      fallbackMessage: '无法解析接口响应。',
    })
  }

  if (!response.ok) {
    throw toAgentRequestError({
      provider: params.settings.provider,
      status: response.status,
      responseMessage: payload.error?.message ?? response.statusText,
      fallbackMessage: '远端返回了错误状态码。',
    })
  }

  recordUsage({
    settings: params.settings,
    purpose: params.purpose ?? 'chat',
    endpoint,
    payload,
  })

  return { payload }
}

async function executeCompatibleChatCompletionRequest(params: {
  settings: AgentConnectionSettings
  apiKey: string
  messages: RemoteChatMessage[]
  tools?: AgentToolDefinition[]
  temperature?: number
  maxTokens?: number
  purpose?: AgentRequestPurpose
}): Promise<RequestExecutionResult & {
  toolFallback: boolean
  toolRequestMode: ResolvedToolCompatibilityMode
}> {
  const candidates = getToolCompatibilityCandidates(
    params.settings,
    params.messages,
    Boolean(params.tools && params.tools.length > 0),
  )

  let lastError: AgentRequestError | null = null

  for (const toolRequestMode of candidates) {
    try {
      const result = await executeChatCompletionRequest({
        ...params,
        toolMode: toolRequestMode,
      })

      if (
        params.settings.provider === 'custom' &&
        params.tools &&
        params.tools.length > 0 &&
        toolRequestMode !== 'plain_chat'
      ) {
        customToolCompatibilityCache.set(getToolCompatibilityCacheKey(params.settings), toolRequestMode)
      }

      return {
        ...result,
        toolFallback: toolRequestMode === 'plain_chat' && Boolean(params.tools && params.tools.length > 0),
        toolRequestMode,
      }
    } catch (error) {
      if (
        !(error instanceof AgentRequestError) ||
        toolRequestMode === 'plain_chat' ||
        !params.tools ||
        params.tools.length === 0 ||
        !shouldRetryWithAlternateToolMode(error)
      ) {
        throw error
      }

      lastError = error
    }
  }

  if (lastError) {
    throw lastError
  }

  throw new Error('未能完成兼容请求。')
}

function buildDiagnosticResult(params: {
  status: AgentDiagnosticResult['status']
  title: string
  message: string
  finishReason?: string | null
  preview?: string
  toolCallsCount?: number
  toolRequestMode?: ResolvedToolCompatibilityMode
  error?: AgentErrorInfo
}): AgentDiagnosticResult {
  return {
    status: params.status,
    title: params.title,
    message: params.message,
    finishReason: params.finishReason,
    preview: params.preview,
    toolCallsCount: params.toolCallsCount,
    toolRequestMode: params.toolRequestMode,
    error: params.error,
  }
}

async function runDiagnostics(settings: AgentConnectionSettings): Promise<AgentDiagnosticsResponse> {
  const normalizedSettings = normalizeAgentSettings(settings)
  const apiKey = getApiKey(normalizedSettings.provider)
  const providerName = AGENT_PROVIDER_PRESETS[normalizedSettings.provider].name
  const resolvedEndpoint = normalizedSettings.apiBaseUrl
    ? resolveChatCompletionsEndpoint(normalizedSettings.apiBaseUrl)
    : ''

  const diagnostics: AgentDiagnosticsResponse = {
    provider: normalizedSettings.provider,
    providerName,
    endpoint: normalizedSettings.apiBaseUrl,
    resolvedEndpoint,
    model: normalizedSettings.model,
    apiKeyConfigured: Boolean(apiKey),
    checkedAt: new Date().toISOString(),
    plainChat: buildDiagnosticResult({
      status: 'not_run',
      title: '聊天测试',
      message: '尚未执行测试。',
    }),
    toolCall: buildDiagnosticResult({
      status: 'not_run',
      title: 'Tool 调用测试',
      message: '尚未执行测试。',
    }),
  }

  if (!apiKey) {
    const error = buildAgentErrorInfo({
      code: 'auth_failed',
      provider: normalizedSettings.provider,
      fallbackMessage: '当前 provider 没有保存 API Key。',
    })

    diagnostics.plainChat = buildDiagnosticResult({
      status: 'not_run',
      title: '聊天测试',
      message: '未执行：当前 provider 没有已保存的 API Key。',
      error,
    })
    diagnostics.toolCall = buildDiagnosticResult({
      status: 'not_run',
      title: 'Tool 调用测试',
      message: '未执行：当前 provider 没有已保存的 API Key。',
      error,
    })

    return diagnostics
  }

  try {
    const plainChatResult = await executeChatCompletionRequest({
      settings: normalizedSettings,
      apiKey,
      messages: [
        {
          role: 'user',
          content: '请只回复：pong',
        },
      ],
      maxTokens: 120,
      purpose: 'diagnostics',
    })
    const plainChoice = plainChatResult.payload.choices?.[0]
    diagnostics.plainChat = buildDiagnosticResult({
      status: 'success',
      title: '聊天测试',
      message: '聊天接口调用成功。',
      finishReason: plainChoice?.finish_reason ?? null,
      preview: extractTextContent(plainChoice?.message?.content),
      toolCallsCount: normalizeToolCalls(plainChoice?.message).length,
    })
  } catch (error) {
    const requestError = error instanceof AgentRequestError
      ? error
      : toAgentRequestError({
        provider: normalizedSettings.provider,
        cause: error,
        fallbackMessage: '聊天测试失败。',
      })

    diagnostics.plainChat = buildDiagnosticResult({
      status: 'failed',
      title: '聊天测试',
      message: requestError.info.message,
      error: requestError.info,
    })
    diagnostics.toolCall = buildDiagnosticResult({
      status: 'not_run',
      title: 'Tool 调用测试',
      message: '聊天测试未通过，已跳过 Tool 调用测试。',
      error: requestError.info,
    })

    return diagnostics
  }

  try {
    const toolDefinition: AgentChatRequest['tools'] = [
      {
        type: 'function',
        function: {
          name: 'get_today_nutrition',
          description: '获取今天的营养摄入汇总。',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
    ]

    const toolRoundOne = await executeCompatibleChatCompletionRequest({
      settings: normalizedSettings,
      apiKey,
      messages: [
        {
          role: 'system',
          content: '你是测试助手。用户要求时优先调用工具。',
        },
        {
          role: 'user',
          content: '请调用 get_today_nutrition 工具，然后简短说明。',
        },
      ],
      tools: toolDefinition,
      maxTokens: 240,
      purpose: 'diagnostics',
    })

    const firstChoice = toolRoundOne.payload.choices?.[0]
    const toolCalls = normalizeToolCalls(firstChoice?.message)

    if (toolCalls.length === 0) {
      const error = buildAgentErrorInfo({
        code: 'tool_calls_unsupported',
        provider: normalizedSettings.provider,
        responseMessage: extractTextContent(firstChoice?.message?.content) || '接口没有返回 tool_calls。',
      })

      diagnostics.toolCall = buildDiagnosticResult({
        status: 'warning',
        title: 'Tool 调用测试',
        message: error.message,
        finishReason: firstChoice?.finish_reason ?? null,
        preview: extractTextContent(firstChoice?.message?.content),
        toolRequestMode: toolRoundOne.toolRequestMode,
        error,
      })

      return diagnostics
    }

    const firstToolCall = toolCalls[0]
    const toolRoundTwo = await executeChatCompletionRequest({
      settings: normalizedSettings,
      apiKey,
      messages: toolRoundOne.toolRequestMode === 'legacy_functions'
        ? [
          {
            role: 'system',
            content: '你是测试助手。用户要求时优先调用工具。',
          },
          {
            role: 'user',
            content: '请调用 get_today_nutrition 工具，然后简短说明。',
          },
          {
            role: 'assistant',
            content: extractTextContent(firstChoice?.message?.content) || null,
            function_call: {
              name: firstToolCall.function.name,
              arguments: serializeFunctionArguments(firstToolCall.function.arguments),
            },
          },
          {
            role: 'function',
            name: firstToolCall.function.name,
            content: JSON.stringify({
              calories: 123,
              protein: 10,
              carbs: 20,
              fat: 3,
              mealCount: 1,
            }),
          },
        ]
        : [
        {
          role: 'system',
          content: '你是测试助手。用户要求时优先调用工具。',
        },
        {
          role: 'user',
          content: '请调用 get_today_nutrition 工具，然后简短说明。',
        },
        {
          role: 'assistant',
          content: extractTextContent(firstChoice?.message?.content) || null,
          reasoning_content: extractOptionalTextContent(firstChoice?.message?.reasoning_content),
          tool_calls: toolCalls,
        },
        {
          role: 'tool',
          tool_call_id: firstToolCall.id,
          content: JSON.stringify({
            calories: 123,
            protein: 10,
            carbs: 20,
            fat: 3,
            mealCount: 1,
          }),
        },
        ],
      tools: toolDefinition,
      maxTokens: 240,
      purpose: 'diagnostics',
      toolMode: toolRoundOne.toolRequestMode,
    })

    const secondChoice = toolRoundTwo.payload.choices?.[0]
    diagnostics.toolCall = buildDiagnosticResult({
      status: 'success',
      title: 'Tool 调用测试',
      message: 'Tool 调用闭环成功：模型已返回 tool_calls，并能消费工具结果继续生成回复。',
      finishReason: secondChoice?.finish_reason ?? null,
      preview: extractTextContent(secondChoice?.message?.content),
      toolCallsCount: toolCalls.length,
      toolRequestMode: toolRoundOne.toolRequestMode,
    })
  } catch (error) {
    const requestError = error instanceof AgentRequestError
      ? error
      : toAgentRequestError({
        provider: normalizedSettings.provider,
        cause: error,
        fallbackMessage: 'Tool 调用测试失败。',
      })

    diagnostics.toolCall = buildDiagnosticResult({
      status: requestError.info.code === 'tool_calls_unsupported' ? 'warning' : 'failed',
      title: 'Tool 调用测试',
      message: requestError.info.message,
      error: requestError.info,
    })
  }

  return diagnostics
}

export function registerAgentIpcHandlers(): void {
  Object.values(CHANNELS).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })

  ipcMain.handle(CHANNELS.getApiKeyStatus, (_event, provider: AgentProvider) => {
    return getApiKeyStatus(provider)
  })

  ipcMain.handle(CHANNELS.saveApiKey, (_event, request: SaveApiKeyRequest) => {
    return saveApiKey(request)
  })

  ipcMain.handle(CHANNELS.clearApiKey, (_event, provider: AgentProvider) => {
    return clearApiKey(provider)
  })

  ipcMain.handle(CHANNELS.chatCompletions, async (_event, request: AgentChatRequest): Promise<AgentChatResponse> => {
    const settings = normalizeAgentSettings(request.settings)
    const apiKey = getApiKey(settings.provider)

    if (!apiKey) {
      throw new Error(`请先在设置页配置 ${AGENT_PROVIDER_PRESETS[settings.provider].name} 的 API Key。`)
    }

    if (!settings.apiBaseUrl.trim() || !settings.model.trim()) {
      throw new Error('请先填写模型和 Base URL。')
    }

    const result = await executeCompatibleChatCompletionRequest({
      settings,
      apiKey,
      messages: request.messages,
      tools: request.tools,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      purpose: 'chat',
    })
    const payload = result.payload

    const choice = payload.choices?.[0]
    const normalizedToolCalls = normalizeToolCalls(choice?.message)
    const normalizedContent = extractTextContent(choice?.message?.content)
    const normalizedReasoningContent = extractOptionalTextContent(choice?.message?.reasoning_content)
    const assistantMessage: RemoteChatMessage = {
      role: 'assistant',
      content: normalizedToolCalls.length > 0 && !normalizedContent ? null : normalizedContent,
      reasoning_content: normalizedReasoningContent,
      tool_calls: normalizedToolCalls.length > 0 ? normalizedToolCalls : undefined,
    }

    if (!choice?.message) {
      throw new Error('模型没有返回有效消息。')
    }

    const toolCalls = normalizedToolCalls.map((toolCall) => {
      try {
        return {
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: parseToolArguments(toolCall.function.arguments),
        }
      } catch (error) {
        console.error('Failed to parse tool arguments:', error)
        return {
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: {},
        }
      }
    })

    return {
      content: assistantMessage.content ?? '',
      toolCalls,
      assistantMessage,
      model: payload.model,
      usage: normalizeUsage(payload.usage),
      toolFallback: result.toolFallback,
      toolRequestMode: result.toolRequestMode,
    }
  })

  ipcMain.handle(CHANNELS.runDiagnostics, async (_event, settings: AgentConnectionSettings) => {
    return runDiagnostics(settings)
  })

  ipcMain.handle(CHANNELS.getUsageStats, () => {
    return buildUsageStats()
  })

  ipcMain.handle(CHANNELS.clearUsageStats, () => {
    writeUsageRecords([])
    return buildUsageStats([])
  })

  ipcMain.handle(CHANNELS.showNotification, (_event, request: DesktopNotificationRequest) => {
    return showDesktopNotification(request)
  })
}
