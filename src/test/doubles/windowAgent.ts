/**
 * Reusable `window.agent.chatCompletions` mock for Tier 2 agent
 * integration tests (task 2.4, Requirements 4.1, 4.2, 4.3, 4.8).
 *
 * Wired in via:
 *
 *     const mock = createMockChatCompletions()
 *     beforeEach(() => mock.install())
 *     afterEach(() => mock.uninstall())
 *
 *     it('returns the final reply after one tool call', async () => {
 *       mock.enqueueToolCall('logFood', { food: 'apple' }, '已记录。')
 *       const reply = await runAgentLoop(...)
 *       expect(reply).toContain('已记录')
 *     })
 *
 * Why a hand-rolled fake instead of `vi.fn().mockResolvedValueOnce(...)`:
 *
 * - Tests need to script *sequences* of responses (tool call → tool
 *   result → final reply) and `mockResolvedValueOnce` chains do not
 *   express tool-call shape conveniently. `enqueueToolCall` produces
 *   the tool-call assistant message AND the final assistant reply in
 *   one helper call, matching the way the controller actually drives
 *   the loop.
 *
 * - Tests need to simulate a hang (Req 4.3) so the controller's
 *   timeout path fires. A plain `mockResolvedValue` with a long delay
 *   would force tests to advance the wall clock past a real `setTimeout`,
 *   which conflicts with the unflushed-timer detector in `setup.ts`.
 *   `enqueueHang()` returns an unresolved promise that the test
 *   releases explicitly.
 *
 * - Tests need to throw structured errors that carry an `AgentErrorInfo`
 *   so controller error-path assertions can inspect `err.info.code`
 *   directly (matching the `AgentRequestError` shape in `src/main/agent.ts`).
 *
 * Design notes (per design.md "Components and Interfaces"
 * `src/test/doubles/windowAgent.ts` section):
 *
 * - The queue is FIFO. Each `chatCompletions(request)` call pops the
 *   head, records the request as `lastRequest`, increments
 *   `callCount`, and returns / throws / hangs accordingly.
 *
 * - `install()` uses `vi.stubGlobal('agent', { chatCompletions })`
 *   so jsdom-environment tests can call `window.agent.chatCompletions(...)`
 *   exactly as production code does. `uninstall()` calls
 *   `vi.unstubAllGlobals()` which restores any previous global,
 *   keeping tests isolated.
 *
 * - Tool-call arguments are serialized as a JSON string in the
 *   assistant's `tool_calls[*].function.arguments` field per OpenAI
 *   conventions, while the controller-facing `toolCalls[*].arguments`
 *   stays a parsed object — mirroring what `src/main/agent.ts`
 *   produces today.
 */

import { vi } from 'vitest'

import type {
  AgentChatRequest,
  AgentChatResponse,
  AgentErrorCode,
  AgentErrorInfo,
  AgentToolInvocation,
  RemoteChatMessage,
  RemoteToolCall,
} from '../../shared/agent'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MockChatCompletions {
  /** Push a scripted response for the next call (FIFO). */
  enqueue(response: AgentChatResponse): void
  /**
   * Convenience: enqueue an assistant message with a single tool call,
   * followed by a final assistant reply. The two responses are queued
   * in order so the controller's tool-call → final-reply loop matches
   * production behavior.
   */
  enqueueToolCall(
    toolName: string,
    args: Record<string, unknown>,
    finalContent: string,
  ): void
  /**
   * Convenience: enqueue a structured error. The next call rejects with
   * a `MockAgentError` whose `info.code` matches the given code, so
   * controller error-path assertions can inspect `err.info.code` the
   * same way they would against the production `AgentRequestError`.
   */
  enqueueError(code: AgentErrorCode): void
  /**
   * Simulate a hang: the next call returns a promise that never
   * resolves until `release()` is invoked. Useful for testing
   * controller timeouts (Req 4.3) without sleeping the wall clock.
   *
   * `release()` resolves the hung promise with the supplied response,
   * or with a benign empty assistant reply if no response is given.
   */
  enqueueHang(): { release: (response?: AgentChatResponse) => void }
  /** Install the mock onto `globalThis.agent` (so `window.agent` resolves to it under jsdom). */
  install(): void
  /** Restore any previously stubbed globals. */
  uninstall(): void
  /** Number of times `chatCompletions` has been called since installation. */
  callCount(): number
  /** The most recent request passed to `chatCompletions`, or `undefined` if never called. */
  lastRequest(): AgentChatRequest | undefined
}

