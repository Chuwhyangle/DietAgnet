/**
 * Example tests for `proactive/rules.ts` (task 4.12, Requirements
 * 2.4, 2.6).
 *
 * `rules.ts` exposes one helper that's safe to test pure (`isReminderQuietHours`)
 * plus a set of async rule-checkers that read from settings + Dexie.
 * The pure helper lets us pin the wrap-around quiet-window logic without
 * any mocking; the async checkers are covered indirectly by the
 * existing `quietHours.property.test.ts` and the planning tests.
 */

import { describe, it, expect, vi } from 'vitest'
import dayjs from 'dayjs'

import { isReminderQuietHours, getSnoozeUntil } from '../rules'
import { makeReminderSettings } from '../../../../test/factories/reminderSettings'

function at(hour: number): dayjs.Dayjs {
  return dayjs(`2024-06-15T${String(hour).padStart(2, '0')}:00:00`)
}

describe('proactive/rules.isReminderQuietHours', () => {
  it('returns true inside a non-wrapping quiet window', () => {
    const settings = makeReminderSettings({
      quietStartHour: 1,
      quietEndHour: 6,
    })
    expect(isReminderQuietHours(settings, at(3))).toBe(true)
    expect(isReminderQuietHours(settings, at(0))).toBe(false)
    expect(isReminderQuietHours(settings, at(6))).toBe(false)
  })

  it('returns true inside a wrapping (around-midnight) quiet window', () => {
    const settings = makeReminderSettings({
      quietStartHour: 23,
      quietEndHour: 7,
    })
    // 23:00, 00:00, 06:00 are inside; 07:00 and noon are outside.
    expect(isReminderQuietHours(settings, at(23))).toBe(true)
    expect(isReminderQuietHours(settings, at(0))).toBe(true)
    expect(isReminderQuietHours(settings, at(6))).toBe(true)
    expect(isReminderQuietHours(settings, at(7))).toBe(false)
    expect(isReminderQuietHours(settings, at(12))).toBe(false)
  })

  it('returns false when start === end (window has zero length)', () => {
    const settings = makeReminderSettings({
      quietStartHour: 5,
      quietEndHour: 5,
    })
    for (let hour = 0; hour < 24; hour += 1) {
      expect(isReminderQuietHours(settings, at(hour))).toBe(false)
    }
  })
})

describe('proactive/rules.getSnoozeUntil', () => {
  it('returns an ISO timestamp `hours` ahead of now', () => {
    vi.useFakeTimers({
      now: new Date('2024-06-15T10:00:00Z'),
      toFake: ['Date'],
    })
    try {
      const iso = getSnoozeUntil(2)
      // Should be exactly 12:00 UTC.
      expect(iso.startsWith('2024-06-15T12:00:00')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
