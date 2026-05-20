/**
 * Reminder-settings arbitraries (task 2.7, Requirement 3.2).
 *
 * The quiet-hours invariant in `coaching/reminderScheduler.ts` has a
 * non-trivial branch when `quietStartHour > quietEndHour` (the window
 * wraps midnight: e.g. 23 → 7 covers 23, 0, 1, ..., 6). To force
 * coverage of that branch in property tests we generate three classes
 * of windows in roughly equal proportions:
 *
 *   1. **Non-wrapping** windows where `start < end` (e.g. 1 → 6).
 *   2. **Wrapping** windows where `start > end` (e.g. 23 → 7).
 *   3. **Edge-case** windows where `start === end` (the production
 *      code treats this as "always inside" so it's worth covering).
 *
 * `cooldownHours` spans the full 0..24 range. All boolean toggles
 * vary independently so each combination of feature flags surfaces
 * over many runs.
 */

import * as fc from 'fast-check'
import type { ReminderSettings } from '../../renderer/src/stores/settings'

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const hourArb = fc.integer({ min: 0, max: 23 })

interface QuietWindow {
  quietStartHour: number
  quietEndHour: number
}

const nonWrappingWindow: fc.Arbitrary<QuietWindow> = fc
  .tuple(hourArb, hourArb)
  .filter(([start, end]) => start < end)
  .map(([start, end]) => ({ quietStartHour: start, quietEndHour: end }))

const wrappingWindow: fc.Arbitrary<QuietWindow> = fc
  .tuple(hourArb, hourArb)
  .filter(([start, end]) => start > end)
  .map(([start, end]) => ({ quietStartHour: start, quietEndHour: end }))

const equalWindow: fc.Arbitrary<QuietWindow> = hourArb.map((hour) => ({
  quietStartHour: hour,
  quietEndHour: hour,
}))

const quietWindowArb: fc.Arbitrary<QuietWindow> = fc.oneof(
  { weight: 4, arbitrary: nonWrappingWindow },
  { weight: 4, arbitrary: wrappingWindow },
  { weight: 1, arbitrary: equalWindow },
)

const cooldownHoursArb = fc.integer({ min: 0, max: 24 })

// ---------------------------------------------------------------------------
// Public arbitrary
// ---------------------------------------------------------------------------

/**
 * Generate a `ReminderSettings` covering both wrapping and
 * non-wrapping quiet windows, the full cooldown range, and every
 * combination of boolean feature flags.
 *
 * **Validates: Requirement 3.2**
 */
export function arbReminderSettings(): fc.Arbitrary<ReminderSettings> {
  return fc
    .record({
      enabled: fc.boolean(),
      mealReminders: fc.boolean(),
      planAdjustmentReminders: fc.boolean(),
      weeklyReportReminders: fc.boolean(),
      postLogGapSummaryInChat: fc.boolean(),
      postLogGapDesktopNotify: fc.boolean(),
      window: quietWindowArb,
      cooldownHours: cooldownHoursArb,
    })
    .map((raw) => ({
      enabled: raw.enabled,
      mealReminders: raw.mealReminders,
      planAdjustmentReminders: raw.planAdjustmentReminders,
      weeklyReportReminders: raw.weeklyReportReminders,
      postLogGapSummaryInChat: raw.postLogGapSummaryInChat,
      postLogGapDesktopNotify: raw.postLogGapDesktopNotify,
      quietStartHour: raw.window.quietStartHour,
      quietEndHour: raw.window.quietEndHour,
      cooldownHours: raw.cooldownHours,
    }))
}
