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
  usagePricing: AgentUsagePricing
  reminders: ReminderSettings
  /** 对话结束后异步提炼记忆；设为 false 可关闭 */
  memoryPostChatExtraction?: boolean
  /** 置信度 ≥ 该值则直接写入长期记忆（agent_inferred） */
  memoryPostChatAutoConfidence?: number
  /** 置信度介于 [该值, 自动阈值) 则进入「待确认」 */
  memoryPostChatPendingMinConfidence?: number
}

export interface AgentUsagePricing {
  promptUsdPerMillionTokens?: number
  completionUsdPerMillionTokens?: number
}

export interface ReminderSettings {
  enabled: boolean
  mealReminders: boolean
  planAdjustmentReminders: boolean
  weeklyReportReminders: boolean
  /** 记录饮食后把当日与计划偏差摘要写入 AI 对话（不调用大模型） */
  postLogGapSummaryInChat: boolean
  /** 记录后在桌面推送一句偏差摘要（受静音时段与总开关影响） */
  postLogGapDesktopNotify: boolean
  quietStartHour: number
  quietEndHour: number
  cooldownHours: number
}

const SETTINGS_KEY = 'diet-agent-settings'

const defaultSettings: Settings = {
  nickname: '',
  calorieGoal: 2000,
  onboarded: false,
  agent: DEFAULT_AGENT_SETTINGS,
  usagePricing: {},
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
  memoryPostChatExtraction: true,
  memoryPostChatAutoConfidence: 0.78,
  memoryPostChatPendingMinConfidence: 0.52,
}

function normalizeUsagePricing(raw?: Partial<AgentUsagePricing> | null): AgentUsagePricing {
  const promptUsdPerMillionTokens = Number(raw?.promptUsdPerMillionTokens)
  const completionUsdPerMillionTokens = Number(raw?.completionUsdPerMillionTokens)

  return {
    promptUsdPerMillionTokens: Number.isFinite(promptUsdPerMillionTokens) && promptUsdPerMillionTokens >= 0
      ? promptUsdPerMillionTokens
      : undefined,
    completionUsdPerMillionTokens: Number.isFinite(completionUsdPerMillionTokens) && completionUsdPerMillionTokens >= 0
      ? completionUsdPerMillionTokens
      : undefined,
  }
}

function normalizeReminderSettings(raw?: Partial<ReminderSettings> | null): ReminderSettings {
  return {
    enabled: raw?.enabled ?? defaultSettings.reminders.enabled,
    mealReminders: raw?.mealReminders ?? defaultSettings.reminders.mealReminders,
    planAdjustmentReminders: raw?.planAdjustmentReminders ?? defaultSettings.reminders.planAdjustmentReminders,
    weeklyReportReminders: raw?.weeklyReportReminders ?? defaultSettings.reminders.weeklyReportReminders,
    postLogGapSummaryInChat: raw?.postLogGapSummaryInChat !== false,
    postLogGapDesktopNotify: raw?.postLogGapDesktopNotify === true,
    quietStartHour: raw?.quietStartHour ?? defaultSettings.reminders.quietStartHour,
    quietEndHour: raw?.quietEndHour ?? defaultSettings.reminders.quietEndHour,
    cooldownHours: raw?.cooldownHours ?? defaultSettings.reminders.cooldownHours,
  }
}

function clampUnitInterval(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(0.95, Math.max(0.3, value))
}

function normalizeSettings(raw?: Partial<Settings> | null): Settings {
  const autoConf = clampUnitInterval(
    Number(raw?.memoryPostChatAutoConfidence),
    defaultSettings.memoryPostChatAutoConfidence ?? 0.78,
  )
  let pendingMin = clampUnitInterval(
    Number(raw?.memoryPostChatPendingMinConfidence),
    defaultSettings.memoryPostChatPendingMinConfidence ?? 0.52,
  )
  if (pendingMin >= autoConf) {
    pendingMin = Math.max(0.3, autoConf - 0.06)
  }

  return {
    nickname: raw?.nickname?.trim() ?? defaultSettings.nickname,
    calorieGoal: raw?.calorieGoal ?? defaultSettings.calorieGoal,
    onboarded: raw?.onboarded === true,
    agent: normalizeAgentSettings(raw?.agent),
    usagePricing: normalizeUsagePricing(raw?.usagePricing),
    reminders: normalizeReminderSettings(raw?.reminders),
    memoryPostChatExtraction: raw?.memoryPostChatExtraction !== false,
    memoryPostChatAutoConfidence: autoConf,
    memoryPostChatPendingMinConfidence: pendingMin,
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
