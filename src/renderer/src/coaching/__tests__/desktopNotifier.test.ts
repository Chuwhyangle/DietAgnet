import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

// Stub window global for node test environment
const mockShowNotification = vi.fn()
vi.stubGlobal('window', {
  agent: {
    showNotification: mockShowNotification,
  },
})

// Mock localStorage for settings
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
vi.stubGlobal('localStorage', mockLocalStorage)

// Mock the audit log
vi.mock('../auditLog', () => ({
  writeAuditEntry: vi.fn().mockResolvedValue({
    id: 1,
    actor: 'system',
    action: 'notificationUnsupported',
    payload: {},
    timestamp: new Date().toISOString(),
  }),
}))

// Mock proactive/rules
vi.mock('../../proactive/rules', () => ({
  isReminderQuietHours: vi.fn().mockReturnValue(false),
}))

// Mock stores/settings
vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn().mockReturnValue({
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

import { writeAuditEntry } from '../auditLog'
import { isReminderQuietHours } from '../../proactive/rules'
import type { NotifyOptions } from '../types'

const mockedIsQuietHours = vi.mocked(isReminderQuietHours)
const mockedWriteAuditEntry = vi.mocked(writeAuditEntry)

function makeOptions(overrides?: Partial<NotifyOptions>): NotifyOptions {
  return {
    title: '早餐还没记哦',
    body: '吃过的话我可以帮你补一下；还没吃的话，也可以去挑几个简单早餐。',
    page: 'diet-log',
    urgency: 'normal',
    ...overrides,
  }
}

describe('desktopNotifier', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockLocalStorage.clear()
    mockedIsQuietHours.mockReturnValue(false)

    // Reset the module-level unsupportedAuditWritten flag by resetting the module
    vi.resetModules()

    // Restore the window.agent mock
    mockShowNotification.mockResolvedValue({
      supported: true,
      shown: true,
    })
    ;(window as any).agent = {
      showNotification: mockShowNotification,
    }
  })

  async function importNotifier() {
    const mod = await import('../desktopNotifier')
    return mod.sendDesktopNotification
  }

  describe('successful OS notification delivery', () => {
    it('delivers an OS notification when supported and outside quiet hours', async () => {
      const sendDesktopNotification = await importNotifier()
      const result = await sendDesktopNotification(makeOptions())

      expect(result).toEqual({ delivered: true, fallbackInApp: false })
      expect(mockShowNotification).toHaveBeenCalledWith({
        title: '早餐还没记哦',
        body: '吃过的话我可以帮你补一下；还没吃的话，也可以去挑几个简单早餐。',
        urgency: 'normal',
        page: 'diet-log',
      })
    })

    it('passes urgency from options to the notification request', async () => {
      const sendDesktopNotification = await importNotifier()
      await sendDesktopNotification(makeOptions({ urgency: 'critical' }))

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ urgency: 'critical' }),
      )
    })

    it('defaults urgency to normal when not specified', async () => {
      const sendDesktopNotification = await importNotifier()
      const opts = makeOptions()
      delete opts.urgency
      await sendDesktopNotification(opts)

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ urgency: 'normal' }),
      )
    })
  })

  describe('quiet hours blocking', () => {
    it('does NOT deliver OS notification during quiet hours', async () => {
      mockedIsQuietHours.mockReturnValue(true)
      const sendDesktopNotification = await importNotifier()

      const result = await sendDesktopNotification(makeOptions())

      expect(result).toEqual({ delivered: false, fallbackInApp: false })
      expect(mockShowNotification).not.toHaveBeenCalled()
    })

    it('does NOT fall back to in-app during quiet hours', async () => {
      mockedIsQuietHours.mockReturnValue(true)
      const sendDesktopNotification = await importNotifier()

      const result = await sendDesktopNotification(makeOptions())

      expect(result.fallbackInApp).toBe(false)
    })
  })

  describe('notification unsupported fallback', () => {
    it('falls back to in-app when window.agent.showNotification is not available', async () => {
      ;(window as any).agent = {}
      const sendDesktopNotification = await importNotifier()

      const result = await sendDesktopNotification(makeOptions())

      expect(result).toEqual({ delivered: false, fallbackInApp: true })
    })

    it('falls back to in-app when window.agent is undefined', async () => {
      ;(window as any).agent = undefined
      const sendDesktopNotification = await importNotifier()

      const result = await sendDesktopNotification(makeOptions())

      expect(result).toEqual({ delivered: false, fallbackInApp: true })
    })

    it('falls back to in-app when response.supported is false', async () => {
      mockShowNotification.mockResolvedValue({
        supported: false,
        shown: false,
        reason: 'Notification.isSupported() returned false',
      })
      const sendDesktopNotification = await importNotifier()

      const result = await sendDesktopNotification(makeOptions())

      expect(result).toEqual({ delivered: false, fallbackInApp: true })
    })

    it('falls back to in-app when showNotification throws', async () => {
      mockShowNotification.mockRejectedValue(new Error('IPC failed'))
      const sendDesktopNotification = await importNotifier()

      const result = await sendDesktopNotification(makeOptions())

      expect(result).toEqual({ delivered: false, fallbackInApp: true })
    })
  })

  describe('audit log for unsupported notifications', () => {
    it('writes notificationUnsupported audit entry when bridge is unavailable', async () => {
      ;(window as any).agent = {}
      const sendDesktopNotification = await importNotifier()

      await sendDesktopNotification(makeOptions())

      expect(mockedWriteAuditEntry).toHaveBeenCalledWith({
        actor: 'system',
        action: 'notificationUnsupported',
        payload: {
          reason: 'window.agent.showNotification is not available',
        },
      })
    })

    it('writes notificationUnsupported audit entry when response.supported is false', async () => {
      mockShowNotification.mockResolvedValue({
        supported: false,
        shown: false,
        reason: 'Platform does not support notifications',
      })
      const sendDesktopNotification = await importNotifier()

      await sendDesktopNotification(makeOptions())

      expect(mockedWriteAuditEntry).toHaveBeenCalledWith({
        actor: 'system',
        action: 'notificationUnsupported',
        payload: {
          reason: 'Platform does not support notifications',
        },
      })
    })

    it('writes audit entry only once per session when bridge is unavailable', async () => {
      ;(window as any).agent = {}
      const sendDesktopNotification = await importNotifier()

      await sendDesktopNotification(makeOptions())
      await sendDesktopNotification(makeOptions())
      await sendDesktopNotification(makeOptions())

      expect(mockedWriteAuditEntry).toHaveBeenCalledTimes(1)
    })
  })

  describe('notification body matches message exactly', () => {
    it('passes body string unchanged to showNotification', async () => {
      const sendDesktopNotification = await importNotifier()
      const body = '午餐记一下，猫猫虫才能帮你看下午和晚餐怎么安排。'
      await sendDesktopNotification(makeOptions({ body }))

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ body }),
      )
    })
  })
})
