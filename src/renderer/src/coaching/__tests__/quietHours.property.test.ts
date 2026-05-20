/**
 * Property-Based Test: Quiet-Hours Reminder Invariant
 *
 * **Validates: Requirements 5.4, 6.6, 10.3**
 *
 * Property 2: For any ReminderSettings configuration defining quietStartHour and
 * quietEndHour, and for any time t that falls inside the quiet-hours window,
 * the Reminder Scheduler SHALL NOT emit a ProactiveEvent with firedAt = t.
 * This holds regardless of escalation state, trigger ordering, rule priority,
 * or which page the user has open.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { evaluateSchedulerTick } from '../reminderScheduler'

dayjs.extend(isoWeek)

// ---------------------------------------------------------------------------
// Mocks �?same pattern as reminderScheduler.test.ts
// ---------------------------------------------------------------------------

let mockSettings: any

vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn(() => mockSettings),
}))

vi.mock('../../stores/dietLog', () => ({
  getDietLog: vi.fn(() => null),
  getLogsForRange: vi.fn(() => []),
  mealTypeLabels: {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '加餐',
  },
}))

const mockProactiveEvents: any[] = []
vi.mock('../../stores/planning', () => ({
  getLatestProactiveEventForRule: vi.fn(async (ruleId: string) => {
    const events = mockProactiveEvents
      .filter((e) => e.ruleId === ruleId)
      .sort((a, b) => b.firedAt.localeCompare(a.firedAt))
    return events[0] ?? null
  }),
  getRecentProactiveEventsForRule: vi.fn(async (ruleId: string, limit: number) => {
    return mockProactiveEvents
      .filter((e) => e.ruleId === ruleId)
      .sort((a, b) => b.firedAt.localeCompare(a.firedAt))
      .slice(0, limit)
  }),
  saveProactiveEvent: vi.fn(async (input: any) => {
    const event = {
      id: mockProactiveEvents.length + 1,
      ...input,
      firedAt: input.firedAt ?? new Date().toISOString(),
      payload: { ...(input.payload ?? {}) },
    }
    mockProactiveEvents.push(event)
    return event
  }),
}))

vi.mock('../../proactive/rules', () => ({
  isReminderQuietHours: vi.fn((settings: any, now: any) => {
    const hour = now.hour()
    const { quietStartHour, quietEndHour } = settings
    if (quietStartHour === quietEndHour) return false
    if (quietStartHour < quietEndHour) {
      return hour >= quietStartHour && hour < quietEndHour
    }
    return hour >= quietStartHour || hour < quietEndHour
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Given quietStartHour and quietEndHour, generate an hour that falls INSIDE
 * the quiet window. Handles both normal (start < end) and wrapping (start > end) cases.
 */
function hoursInsideQuietWindow(start: number, end: number): number[] {
  if (start === end) return []
  const hours: number[] = []
  if (start < end) {
    // Normal case: e.g., 1:00 to 5:00 �?hours 1, 2, 3, 4
    for (let h = start; h < end; h++) {
      hours.push(h)
    }
  } else {
    // Wrapping case: e.g., 23:00 to 7:00 �?hours 23, 0, 1, 2, 3, 4, 5, 6
    for (let h = start; h < 24; h++) {
      hours.push(h)
    }
    for (let h = 0; h < end; h++) {
      hours.push(h)
    }
  }
  return hours
}

// ---------------------------------------------------------------------------
// Property Test
// ---------------------------------------------------------------------------

