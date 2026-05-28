import dayjs from 'dayjs'
import type { DailyPlanGap, DynamicPlanSuggestion } from '../planning/dynamicPlan'
import type { AppLanguage } from '../stores/settings'

function resolveLanguage(language?: AppLanguage): AppLanguage {
  return language === 'zh' ? 'zh' : 'en'
}

export function buildPlanGapDigestPlain(gap: DailyPlanGap, language?: AppLanguage): string {
  const resolvedLanguage = resolveLanguage(language)
  const dateLabel = dayjs(gap.date).format(resolvedLanguage === 'zh' ? 'M月D日' : 'MMM D')
  const { dailyTarget, actualCalories, remainingCalories } = gap
  if (actualCalories <= dailyTarget) {
    if (resolvedLanguage === 'en') {
      return `${dateLabel}: logged ${actualCalories} kcal, target ${dailyTarget} kcal, about ${remainingCalories} kcal remaining for the day.`
    }
    return `${dateLabel}：已记录 ${actualCalories} kcal，目标 ${dailyTarget} kcal，全天还剩约 ${remainingCalories} kcal。`
  }
  const over = actualCalories - dailyTarget
  if (resolvedLanguage === 'en') {
    return `${dateLabel}: logged ${actualCalories} kcal, target ${dailyTarget} kcal, currently about ${over} kcal above plan.`
  }
  return `${dateLabel}：已记录 ${actualCalories} kcal，目标 ${dailyTarget} kcal，当前比计划多出约 ${over} kcal。`
}

export function buildCoachDigestMarkdown(params: {
  gap: DailyPlanGap
  suggestion: DynamicPlanSuggestion | null
  savedAdjustmentId?: number
  language?: AppLanguage
}): string {
  const { gap, suggestion } = params
  const resolvedLanguage = resolveLanguage(params.language)
  const plain = buildPlanGapDigestPlain(gap, resolvedLanguage)
  const colon = plain.search(/[：:]/)
  const body = colon === -1 ? plain : plain.slice(colon + 1)
  const dateLabel = dayjs(gap.date).format(resolvedLanguage === 'zh' ? 'M月D日' : 'MMM D')
  const headlineMd = resolvedLanguage === 'zh'
    ? `**【饮食快照 · ${dateLabel}】** ${body.trimStart()}`
    : `**Diet Snapshot · ${dateLabel}** ${body.trimStart()}`

  if (!suggestion || suggestion.suggestionType === 'maintain') {
    if (resolvedLanguage === 'en') {
      return `${headlineMd}\n\nYour rhythm is close to plan. Keep eating normally.`
    }
    return `${headlineMd}\n\n节奏与计划接近，继续按平常吃就好。`
  }

  const expand = [
    '---',
    '',
    resolvedLanguage === 'zh' ? '**展开建议**' : '**Suggestion details**',
    '',
    suggestion.suggestionText,
  ]
  if (params.savedAdjustmentId) {
    expand.push(
      '',
      resolvedLanguage === 'zh'
        ? `_建议记录 ID：${params.savedAdjustmentId}（可在饮食记录页采纳、忽略或晚点）_`
        : `_Suggestion ID: ${params.savedAdjustmentId} (accept, dismiss, or snooze it from the Diet Log page)_`,
    )
  } else {
    expand.push(
      '',
      resolvedLanguage === 'zh'
        ? '_（当前设置下未写入待确认建议记录，仅作参考）_'
        : '_This was not saved as a pending suggestion under the current settings; use it as a reference._',
    )
  }

  return [headlineMd, '', ...expand].join('\n')
}
