export const SETTINGS_UPDATED_EVENT = 'diet-agent:settings-updated'
export const DIET_LOG_UPDATED_EVENT = 'diet-agent:diet-log-updated'
export const PLANNING_UPDATED_EVENT = 'diet-agent:planning-updated'

export interface DietLogUpdatedDetail {
  date: string
}

export function emitSettingsUpdated(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT))
}

export function emitDietLogUpdated(date: string): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent<DietLogUpdatedDetail>(DIET_LOG_UPDATED_EVENT, {
      detail: { date },
    }),
  )
}

export function emitPlanningUpdated(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(PLANNING_UPDATED_EVENT))
}
