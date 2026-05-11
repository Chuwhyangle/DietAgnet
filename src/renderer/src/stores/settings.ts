// 本地设置存储

import {
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  type AgentConnectionSettings,
} from '../../../shared/agent'
import { emitSettingsUpdated } from './events'

export interface Settings {
  nickname: string
  calorieGoal?: number
  onboarded?: boolean
  agent: AgentConnectionSettings
}

const SETTINGS_KEY = 'diet-agent-settings'

const defaultSettings: Settings = {
  nickname: '',
  calorieGoal: 2000,
  onboarded: false,
  agent: DEFAULT_AGENT_SETTINGS,
}

function normalizeSettings(raw?: Partial<Settings> | null): Settings {
  return {
    nickname: raw?.nickname?.trim() ?? defaultSettings.nickname,
    calorieGoal: raw?.calorieGoal ?? defaultSettings.calorieGoal,
    onboarded: raw?.onboarded === true,
    agent: normalizeAgentSettings(raw?.agent),
  }
}

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      return normalizeSettings(JSON.parse(raw) as Partial<Settings>)
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
  }

  return normalizeSettings()
}

export function saveSettings(settings: Settings): void {
  const normalizedSettings = normalizeSettings(settings)
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizedSettings))
  emitSettingsUpdated()
}
