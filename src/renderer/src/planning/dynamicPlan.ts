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
  getCurrentPlanningProfile,
  getLatestPersonalDietPlan,
  getConfirmedPlannedMealsForDate,
  getUserMemories,
  saveDailyPlanAdjustment,
  type DailyPlanAdjustment,
  type DailyPlanSuggestionType,
  type PersonalDietPlan,
  type PlanningProfile,
  type PlannedMeal,
  type UserMemory,
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
  planningProfile: PlanningProfile | null
  confirmedPlannedMeals: PlannedMeal[]
  relevantMemories: UserMemory[]
  safetyContext: DynamicPlanSafetyContext
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

export interface DynamicPlanSafetyContext {
  avoidDairy: boolean
  conservative: boolean
  notes: string[]
}

const SIGNIFICANT_PERCENT = 0.25
const SIGNIFICANT_CALORIES = 200
const DAIRY_AVOIDANCE_RE = /(乳糖不耐|不喝牛奶|不能喝牛奶|不吃牛奶|不要牛奶|牛奶不行|奶制品不耐|乳制品不耐|lactose|milk)/i
const HEALTH_CAUTION_RE = /(医生|医嘱|疾病|慢病|糖尿病|肾病|胃炎|药物|怀孕|孕期|哺乳|进食障碍|厌食|暴食|低体重|偏瘦|未成年|儿童|青少年)/i
const EXTREME_LANGUAGE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/跳过下一餐/g, '下一餐做温和调整'],
  [/完全不吃/g, '适量减少'],
  [/极端节食/g, '过度限制'],
  [/不吃饭/g, '过度补偿'],
]

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

function getProfileBmi(profile: PlanningProfile | null): number | null {
  if (!profile?.heightCm || !profile.weightKg || profile.heightCm <= 0 || profile.weightKg <= 0) {
    return null
  }

  return profile.weightKg / ((profile.heightCm / 100) ** 2)
}

function buildSafetyContext(profile: PlanningProfile | null, memories: UserMemory[]): DynamicPlanSafetyContext {
  const memoryText = memories.map((memory) => `${memory.content} ${memory.tags.join(' ')}`).join('\n')
  const profileText = [
    profile?.dietPreference,
    profile?.allergies,
    profile?.medicalNotes,
    profile?.scheduleNotes,
  ].filter(Boolean).join('\n')
  const joinedText = `${memoryText}\n${profileText}`
  const bmi = getProfileBmi(profile)
  const notes: string[] = []

  const avoidDairy = DAIRY_AVOIDANCE_RE.test(joinedText)
  if (avoidDairy) {
    notes.push('已避开牛奶、酸奶等奶类补充选项。')
  }

  const ageCaution = typeof profile?.age === 'number' && profile.age < 18
  const bmiLow = bmi !== null && bmi < 18.5
  const healthCaution = HEALTH_CAUTION_RE.test(joinedText)
  if (ageCaution || bmiLow || healthCaution) {
    notes.push('存在年龄、体重或健康备注相关风险，建议只做温和调整，并优先遵循医生或营养师意见。')
  }

  return {
    avoidDairy,
    conservative: ageCaution || bmiLow || healthCaution,
    notes,
  }
}

function ensureSafetyText(text: string, safetyContext: DynamicPlanSafetyContext): string {
  let safeText = text
  for (const [pattern, replacement] of EXTREME_LANGUAGE_REPLACEMENTS) {
    safeText = safeText.replace(pattern, replacement)
  }

  const extraNotes = [
    safetyContext.avoidDairy ? '我会避开牛奶、酸奶等奶类选项。' : undefined,
    safetyContext.conservative
      ? '如果涉及未成年人、BMI 偏低、孕期/哺乳期、疾病、药物或医生建议，请先按专业意见执行。'
      : undefined,
  ].filter(Boolean)

  if (extraNotes.length === 0) {
    return safeText
  }

  return `${safeText} ${extraNotes.join(' ')}`
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
  safetyContext: DynamicPlanSafetyContext
}): string {
  const mealLabel = params.mealType ? mealTypeLabels[params.mealType] : '今天'
  const windowText = params.recommendedMealWindow ? `，可以放在${params.recommendedMealWindow}` : ''
  const foodOptions = params.safetyContext.avoidDairy
    ? '鸡蛋、豆制品、瘦肉、鱼虾或少量主食'
    : '鸡蛋、无糖酸奶、豆制品、瘦肉或少量主食'

  return ensureSafetyText(
    `${mealLabel}比计划少了大约 ${params.deltaCalories} kcal。建议补充 ${params.suggestedCalories} kcal 左右${windowText}，优先选${foodOptions}，不用把所有缺口都堆到一餐里。`,
    params.safetyContext,
  )
}

function buildReduceText(params: {
  mealType?: MealType
  plannedCalories: number
  actualCalories: number
  deltaCalories: number
  suggestedCalories: number
  recommendedMealWindow?: string
  safetyContext: DynamicPlanSafetyContext
}): string {
  const mealLabel = params.mealType ? mealTypeLabels[params.mealType] : '今天'
  const windowText = params.recommendedMealWindow ? `，${params.recommendedMealWindow}可以清淡一点` : ''

  return ensureSafetyText(
    `${mealLabel}比计划多了大约 ${Math.abs(params.deltaCalories)} kcal${windowText}。下一餐优先选清淡蛋白和蔬菜，主食少量就好，不需要用过度补偿来抵消。`,
    params.safetyContext,
  )
}

function buildMaintainText(params: {
  actualCalories: number
  plannedCalories: number
  remainingCalories: number
  safetyContext: DynamicPlanSafetyContext
}): string {
  return ensureSafetyText(
    `今天目前摄入 ${params.actualCalories} kcal，距离目标还剩约 ${params.remainingCalories} kcal。节奏整体还稳，下一餐按正常计划吃就好。`,
    params.safetyContext,
  )
}

export async function getDailyPlanGap(date = dayjs().format('YYYY-MM-DD')): Promise<DailyPlanGap | null> {
  const [latestPlan, confirmedPlannedMeals, currentProfile, relevantMemories] = await Promise.all([
    getLatestPersonalDietPlan(),
    getConfirmedPlannedMealsForDate(date),
    getCurrentPlanningProfile(),
    getUserMemories({
      status: 'active',
      types: ['preference', 'allergy', 'avoidance', 'habit', 'schedule', 'health_note'],
      limit: 50,
    }),
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
    planningProfile: currentProfile ?? latestPlan?.profileSnapshot ?? null,
    confirmedPlannedMeals,
    relevantMemories,
    safetyContext: buildSafetyContext(currentProfile ?? latestPlan?.profileSnapshot ?? null, relevantMemories),
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
          safetyContext: gap.safetyContext,
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
          safetyContext: gap.safetyContext,
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
        safetyContext: gap.safetyContext,
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
        safetyContext: gap.safetyContext,
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
      safetyContext: gap.safetyContext,
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
    suggestion !== null

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
