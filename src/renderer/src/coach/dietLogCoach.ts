import dayjs from 'dayjs'
import {
  DIET_LOG_UPDATED_EVENT,
  emitChatHistoryUpdated,
  type DietLogUpdatedDetail,
} from '../stores/events'
import { getSettings } from '../stores/settings'
import { clearDailyPlanAdjustments } from '../stores/planning'
import type { MealType } from '../stores/dietLog'
import { evaluateDailyPlanAdjustment, getDailyPlanGap } from '../planning/dynamicPlan'
import { buildCoachDigestMarkdown, buildPlanGapDigestPlain } from './gapDigest'
import { appendCoachChatMessage } from '../stores/chatHistory'
import { isReminderQuietHours } from '../proactive/rules'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

let debounceTimer: number | undefined

function canPersistPlanAdjustment(): boolean {
  const { reminders } = getSettings()
  return reminders.enabled && reminders.planAdjustmentReminders
}

export function registerDietLogCoachReactions(): () => void {
  const onDietLogUpdated = (event: Event): void => {
    const detail = (event as CustomEvent<DietLogUpdatedDetail>).detail
    if (!detail?.date || !DATE_RE.test(detail.date)) {
      return
    }

    window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      void runDietLogCoach(detail)
    }, 700)
  }

  window.addEventListener(DIET_LOG_UPDATED_EVENT, onDietLogUpdated)

  return () => {
    window.removeEventListener(DIET_LOG_UPDATED_EVENT, onDietLogUpdated)
    window.clearTimeout(debounceTimer)
  }
}

async function runDietLogCoach(detail: DietLogUpdatedDetail): Promise<void> {
  const settings = getSettings()
  const { date, mealType, resetPlanSuggestions } = detail

  if (resetPlanSuggestions) {
    await clearDailyPlanAdjustments(date)
  }

  const gap = await getDailyPlanGap(date)
  if (!gap) {
    return
  }

  const persist = canPersistPlanAdjustment()
  const result = await evaluateDailyPlanAdjustment({
    date,
    mealType: mealType as MealType | undefined,
    persist,
    generatedBy: 'local_rule',
  })

  const digestMd = buildCoachDigestMarkdown({
    gap,
    suggestion: result.suggestion,
    savedAdjustmentId: result.savedAdjustment?.id,
    language: settings.language,
  })

  if (settings.reminders.postLogGapSummaryInChat !== false) {
    const appended = appendCoachChatMessage(digestMd)
    if (appended) {
      emitChatHistoryUpdated({ appendedCoach: appended })
    }
  }

  const allowDesktop = settings.reminders.enabled &&
    settings.reminders.postLogGapDesktopNotify === true &&
    !isReminderQuietHours(settings.reminders, dayjs())

  if (allowDesktop) {
    void window.agent.showNotification({
      title: settings.language === 'zh' ? '今日饮食与计划' : 'Today’s Diet and Plan',
      body: buildPlanGapDigestPlain(gap, settings.language),
      urgency: 'normal',
    }).catch((error) => {
      console.error('dietLogCoach: desktop notification failed', error)
    })
  }
}