describe('Property 2: Quiet-Hours Reminder Invariant', () => {
  beforeEach(() => {
    mockProactiveEvents.length = 0
    vi.clearAllMocks()
  })

  /**
   * Core invariant: for ANY quiet-hours configuration and ANY time inside
   * that window, evaluateSchedulerTick NEVER fires a ProactiveEvent.
   *
   * Strategy:
   * - Generate arbitrary quietStartHour (0-23) and quietEndHour (0-23) where start �?end
   * - Generate a time t whose hour falls inside the quiet window
   * - Set up mock settings with those quiet hours, reminders enabled, meals unlogged
   * - Assert result.fired is null and result.quietHoursActive is true
   */
  it('never emits a ProactiveEvent when time is inside quiet hours', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.date({
          min: new Date('2024-01-01'),
          max: new Date('2025-12-31'),
        }),
        async (quietStartHour, quietEndHour, minute, baseDate) => {
          // Skip the degenerate case where start === end (no quiet window)
          if (quietStartHour === quietEndHour) return

          // Compute hours inside the quiet window
          const quietHours = hoursInsideQuietWindow(quietStartHour, quietEndHour)
          if (quietHours.length === 0) return

          // Pick an hour inside the quiet window deterministically from the generated data
          const hourIndex = Math.abs(minute) % quietHours.length
          const hour = quietHours[hourIndex]

          // Construct a time t inside the quiet window
          const t = dayjs(baseDate)
            .hour(hour)
            .minute(minute)
            .second(0)
            .millisecond(0)

          // Configure settings with generated quiet hours and all reminders enabled
          mockSettings = {
            reminders: {
              enabled: true,
              mealReminders: true,
              planAdjustmentReminders: true,
              weeklyReportReminders: true,
              postLogGapSummaryInChat: true,
              postLogGapDesktopNotify: false,
              quietStartHour,
              quietEndHour,
              cooldownHours: 0, // No cooldown to maximize chance of firing
            },
            calorieGoal: 2000,
          }

          // Clear events for this iteration
          mockProactiveEvents.length = 0

          const result = await evaluateSchedulerTick(t)

          // The key invariant: no event fires during quiet hours
          expect(result.fired).toBeNull()
          expect(result.quietHoursActive).toBe(true)
        },
      ),
      { ...defaultRunConfig() },
    )
  })

  /**
   * Supplementary property: quiet-hours invariant holds even when there are
   * pending escalations (previous events that would normally trigger escalation).
   *
   * This verifies that escalation state does NOT override quiet hours.
   */
  it('never emits a ProactiveEvent during quiet hours even with pending escalations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        async (quietStartHour, quietEndHour, minute) => {
          if (quietStartHour === quietEndHour) return

          const quietHours = hoursInsideQuietWindow(quietStartHour, quietEndHour)
          if (quietHours.length === 0) return

          const hourIndex = Math.abs(minute) % quietHours.length
          const hour = quietHours[hourIndex]

          // Use a fixed date for simplicity
          const t = dayjs('2024-06-15')
            .hour(hour)
            .minute(minute)
            .second(0)

          // Simulate a previous event that would normally trigger escalation
          // (fired > 90 minutes ago, meal still unlogged)
          mockProactiveEvents.length = 0
          mockProactiveEvents.push({
            id: 1,
            ruleId: 'coaching_breakfast_reminder',
            trigger: 'cron',
            priority: 'low',
            firedAt: t.subtract(120, 'minute').toISOString(),
            delivered: true,
            message: 'test',
            payload: { escalationLevel: 0, dismissCount: 0, quietHoursActive: false },
          })

          mockSettings = {
            reminders: {
              enabled: true,
              mealReminders: true,
              planAdjustmentReminders: true,
              weeklyReportReminders: true,
              postLogGapSummaryInChat: true,
              postLogGapDesktopNotify: false,
              quietStartHour,
              quietEndHour,
              cooldownHours: 0,
            },
            calorieGoal: 2000,
          }

          const result = await evaluateSchedulerTick(t)

          expect(result.fired).toBeNull()
          expect(result.quietHoursActive).toBe(true)
        },
      ),
      { ...defaultRunConfig() },
    )
  })

  /**
   * Supplementary property: quiet-hours invariant holds for wrapping windows
   * (start > end, e.g., 22:00 to 6:00) specifically.
   *
   * This ensures the midnight-crossing logic is correct.
   */
  it('never emits during wrapping quiet-hours windows (start > end)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate start in [1, 23] and end in [0, 22] to force wrapping
        fc.integer({ min: 1, max: 23 }),
        fc.integer({ min: 0, max: 22 }),
        fc.integer({ min: 0, max: 59 }),
        async (rawStart, rawEnd, minute) => {
          // Ensure start > end for wrapping
          const quietStartHour = Math.max(rawStart, rawEnd + 1)
          const quietEndHour = Math.min(rawStart, rawEnd)

          // Skip if they ended up equal or not wrapping
          if (quietStartHour === quietEndHour) return
          if (quietStartHour <= quietEndHour) return

          const quietHours = hoursInsideQuietWindow(quietStartHour, quietEndHour)
          if (quietHours.length === 0) return

          const hourIndex = Math.abs(minute) % quietHours.length
          const hour = quietHours[hourIndex]

          const t = dayjs('2024-09-20')
            .hour(hour)
            .minute(minute)
            .second(0)

          mockProactiveEvents.length = 0
          mockSettings = {
            reminders: {
              enabled: true,
              mealReminders: true,
              planAdjustmentReminders: true,
              weeklyReportReminders: true,
              postLogGapSummaryInChat: true,
              postLogGapDesktopNotify: false,
              quietStartHour,
              quietEndHour,
              cooldownHours: 0,
            },
            calorieGoal: 2000,
          }

          const result = await evaluateSchedulerTick(t)

          expect(result.fired).toBeNull()
          expect(result.quietHoursActive).toBe(true)
        },
      ),
      { ...defaultRunConfig() },
    )
  })
})
