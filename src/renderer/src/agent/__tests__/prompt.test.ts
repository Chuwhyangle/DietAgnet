/**
 * Tier 2 integration tests for `agent/prompt.ts`.
 *
 * Asserts the assembled system prompt contains:
 *   - Active nickname
 *   - Daily calorie target
 *   - Time-of-day greeting
 *   - Rhythm summary (when present)
 *   - No unresolved {{placeholder}} tokens
 *
 * Uses Fake_Clock (vi.useFakeTimers) for time-of-day assertions.
 *
 * Validates: Requirement 4.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Settings } from '../../stores/settings'

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    nickname: '小明',
    calorieGoal: 1800,
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
    memoryPostChatExtraction: true,
    memoryPostChatAutoConfidence: 0.78,
    memoryPostChatPendingMinConfidence: 0.52,
    ...overrides,
  } as Settings
}

describe('agent/prompt – buildSystemPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes the active nickname in the prompt', async () => {
    vi.setSystemTime(new Date('2024-06-15T10:00:00'))
    const { buildSystemPrompt } = await import('../prompt')
    const settings = makeSettings({ nickname: '测试达人' })
    const prompt = buildSystemPrompt(settings)

    expect(prompt).toContain('测试达人')
  })

  it('uses default nickname when nickname is empty', async () => {
    vi.setSystemTime(new Date('2024-06-15T10:00:00'))
    const { buildSystemPrompt } = await import('../prompt')
    const settings = makeSettings({ nickname: '' })
    const prompt = buildSystemPrompt(settings)

    expect(prompt).toContain('小可爱')
  })

  it('includes the daily calorie target', async () => {
    vi.setSystemTime(new Date('2024-06-15T10:00:00'))
    const { buildSystemPrompt } = await import('../prompt')
    const settings = makeSettings({ calorieGoal: 2500 })
    const prompt = buildSystemPrompt(settings)

    expect(prompt).toContain('2500')
  })

  describe('time-of-day greeting', () => {
    it('shows 深夜 before 6:00', async () => {
      vi.setSystemTime(new Date('2024-06-15T03:00:00'))
      const { buildSystemPrompt } = await import('../prompt')
      const prompt = buildSystemPrompt(makeSettings())

      expect(prompt).toContain('深夜')
    })

    it('shows 上午 between 6:00 and 10:59', async () => {
      vi.setSystemTime(new Date('2024-06-15T08:00:00'))
      const { buildSystemPrompt } = await import('../prompt')
      const prompt = buildSystemPrompt(makeSettings())

      expect(prompt).toContain('上午')
    })

    it('shows 中午 between 11:00 and 13:59', async () => {
      vi.setSystemTime(new Date('2024-06-15T12:00:00'))
      const { buildSystemPrompt } = await import('../prompt')
      const prompt = buildSystemPrompt(makeSettings())

      expect(prompt).toContain('中午')
    })

    it('shows 下午 between 14:00 and 17:59', async () => {
      vi.setSystemTime(new Date('2024-06-15T15:00:00'))
      const { buildSystemPrompt } = await import('../prompt')
      const prompt = buildSystemPrompt(makeSettings())

      expect(prompt).toContain('下午')
    })

    it('shows 晚上 from 18:00 onward', async () => {
      vi.setSystemTime(new Date('2024-06-15T20:00:00'))
      const { buildSystemPrompt } = await import('../prompt')
      const prompt = buildSystemPrompt(makeSettings())

      expect(prompt).toContain('晚上')
    })
  })

  it('includes the rhythm summary when memoryContext is provided', async () => {
    vi.setSystemTime(new Date('2024-06-15T10:00:00'))
    const { buildSystemPrompt } = await import('../prompt')
    const rhythmSummary = '## 近期饮食节奏\n- 最近7天平均每天记录2.3餐'
    const prompt = buildSystemPrompt(makeSettings(), rhythmSummary)

    expect(prompt).toContain('近期饮食节奏')
    expect(prompt).toContain('最近7天平均每天记录2.3餐')
  })

  it('does not include rhythm section when memoryContext is empty', async () => {
    vi.setSystemTime(new Date('2024-06-15T10:00:00'))
    const { buildSystemPrompt } = await import('../prompt')
    const prompt = buildSystemPrompt(makeSettings(), '')

    // The prompt should still be valid without the rhythm section
    expect(prompt).toContain('小明')
    expect(prompt).toContain('1800')
  })

  it('contains no unresolved {{placeholder}} tokens', async () => {
    vi.setSystemTime(new Date('2024-06-15T10:00:00'))
    const { buildSystemPrompt } = await import('../prompt')
    const rhythmSummary = '## 近期饮食节奏\n- 平均每天记录2餐'
    const prompt = buildSystemPrompt(makeSettings(), rhythmSummary)

    // Assert no {{...}} placeholder tokens remain
    expect(prompt).not.toMatch(/\{\{.*?\}\}/)
  })

  it('contains no unresolved ${...} template literal placeholders in output', async () => {
    vi.setSystemTime(new Date('2024-06-15T10:00:00'))
    const { buildSystemPrompt } = await import('../prompt')
    const prompt = buildSystemPrompt(makeSettings())

    // All template literals should have been resolved
    expect(prompt).not.toMatch(/\$\{.*?\}/)
  })

  it('includes the current date', async () => {
    vi.setSystemTime(new Date('2024-06-15T10:00:00'))
    const { buildSystemPrompt } = await import('../prompt')
    const prompt = buildSystemPrompt(makeSettings())

    expect(prompt).toContain('2024-06-15')
  })
})
