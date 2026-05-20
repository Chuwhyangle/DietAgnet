/**
 * Example tests for `stores/events.ts` (task 4.13, Requirement 2.5).
 *
 * The events module wraps `window.dispatchEvent` with typed `CustomEvent`
 * helpers. Each emitter is a one-liner; the test pins the dispatched
 * event name and the `detail` shape so consumers can rely on them.
 */

import { describe, it, expect, vi } from 'vitest'

import {
  CHAT_HISTORY_UPDATED_EVENT,
  DIET_LOG_UPDATED_EVENT,
  MEMORY_UPDATED_EVENT,
  PLANNING_UPDATED_EVENT,
  RECIPE_CALIBRATION_UPDATED_EVENT,
  SETTINGS_UPDATED_EVENT,
  emitChatHistoryUpdated,
  emitDietLogUpdated,
  emitMemoryUpdated,
  emitPlanningUpdated,
  emitRecipeCalibrationUpdated,
  emitSettingsUpdated,
} from '../events'

describe('stores/events', () => {
  it('emitDietLogUpdated dispatches the named event with a date payload', () => {
    const handler = vi.fn()
    window.addEventListener(DIET_LOG_UPDATED_EVENT, handler as EventListener)
    try {
      emitDietLogUpdated('2024-06-15', { mealType: 'lunch' })
      expect(handler).toHaveBeenCalledTimes(1)
      const event = handler.mock.calls[0][0] as CustomEvent
      expect(event.detail).toEqual({ date: '2024-06-15', mealType: 'lunch' })
    } finally {
      window.removeEventListener(DIET_LOG_UPDATED_EVENT, handler as EventListener)
    }
  })

  it('emitChatHistoryUpdated dispatches with an `appendedCoach` payload', () => {
    const handler = vi.fn()
    window.addEventListener(CHAT_HISTORY_UPDATED_EVENT, handler as EventListener)
    try {
      emitChatHistoryUpdated({})
      emitChatHistoryUpdated({
        appendedCoach: {
          id: 'coach-1',
          kind: 'coach',
          content: 'digest',
          timestamp: '2024-06-15T10:00:00.000Z',
        },
      })
      expect(handler).toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener(
        CHAT_HISTORY_UPDATED_EVENT,
        handler as EventListener,
      )
    }
  })

  it('the simple emitters fire their named events with no detail', () => {
    const cases = [
      [SETTINGS_UPDATED_EVENT, emitSettingsUpdated],
      [PLANNING_UPDATED_EVENT, emitPlanningUpdated],
      [RECIPE_CALIBRATION_UPDATED_EVENT, emitRecipeCalibrationUpdated],
      [MEMORY_UPDATED_EVENT, emitMemoryUpdated],
    ] as const

    for (const [eventName, emitter] of cases) {
      const handler = vi.fn()
      window.addEventListener(eventName, handler as EventListener)
      try {
        emitter()
        expect(handler).toHaveBeenCalledTimes(1)
      } finally {
        window.removeEventListener(eventName, handler as EventListener)
      }
    }
  })
})
