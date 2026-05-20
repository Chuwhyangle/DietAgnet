import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock localStorage
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

import { getCoachingSettings, saveCoachingSettings } from '../trustDial'

const COACHING_SETTINGS_KEY = 'diet-agent-coaching-settings'

describe('trustDial', () => {
  beforeEach(() => {
    mockLocalStorage.clear()
  })

  describe('getCoachingSettings', () => {
    it('returns defaults when localStorage is empty', () => {
      const settings = getCoachingSettings()
      expect(settings).toEqual({
        trustMode: 'autopilot',
        estimateAutoConfidence: 0.7,
      })
    })

    it('returns stored settings when valid', () => {
      mockLocalStorage.setItem(
        COACHING_SETTINGS_KEY,
        JSON.stringify({ trustMode: 'precision', estimateAutoConfidence: 0.85 }),
      )
      const settings = getCoachingSettings()
      expect(settings.trustMode).toBe('precision')
      expect(settings.estimateAutoConfidence).toBe(0.85)
    })

    it('returns defaults when JSON is invalid', () => {
      mockLocalStorage.setItem(COACHING_SETTINGS_KEY, 'not-json')
      const settings = getCoachingSettings()
      expect(settings).toEqual({
        trustMode: 'autopilot',
        estimateAutoConfidence: 0.7,
      })
    })

    it('returns default trustMode when stored value is invalid', () => {
      mockLocalStorage.setItem(
        COACHING_SETTINGS_KEY,
        JSON.stringify({ trustMode: 'invalid', estimateAutoConfidence: 0.8 }),
      )
      const settings = getCoachingSettings()
      expect(settings.trustMode).toBe('autopilot')
      expect(settings.estimateAutoConfidence).toBe(0.8)
    })

    it('clamps estimateAutoConfidence below 0.5 to default', () => {
      mockLocalStorage.setItem(
        COACHING_SETTINGS_KEY,
        JSON.stringify({ trustMode: 'precision', estimateAutoConfidence: 0.3 }),
      )
      const settings = getCoachingSettings()
      expect(settings.estimateAutoConfidence).toBe(0.7)
    })

    it('clamps estimateAutoConfidence above 0.95 to default', () => {
      mockLocalStorage.setItem(
        COACHING_SETTINGS_KEY,
        JSON.stringify({ trustMode: 'autopilot', estimateAutoConfidence: 1.5 }),
      )
      const settings = getCoachingSettings()
      expect(settings.estimateAutoConfidence).toBe(0.7)
    })

    it('handles NaN estimateAutoConfidence gracefully', () => {
      mockLocalStorage.setItem(
        COACHING_SETTINGS_KEY,
        JSON.stringify({ trustMode: 'autopilot', estimateAutoConfidence: 'abc' }),
      )
      const settings = getCoachingSettings()
      expect(settings.estimateAutoConfidence).toBe(0.7)
    })
  })

  describe('saveCoachingSettings', () => {
    it('persists valid settings to localStorage', () => {
      saveCoachingSettings({ trustMode: 'precision', estimateAutoConfidence: 0.8 })
      const raw = mockLocalStorage.getItem(COACHING_SETTINGS_KEY)
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed.trustMode).toBe('precision')
      expect(parsed.estimateAutoConfidence).toBe(0.8)
    })

    it('normalizes invalid trustMode before saving', () => {
      saveCoachingSettings({ trustMode: 'bogus' as any, estimateAutoConfidence: 0.7 })
      const raw = JSON.parse(mockLocalStorage.getItem(COACHING_SETTINGS_KEY)!)
      expect(raw.trustMode).toBe('autopilot')
    })

    it('normalizes out-of-range confidence before saving', () => {
      saveCoachingSettings({ trustMode: 'autopilot', estimateAutoConfidence: 99 })
      const raw = JSON.parse(mockLocalStorage.getItem(COACHING_SETTINGS_KEY)!)
      expect(raw.estimateAutoConfidence).toBe(0.7)
    })

    it('round-trips correctly through get/save', () => {
      const original = { trustMode: 'precision' as const, estimateAutoConfidence: 0.65 }
      saveCoachingSettings(original)
      const loaded = getCoachingSettings()
      expect(loaded).toEqual(original)
    })

    it('switching modes does not invalidate prior entries', () => {
      saveCoachingSettings({ trustMode: 'autopilot', estimateAutoConfidence: 0.7 })
      saveCoachingSettings({ trustMode: 'precision', estimateAutoConfidence: 0.7 })
      const settings = getCoachingSettings()
      expect(settings.trustMode).toBe('precision')
    })
  })
})
