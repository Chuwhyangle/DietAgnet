/**
 * Example tests for `coach/dietLogCoach.ts` (task 4.2, Requirements
 * 2.2, 2.6).
 *
 * `dietLogCoach.ts` exports `registerDietLogCoachReactions()`, which
 * subscribes to the `diet-agent:diet-log-updated` `CustomEvent`,
 * debounces by 700 ms, then runs gap → evaluate → digest → optional
 * chat append + desktop notification. We mock every collaborator so
 * we can assert orchestration shape (subscribe, debounce, reset
 * branching, cleanup).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { DIET_LOG_UPDATED_EVENT } from '../../stores/events'

// All mock factories must be self-contained (no outer-scope variable refs)
// because `vi.mock` is hoisted above imports.
vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn(() => ({
    nickname: '猫猫',
    calorieGoal: 2000,
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
    agent: {},
    usagePricing: {},
  })),
}))

vi.mock('../../stores/planning', () => ({
  clearDailyPlanAdjustments: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../planning/dynamicPlan', () => ({
  evaluateDailyPlanAdjustment: vi.fn(() =>
    Promise.resolve({ suggestion: null, savedAdjustment: null }),
  ),
  getDailyPlanGap: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('../gapDigest', () => ({
  buildCoachDigestMarkdown: vi.fn(() => 'digest-md'),
  buildPlanGapDigestPlain: vi.fn(() => 'digest-plain'),
}))

vi.mock('../../stores/chatHistory', () => ({
  appendCoachChatMessage: vi.fn(() => null),
}))

vi.mock('../../proactive/rules', () => ({
  isReminderQuietHours: vi.fn(() => false),
}))

import { registerDietLogCoachReactions } from '../dietLogCoach'
import { clearDailyPlanAdjustments } from '../../stores/planning'
import { getDailyPlanGap } from '../../planning/dynamicPlan'

describe('coach/dietLogCoach.registerDietLogCoachReactions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(clearDailyPlanAdjustments).mockClear()
    vi.mocked(getDailyPlanGap).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function dispatchUpdate(detail: {
    date: string
    mealType?: string
    resetPlanSuggestions?: boolean
  }): void {
    window.dispatchEvent(new CustomEvent(DIET_LOG_UPDATED_EVENT, { detail }))
  }

  it('returns a cleanup function that detaches the event listener', async () => {
    const cleanup = registerDietLogCoachReactions()
    cleanup()

    dispatchUpdate({ date: '2024-06-15' })
    vi.advanceTimersByTime(1_000)
    await vi.runAllTimersAsync()

    expect(getDailyPlanGap).not.toHaveBeenCalled()
  })

  it('ignores events with a malformed date', async () => {
    const cleanup = registerDietLogCoachReactions()
    dispatchUpdate({ date: 'not-a-date' })
    vi.advanceTimersByTime(1_000)
    await vi.runAllTimersAsync()
    expect(getDailyPlanGap).not.toHaveBeenCalled()
    cleanup()
  })

  it('debounces successive events: only the last date is evaluated', async () => {
    const cleanup = registerDietLogCoachReactions()

    dispatchUpdate({ date: '2024-06-15' })
    dispatchUpdate({ date: '2024-06-16' })
    vi.advanceTimersByTime(500)
    expect(getDailyPlanGap).not.toHaveBeenCalled()

    vi.advanceTimersByTime(700)
    await vi.runAllTimersAsync()
    expect(getDailyPlanGap).toHaveBeenCalledTimes(1)
    expect(getDailyPlanGap).toHaveBeenLastCalledWith('2024-06-16')

    cleanup()
  })

  it('clears prior plan adjustments when resetPlanSuggestions is true', async () => {
    const cleanup = registerDietLogCoachReactions()

    dispatchUpdate({ date: '2024-06-15', resetPlanSuggestions: true })
    vi.advanceTimersByTime(700)
    await vi.runAllTimersAsync()

    expect(clearDailyPlanAdjustments).toHaveBeenCalledTimes(1)
    expect(clearDailyPlanAdjustments).toHaveBeenCalledWith('2024-06-15')

    cleanup()
  })
})