/**
 * Error class thrown by `enqueueError`. Mirrors the `AgentRequestError`
 * shape in `src/main/agent.ts` so controller code paths that branch on
 * `err instanceof Error && 'info' in err` behave the same way under test.
 */
export class MockAgentError extends Error {
  readonly info: AgentErrorInfo

  constructor(info: AgentErrorInfo) {
    super(info.message)
    this.name = 'MockAgentError'
    this.info = info
  }
}

// ---------------------------------------------------------------------------
// Internal queue entry types
// ---------------------------------------------------------------------------

type QueueEntry =
  | { kind: 'response'; response: AgentChatResponse }
  | { kind: 'error'; error: MockAgentError }
  | { kind: 'hang'; promise: Promise<AgentChatResponse> }

// ---------------------------------------------------------------------------
// Helpers for building canonical responses
// ---------------------------------------------------------------------------

function buildToolCallResponse(
  toolName: string,
  args: Record<string, unknown>,
): AgentChatResponse {
  const id = `call_${Math.random().toString(36).slice(2, 10)}`
  // Per OpenAI conventions, the wire-level `tool_calls[*].function.arguments`
  // is a JSON-encoded string. The controller-facing `toolCalls[*].arguments`
  // is the parsed object.
  const toolCallWire: RemoteToolCall = {
    id,
    type: 'function',
    function: {
      name: toolName,
      arguments: JSON.stringify(args),
    },
  }
  const assistantMessage: RemoteChatMessage = {
    role: 'assistant',
    content: null,
    tool_calls: [toolCallWire],
  }
  const toolCallParsed: AgentToolInvocation = {
    id,
    name: toolName,
    arguments: args,
  }
  return {
    content: '',
    toolCalls: [toolCallParsed],
    assistantMessage,
  }
}

function buildFinalReplyResponse(content: string): AgentChatResponse {
  const assistantMessage: RemoteChatMessage = {
    role: 'assistant',
    content,
  }
  return {
    content,
    toolCalls: [],
    assistantMessage,
  }
}

function buildEmptyResponse(): AgentChatResponse {
  return buildFinalReplyResponse('')
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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a fresh `MockChatCompletions` instance.
 *
 * Each call returns an independent object with its own queue and
 * counters so individual test files (or individual `it` blocks via
 * `beforeEach`) do not leak scripted responses across cases.
 */
export function createMockChatCompletions(): MockChatCompletions {
  const queue: QueueEntry[] = []
  let callCount = 0
  let lastRequest: AgentChatRequest | undefined

  const chatCompletions = async (
    request: AgentChatRequest,
  ): Promise<AgentChatResponse> => {
    callCount += 1
    lastRequest = request

    const next = queue.shift()
    if (!next) {
      throw new Error(
        'MockChatCompletions: chatCompletions was called but the queue is empty. ' +
          'Did you forget to enqueue() / enqueueToolCall() / enqueueError() / enqueueHang()?',
      )
    }

    if (next.kind === 'response') {
      return next.response
    }
    if (next.kind === 'error') {
      throw next.error
    }
    // 'hang': return the never-resolving promise; the test owns release().
    return next.promise
  }

  const api: MockChatCompletions = {
    enqueue(response) {
      queue.push({ kind: 'response', response })
    },

    enqueueToolCall(toolName, args, finalContent) {
      queue.push({
        kind: 'response',
        response: buildToolCallResponse(toolName, args),
      })
      queue.push({
        kind: 'response',
        response: buildFinalReplyResponse(finalContent),
      })
    },

    enqueueError(code) {
      queue.push({
        kind: 'error',
        error: new MockAgentError({
          code,
          message: defaultMessageForCode(code),
          retryable: code === 'endpoint_unreachable' || code === 'timeout',
        }),
      })
    },

    enqueueHang() {
      let resolveFn: (value: AgentChatResponse) => void = () => {}
      const promise = new Promise<AgentChatResponse>((resolve) => {
        resolveFn = resolve
      })
      queue.push({ kind: 'hang', promise })
      return {
        release: (response) => {
          resolveFn(response ?? buildEmptyResponse())
        },
      }
    },

    install() {
      vi.stubGlobal('agent', { chatCompletions })
    },

    uninstall() {
      vi.unstubAllGlobals()
    },

    callCount() {
      return callCount
    },

    lastRequest() {
      return lastRequest
    },
  }

  return api
}
