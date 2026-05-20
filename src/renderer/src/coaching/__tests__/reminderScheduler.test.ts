import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { evaluateSchedulerTick, startForegroundScheduler } from '../reminderScheduler'

dayjs.extend(isoWeek)

// Mock settings
const mockSettings = {
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
  calorieGoal: 2000,
}

vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn(() => mockSettings),
}))

// Mock diet log
const mockDietLogs: Record<string, any> = {}
vi.mock('../../stores/dietLog', () => ({
  getDietLog: vi.fn((date: string) => mockDietLogs[date] ?? null),
  getLogsForRange: vi.fn((startDate: string, endDate: string) => {
    const logs: any[] = []
    let current = dayjs(startDate)
    const end = dayjs(endDate)
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      const dateStr = current.format('YYYY-MM-DD')
      if (mockDietLogs[dateStr]) {
        logs.push(mockDietLogs[dateStr])
      }
      current = current.add(1, 'day')
    }
    return logs
  }),
  mealTypeLabels: {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '加餐',
  },
}))

// Mock planning store
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

// Mock proactive rules (only isReminderQuietHours)
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

function createDietLog(date: string, mealType: string): any {
  return {
    date,
    meals: [
      {
        type: mealType,
        items: [{ recipeId: 'r1', name: 'Food', servings: 1, calories: 500, protein: 20, carbs: 60, fat: 15 }],
      },
    ],
  }
}

