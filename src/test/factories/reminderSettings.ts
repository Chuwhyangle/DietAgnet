/**
 * Reminder settings factory for tests (task 2.6, Requirements 2.1,
 * 2.2, 2.3, 2.4).
 *
 * Production code under `src/renderer/src/stores/settings.ts` defines
 * `ReminderSettings`. Defaults here mirror the production
 * `defaultSettings.reminders`:
 *
 *     enabled:                       true
 *     mealReminders:                 true
 *     planAdjustmentReminders:       true
 *     weeklyReportReminders:         false
 *     postLogGapSummaryInChat:       true
 *     postLogGapDesktopNotify:       false
 *     quietStartHour:                23
 *     quietEndHour:                   7
 *     cooldownHours:                  4
 *
 * The 23 → 7 quiet window deliberately *wraps* across midnight so
 * tests that exercise the wrap-around branch of quiet-hours logic
 * (Requirement 3.2) get the realistic case for free. Tests that
 * specifically need a non-wrapping window can override with
 * `{ quietStartHour: 1, quietEndHour: 6 }`.
 */

import type { ReminderSettings } from '../../renderer/src/stores/settings'

/**
 * Build a valid `ReminderSettings` with the production defaults.
 *
 * Top-level fields are shallow-merged. Boolean fields can be flipped
 * individually without re-stating the rest, e.g.:
 *
 *     makeReminderSettings({ enabled: false })
 *     makeReminderSettings({ quietStartHour: 22, quietEndHour: 6 })
 */
export function makeReminderSettings(
  overrides: Partial<ReminderSettings> = {},
): ReminderSettings {
  const defaults: ReminderSettings = {
    enabled: true,
    mealReminders: true,
    planAdjustmentReminders: true,
    weeklyReportReminders: false,
    postLogGapSummaryInChat: true,
    postLogGapDesktopNotify: false,
    quietStartHour: 23,
    quietEndHour: 7,
    cooldownHours: 4,
  }
  return { ...defaults, ...overrides }
}
