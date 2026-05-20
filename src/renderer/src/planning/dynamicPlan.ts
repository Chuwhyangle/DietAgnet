import dayjs from 'dayjs'
import {
  getDietLog,
  mealTypeLabels,
  summarizeDietLog,
  type DietLog,
  type Meal,
  type MealType,
} from '../stores/dietLog'
import { getSettings } from '../stores/settings'
import {
  getLatestPersonalDietPlan,
  getConfirmedPlannedMealsForDate,
  saveDailyPlanAdjustment,
  type DailyPlanAdjustment,
  type DailyPlanSuggestionType,
  type PersonalDietPlan,
  type PlannedMeal,
} from '../stores/planning'

export interface MealCalorieTarget {
  mealType: MealType
  label: string
  ratio: number
  calories: number
}

export interface DailyPlanGap {
  date: string
  sourcePlanId?: number
  dailyTarget: number
  actualCalories: number
  remainingCalories: number
  mealTargets: MealCalorieTarget[]
  mealGaps: Array<{
    mealType: MealType
    label: string
    plannedCalories: number
    actualCalories: number
    deltaCalories: number
    hasPlannedMeal: boolean
  }>
  latestPlan: PersonalDietPlan | null
  confirmedPlannedMeals: PlannedMeal[]
}

export interface DynamicPlanSuggestion {
  date: string
  sourcePlanId?: number
  ruleId: string
  mealType?: MealType
  plannedCalories: number
  actualCalories: number
  deltaCalories: number
  suggestedCalories: number
  suggestionType: DailyPlanSuggestionType
  suggestionText: string
  recommendedMealWindow?: string
}

const SIGNIFICANT_PERCENT = 0.25
const SIGNIFICANT_CALORIES = 200

