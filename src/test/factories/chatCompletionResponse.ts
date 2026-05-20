/**
 * Chat-completion message and error factories for tests (task 2.6,
 * Requirements 2.1, 2.2, 2.3, 2.4).
 *
 * Production types live in `src/shared/agent.ts`:
 *
 *   - `RemoteChatMessage`  — wire-shape for one assistant / user / tool
 *                            message; assistants that call a tool set
 *                            `content: null` and populate `tool_calls`.
 *   - `RemoteToolCall`     — one entry inside `tool_calls`; the
 *                            `function.arguments` field is a
 *                            JSON-encoded string per OpenAI conventions.
 *   - `AgentErrorInfo`     — structured error returned by the
 *                            chat-completions IPC handler, keyed by
 *                            `AgentErrorCode`.
 *
 * The factories below build correctly-shaped instances of each so
 * controller / tool / IPC tests can script responses without redoing
 * the JSON serialization or remembering which fields nulls out.
 *
 *     makeAssistantMessage('已记录。')
 *     makeToolCallMessage('logFood', { food: 'apple' })
 *     makeAgentError('timeout')
 */

import type {
  AgentErrorCode,
  AgentErrorInfo,
  RemoteChatMessage,
  RemoteToolCall,
} from '../../shared/agent'

/**
 * Build a `RemoteChatMessage` with `role: 'assistant'` and the given
 * text content. `tool_calls` is omitted so the controller treats this
 * as a final reply.
 */
export function makeAssistantMessage(content: string): RemoteChatMessage {
  return {
    role: 'assistant',
    content,
  }
}

/**
 * Build a `RemoteChatMessage` with `role: 'assistant'`, `content: null`,
 * and a single `tool_calls` entry invoking the named tool with the
 * supplied arguments.
 *
 * Per OpenAI conventions the wire-level `function.arguments` is a
 * JSON-encoded string; this factory handles the serialization so
 * callers can pass a plain object.
 *
 *     makeToolCallMessage('logFood', { food: 'apple', servings: 1 })
 */
export function makeToolCallMessage(
  toolName: string,
  args: Record<string, unknown>,
): RemoteChatMessage {
  const toolCall: RemoteToolCall = {
    id: `call_${Math.random().toString(36).slice(2, 10)}`,
    type: 'function',
    function: {
      name: toolName,
      arguments: JSON.stringify(args),
    },
  }
  return {
    role: 'assistant',
    content: null,
    tool_calls: [toolCall],
  }
}

/**
 * Build a structured `AgentErrorInfo` for the given `AgentErrorCode`.
 *
 * Each known code gets a stable, human-readable default message
 * matching the wording used elsewhere in the test doubles
 * (`createMockChatCompletions`). The `retryable` flag is true for the
 * codes that production code retries — `endpoint_unreachable` and
 * `timeout` — and false otherwise. Tests that need a different
 * message or `retryable` value can spread an override on top.
 *
 *     makeAgentError('timeout')
 *     // → { code: 'timeout', message: '...', retryable: true }
 */
export function makeAgentError(code: AgentErrorCode): AgentErrorInfo {
  return {
    code,
    message: defaultMessageForCode(code),
    retryable: isRetryableCode(code),
  }
}

function defaultMessageForCode(code: AgentErrorCode): string {
  switch (code) {
    case 'auth_failed':
      return 'mock: authentication failed'
    case 'endpoint_unreachable':
      return 'mock: endpoint unreachable'
    case 'model_not_found':
      return 'mock: model not found'
    case 'tool_calls_unsupported':
      return 'mock: tool calls unsupported'
    case 'timeout':
      return 'mock: request timed out'
    case 'invalid_response':
      return 'mock: invalid response'
    case 'bad_request':
      return 'mock: bad request'
    case 'unknown':
    default:
      return 'mock: unknown error'
  }
}

function isRetryableCode(code: AgentErrorCode): boolean {
  return code === 'endpoint_unreachable' || code === 'timeout'
}
