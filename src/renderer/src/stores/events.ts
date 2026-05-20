import type { MealType } from './dietLog'
import type { PersistedChatMessage } from './chatHistory'

export const SETTINGS_UPDATED_EVENT = 'diet-agent:settings-updated'
export const DIET_LOG_UPDATED_EVENT = 'diet-agent:diet-log-updated'
export const PLANNING_UPDATED_EVENT = 'diet-agent:planning-updated'
export const RECIPE_CALIBRATION_UPDATED_EVENT = 'diet-agent:recipe-calibration-updated'
export const MEMORY_UPDATED_EVENT = 'diet-agent:memory-updated'
export const CHAT_HISTORY_UPDATED_EVENT = 'diet-agent:chat-history-updated'

export interface DietLogUpdatedDetail {
  date: string
  mealType?: MealType
  /** 删除条目等场景：先清空当日动态建议再重算，避免旧卡片与现状矛盾 */
  resetPlanSuggestions?: boolean
}

export interface ChatHistoryUpdatedDetail {
  /** 若存在，对话页应追加该条而非整表 reload，避免覆盖未持久化的输入中状态 */
  appendedCoach?: PersistedChatMessage
}

export function emitSettingsUpdated(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT))
}

export function emitDietLogUpdated(date: string, detail: Partial<Omit<DietLogUpdatedDetail, 'date'>> = {}): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent<DietLogUpdatedDetail>(DIET_LOG_UPDATED_EVENT, {
      detail: { date, ...detail },
    }),
  )
}

export function emitChatHistoryUpdated(detail: ChatHistoryUpdatedDetail = {}): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent<ChatHistoryUpdatedDetail>(CHAT_HISTORY_UPDATED_EVENT, { detail }))
}

export function emitPlanningUpdated(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(PLANNING_UPDATED_EVENT))
}

export function emitRecipeCalibrationUpdated(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(RECIPE_CALIBRATION_UPDATED_EVENT))
}

export function emitMemoryUpdated(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(MEMORY_UPDATED_EVENT))
}