function roundToNearestTen(value: number): number {
  return Math.round(value / 10) * 10
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getMealRatioMap(mealsPerDay?: number): Record<MealType, number> {
  if (mealsPerDay && mealsPerDay >= 4) {
    return {
      breakfast: 0.2,
      lunch: 0.35,
      dinner: 0.3,
      snack: 0.15,
    }
  }

  return {
    breakfast: 0.25,
    lunch: 0.4,
    dinner: 0.35,
    snack: 0,
  }
}

function sumMealCalories(log: DietLog | null, mealType: MealType): number {
  const meal = log?.meals.find((entry: Meal) => entry.type === mealType)
  if (!meal) {
    return 0
  }

  return meal.items.reduce((sum, item) => sum + item.calories, 0)
}

function getRecommendedMealWindow(mealType?: MealType): string | undefined {
  switch (mealType) {
    case 'breakfast':
      return '上午加餐或午餐'
    case 'lunch':
      return '下午加餐或晚餐'
    case 'dinner':
      return '今晚轻加餐或明天早餐'
    case 'snack':
      return '下一餐'
    default:
      return undefined
  }
}

function buildSupplementText(params: {
  mealType?: MealType
  plannedCalories: number
  actualCalories: number
  deltaCalories: number
  suggestedCalories: number
  recommendedMealWindow?: string
}): string {
  const mealLabel = params.mealType ? mealTypeLabels[params.mealType] : '今天'
  const windowText = params.recommendedMealWindow ? `，可以放在${params.recommendedMealWindow}` : ''

  return `${mealLabel}比计划少了大约 ${params.deltaCalories} kcal。建议补充 ${params.suggestedCalories} kcal 左右${windowText}，优先选鸡蛋、酸奶、豆制品、瘦肉或少量主食，不用把所有缺口都堆到一餐里。`
}

function buildReduceText(params: {
  mealType?: MealType
  plannedCalories: number
  actualCalories: number
  deltaCalories: number
  suggestedCalories: number
  recommendedMealWindow?: string
}): string {
  const mealLabel = params.mealType ? mealTypeLabels[params.mealType] : '今天'
  const windowText = params.recommendedMealWindow ? `，${params.recommendedMealWindow}可以清淡一点` : ''

  return `${mealLabel}比计划多了大约 ${Math.abs(params.deltaCalories)} kcal${windowText}。下一餐优先选清淡蛋白和蔬菜，主食少量就好，不需要用不吃饭来补偿。`
}

function buildMaintainText(params: {
  actualCalories: number
  plannedCalories: number
  remainingCalories: number
}): string {
  return `今天目前摄入 ${params.actualCalories} kcal，距离目标还剩约 ${params.remainingCalories} kcal。节奏整体还稳，下一餐按正常计划吃就好。`
}

export async function getDailyPlanGap(date = dayjs().format('YYYY-MM-DD')): Promise<DailyPlanGap | null> {
  const [latestPlan, confirmedPlannedMeals] = await Promise.all([
    getLatestPersonalDietPlan(),
    getConfirmedPlannedMealsForDate(date),
  ])
  const settings = getSettings()
  const dailyTarget = latestPlan?.dailyCalorieTarget ?? settings.calorieGoal

  if (!dailyTarget || dailyTarget <= 0) {
    return null
  }

  const log = getDietLog(date)
  const actualSummary = summarizeDietLog(log)
  const ratioMap = getMealRatioMap(latestPlan?.profileSnapshot.mealsPerDay)

  const plannedMealsByType = new Map<MealType, PlannedMeal>()
  for (const pm of confirmedPlannedMeals) {
    if (!plannedMealsByType.has(pm.mealType as MealType)) {
      plannedMealsByType.set(pm.mealType as MealType, pm)
    }
  }

  const mealTargets = (Object.keys(ratioMap) as MealType[])
    .filter((mealType) => ratioMap[mealType] > 0)
    .map((mealType) => {
      const planned = plannedMealsByType.get(mealType)
      return {
        mealType,
        label: mealTypeLabels[mealType],
        ratio: ratioMap[mealType],
        calories: planned
          ? planned.totalCalories
          : roundToNearestTen(dailyTarget * ratioMap[mealType]),
      }
    })

  const mealGaps = mealTargets.map((target) => {
    const actualCalories = sumMealCalories(log, target.mealType)
    return {
      mealType: target.mealType,
      label: target.label,
      plannedCalories: target.calories,
      actualCalories,
      deltaCalories: target.calories - actualCalories,
      hasPlannedMeal: plannedMealsByType.has(target.mealType),
    }
  })

  return {
    date,
    sourcePlanId: latestPlan?.id,
    dailyTarget,
    actualCalories: actualSummary.calories,
    remainingCalories: Math.max(0, dailyTarget - actualSummary.calories),
    mealTargets,
    mealGaps,
    latestPlan,
    confirmedPlannedMeals,
  }
}

export function buildDynamicPlanSuggestion(
  gap: DailyPlanGap,
  mealType?: MealType,
): DynamicPlanSuggestion | null {
  const selectedMealGap = mealType
    ? gap.mealGaps.find((item) => item.mealType === mealType)
    : null

  if (selectedMealGap) {
    const absDelta = Math.abs(selectedMealGap.deltaCalories)
    const significantDelta = absDelta >= SIGNIFICANT_CALORIES &&
      absDelta >= selectedMealGap.plannedCalories * SIGNIFICANT_PERCENT
    const recommendedMealWindow = getRecommendedMealWindow(selectedMealGap.mealType)

    if (significantDelta && selectedMealGap.deltaCalories > 0) {
      const suggestedCalories = clamp(roundToNearestTen(selectedMealGap.deltaCalories * 0.8), 200, 500)
      return {
        date: gap.date,
        sourcePlanId: gap.sourcePlanId,
        ruleId: 'after_meal_plan_gap',
        mealType: selectedMealGap.mealType,
        plannedCalories: selectedMealGap.plannedCalories,
        actualCalories: selectedMealGap.actualCalories,
        deltaCalories: selectedMealGap.deltaCalories,
        suggestedCalories,
        suggestionType: 'supplement',
        recommendedMealWindow,
        suggestionText: buildSupplementText({
          ...selectedMealGap,
          suggestedCalories,
          recommendedMealWindow,
        }),
      }
    }

    if (significantDelta && selectedMealGap.deltaCalories < 0) {
      const suggestedCalories = clamp(roundToNearestTen(absDelta), 200, 500)
      return {
        date: gap.date,
        sourcePlanId: gap.sourcePlanId,
        ruleId: 'after_meal_plan_gap',
        mealType: selectedMealGap.mealType,
        plannedCalories: selectedMealGap.plannedCalories,
        actualCalories: selectedMealGap.actualCalories,
        deltaCalories: selectedMealGap.deltaCalories,
        suggestedCalories,
        suggestionType: 'reduce',
        recommendedMealWindow,
        suggestionText: buildReduceText({
          ...selectedMealGap,
          suggestedCalories,
          recommendedMealWindow,
        }),
      }
    }
  }

  const dailyDelta = gap.dailyTarget - gap.actualCalories
  const absDailyDelta = Math.abs(dailyDelta)
  const dayHasSignificantGap = absDailyDelta >= SIGNIFICANT_CALORIES &&
    absDailyDelta >= gap.dailyTarget * 0.18

  if (!mealType && dayHasSignificantGap && dailyDelta > 0) {
    const suggestedCalories = clamp(roundToNearestTen(dailyDelta * 0.5), 200, 500)
    return {
      date: gap.date,
      sourcePlanId: gap.sourcePlanId,
      ruleId: 'today_low_intake',
      plannedCalories: gap.dailyTarget,
      actualCalories: gap.actualCalories,
      deltaCalories: dailyDelta,
      suggestedCalories,
      suggestionType: 'supplement',
      recommendedMealWindow: '下一餐',
      suggestionText: buildSupplementText({
        plannedCalories: gap.dailyTarget,
        actualCalories: gap.actualCalories,
        deltaCalories: dailyDelta,
        suggestedCalories,
        recommendedMealWindow: '下一餐',
      }),
    }
  }

  if (!mealType && dayHasSignificantGap && dailyDelta < 0) {
    const suggestedCalories = clamp(roundToNearestTen(absDailyDelta), 200, 500)
    return {
      date: gap.date,
      sourcePlanId: gap.sourcePlanId,
      ruleId: 'today_over_target',
      plannedCalories: gap.dailyTarget,
      actualCalories: gap.actualCalories,
      deltaCalories: dailyDelta,
      suggestedCalories,
      suggestionType: 'reduce',
      recommendedMealWindow: '下一餐或明天',
      suggestionText: buildReduceText({
        plannedCalories: gap.dailyTarget,
        actualCalories: gap.actualCalories,
        deltaCalories: dailyDelta,
        suggestedCalories,
        recommendedMealWindow: '下一餐或明天',
      }),
    }
  }

  return {
    date: gap.date,
    sourcePlanId: gap.sourcePlanId,
    ruleId: mealType ? 'after_meal_plan_gap' : 'today_plan_check',
    mealType,
    plannedCalories: selectedMealGap?.plannedCalories ?? gap.dailyTarget,
    actualCalories: selectedMealGap?.actualCalories ?? gap.actualCalories,
    deltaCalories: selectedMealGap?.deltaCalories ?? dailyDelta,
    suggestedCalories: 0,
    suggestionType: 'maintain',
    suggestionText: buildMaintainText({
      actualCalories: gap.actualCalories,
      plannedCalories: gap.dailyTarget,
      remainingCalories: gap.remainingCalories,
    }),
  }
}

export async function evaluateDailyPlanAdjustment(params: {
  date?: string
  mealType?: MealType
  persist?: boolean
  generatedBy?: 'local_rule' | 'agent'
} = {}): Promise<{
  gap: DailyPlanGap | null
  suggestion: DynamicPlanSuggestion | null
  savedAdjustment: DailyPlanAdjustment | null
}> {
  const date = params.date ?? dayjs().format('YYYY-MM-DD')
  const gap = await getDailyPlanGap(date)
  const settings = getSettings()

  if (!gap) {
    return {
      gap: null,
      suggestion: null,
      savedAdjustment: null,
    }
  }

  const suggestion = buildDynamicPlanSuggestion(gap, params.mealType)
  const shouldPersist = params.persist === true &&
    (params.generatedBy === 'agent' || (settings.reminders.enabled && settings.reminders.planAdjustmentReminders)) &&
    suggestion !== null &&
    suggestion.suggestionType !== 'maintain'

  if (!shouldPersist || !suggestion) {
    return {
      gap,
      suggestion,
      savedAdjustment: null,
    }
  }

  const savedAdjustment = await saveDailyPlanAdjustment({
    ...suggestion,
    generatedBy: params.generatedBy ?? 'local_rule',
  })

  return {
    gap,
    suggestion,
    savedAdjustment,
  }
}
