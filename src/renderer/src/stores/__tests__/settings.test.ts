/**
 * Example tests for `stores/settings.ts` (task 4.13, Requirements
 * 2.5, 2.8).
 */

import { describe, it, expect } from 'vitest'

import { getSettings, saveSettings } from '../settings'

const STORAGE_KEY = 'diet-agent-settings'

describe('stores/settings', () => {
  it('returns sensible defaults when nothing is persisted', () => {
    const settings = getSettings()
    expect(settings.language).toBe('en')
    expect(settings.nickname).toBe('')
    expect(settings.calorieGoal).toBe(2000)
    expect(settings.reminders.enabled).toBe(true)
    expect(settings.reminders.quietStartHour).toBe(23)
    expect(settings.reminders.quietEndHour).toBe(7)
    expect(settings.memoryPostChatExtraction).toBe(true)
  })

  it('returns defaults when JSON is invalid', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    const settings = getSettings()
    expect(settings.nickname).toBe('')
  })

  it('saveSettings persists and getSettings round-trips the value', () => {
    const initial = getSettings()
    saveSettings({
      ...initial,
      nickname: '猫猫',
      language: 'zh',
      calorieGoal: 1800,
      reminders: {
        ...initial.reminders,
        cooldownHours: 6,
      },
    })

    const roundTripped = getSettings()
    expect(roundTripped.nickname).toBe('猫猫')
    expect(roundTripped.language).toBe('zh')
    expect(roundTripped.calorieGoal).toBe(1800)
    expect(roundTripped.reminders.cooldownHours).toBe(6)
  })

  it('normalizes legacy / partial reminder settings on load (migration path)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        nickname: '猫',
        reminders: {
          // intentionally omitting most fields → normalizer fills defaults
          quietStartHour: 22,
        },
      }),
    )
    const settings = getSettings()
    expect(settings.reminders.quietStartHour).toBe(22)
    expect(settings.reminders.quietEndHour).toBe(7) // default carried over
    expect(settings.reminders.enabled).toBe(true)
  })

  it('clamps invalid memoryPostChatAutoConfidence into valid range', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        memoryPostChatAutoConfidence: 5,
        memoryPostChatPendingMinConfidence: -1,
      }),
    )
    const settings = getSettings()
    expect(settings.memoryPostChatAutoConfidence).toBeLessThanOrEqual(1)
    expect(settings.memoryPostChatPendingMinConfidence).toBeGreaterThanOrEqual(0)
  })

  it('normalizes invalid language to English', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        language: 'fr',
      }),
    )
    const settings = getSettings()
    expect(settings.language).toBe('en')
  })
})
