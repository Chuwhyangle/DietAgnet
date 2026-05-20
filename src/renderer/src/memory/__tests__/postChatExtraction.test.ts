/**
 * Example tests for `memory/postChatExtraction.ts` (task 4.10,
 * Requirement 2.4).
 *
 * `runPostChatMemoryExtraction` calls `window.agent.chatCompletions`
 * with the documented system prompt, parses the JSON-array response,
 * filters by confidence + duplicate detection, and persists qualifying
 * candidates through `remember` (auto-apply) or `saveUserMemory`
 * (pending_confirm). Allergy / avoidance candidates always go to
 * pending. The function bails out for empty queues, mocked-out API
 * keys, recently-attempted runs (10 s gate), and short user / assistant
 * messages.
 *
 * We exercise the bail-out paths plus the happy path for a non-allergy
 * candidate, mocking every collaborator. The full LLM round-trip is
 * out of scope (Req 4.8 says we never contact a real endpoint).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn(() => ({
    nickname: '猫猫',
    calorieGoal: 2000,
    memoryPostChatExtraction: true,
    memoryPostChatAutoConfidence: 0.78,
    memoryPostChatPendingMinConfidence: 0.52,
    agent: {
      provider: 'deepseek',
      apiBaseUrl: 'https://api.example.com',
      model: 'demo-model',
      toolCompatibility: 'auto',
    },
    reminders: {},
  })),
}))

vi.mock('../../stores/planning', () => ({
  saveUserMemory: vi.fn((row) =>
    Promise.resolve({ ...row, id: row.id ?? Math.floor(Math.random() * 1_000_000) }),
  ),
  getUserMemories: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../manager', () => ({
  remember: vi.fn(() =>
    Promise.resolve({
      memory: {
        id: 1,
        type: 'preference',
        content: 'mocked',
        normalizedContent: 'mocked',
        tags: [],
        source: 'agent_inferred',
        confidence: 0.85,
        status: 'active',
        createdAt: '2024-06-15T08:00:00.000Z',
        updatedAt: '2024-06-15T08:00:00.000Z',
        mergedFromIds: [],
      },
      merged: false,
    }),
  ),
}))

import { runPostChatMemoryExtraction } from '../postChatExtraction'
import { getSettings } from '../../stores/settings'
import { saveUserMemory } from '../../stores/planning'
import { remember } from '../manager'

interface AgentBridgeMock {
  chatCompletions: ReturnType<typeof vi.fn>
  getApiKeyStatus: ReturnType<typeof vi.fn>
}

describe('memory/postChatExtraction.runPostChatMemoryExtraction', () => {
  let agent: AgentBridgeMock

  beforeEach(() => {
    agent = {
      chatCompletions: vi.fn(() =>
        Promise.resolve({
          content: JSON.stringify([
            {
              type: 'preference',
              content: '喜欢清淡口味，偏好少油少盐的家常菜',
              tags: ['preference', 'flavor'],
              confidence: 0.85,
              reason: 'user said so',
            },
          ]),
          toolCalls: [],
          assistantMessage: { role: 'assistant', content: '...' },
        }),
      ),
      getApiKeyStatus: vi.fn(() => Promise.resolve({ configured: true })),
    }
    vi.stubGlobal('agent', agent)
    vi.mocked(remember).mockClear()
    vi.mocked(saveUserMemory).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('bails out when extraction is disabled in settings', async () => {
    vi.mocked(getSettings).mockReturnValueOnce({
      ...vi.mocked(getSettings)(),
      memoryPostChatExtraction: false,
    } as never)

    await runPostChatMemoryExtraction({
      userMessage: '我喜欢清淡口味，少油少盐',
      assistantMessage: '记下了，下次给你推荐清淡的菜。',
    })

    expect(agent.chatCompletions).not.toHaveBeenCalled()
  })

  it('bails out when user/assistant messages are too short', async () => {
    await runPostChatMemoryExtraction({
      userMessage: 'a',
      assistantMessage: 'b',
    })
    expect(agent.chatCompletions).not.toHaveBeenCalled()
  })

  it('bails out when the API key is not configured', async () => {
    agent.getApiKeyStatus.mockResolvedValueOnce({ configured: false })

    await runPostChatMemoryExtraction({
      userMessage: '我喜欢清淡口味',
      assistantMessage: '记下了，下次给你推荐清淡的菜。',
    })
    expect(agent.chatCompletions).not.toHaveBeenCalled()
  })

  it('persists a high-confidence preference candidate via `remember`', async () => {
    await runPostChatMemoryExtraction({
      userMessage: '我总是喜欢清淡口味，少油少盐',
      assistantMessage: '记下了，会一直按清淡口味来推荐。',
    })

    expect(agent.chatCompletions).toHaveBeenCalledTimes(1)
    expect(remember).toHaveBeenCalledTimes(1)
    expect(remember).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preference',
        source: 'agent_inferred',
      }),
    )
  })
})