describe('evaluateSchedulerTick', () => {
  beforeEach(() => {
    mockProactiveEvents.length = 0
    Object.keys(mockDietLogs).forEach((key) => delete mockDietLogs[key])
    mockSettings.reminders.enabled = true
    mockSettings.reminders.mealReminders = true
    mockSettings.reminders.quietStartHour = 23
    mockSettings.reminders.quietEndHour = 7
    mockSettings.reminders.cooldownHours = 4
    vi.clearAllMocks()
  })

  it('returns quietHoursActive=true during quiet hours and does not fire', async () => {
    // 2:00 AM is within quiet hours (23:00 - 07:00)
    const now = dayjs('2024-03-10T02:00:00')
    const result = await evaluateSchedulerTick(now)

    expect(result.fired).toBeNull()
    expect(result.quietHoursActive).toBe(true)
    expect(result.escalated).toBe(false)
  })

  it('does not fire when reminders are globally disabled', async () => {
    mockSettings.reminders.enabled = false
    const now = dayjs('2024-03-10T09:00:00')
    const result = await evaluateSchedulerTick(now)

    expect(result.fired).toBeNull()
    expect(result.quietHoursActive).toBe(false)
  })

  it('does not fire when mealReminders are disabled', async () => {
    mockSettings.reminders.mealReminders = false
    const now = dayjs('2024-03-10T09:00:00')
    const result = await evaluateSchedulerTick(now)

    expect(result.fired).toBeNull()
  })

  it('fires a breakfast reminder after 8:00 when breakfast is not logged', async () => {
    const now = dayjs('2024-03-10T09:00:00')
    const result = await evaluateSchedulerTick(now)

    expect(result.fired).not.toBeNull()
    expect(result.fired!.ruleId).toBe('coaching_breakfast_reminder')
    expect(result.fired!.priority).toBe('low')
    expect(result.escalated).toBe(false)
    expect(result.fired!.payload.mealType).toBe('breakfast')
    expect(result.fired!.payload.escalationLevel).toBe(0)
  })

  it('does not fire breakfast reminder when breakfast is already logged', async () => {
    mockDietLogs['2024-03-10'] = createDietLog('2024-03-10', 'breakfast')
    const now = dayjs('2024-03-10T09:00:00')
    const result = await evaluateSchedulerTick(now)

    // Should not fire breakfast, might fire lunch if after 13:00
    expect(result.fired?.payload?.mealType).not.toBe('breakfast')
  })

  it('fires a lunch reminder after 13:00 when lunch is not logged', async () => {
    // Log breakfast so it doesn't fire first
    mockDietLogs['2024-03-10'] = createDietLog('2024-03-10', 'breakfast')
    const now = dayjs('2024-03-10T14:00:00')
    const result = await evaluateSchedulerTick(now)

    expect(result.fired).not.toBeNull()
    expect(result.fired!.ruleId).toBe('coaching_lunch_reminder')
    expect(result.fired!.payload.mealType).toBe('lunch')
  })

  it('fires a dinner reminder after 20:00 when dinner is not logged', async () => {
    // Log breakfast and lunch
    mockDietLogs['2024-03-10'] = {
      date: '2024-03-10',
      meals: [
        { type: 'breakfast', items: [{ recipeId: 'r1', name: 'Food', servings: 1, calories: 300, protein: 10, carbs: 40, fat: 10 }] },
        { type: 'lunch', items: [{ recipeId: 'r2', name: 'Food2', servings: 1, calories: 500, protein: 20, carbs: 60, fat: 15 }] },
      ],
    }
    const now = dayjs('2024-03-10T21:00:00')
    const result = await evaluateSchedulerTick(now)

    expect(result.fired).not.toBeNull()
    expect(result.fired!.ruleId).toBe('coaching_dinner_reminder')
    expect(result.fired!.payload.mealType).toBe('dinner')
  })

  it('escalates a meal reminder after 90 minutes if meal still unlogged', async () => {
    // Simulate a previous firing 100 minutes ago
    const firedAt = dayjs('2024-03-10T08:30:00').toISOString()
    mockProactiveEvents.push({
      id: 1,
      ruleId: 'coaching_breakfast_reminder',
      trigger: 'cron',
      priority: 'low',
      firedAt,
      delivered: true,
      message: 'test',
      payload: { escalationLevel: 0, dismissCount: 0, quietHoursActive: false },
    })

    // Set cooldown to 1 hour so the cooldown from the first event has passed
    mockSettings.reminders.cooldownHours = 1

    const now = dayjs('2024-03-10T10:01:00') // 91 minutes after firing
    const result = await evaluateSchedulerTick(now)

    expect(result.fired).not.toBeNull()
    expect(result.fired!.priority).toBe('medium') // escalated
    expect(result.escalated).toBe(true)
    expect(result.fired!.payload.escalationLevel).toBe(1)
  })

  it('does not escalate if meal has been logged', async () => {
    const firedAt = dayjs('2024-03-10T08:30:00').toISOString()
    mockProactiveEvents.push({
      id: 1,
      ruleId: 'coaching_breakfast_reminder',
      trigger: 'cron',
      priority: 'low',
      firedAt,
      delivered: true,
      message: 'test',
      payload: { escalationLevel: 0, dismissCount: 0, quietHoursActive: false },
    })

    // Breakfast is logged
    mockDietLogs['2024-03-10'] = createDietLog('2024-03-10', 'breakfast')

    mockSettings.reminders.cooldownHours = 1
    const now = dayjs('2024-03-10T10:01:00')
    const result = await evaluateSchedulerTick(now)

    // Should not fire breakfast at all since it's logged
    expect(result.fired?.ruleId).not.toBe('coaching_breakfast_reminder')
  })

  it('respects cooldown — does not fire if within cooldown window', async () => {
    // Previous event fired 2 hours ago, cooldown is 4 hours
    const firedAt = dayjs('2024-03-10T07:00:00').toISOString()
    mockProactiveEvents.push({
      id: 1,
      ruleId: 'coaching_breakfast_reminder',
      trigger: 'cron',
      priority: 'low',
      firedAt,
      delivered: true,
      message: 'test',
      payload: { escalationLevel: 0, dismissCount: 0, quietHoursActive: false },
    })

    mockSettings.reminders.cooldownHours = 4
    const now = dayjs('2024-03-10T09:00:00') // Only 2 hours later
    const result = await evaluateSchedulerTick(now)

    // Breakfast rule is in cooldown, so it should skip to next rule or not fire
    expect(result.fired?.ruleId).not.toBe('coaching_breakfast_reminder')
  })

  it('respects dismiss-pause — pauses rule after 3 consecutive dismissals', async () => {
    const baseTime = dayjs('2024-03-10T08:00:00')
    // 3 consecutive dismissals
    for (let i = 0; i < 3; i++) {
      mockProactiveEvents.push({
        id: i + 1,
        ruleId: 'coaching_breakfast_reminder',
        trigger: 'cron',
        priority: 'low',
        firedAt: baseTime.subtract(i * 30, 'minute').toISOString(),
        delivered: true,
        message: 'test',
        userResponse: 'dismissed',
        payload: { escalationLevel: 0, dismissCount: i, quietHoursActive: false },
      })
    }

    // Now try to fire 1 hour after the most recent dismissal (within 24h pause)
    const now = dayjs('2024-03-10T09:00:00')
    mockSettings.reminders.cooldownHours = 0 // Remove cooldown to isolate dismiss-pause
    const result = await evaluateSchedulerTick(now)

    expect(result.fired?.ruleId).not.toBe('coaching_breakfast_reminder')
  })

  it('fires weekly check-in when user has logged ≥3 days this week', async () => {
    // Log all meals for today so meal reminders don't fire
    mockDietLogs['2024-03-10'] = {
      date: '2024-03-10',
      meals: [
        { type: 'breakfast', items: [{ recipeId: 'r1', name: 'F', servings: 1, calories: 300, protein: 10, carbs: 40, fat: 10 }] },
        { type: 'lunch', items: [{ recipeId: 'r2', name: 'F', servings: 1, calories: 500, protein: 20, carbs: 60, fat: 15 }] },
        { type: 'dinner', items: [{ recipeId: 'r3', name: 'F', servings: 1, calories: 600, protein: 25, carbs: 70, fat: 20 }] },
      ],
    }

    // ISO week for 2024-03-10 (Sunday) starts on 2024-03-04 (Monday)
    // Log 3 days this week
    mockDietLogs['2024-03-04'] = createDietLog('2024-03-04', 'lunch')
    mockDietLogs['2024-03-05'] = createDietLog('2024-03-05', 'lunch')
    mockDietLogs['2024-03-06'] = createDietLog('2024-03-06', 'lunch')

    const now = dayjs('2024-03-10T12:00:00') // Sunday noon
    mockSettings.reminders.cooldownHours = 0
    const result = await evaluateSchedulerTick(now)

    expect(result.fired).not.toBeNull()
    expect(result.fired!.ruleId).toBe('coaching_weekly_checkin')
    expect(result.fired!.payload.loggedDays).toBeGreaterThanOrEqual(3)
  })

  it('does not fire weekly check-in when fewer than 3 days logged', async () => {
    // Log all meals for today so meal reminders don't fire
    mockDietLogs['2024-03-10'] = {
      date: '2024-03-10',
      meals: [
        { type: 'breakfast', items: [{ recipeId: 'r1', name: 'F', servings: 1, calories: 300, protein: 10, carbs: 40, fat: 10 }] },
        { type: 'lunch', items: [{ recipeId: 'r2', name: 'F', servings: 1, calories: 500, protein: 20, carbs: 60, fat: 15 }] },
        { type: 'dinner', items: [{ recipeId: 'r3', name: 'F', servings: 1, calories: 600, protein: 25, carbs: 70, fat: 20 }] },
      ],
    }

    // Only 1 other day logged this week (today counts as 1, so total = 2, not enough for ≥3)
    mockDietLogs['2024-03-04'] = createDietLog('2024-03-04', 'lunch')

    const now = dayjs('2024-03-10T12:00:00')
    mockSettings.reminders.cooldownHours = 0
    const result = await evaluateSchedulerTick(now)

    expect(result.fired?.ruleId).not.toBe('coaching_weekly_checkin')
  })

  it('does not fire weekly check-in twice in the same ISO week', async () => {
    // Log all meals for today
    mockDietLogs['2024-03-10'] = {
      date: '2024-03-10',
      meals: [
        { type: 'breakfast', items: [{ recipeId: 'r1', name: 'F', servings: 1, calories: 300, protein: 10, carbs: 40, fat: 10 }] },
        { type: 'lunch', items: [{ recipeId: 'r2', name: 'F', servings: 1, calories: 500, protein: 20, carbs: 60, fat: 15 }] },
        { type: 'dinner', items: [{ recipeId: 'r3', name: 'F', servings: 1, calories: 600, protein: 25, carbs: 70, fat: 20 }] },
      ],
    }
    mockDietLogs['2024-03-04'] = createDietLog('2024-03-04', 'lunch')
    mockDietLogs['2024-03-05'] = createDietLog('2024-03-05', 'lunch')
    mockDietLogs['2024-03-06'] = createDietLog('2024-03-06', 'lunch')

    // Already fired this week
    mockProactiveEvents.push({
      id: 99,
      ruleId: 'coaching_weekly_checkin',
      trigger: 'cron',
      priority: 'low',
      firedAt: dayjs('2024-03-08T12:00:00').toISOString(), // Friday of same ISO week
      delivered: true,
      message: 'weekly',
      payload: { loggedDays: 3 },
    })

    const now = dayjs('2024-03-10T12:00:00')
    mockSettings.reminders.cooldownHours = 0
    const result = await evaluateSchedulerTick(now)

    expect(result.fired?.ruleId).not.toBe('coaching_weekly_checkin')
  })

  it('persists a ProactiveEvent with required payload fields', async () => {
    const now = dayjs('2024-03-10T09:00:00')
    const result = await evaluateSchedulerTick(now)

    expect(result.fired).not.toBeNull()
    expect(result.fired!.payload).toHaveProperty('sourceTickId')
    expect(result.fired!.payload).toHaveProperty('escalationLevel')
    expect(result.fired!.payload).toHaveProperty('dismissCount')
    expect(result.fired!.payload).toHaveProperty('quietHoursActive')
  })

  it('returns nothing fired when all meals are logged and no weekly check-in needed', async () => {
    mockDietLogs['2024-03-10'] = {
      date: '2024-03-10',
      meals: [
        { type: 'breakfast', items: [{ recipeId: 'r1', name: 'F', servings: 1, calories: 300, protein: 10, carbs: 40, fat: 10 }] },
        { type: 'lunch', items: [{ recipeId: 'r2', name: 'F', servings: 1, calories: 500, protein: 20, carbs: 60, fat: 15 }] },
        { type: 'dinner', items: [{ recipeId: 'r3', name: 'F', servings: 1, calories: 600, protein: 25, carbs: 70, fat: 20 }] },
      ],
    }

    const now = dayjs('2024-03-10T21:00:00')
    const result = await evaluateSchedulerTick(now)

    // No meal reminders needed, and weekly check-in requires ≥3 days
    expect(result.fired).toBeNull()
    expect(result.quietHoursActive).toBe(false)
  })
})

describe('startForegroundScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockProactiveEvents.length = 0
    Object.keys(mockDietLogs).forEach((key) => delete mockDietLogs[key])
    mockSettings.reminders.enabled = true
    mockSettings.reminders.mealReminders = true
    mockSettings.reminders.quietStartHour = 23
    mockSettings.reminders.quietEndHour = 7
    mockSettings.reminders.cooldownHours = 4
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a cleanup function', () => {
    const cleanup = startForegroundScheduler()
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('sets up a 10-minute interval', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    const cleanup = startForegroundScheduler()

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10 * 60 * 1000)
    cleanup()
    setIntervalSpy.mockRestore()
  })

  it('cleanup clears the interval', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    const cleanup = startForegroundScheduler()
    cleanup()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})
