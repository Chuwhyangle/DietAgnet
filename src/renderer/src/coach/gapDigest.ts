import dayjs from 'dayjs'
import type { DailyPlanGap, DynamicPlanSuggestion } from '../planning/dynamicPlan'

export function buildPlanGapDigestPlain(gap: DailyPlanGap): string {
  const dateLabel = dayjs(gap.date).format('M月D日')
  const { dailyTarget, actualCalories, remainingCalories } = gap
  if (actualCalories <= dailyTarget) {
    return `${dateLabel}：已记录 ${actualCalories} kcal，目标 ${dailyTarget} kcal，全天还剩约 ${remainingCalories} kcal。`
  }
  const over = actualCalories - dailyTarget
  return `${dateLabel}：已记录 ${actualCalories} kcal，目标 ${dailyTarget} kcal，当前比计划多出约 ${over} kcal。`
}

export function buildCoachDigestMarkdown(params: {
  gap: DailyPlanGap
  suggestion: DynamicPlanSuggestion | null
  savedAdjustmentId?: number
}): string {
  const { gap, suggestion } = params
  const plain = buildPlanGapDigestPlain(gap)
  const colon = plain.indexOf('：')
  const body = colon === -1 ? plain : plain.slice(colon + 1)
  const dateLabel = dayjs(gap.date).format('M月D日')
  const headlineMd = `**【饮食快照 · ${dateLabel}】** ${body.trimStart()}`

  if (!suggestion || suggestion.suggestionType === 'maintain') {
    return `${headlineMd}\n\n节奏与计划接近，继续按平常吃就好。`
  }

  const expand = [
    '---',
    '',
    '**展开建议**',
    '',
    suggestion.suggestionText,
  ]
  if (params.savedAdjustmentId) {
    expand.push('', `_建议记录 ID：${params.savedAdjustmentId}（可在饮食记录页采纳、忽略或晚点）_`)
  } else {
    expand.push('', '_（当前设置下未写入待确认建议记录，仅作参考）_')
  }

  return [headlineMd, '', ...expand].join('\n')
}
