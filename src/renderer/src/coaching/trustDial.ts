/**
 * Trust Dial — coaching settings store.
 *
 * Persists the user's trust-mode preference and auto-confidence threshold
 * in localStorage under key `diet-agent-coaching-settings`.
 */

import type { CoachingSettings, TrustMode } from './types'

const COACHING_SETTINGS_KEY = 'diet-agent-coaching-settings'

const defaultCoachingSettings: CoachingSettings = {
  trustMode: 'autopilot',
  estimateAutoConfidence: 0.7,
}

function isValidTrustMode(value: unknown): value is TrustMode {
  return value === 'precision' || value === 'autopilot'
}

function normalizeCoachingSettings(raw?: Partial<CoachingSettings> | null): CoachingSettings {
  const trustMode = isValidTrustMode(raw?.trustMode)
    ? raw.trustMode
    : defaultCoachingSettings.trustMode

  const confidence = Number(raw?.estimateAutoConfidence)
  const estimateAutoConfidence =
    Number.isFinite(confidence) && confidence >= 0.5 && confidence <= 0.95
      ? confidence
      : defaultCoachingSettings.estimateAutoConfidence

  return { trustMode, estimateAutoConfidence }
}

export function getCoachingSettings(): CoachingSettings {
  try {
    const raw = localStorage.getItem(COACHING_SETTINGS_KEY)
    if (raw) {
      return normalizeCoachingSettings(JSON.parse(raw) as Partial<CoachingSettings>)
    }
  } catch (error) {
    console.error('Failed to load coaching settings:', error)
  }

  return normalizeCoachingSettings()
}

export function saveCoachingSettings(settings: CoachingSettings): void {
  const normalized = normalizeCoachingSettings(settings)
  localStorage.setItem(COACHING_SETTINGS_KEY, JSON.stringify(normalized))
}
