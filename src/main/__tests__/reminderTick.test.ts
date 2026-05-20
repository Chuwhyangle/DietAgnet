/**
 * Main-process reminder background tick tests (task 8.3).
 *
 * Tests the background tick mechanism in `src/main/index.ts`:
 *   - The tick fires at the documented 30-minute interval
 *   - The tick sends `coaching:reminder-tick` IPC only when the window
 *     is not focused (hidden or minimized)
 *   - Quiet hours are respected (no notification during quiet window)
 *   - Cooldown windows are respected (no notification within cooldown)
 *
 * The main process tick sends an IPC message to the renderer, which then
 * evaluates `evaluateSchedulerTick()`. We test both layers:
 *   1. The main-process setInterval + IPC dispatch logic (via mocked electron)
 *   2. The renderer-side `evaluateSchedulerTick` quiet-hours and cooldown
 *      behavior (mirroring Property 2 at the main-process level)
 *
 * Validates: Requirements 5.3, 5.5
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import {
  electronMock,
  type ElectronMock,
  type BrowserWindowInstance,
} from '../../test/doubles/electron'

// ---------------------------------------------------------------------------
// Module-level mocks for main process
// ---------------------------------------------------------------------------

let mockElectron: ElectronMock

vi.mock('electron', () => {
  mockElectron = electronMock()
  return {
    ...mockElectron,
    shell: { openExternal: vi.fn() },
    Menu: { buildFromTemplate: vi.fn(() => ({})) },
    nativeImage: { createFromDataURL: vi.fn(() => ({})) },
    Tray: vi.fn(() => ({
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      on: vi.fn(),
    })),
  }
})

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
}))

// Mock the agent and dietLog modules to prevent their side effects
vi.mock('../agent', () => ({
  registerAgentIpcHandlers: vi.fn(),
}))

vi.mock('../dietLog', () => ({
  registerDietLogIpcHandlers: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Main-process background tick tests
// ---------------------------------------------------------------------------

describe('Main-process background tick', () => {
  const BACKGROUND_TICK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
  let tickCallback: (() => void) | null = null
  let win: BrowserWindowInstance

  beforeAll(async () => {
    vi.useFakeTimers()

    // Spy on setInterval to capture the tick callback
    const setIntervalSpy = vi.spyOn(global, 'setInterval')

    // Import the module — triggers app.whenReady().then(...)
    await import('../index')
    // Flush the microtask queue so the .then() callback runs
    await vi.advanceTimersByTimeAsync(0)

    // Find the 30-minute interval registration
    const tickCall = setIntervalSpy.mock.calls.find(
      (call) => call[1] === BACKGROUND_TICK_INTERVAL_MS,
    )
    expect(tickCall).toBeDefined()
    tickCallback = tickCall![0] as () => void

    // Get the BrowserWindow instance created during init
    const windowInstances = mockElectron.BrowserWindow.getAllWindows()
    expect(windowInstances.length).toBeGreaterThan(0)
    win = windowInstances[0] as BrowserWindowInstance

    setIntervalSpy.mockRestore()
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('tick interval and IPC dispatch', () => {
    it('registers a setInterval at the documented 30-minute interval', () => {
      // Verified in beforeAll — the callback was captured
      expect(tickCallback).not.toBeNull()
    })

    it('sends coaching:reminder-tick IPC when window is not visible', () => {
      // Simulate window being hidden (not visible)
      win.isVisible.mockReturnValue(false)
      win.isMinimized.mockReturnValue(false)
      win.isFocused.mockReturnValue(false)
      win.isDestroyed.mockReturnValue(false)

      win.webContents.send.mockClear()

      // Invoke the tick callback directly
      tickCallback!()

      expect(win.webContents.send).toHaveBeenCalledWith('coaching:reminder-tick')
    })

    it('sends coaching:reminder-tick IPC when window is minimized', () => {
      // Simulate window being minimized
      win.isVisible.mockReturnValue(true)
      win.isMinimized.mockReturnValue(true)
      win.isFocused.mockReturnValue(false)
      win.isDestroyed.mockReturnValue(false)

      win.webContents.send.mockClear()

      tickCallback!()

      expect(win.webContents.send).toHaveBeenCalledWith('coaching:reminder-tick')
    })

    it('sends coaching:reminder-tick IPC when window is visible but not focused', () => {
      // Simulate window being visible but not focused
      win.isVisible.mockReturnValue(true)
      win.isMinimized.mockReturnValue(false)
      win.isFocused.mockReturnValue(false)
      win.isDestroyed.mockReturnValue(false)

      win.webContents.send.mockClear()

      tickCallback!()

      expect(win.webContents.send).toHaveBeenCalledWith('coaching:reminder-tick')
    })

    it('does NOT send tick when window is focused and visible', () => {
      // Simulate window being focused and visible
      win.isVisible.mockReturnValue(true)
      win.isMinimized.mockReturnValue(false)
      win.isFocused.mockReturnValue(true)
      win.isDestroyed.mockReturnValue(false)

      win.webContents.send.mockClear()

      tickCallback!()

      expect(win.webContents.send).not.toHaveBeenCalledWith('coaching:reminder-tick')
    })

    it('does NOT send tick when window is destroyed', () => {
      // Simulate window being destroyed
      win.isDestroyed.mockReturnValue(true)

      win.webContents.send.mockClear()

      tickCallback!()

      expect(win.webContents.send).not.toHaveBeenCalledWith('coaching:reminder-tick')
    })

    it('fires multiple ticks at the correct cadence', () => {
      win.isVisible.mockReturnValue(false)
      win.isMinimized.mockReturnValue(false)
      win.isFocused.mockReturnValue(false)
      win.isDestroyed.mockReturnValue(false)

      win.webContents.send.mockClear()

      // Invoke the tick callback 3 times (simulating 3 intervals)
      tickCallback!()
      tickCallback!()
      tickCallback!()

      const tickCalls = win.webContents.send.mock.calls.filter(
        (call) => call[0] === 'coaching:reminder-tick',
      )
      expect(tickCalls.length).toBe(3)
    })
  })
})

// ---------------------------------------------------------------------------
// Renderer-side evaluateSchedulerTick quiet-hours and cooldown tests
// (mirroring Property 2 at the main-process level per Requirement 5.3)
// ---------------------------------------------------------------------------

describe('evaluateSchedulerTick — quiet hours and cooldown (main-process level mirror)', () => {
  // These tests exercise the renderer scheduling logic that the main-process
  // tick triggers, verifying the quiet-hours invariant and cooldown behavior
  // under fake timers.

  let mockSettings: {
    reminders: {
      enabled: boolean
      mealReminders: boolean
      planAdjustmentReminders: boolean
      weeklyReportReminders: boolean
      postLogGapSummaryInChat: boolean
      postLogGapDesktopNotify: boolean
      quietStartHour: number
      quietEndHour: number
      cooldownHours: number
    }
    calorieGoal: number
  }
  let mockProactiveEvents: any[]
  let mockDietLogs: Record<string, any>
  let evaluateSchedulerTick: typeof import('../../renderer/src/coaching/reminderScheduler').evaluateSchedulerTick

  beforeEach(async () => {
    vi.useFakeTimers()

    mockSettings = {
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
    mockProactiveEvents = []
    mockDietLogs = {}

    vi.doMock('../../renderer/src/stores/settings', () => ({
      getSettings: vi.fn(() => mockSettings),
    }))

    vi.doMock('../../renderer/src/stores/dietLog', () => ({
      getDietLog: vi.fn((date: string) => mockDietLogs[date] ?? null),
      getLogsForRange: vi.fn(() => []),
      mealTypeLabels: {
        breakfast: '早餐',
        lunch: '午餐',
        dinner: '晚餐',
        snack: '加餐',
      },
    }))

    vi.doMock('../../renderer/src/stores/planning', () => ({
      getLatestProactiveEventForRule: vi.fn(async (ruleId: string) => {
        const events = mockProactiveEvents
          .filter((e: any) => e.ruleId === ruleId)
          .sort((a: any, b: any) => b.firedAt.localeCompare(a.firedAt))
        return events[0] ?? null
      }),
      getRecentProactiveEventsForRule: vi.fn(async (ruleId: string, limit: number) => {
        return mockProactiveEvents
          .filter((e: any) => e.ruleId === ruleId)
          .sort((a: any, b: any) => b.firedAt.localeCompare(a.firedAt))
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

    vi.doMock('../../renderer/src/proactive/rules', () => ({
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

    const mod = await import('../../renderer/src/coaching/reminderScheduler')
    evaluateSchedulerTick = mod.evaluateSchedulerTick
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  describe('quiet hours invariant', () => {
    it('never fires during quiet hours (23:00-07:00 wrapping window)', async () => {
      const dayjs = (await import('dayjs')).default

      // Test every hour in the quiet window
      const quietHours = [23, 0, 1, 2, 3, 4, 5, 6]
      for (const hour of quietHours) {
        const now = dayjs(`2024-06-15T${hour.toString().padStart(2, '0')}:30:00`)
        const result = await evaluateSchedulerTick(now)

        expect(result.fired).toBeNull()
        expect(result.quietHoursActive).toBe(true)
      }
    })

    it('allows firing outside quiet hours', async () => {
      const dayjs = (await import('dayjs')).default

      // 9:00 AM is outside quiet hours (23:00-07:00)
      const now = dayjs('2024-06-15T09:00:00')
      const result = await evaluateSchedulerTick(now)

      // Should fire breakfast reminder (no breakfast logged, after 8:00)
      expect(result.fired).not.toBeNull()
      expect(result.quietHoursActive).toBe(false)
    })

    it('respects non-wrapping quiet hours window', async () => {
      const dayjs = (await import('dayjs')).default

      // Configure non-wrapping quiet hours: 1:00 - 6:00
      mockSettings.reminders.quietStartHour = 1
      mockSettings.reminders.quietEndHour = 6

      // 3:00 AM is within quiet hours
      const now = dayjs('2024-06-15T03:00:00')
      const result = await evaluateSchedulerTick(now)

      expect(result.fired).toBeNull()
      expect(result.quietHoursActive).toBe(true)
    })

    it('does not activate quiet hours when start equals end', async () => {
      const dayjs = (await import('dayjs')).default

      // When start == end, quiet hours are disabled
      mockSettings.reminders.quietStartHour = 7
      mockSettings.reminders.quietEndHour = 7

      const now = dayjs('2024-06-15T07:30:00')
      const result = await evaluateSchedulerTick(now)

      // Quiet hours not active (start == end means disabled)
      expect(result.quietHoursActive).toBe(false)
    })
  })

  describe('cooldown window', () => {
    it('does not fire within the cooldown period after last notification', async () => {
      const dayjs = (await import('dayjs')).default

      // A breakfast reminder fired 2 hours ago; cooldown is 4 hours
      mockProactiveEvents.push({
        id: 1,
        ruleId: 'coaching_breakfast_reminder',
        trigger: 'cron',
        priority: 'low',
        firedAt: dayjs('2024-06-15T08:00:00').toISOString(),
        delivered: true,
        message: 'test',
        payload: { escalationLevel: 0, dismissCount: 0, quietHoursActive: false },
      })

      mockSettings.reminders.cooldownHours = 4

      // 2 hours later — still within cooldown
      const now = dayjs('2024-06-15T10:00:00')
      const result = await evaluateSchedulerTick(now)

      // The breakfast rule should not fire (in cooldown)
      expect(result.fired?.ruleId).not.toBe('coaching_breakfast_reminder')
    })

    it('fires after the cooldown period has elapsed', async () => {
      const dayjs = (await import('dayjs')).default

      // A breakfast reminder fired 5 hours ago; cooldown is 4 hours
      mockProactiveEvents.push({
        id: 1,
        ruleId: 'coaching_breakfast_reminder',
        trigger: 'cron',
        priority: 'low',
        firedAt: dayjs('2024-06-15T08:00:00').toISOString(),
        delivered: true,
        message: 'test',
        payload: { escalationLevel: 0, dismissCount: 0, quietHoursActive: false },
      })

      mockSettings.reminders.cooldownHours = 4

      // 5 hours later — cooldown has elapsed
      const now = dayjs('2024-06-15T13:00:00')
      const result = await evaluateSchedulerTick(now)

      // Should be able to fire (breakfast still not logged, after 8:00)
      expect(result.fired).not.toBeNull()
      expect(result.cooldownActive).toBe(false)
    })

    it('respects explicit cooldownUntil timestamp on a proactive event', async () => {
      const dayjs = (await import('dayjs')).default

      // Event has an explicit cooldownUntil that extends beyond the normal cooldown
      mockProactiveEvents.push({
        id: 1,
        ruleId: 'coaching_breakfast_reminder',
        trigger: 'cron',
        priority: 'low',
        firedAt: dayjs('2024-06-15T08:00:00').toISOString(),
        cooldownUntil: dayjs('2024-06-15T15:00:00').toISOString(),
        delivered: true,
        message: 'test',
        payload: { escalationLevel: 0, dismissCount: 0, quietHoursActive: false },
      })

      mockSettings.reminders.cooldownHours = 2 // Normal cooldown would end at 10:00

      // 13:00 — past normal cooldown but before explicit cooldownUntil
      const now = dayjs('2024-06-15T13:00:00')
      const result = await evaluateSchedulerTick(now)

      // Should not fire breakfast (explicit cooldownUntil still active)
      expect(result.fired?.ruleId).not.toBe('coaching_breakfast_reminder')
    })
  })

  describe('tick cadence under fake timers', () => {
    it('evaluateSchedulerTick can be called at each tick interval without error', async () => {
      const dayjs = (await import('dayjs')).default

      // Simulate calling evaluateSchedulerTick at 30-minute intervals
      // (as the main process would trigger it)
      const startTime = dayjs('2024-06-15T08:00:00')
      const results: any[] = []

      for (let i = 0; i < 4; i++) {
        const tickTime = startTime.add(i * 30, 'minute')
        const result = await evaluateSchedulerTick(tickTime)
        results.push(result)
      }

      // First tick should fire (breakfast not logged, after 8:00)
      expect(results[0].fired).not.toBeNull()
      expect(results[0].fired.ruleId).toBe('coaching_breakfast_reminder')

      // Subsequent ticks within cooldown should not fire the same rule
      // (cooldown is 4 hours, so ticks at 8:30, 9:00, 9:30 are all within cooldown)
      for (let i = 1; i < 4; i++) {
        expect(results[i].fired?.ruleId).not.toBe('coaching_breakfast_reminder')
      }
    })

    it('transitions from quiet hours to active firing as time advances', async () => {
      const dayjs = (await import('dayjs')).default

      // Start at 6:30 AM (quiet hours), advance past 7:00 AM
      const quietTime = dayjs('2024-06-15T06:30:00')
      const activeTime = dayjs('2024-06-15T08:30:00')

      const quietResult = await evaluateSchedulerTick(quietTime)
      expect(quietResult.quietHoursActive).toBe(true)
      expect(quietResult.fired).toBeNull()

      const activeResult = await evaluateSchedulerTick(activeTime)
      expect(activeResult.quietHoursActive).toBe(false)
      // After 8:00, breakfast reminder should fire
      expect(activeResult.fired).not.toBeNull()
    })
  })
})
