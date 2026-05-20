/**
 * Main-process agent IPC handler tests (task 8.1).
 *
 * Covers the `agent:chat-completions` IPC handler registered by
 * `registerAgentIpcHandlers()` in `src/main/agent.ts`.
 *
 * Tests exercise:
 *   - Success path: mock a successful HTTP response, verify the handler
 *     returns the assistant message with correct shape.
 *   - Failure modes: auth_failed, endpoint_unreachable, model_not_found,
 *     tool_calls_unsupported, timeout — each mapped to the documented
 *     structured error code.
 *
 * Validates: Requirements 5.1, 5.5, 5.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  electronMock,
  getRegisteredHandlers,
  type ElectronMock,
  type IpcMainHandler,
} from '../../test/doubles/electron'
import type { AgentChatRequest } from '../../shared/agent'

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

let mockElectron: ElectronMock

vi.mock('electron', () => {
  mockElectron = electronMock()
  return mockElectron
})

vi.mock('fs', () => createFsMockWithStoredDeepSeekKey())

vi.mock('path', () => ({
  dirname: vi.fn((p: string) => p),
  join: vi.fn((...parts: string[]) => parts.join('/')),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChatRequest(overrides?: Partial<AgentChatRequest>): AgentChatRequest {
  return {
    settings: {
      provider: 'deepseek',
      apiBaseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      toolCompatibility: 'auto',
    },
    messages: [{ role: 'user', content: 'Hello' }],
    tools: [],
    ...overrides,
  }
}

function createFsMockWithStoredDeepSeekKey() {
  const encryptedDeepSeekKey = Buffer.from('encrypted-deepseek-test-key').toString('base64')

  return {
    existsSync: vi.fn((filePath: string) => filePath.endsWith('secure-config.json')),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((filePath: string) => {
      if (!filePath.endsWith('secure-config.json')) {
        return '{}'
      }

      return JSON.stringify({
        version: 1,
        encrypted: true,
        apiKeys: {
          deepseek: encryptedDeepSeekKey,
        },
      })
    }),
    writeFileSync: vi.fn(),
  }
}

function makeSuccessResponse(content = 'Hello! How can I help you?') {
  return {
    id: 'chatcmpl-123',
    model: 'deepseek-v4-flash',
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    choices: [
      {
        finish_reason: 'stop',
        message: {
          role: 'assistant' as const,
          content,
        },
      },
    ],
  }
}

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: new Headers(),
    } as unknown as Response),
  )
}

function mockFetchNetworkError(errorMessage: string) {
  return vi.fn(() => {
    const error = new Error(errorMessage)
    return Promise.reject(error)
  })
}

function mockFetchAbort() {
  return vi.fn(() => {
    const error = new Error('The operation was aborted')
    error.name = 'AbortError'
    return Promise.reject(error)
  })
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('src/main/agent.ts — chat-completions IPC handler', () => {
  let chatCompletionsHandler: IpcMainHandler

  beforeEach(async () => {
    // Re-create the electron mock for isolation
    mockElectron = electronMock()
    mockElectron.safeStorage.decryptString.mockReturnValue(
      'test-api-key-placeholder',
    )

    // Dynamically import and register handlers. The vi.mock above
    // ensures the module gets our mock electron.
    vi.resetModules()
    vi.doMock('electron', () => mockElectron)
    vi.doMock('fs', () => createFsMockWithStoredDeepSeekKey())
    vi.doMock('path', () => ({
      dirname: vi.fn((p: string) => p),
      join: vi.fn((...parts: string[]) => parts.join('/')),
    }))

    const agentModule = await import('../agent')
    agentModule.registerAgentIpcHandlers()

    const handlers = getRegisteredHandlers(mockElectron)
    const handler = handlers.get('agent:chat-completions')
    expect(handler).toBeDefined()
    chatCompletionsHandler = handler!
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------

  it('returns assistant message on successful chat completion', async () => {
    const responseBody = makeSuccessResponse('I am your diet assistant.')
    globalThis.fetch = mockFetchResponse(200, responseBody)

    const result = await chatCompletionsHandler(undefined, makeChatRequest())

    expect(result).toMatchObject({
      content: 'I am your diet assistant.',
      toolCalls: [],
      assistantMessage: {
        role: 'assistant',
        content: 'I am your diet assistant.',
      },
    })
  })

  it('returns tool calls when the model responds with tool_calls', async () => {
    const responseBody = {
      id: 'chatcmpl-456',
      model: 'deepseek-v4-flash',
      usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_today_nutrition',
                  arguments: '{}',
                },
              },
            ],
          },
        },
      ],
    }
    globalThis.fetch = mockFetchResponse(200, responseBody)

    const result = await chatCompletionsHandler(
      undefined,
      makeChatRequest({
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_today_nutrition',
              description: 'Get nutrition summary',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      }),
    )

    expect(result).toMatchObject({
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'get_today_nutrition',
          arguments: {},
        },
      ],
    })
  })

  // -------------------------------------------------------------------------
  // Failure modes
  // -------------------------------------------------------------------------

  it('maps 401 response to auth_failed error code', async () => {
    const responseBody = {
      error: { message: 'Invalid API key provided' },
    }
    globalThis.fetch = mockFetchResponse(401, responseBody)

    await expect(
      chatCompletionsHandler(undefined, makeChatRequest()),
    ).rejects.toThrow(/认证失败|auth/i)
  })

  it('maps 403 response to auth_failed error code', async () => {
    const responseBody = {
      error: { message: 'Permission denied' },
    }
    globalThis.fetch = mockFetchResponse(403, responseBody)

    await expect(
      chatCompletionsHandler(undefined, makeChatRequest()),
    ).rejects.toThrow(/认证失败|auth/i)
  })

  it('maps network error (ECONNREFUSED) to endpoint_unreachable error code', async () => {
    globalThis.fetch = mockFetchNetworkError('fetch failed: ECONNREFUSED')

    await expect(
      chatCompletionsHandler(undefined, makeChatRequest()),
    ).rejects.toThrow(/endpoint.*不可达|unreachable/i)
  })

  it('maps DNS resolution failure to endpoint_unreachable error code', async () => {
    globalThis.fetch = mockFetchNetworkError('fetch failed: ENOTFOUND')

    await expect(
      chatCompletionsHandler(undefined, makeChatRequest()),
    ).rejects.toThrow(/endpoint.*不可达|unreachable/i)
  })

  it('maps "model not found" response to model_not_found error code', async () => {
    const responseBody = {
      error: { message: 'Model deepseek-v99 not found' },
    }
    globalThis.fetch = mockFetchResponse(404, responseBody)

    await expect(
      chatCompletionsHandler(undefined, makeChatRequest()),
    ).rejects.toThrow(/模型不存在|model.*not found/i)
  })

  it('maps "tools not supported" response to tool_calls_unsupported error code', async () => {
    const responseBody = {
      error: { message: 'tools not supported for this model' },
    }
    globalThis.fetch = mockFetchResponse(400, responseBody)

    await expect(
      chatCompletionsHandler(
        undefined,
        makeChatRequest({
          tools: [
            {
              type: 'function',
              function: {
                name: 'test_tool',
                description: 'A test tool',
                parameters: { type: 'object', properties: {} },
              },
            },
          ],
        }),
      ),
    ).rejects.toThrow(/不支持.*tool|tool.*unsupported/i)
  })

  it('maps AbortError (timeout) to timeout error code', async () => {
    globalThis.fetch = mockFetchAbort()

    await expect(
      chatCompletionsHandler(undefined, makeChatRequest()),
    ).rejects.toThrow(/超时|timeout/i)
  })

  // -------------------------------------------------------------------------
  // Edge case: missing API key
  // -------------------------------------------------------------------------

  it('throws when no API key is configured for the provider', async () => {
    // The default mock has no stored keys and the built-in fallback
    // for deepseek is present, so use a provider without a fallback.
    await expect(
      chatCompletionsHandler(
        undefined,
        makeChatRequest({
          settings: {
            provider: 'qwen',
            apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            model: 'qwen-plus',
            toolCompatibility: 'auto',
          },
        }),
      ),
    ).rejects.toThrow(/API Key/)
  })
})
