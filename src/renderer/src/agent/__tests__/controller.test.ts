/**
 * Tier 2 integration tests for `agent/controller.ts`.
 *
 * Drives `runAgentConversation` against `createMockChatCompletions()`
 * from `src/test/doubles/windowAgent.ts`.
 *
 * Covers:
 *   - Single tool-call → final reply happy path (Req 4.1)
 *   - Repeated identical tool calls beyond retry limit (Req 4.2)
 *   - Hang/timeout path returning a structured timeout error (Req 4.3)
 *   - Mock_Chat_Completions isolation (Req 4.8)
 *
 * Uses Fake_Clock (vi.useFakeTimers) for timeout assertions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockChatCompletions, MockAgentError } from '../../../../test/doubles/windowAgent'
import type { AgentRunOptions } from '../controller'

// Mock dependencies that the controller imports at module level
vi.mock('../../stores/settings', () => ({
  getSettings: () => ({
    language: 'zh',
    nickname: '测试用户',
    calorieGoal: 2000,
    onboarded: true,
    agent: {
      provider: 'deepseek',
      apiBaseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      toolCompatibility: 'auto',
    },
    usagePricing: {},
    reminders: {
      enabled: true,
      mealReminders: true,
      planAdjustmentReminders: true,
      weeklyReportReminders: false,
      postLogGapSummaryInChat: true,
      postLogGapDesktopNotify: false,
      quietStartHour: 23,
      quietEndHour: 7,
      cooldownHours: 4,
    },
  }),
}))

vi.mock('../../memory/prompt', () => ({
  buildMemoryContextForPrompt: async () => '',
}))

vi.mock('../tools', () => ({
  AGENT_TOOLS: [],
  getToolDefinitions: vi.fn(() => []),
  executeToolCall: vi.fn(async (toolCall: { name: string }) => ({
    success: true,
    tool: toolCall.name,
    result: '操作成功',
  })),
}))

// Import after mocks are declared
const { runAgentConversation } = await import('../controller')
const { executeToolCall } = await import('../tools')

describe('agent/controller - runAgentConversation', () => {
  let mock: ReturnType<typeof createMockChatCompletions>

  beforeEach(() => {
    mock = createMockChatCompletions()
    mock.install()
    vi.mocked(executeToolCall).mockClear()
  })

  afterEach(() => {
    mock.uninstall()
  })

  function makeOptions(overrides: Partial<AgentRunOptions> = {}): AgentRunOptions {
    return {
      history: [],
      userInput: '今天吃了一个苹果',
      ...overrides,
    }
  }

  describe('happy path: single tool-call → final reply', () => {
    it('processes a tool call and returns the final assistant message', async () => {
      // Enqueue: first response is a tool call, second is the final reply
      mock.enqueueToolCall('add_meal', { food: 'apple' }, '已帮你记录了一个苹果 🍎')

      const result = await runAgentConversation(makeOptions())

      expect(result.assistantMessage).toContain('已帮你记录了一个苹果')
      expect(mock.callCount()).toBe(2) // tool-call response + final reply
      expect(vi.mocked(executeToolCall)).toHaveBeenCalledOnce()
      expect(vi.mocked(executeToolCall)).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'add_meal' }),
        expect.anything(),
      )
    })

    it('invokes onToolFinished callback after tool execution', async () => {
      mock.enqueueToolCall('get_today_nutrition', {}, '今天摄入了 1200 kcal。')
      const onToolFinished = vi.fn()

      await runAgentConversation(makeOptions({ onToolFinished }))

      expect(onToolFinished).toHaveBeenCalledOnce()
      expect(onToolFinished).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCall: expect.objectContaining({ name: 'get_today_nutrition' }),
          result: expect.anything(),
        }),
      )
    })

    it('returns assistantRemoteTranscript containing the tool exchange', async () => {
      mock.enqueueToolCall('search_recipe', { keyword: '鸡胸肉' }, '找到了 3 道菜谱。')

      const result = await runAgentConversation(makeOptions({ userInput: '搜索鸡胸肉菜谱' }))

      expect(result.assistantRemoteTranscript).toBeDefined()
      expect(result.assistantRemoteTranscript!.length).toBeGreaterThanOrEqual(2)
      // Should contain the assistant tool-call message and the final reply
      const roles = result.assistantRemoteTranscript!.map((m) => m.role)
      expect(roles).toContain('assistant')
      expect(roles).toContain('tool')
    })
  })

  describe('repeated identical tool calls beyond retry limit', () => {
    it('throws when the model returns the same tool call signature twice in a row', async () => {
      // The controller checks if the current tool-call signature matches the
      // previous one. If so, it throws immediately (no retry limit counter -
      // a single repeat is enough to trigger the error).
      const toolCallResponse = {
        content: '',
        toolCalls: [
          {
            id: 'call_abc123',
            name: 'get_today_nutrition',
            arguments: {},
          },
        ],
        assistantMessage: {
          role: 'assistant' as const,
          content: null,
          tool_calls: [
            {
              id: 'call_abc123',
              type: 'function' as const,
              function: {
                name: 'get_today_nutrition',
                arguments: '{}',
              },
            },
          ],
        },
      }

      // Enqueue the same tool call twice - the controller should detect the
      // duplicate signature on the second iteration and throw.
      mock.enqueue(toolCallResponse)
      mock.enqueue(toolCallResponse)

      await expect(runAgentConversation(makeOptions())).rejects.toThrow(
        '模型重复发起了同一组工具调用',
      )
    })

    it('does NOT throw when tool calls differ between rounds', async () => {
      // First round: tool call A
      mock.enqueue({
        content: '',
        toolCalls: [{ id: 'call_1', name: 'get_today_nutrition', arguments: {} }],
        assistantMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'get_today_nutrition', arguments: '{}' } },
          ],
        },
      })
      // Second round: different tool call
      mock.enqueue({
        content: '',
        toolCalls: [{ id: 'call_2', name: 'get_diet_log', arguments: { date: '2024-06-15' } }],
        assistantMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call_2', type: 'function', function: { name: 'get_diet_log', arguments: '{"date":"2024-06-15"}' } },
          ],
        },
      })
      // Final reply
      mock.enqueue({
        content: '完成了查询。',
        toolCalls: [],
        assistantMessage: { role: 'assistant', content: '完成了查询。' },
      })

      const result = await runAgentConversation(makeOptions())
      expect(result.assistantMessage).toContain('完成了查询')
    })

    it('throws when tool rounds exceed MAX_TOOL_ROUNDS (6)', async () => {
      // Enqueue 7 distinct tool calls (exceeding the 6-round limit)
      for (let i = 0; i < 7; i++) {
        mock.enqueue({
          content: '',
          toolCalls: [{ id: `call_${i}`, name: 'get_today_nutrition', arguments: { round: i } }],
          assistantMessage: {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: `call_${i}`, type: 'function', function: { name: 'get_today_nutrition', arguments: JSON.stringify({ round: i }) } },
            ],
          },
        })
      }

      await expect(runAgentConversation(makeOptions())).rejects.toThrow(
        '工具调用轮数超出上限',
      )
    })
  })

  describe('hang/timeout path', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('propagates a structured timeout error from chatCompletions', async () => {
      // When the underlying chatCompletions throws a timeout error,
      // the controller should propagate it as-is.
      mock.enqueueError('timeout')

      const promise = runAgentConversation(makeOptions())

      await expect(promise).rejects.toThrow('mock: request timed out')
      await expect(promise).rejects.toSatisfy((err: unknown) => {
        return err instanceof MockAgentError && err.info.code === 'timeout'
      })
    })

    it('hangs indefinitely when chatCompletions never resolves (no built-in timeout)', async () => {
      // The controller does not implement its own timeout - it relies on
      // the IPC layer. When chatCompletions hangs, the controller's promise
      // also hangs. We verify this by racing against a timer.
      const { release } = mock.enqueueHang()

      const controllerPromise = runAgentConversation(makeOptions())
      let resolved = false
      controllerPromise.then(() => { resolved = true }).catch(() => { resolved = true })

      // Advance time significantly - the controller should still be waiting
      await vi.advanceTimersByTimeAsync(30_000)
      expect(resolved).toBe(false)

      // Release the hang with a final reply to clean up
      release({
        content: '终于回来了',
        toolCalls: [],
        assistantMessage: { role: 'assistant', content: '终于回来了' },
      })

      const result = await controllerPromise
      expect(result.assistantMessage).toContain('终于回来了')
    })

    it('propagates timeout error with retryable flag', async () => {
      mock.enqueueError('timeout')

      try {
        await runAgentConversation(makeOptions())
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(MockAgentError)
        const agentErr = err as MockAgentError
        expect(agentErr.info.code).toBe('timeout')
        expect(agentErr.info.retryable).toBe(true)
      }
    })
  })

  describe('structured-error matrix (Req 4.1, 4.8)', () => {
    /**
     * Systematically tests every documented AgentErrorCode propagated
     * through the controller. For each code we assert:
     *   1. The error is thrown/rejected (controller does not swallow it)
     *   2. The error carries the correct `info.code`
     *   3. The error carries the correct `info.retryable` flag
     *
     * Retryable codes: timeout, endpoint_unreachable
     * Non-retryable codes: auth_failed, model_not_found, tool_calls_unsupported
     */
    const errorMatrix: Array<{
      code: Parameters<typeof mock.enqueueError>[0]
      expectedMessage: string
      retryable: boolean
    }> = [
      { code: 'auth_failed', expectedMessage: 'mock: authentication failed', retryable: false },
      { code: 'endpoint_unreachable', expectedMessage: 'mock: endpoint unreachable', retryable: true },
      { code: 'model_not_found', expectedMessage: 'mock: model not found', retryable: false },
      { code: 'tool_calls_unsupported', expectedMessage: 'mock: tool calls unsupported', retryable: false },
      { code: 'timeout', expectedMessage: 'mock: request timed out', retryable: true },
    ]

    for (const { code, expectedMessage, retryable } of errorMatrix) {
      describe(`error code: ${code}`, () => {
        it('rejects with a MockAgentError', async () => {
          mock.enqueueError(code)
          await expect(runAgentConversation(makeOptions())).rejects.toBeInstanceOf(MockAgentError)
        })

        it(`has message "${expectedMessage}"`, async () => {
          mock.enqueueError(code)
          await expect(runAgentConversation(makeOptions())).rejects.toThrow(expectedMessage)
        })

        it(`has info.code === "${code}"`, async () => {
          mock.enqueueError(code)
          try {
            await runAgentConversation(makeOptions())
            expect.fail('should have thrown')
          } catch (err) {
            expect(err).toBeInstanceOf(MockAgentError)
            expect((err as MockAgentError).info.code).toBe(code)
          }
        })

        it(`has info.retryable === ${retryable}`, async () => {
          mock.enqueueError(code)
          try {
            await runAgentConversation(makeOptions())
            expect.fail('should have thrown')
          } catch (err) {
            expect(err).toBeInstanceOf(MockAgentError)
            expect((err as MockAgentError).info.retryable).toBe(retryable)
          }
        })
      })
    }
  })
})
