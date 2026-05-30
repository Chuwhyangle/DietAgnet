import { getSettings, type AppLanguage } from '../stores/settings'
import type {
  ActivityLevel,
  PersonalDietPlan,
  PlanningFollowUpCode,
  PlanningFollowUpQuestion,
  PlanningGender,
  PlanningGoal,
  PlanningProfile,
  PlanningStepKey,
} from '../stores/planning'

export type PlanningInputType = 'number' | 'choice' | 'text'
export type PlanningAnswerValue = string | number

export interface PlanningChoiceOption {
  label: string
  value: string
  description?: string
}

export interface PlanningStepDefinition {
  key: PlanningStepKey
  label: string
  prompt: string
  helperText?: string
  inputType: PlanningInputType
  optional?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  placeholder?: string
  rows?: number
  options?: PlanningChoiceOption[]
}

export interface PlanningProgress {
  completedCount: number
  totalCount: number
  percent: number
}

export interface PlanningPlanDraft
  extends Pick<
    PersonalDietPlan,
    | 'title'
    | 'summary'
    | 'dailyCalorieTarget'
    | 'proteinTarget'
    | 'carbsTarget'
    | 'fatTarget'
    | 'mealGuidance'
    | 'cautionNotes'
    | 'generationMode'
    | 'generatedWithModel'
  > {}

export interface PlanMetricChange {
  key: 'dailyCalorieTarget' | 'proteinTarget' | 'carbsTarget' | 'fatTarget'
  label: string
  previous?: number
  current?: number
  delta: number
  unit: string
}

export interface PlanProfileChange {
  key: keyof PlanningProfile
  label: string
  previous: string
  current: string
}

export interface PlanVersionDiff {
  metricChanges: PlanMetricChange[]
  profileChanges: PlanProfileChange[]
  summary: string
}

export interface PlanningProfileSummaryItem {
  key: PlanningStepKey
  label: string
  value: string
}

type LabelSet<T extends string> = Record<T, string>

const LABELS: Record<AppLanguage, {
  gender: LabelSet<PlanningGender>
  goal: LabelSet<PlanningGoal>
  activity: LabelSet<ActivityLevel>
}> = {
  en: {
    gender: {
      male: 'Male',
      female: 'Female',
      other: 'Other / prefer not to say',
    },
    goal: {
      lose_fat: 'Fat loss',
      maintain: 'Maintain',
      gain_muscle: 'Muscle gain',
      health: 'Health management',
    },
    activity: {
      low: 'Mostly sedentary',
      medium: 'Light to moderate activity',
      high: 'Frequent training',
    },
  },
  zh: {
    gender: {
      male: '男',
      female: '女',
      other: '其他 / 不便说明',
    },
    goal: {
      lose_fat: '减脂',
      maintain: '维持',
      gain_muscle: '增肌',
      health: '健康管理',
    },
    activity: {
      low: '久坐少动',
      medium: '轻中度活动',
      high: '高频训练',
    },
  },
}

export const GENDER_LABELS: Record<PlanningGender, string> = LABELS.zh.gender
export const GOAL_LABELS: Record<PlanningGoal, string> = LABELS.zh.goal
export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = LABELS.zh.activity

const STEP_SKIP_DEFAULTS: Record<AppLanguage, Partial<Record<PlanningStepKey, string | number>>> = {
  en: {
    dietPreference: 'No special preference',
    allergies: 'None',
    medicalNotes: 'None',
    cookingPreference: 'Not specified yet',
    scheduleNotes: 'No extra schedule notes',
  },
  zh: {
    dietPreference: '无特别偏好',
    allergies: '无',
    medicalNotes: '无',
    cookingPreference: '暂未说明',
    scheduleNotes: '暂无额外安排',
  },
}

const PROFILE_CHANGE_FIELDS: Record<AppLanguage, Array<{ key: PlanningStepKey; label: string }>> = {
  en: [
    { key: 'age', label: 'Age' },
    { key: 'gender', label: 'Gender' },
    { key: 'heightCm', label: 'Height' },
    { key: 'weightKg', label: 'Current weight' },
    { key: 'targetWeightKg', label: 'Target weight' },
    { key: 'goal', label: 'Goal' },
    { key: 'activityLevel', label: 'Activity level' },
    { key: 'mealsPerDay', label: 'Meals per day' },
    { key: 'dietPreference', label: 'Diet preference' },
    { key: 'allergies', label: 'Allergies / avoidances' },
    { key: 'medicalNotes', label: 'Health notes' },
    { key: 'cookingPreference', label: 'Cooking habits' },
    { key: 'scheduleNotes', label: 'Schedule notes' },
  ],
  zh: [
    { key: 'age', label: '年龄' },
    { key: 'gender', label: '性别' },
    { key: 'heightCm', label: '身高' },
    { key: 'weightKg', label: '当前体重' },
    { key: 'targetWeightKg', label: '目标体重' },
    { key: 'goal', label: '目标方向' },
    { key: 'activityLevel', label: '活动水平' },
    { key: 'mealsPerDay', label: '每日餐次' },
    { key: 'dietPreference', label: '饮食偏好' },
    { key: 'allergies', label: '过敏/忌口' },
    { key: 'medicalNotes', label: '健康备注' },
    { key: 'cookingPreference', label: '做饭习惯' },
    { key: 'scheduleNotes', label: '作息安排' },
  ],
}

const PLAN_METRIC_FIELDS: Record<AppLanguage, Array<{
  key: PlanMetricChange['key']
  label: string
  unit: string
}>> = {
  en: [
    { key: 'dailyCalorieTarget', label: 'Calories', unit: 'kcal' },
    { key: 'proteinTarget', label: 'Protein', unit: 'g' },
    { key: 'carbsTarget', label: 'Carbs', unit: 'g' },
    { key: 'fatTarget', label: 'Fat', unit: 'g' },
  ],
  zh: [
    { key: 'dailyCalorieTarget', label: '热量目标', unit: 'kcal' },
    { key: 'proteinTarget', label: '蛋白质', unit: 'g' },
    { key: 'carbsTarget', label: '碳水', unit: 'g' },
    { key: 'fatTarget', label: '脂肪', unit: 'g' },
  ],
}

const PLANNING_STEPS: Record<AppLanguage, PlanningStepDefinition[]> = {
  en: [
    {
      key: 'age',
      label: 'age',
      prompt: 'First, tell me your age so I can adjust the metabolism estimate and plan rhythm.',
      helperText: 'Enter your actual age in years.',
      inputType: 'number',
      min: 8,
      max: 100,
      step: 1,
      unit: 'years',
      placeholder: 'e.g. 28',
    },
    {
      key: 'gender',
      label: 'gender',
      prompt: 'What is your biological sex? If you prefer not to say, choose “Other / prefer not to say”.',
      inputType: 'choice',
      step: 1,
      options: [
        { label: 'Male', value: 'male', description: 'Used for basal metabolism estimates.' },
        { label: 'Female', value: 'female', description: 'Used for basal metabolism estimates.' },
        { label: 'Other / prefer not to say', value: 'other', description: 'I will use a neutral estimate.' },
      ],
    },
    {
      key: 'heightCm',
      label: 'height',
      prompt: 'What is your height? Enter it directly in centimeters.',
      helperText: 'Use centimeters, for example 170.',
      inputType: 'number',
      min: 90,
      max: 260,
      step: 1,
      unit: 'cm',
      placeholder: 'e.g. 170',
    },
    {
      key: 'weightKg',
      label: 'current weight',
      prompt: 'What is your current weight? I will use it to estimate maintenance calories.',
      helperText: 'Use kilograms. One decimal place is fine.',
      inputType: 'number',
      min: 20,
      max: 300,
      step: 0.1,
      unit: 'kg',
      placeholder: 'e.g. 65.5',
    },
    {
      key: 'targetWeightKg',
      label: 'target weight',
      prompt: 'What target weight would you like to work toward first? A stage target is enough.',
      helperText: 'Use kilograms. One decimal place is fine.',
      inputType: 'number',
      min: 20,
      max: 300,
      step: 0.1,
      unit: 'kg',
      placeholder: 'e.g. 60',
    },
    {
      key: 'goal',
      label: 'goal',
      prompt: 'What is your main goal right now?',
      inputType: 'choice',
      step: 1,
      options: [
        { label: 'Fat loss', value: 'lose_fat', description: 'Create a calorie deficit while protecting protein intake.' },
        { label: 'Maintain', value: 'maintain', description: 'Keep weight and energy stable.' },
        { label: 'Muscle gain', value: 'gain_muscle', description: 'Use a modest surplus and support training recovery.' },
        { label: 'Health management', value: 'health', description: 'Focus on regular, balanced, sustainable eating.' },
      ],
    },
    {
      key: 'activityLevel',
      label: 'activity level',
      prompt: 'Which activity level best matches your normal routine?',
      inputType: 'choice',
      step: 1,
      options: [
        { label: 'Mostly sedentary', value: 'low', description: 'Desk work and little regular exercise.' },
        { label: 'Light to moderate activity', value: 'medium', description: 'Around 2-4 workouts per week or decent daily steps.' },
        { label: 'Frequent training', value: 'high', description: 'Frequent training or physically active work.' },
      ],
    },
    {
      key: 'mealsPerDay',
      label: 'meals per day',
      prompt: 'How many times do you usually eat per day? Count meals and fixed snacks.',
      helperText: 'Usually 3 or 4. If your schedule is unusual, enter what is true for you.',
      inputType: 'number',
      min: 1,
      max: 8,
      step: 1,
      unit: 'meals',
      placeholder: 'e.g. 3',
    },
    {
      key: 'dietPreference',
      label: 'diet preference',
      prompt: 'Any preferences or directions you want to avoid? For example Chinese hot meals, lower carb, high protein, vegetarian.',
      inputType: 'text',
      optional: true,
      rows: 3,
      placeholder: 'e.g. I prefer warm Chinese meals and simple breakfasts',
    },
    {
      key: 'allergies',
      label: 'allergies / avoidances',
      prompt: 'Any food allergies, avoidances, or ingredients I must avoid?',
      inputType: 'text',
      optional: true,
      rows: 3,
      placeholder: 'e.g. allergic to seafood, no cilantro',
    },
    {
      key: 'medicalNotes',
      label: 'health notes',
      prompt: 'If you have chronic conditions, medical advice, medication effects, pregnancy/breastfeeding, or similar context, add it here.',
      inputType: 'text',
      optional: true,
      rows: 4,
      placeholder: 'e.g. mild gastritis, doctor suggested smaller frequent meals',
    },
    {
      key: 'cookingPreference',
      label: 'cooking habits',
      prompt: 'Do you usually cook, order delivery, eat at a cafeteria, or mix these? This affects the plan.',
      inputType: 'text',
      optional: true,
      rows: 3,
      placeholder: 'e.g. delivery on weekdays, cook on weekends',
    },
    {
      key: 'scheduleNotes',
      label: 'schedule notes',
      prompt: 'Finally, add schedule or execution constraints, such as night shifts, early starts, long commute, or training time.',
      inputType: 'text',
      optional: true,
      rows: 3,
      placeholder: 'e.g. train at 9 pm, lunch has to be delivery',
    },
  ],
  zh: [
    {
      key: 'age',
      label: '年龄',
      prompt: '先告诉我你的年龄吧，我会据此调整基础代谢和计划节奏。',
      helperText: '请输入实际年龄，单位为岁。',
      inputType: 'number',
      min: 8,
      max: 100,
      step: 1,
      unit: '岁',
      placeholder: '例如 28',
    },
    {
      key: 'gender',
      label: '性别',
      prompt: '你的生理性别是？如果不方便说明，也可以选择“其他 / 不便说明”。',
      inputType: 'choice',
      step: 1,
      options: [
        { label: '男', value: 'male', description: '用于估算基础代谢。' },
        { label: '女', value: 'female', description: '用于估算基础代谢。' },
        { label: '其他 / 不便说明', value: 'other', description: '我会采用中性估算。' },
      ],
    },
    {
      key: 'heightCm',
      label: '身高',
      prompt: '你的身高是多少？直接填厘米就行。',
      helperText: '单位是厘米，例如 170。',
      inputType: 'number',
      min: 90,
      max: 260,
      step: 1,
      unit: 'cm',
      placeholder: '例如 170',
    },
    {
      key: 'weightKg',
      label: '当前体重',
      prompt: '现在的体重是多少？我会用它估算维持热量。',
      helperText: '单位是公斤，可以带 1 位小数。',
      inputType: 'number',
      min: 20,
      max: 300,
      step: 0.1,
      unit: 'kg',
      placeholder: '例如 65.5',
    },
    {
      key: 'targetWeightKg',
      label: '目标体重',
      prompt: '你希望先把体重做到多少？如果是更偏体型管理，也先填一个阶段性目标。',
      helperText: '单位是公斤，可以带 1 位小数。',
      inputType: 'number',
      min: 20,
      max: 300,
      step: 0.1,
      unit: 'kg',
      placeholder: '例如 60',
    },
    {
      key: 'goal',
      label: '目标方向',
      prompt: '你当前最想实现的目标是什么？',
      inputType: 'choice',
      step: 1,
      options: [
        { label: '减脂', value: 'lose_fat', description: '控制热量缺口，优先保蛋白。' },
        { label: '维持', value: 'maintain', description: '保持体重和状态稳定。' },
        { label: '增肌', value: 'gain_muscle', description: '适度盈余，兼顾训练恢复。' },
        { label: '健康管理', value: 'health', description: '以规律、均衡和可持续为主。' },
      ],
    },
    {
      key: 'activityLevel',
      label: '活动水平',
      prompt: '你的日常活动量大概在哪个档位？',
      inputType: 'choice',
      step: 1,
      options: [
        { label: '久坐少动', value: 'low', description: '久坐办公，基本不运动。' },
        { label: '轻中度活动', value: 'medium', description: '每周有 2-4 次运动或步数尚可。' },
        { label: '高频训练', value: 'high', description: '训练频繁、体力活动多。' },
      ],
    },
    {
      key: 'mealsPerDay',
      label: '每日餐次',
      prompt: '你平时一天大概吃几餐？包含正餐和固定加餐都算。',
      helperText: '通常填 3 或 4；如果作息特殊，也照实填。',
      inputType: 'number',
      min: 1,
      max: 8,
      step: 1,
      unit: '餐',
      placeholder: '例如 3',
    },
    {
      key: 'dietPreference',
      label: '饮食偏好',
      prompt: '有没有特别喜欢或尽量不想吃的方向？比如中式、低碳、高蛋白、素食。',
      inputType: 'text',
      optional: true,
      rows: 3,
      placeholder: '例如：更喜欢中式热食，早餐想简单一点',
    },
    {
      key: 'allergies',
      label: '过敏 / 忌口',
      prompt: '有没有食物过敏、忌口或必须避开的食材？',
      inputType: 'text',
      optional: true,
      rows: 3,
      placeholder: '例如：海鲜过敏，不吃香菜',
    },
    {
      key: 'medicalNotes',
      label: '健康备注',
      prompt: '如果有慢病、医生建议、药物影响、孕期/哺乳期等信息，可以在这里补充。',
      inputType: 'text',
      optional: true,
      rows: 4,
      placeholder: '例如：轻度胃炎，医生建议少量多餐',
    },
    {
      key: 'cookingPreference',
      label: '做饭习惯',
      prompt: '你更倾向自己做饭、外卖、食堂，还是混合？这会影响执行方案。',
      inputType: 'text',
      optional: true,
      rows: 3,
      placeholder: '例如：工作日外卖，周末自己做',
    },
    {
      key: 'scheduleNotes',
      label: '作息安排',
      prompt: '最后补充一下你的作息或执行限制，比如夜班、早起、通勤长、训练时间。',
      inputType: 'text',
      optional: true,
      rows: 3,
      placeholder: '例如：晚上 9 点训练，午餐只能点外卖',
    },
  ],
}

function resolveLanguage(language?: AppLanguage): AppLanguage {
  return language ?? (getSettings().language === 'zh' ? 'zh' : 'en')
}

function labelsFor(language?: AppLanguage): (typeof LABELS)[AppLanguage] {
  return LABELS[resolveLanguage(language)]
}

function stepsFor(language?: AppLanguage): PlanningStepDefinition[] {
  return PLANNING_STEPS[resolveLanguage(language)]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeText(value: PlanningAnswerValue | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function isEmptyText(value: PlanningAnswerValue | undefined): boolean {
  const normalized = normalizeText(value).toLowerCase()
  return [
    '',
    '无',
    '暂无额外安排',
    '暂未说明',
    '无特别偏好',
    'none',
    'no extra schedule notes',
    'not specified yet',
    'no special preference',
  ].includes(normalized)
}

function stripCodeFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
}

function extractJsonObject(content: string): string {
  const fenced = stripCodeFence(content)
  const firstBrace = fenced.indexOf('{')
  const lastBrace = fenced.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return fenced
  }

  return fenced.slice(firstBrace, lastBrace + 1)
}

function buildAiNarrativePrompt(
  profile: PlanningProfile,
  fallbackPlan: PlanningPlanDraft,
  language: AppLanguage,
): string {
  if (language === 'zh') {
    return [
      '请基于下面这份用户资料和已计算好的基础营养目标，生成一份简体中文 JSON。',
      '只返回 JSON，不要 Markdown，不要额外说明。',
      'JSON schema:',
      '{"title":"string","summary":"string","mealGuidance":["string"],"cautionNotes":["string"]}',
      '要求：',
      '1. mealGuidance 给 4 到 6 条，必须具体、能执行。',
      '2. cautionNotes 给 1 到 4 条，优先写真正需要提醒的点。',
      '3. 不要写医学诊断，不要承诺减重速度。',
      '4. 如果存在过敏、忌口或健康备注，必须体现在 cautionNotes 里。',
      '',
      '用户资料：',
      JSON.stringify(profile, null, 2),
      '',
      '基础目标：',
      JSON.stringify(
        {
          dailyCalorieTarget: fallbackPlan.dailyCalorieTarget,
          proteinTarget: fallbackPlan.proteinTarget,
          carbsTarget: fallbackPlan.carbsTarget,
          fatTarget: fallbackPlan.fatTarget,
          summary: fallbackPlan.summary,
        },
        null,
        2,
      ),
    ].join('\n')
  }

  return [
    'Generate an English JSON diet plan from the user profile and calculated nutrition targets below.',
    'Return JSON only. Do not use Markdown and do not add extra commentary.',
    'JSON schema:',
    '{"title":"string","summary":"string","mealGuidance":["string"],"cautionNotes":["string"]}',
    'Requirements:',
    '1. mealGuidance must contain 4 to 6 specific, actionable items.',
    '2. cautionNotes must contain 1 to 4 genuinely useful cautions.',
    '3. Do not provide medical diagnosis and do not promise weight-change speed.',
    '4. If allergies, avoidances, or health notes exist, reflect them in cautionNotes.',
    '',
    'User profile:',
    JSON.stringify(profile, null, 2),
    '',
    'Base targets:',
    JSON.stringify(
      {
        dailyCalorieTarget: fallbackPlan.dailyCalorieTarget,
        proteinTarget: fallbackPlan.proteinTarget,
        carbsTarget: fallbackPlan.carbsTarget,
        fatTarget: fallbackPlan.fatTarget,
        summary: fallbackPlan.summary,
      },
      null,
      2,
    ),
  ].join('\n')
}

function getBmr(profile: PlanningProfile): number {
  const { age = 25, heightCm = 165, weightKg = 60, gender = 'other' } = profile
  const genderOffset = gender === 'male' ? 5 : gender === 'female' ? -161 : -78
  return 10 * weightKg + 6.25 * heightCm - 5 * age + genderOffset
}

function getActivityMultiplier(activityLevel: ActivityLevel): number {
  switch (activityLevel) {
    case 'low':
      return 1.2
    case 'high':
      return 1.72
    default:
      return 1.45
  }
}

function getGoalAdjustment(goal: PlanningGoal): number {
  switch (goal) {
    case 'lose_fat':
      return -350
    case 'gain_muscle':
      return 250
    case 'health':
      return -100
    default:
      return 0
  }
}

function buildBaseCautionNotes(profile: PlanningProfile, bmi: number, language: AppLanguage): string[] {
  const notes: string[] = []

  if (!isEmptyText(profile.allergies)) {
    notes.push(
      language === 'zh'
        ? `计划中默认避开：${normalizeText(profile.allergies)}。`
        : `Avoid these by default in the plan: ${normalizeText(profile.allergies)}.`,
    )
  }

  if (!isEmptyText(profile.medicalNotes)) {
    notes.push(
      language === 'zh'
        ? `存在额外健康备注：${normalizeText(profile.medicalNotes)}，执行前优先遵循医生建议。`
        : `Health notes were provided: ${normalizeText(profile.medicalNotes)}. Follow professional medical advice first.`,
    )
  }

  if (bmi < 18.5) {
    notes.push(
      language === 'zh'
        ? '当前体重偏轻，建议不要继续激进控卡，优先保证蛋白质和总能量。'
        : 'Current weight appears relatively low; avoid aggressive calorie restriction and prioritize enough protein and total energy.',
    )
  }

  if (bmi > 30) {
    notes.push(
      language === 'zh'
        ? '当前体重管理需要循序渐进，建议先保证规律进食和稳定活动量，不要极端节食。'
        : 'Weight management should be gradual; prioritize regular meals and steady activity instead of extreme restriction.',
    )
  }

  if (notes.length === 0) {
    notes.push(
      language === 'zh'
        ? '如果执行中出现明显乏力、头晕或肠胃不适，先停止激进调整，再观察和复盘。'
        : 'If fatigue, dizziness, or digestive discomfort appears, stop aggressive adjustments and review what changed.',
    )
  }

  return notes.slice(0, 4)
}

function buildBaseMealGuidance(
  profile: PlanningProfile,
  calorieTarget: number,
  language: AppLanguage,
): string[] {
  const mealsPerDay = profile.mealsPerDay ?? 3
  const labels = labelsFor(language)
  const goalLabel = labels.goal[profile.goal ?? 'health']
  const activityLabel = labels.activity[profile.activityLevel ?? 'medium']

  if (language === 'zh') {
    const guidance: string[] = [
      `先按每天 ${mealsPerDay} 餐执行，把总热量控制在 ${calorieTarget} kcal 左右，避免白天不吃、晚上补偿。`,
      `每餐优先安排优质蛋白，目标全天约 ${round((profile.weightKg ?? 60) * 1.5)} g，来源可用鸡蛋、奶、豆制品、鱼虾或瘦肉。`,
      `当前目标是“${goalLabel}”，活动水平属于“${activityLabel}”，主食不要完全砍掉，训练前后适当留碳水。`,
    ]

    if (!isEmptyText(profile.dietPreference)) {
      guidance.push(`饮食偏好已纳入计划：${normalizeText(profile.dietPreference)}。执行时优先选你更容易坚持的做法。`)
    } else {
      guidance.push('先用“固定早餐 + 稳定午餐 + 晚餐控油”的简单结构执行，比一次性追求完美更容易坚持。')
    }

    if (!isEmptyText(profile.cookingPreference)) {
      guidance.push(`结合你的做饭习惯：${normalizeText(profile.cookingPreference)}，尽量提前准备可重复购买或复用的食材。`)
    }

    if (!isEmptyText(profile.scheduleNotes)) {
      guidance.push(`作息限制已记录：${normalizeText(profile.scheduleNotes)}。建议把最难控制的一餐提前做“默认选择”。`)
    }

    return guidance.slice(0, 6)
  }

  const guidance: string[] = [
    `Start with ${mealsPerDay} meals per day and keep total intake around ${calorieTarget} kcal, avoiding a skip-all-day-and-compensate-at-night pattern.`,
    `Prioritize quality protein at each meal, aiming for about ${round((profile.weightKg ?? 60) * 1.5)} g per day from eggs, dairy, soy foods, seafood, or lean meat.`,
    `Your current goal is “${goalLabel}” and your activity level is “${activityLabel}”; do not remove carbs entirely, especially around training.`,
  ]

  if (!isEmptyText(profile.dietPreference)) {
    guidance.push(`Diet preferences are included: ${normalizeText(profile.dietPreference)}. Choose the version you can repeat consistently.`)
  } else {
    guidance.push('Use a simple structure first: repeatable breakfast, steady lunch, and a lower-oil dinner. Consistency beats perfect variety.')
  }

  if (!isEmptyText(profile.cookingPreference)) {
    guidance.push(`Based on your cooking habits (${normalizeText(profile.cookingPreference)}), prepare repeatable ingredients or default orders in advance.`)
  }

  if (!isEmptyText(profile.scheduleNotes)) {
    guidance.push(`Schedule constraints are recorded: ${normalizeText(profile.scheduleNotes)}. Give the hardest meal a default choice before the day gets busy.`)
  }

  return guidance.slice(0, 6)
}

async function tryGenerateAiNarrative(
  profile: PlanningProfile,
  fallbackPlan: PlanningPlanDraft,
  language: AppLanguage,
): Promise<PlanningPlanDraft | null> {
  const settings = getSettings()

  if (!settings.agent.apiBaseUrl.trim() || !settings.agent.model.trim()) {
    return null
  }

  const apiStatus = await window.agent.getApiKeyStatus(settings.agent.provider)
  if (!apiStatus.configured) {
    return null
  }

  const response = await window.agent.chatCompletions({
    settings: settings.agent,
    messages: [
      {
        role: 'system',
        content: language === 'zh'
          ? '你是一个谨慎的饮食计划助手，只能输出严格 JSON。'
          : 'You are a careful diet planning assistant. You must output strict JSON only.',
      },
      {
        role: 'user',
        content: buildAiNarrativePrompt(profile, fallbackPlan, language),
      },
    ],
    tools: [],
    temperature: 0.4,
    maxTokens: 900,
  })

  const parsed = JSON.parse(extractJsonObject(response.content)) as {
    title?: unknown
    summary?: unknown
    mealGuidance?: unknown
    cautionNotes?: unknown
  }

  const mealGuidance = Array.isArray(parsed.mealGuidance)
    ? parsed.mealGuidance.map((item) => normalizeText(String(item))).filter(Boolean)
    : []
  const cautionNotes = Array.isArray(parsed.cautionNotes)
    ? parsed.cautionNotes.map((item) => normalizeText(String(item))).filter(Boolean)
    : []

  const title = normalizeText(typeof parsed.title === 'string' ? parsed.title : '')
  const summary = normalizeText(typeof parsed.summary === 'string' ? parsed.summary : '')

  if (!title || !summary || mealGuidance.length < 3) {
    return null
  }

  return {
    ...fallbackPlan,
    title,
    summary,
    mealGuidance,
    cautionNotes: cautionNotes.length > 0 ? cautionNotes : fallbackPlan.cautionNotes,
    generationMode: 'ai',
    generatedWithModel: response.model ?? settings.agent.model,
  }
}

function createFollowUpQuestion(params: {
  code: PlanningFollowUpCode
  prompt: string
  note: string
  targetField?: 'medicalNotes' | 'scheduleNotes'
}): PlanningFollowUpQuestion {
  return {
    id: `${params.code}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    code: params.code,
    prompt: params.prompt,
    note: params.note,
    targetField: params.targetField,
    createdAt: new Date().toISOString(),
  }
}

export function getPlanningSteps(language?: AppLanguage): PlanningStepDefinition[] {
  return stepsFor(language).map((step) => ({
    ...step,
    options: step.options?.map((option) => ({ ...option })),
  }))
}

export function getPlanningStep(stepKey: PlanningStepKey, language?: AppLanguage): PlanningStepDefinition {
  const step = stepsFor(language).find((item) => item.key === stepKey)
  if (!step) {
    throw new Error(`Unknown planning step: ${stepKey}`)
  }

  return {
    ...step,
    options: step.options?.map((option) => ({ ...option })),
  }
}

export function getNextPlanningStepKey(currentStepKey: PlanningStepKey | null | undefined): PlanningStepKey | null {
  const steps = stepsFor('en')
  if (!currentStepKey) {
    return steps[0]?.key ?? null
  }

  const currentIndex = steps.findIndex((step) => step.key === currentStepKey)
  if (currentIndex === -1 || currentIndex === steps.length - 1) {
    return null
  }

  return steps[currentIndex + 1].key
}

export function getPreviousPlanningStepKey(currentStepKey: PlanningStepKey | null | undefined): PlanningStepKey | null {
  if (!currentStepKey) {
    return null
  }

  const steps = stepsFor('en')
  const currentIndex = steps.findIndex((step) => step.key === currentStepKey)
  if (currentIndex <= 0) {
    return null
  }

  return steps[currentIndex - 1].key
}

export function getPlanningStepSkipValue(
  stepKey: PlanningStepKey,
  language?: AppLanguage,
): string | number | undefined {
  return STEP_SKIP_DEFAULTS[resolveLanguage(language)][stepKey]
}

export function buildProfilePatch(
  stepKey: PlanningStepKey,
  value: PlanningAnswerValue,
): Partial<PlanningProfile> {
  switch (stepKey) {
    case 'age':
      return { age: Number(value) }
    case 'gender':
      return { gender: value as PlanningGender }
    case 'heightCm':
      return { heightCm: Number(value) }
    case 'weightKg':
      return { weightKg: Number(value) }
    case 'targetWeightKg':
      return { targetWeightKg: Number(value) }
    case 'goal':
      return { goal: value as PlanningGoal }
    case 'activityLevel':
      return { activityLevel: value as ActivityLevel }
    case 'mealsPerDay':
      return { mealsPerDay: Number(value) }
    case 'dietPreference':
      return { dietPreference: normalizeText(value) }
    case 'allergies':
      return { allergies: normalizeText(value) }
    case 'medicalNotes':
      return { medicalNotes: normalizeText(value) }
    case 'cookingPreference':
      return { cookingPreference: normalizeText(value) }
    case 'scheduleNotes':
      return { scheduleNotes: normalizeText(value) }
    default:
      return {}
  }
}

export function getPlanningAnswerFromProfile(
  profile: Partial<PlanningProfile>,
  stepKey: PlanningStepKey,
): PlanningAnswerValue | undefined {
  const value = profile[stepKey]
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }

  return undefined
}

export function formatPlanningAnswer(
  stepKey: PlanningStepKey,
  value: PlanningAnswerValue,
  language?: AppLanguage,
): string {
  const labels = labelsFor(language)
  const resolvedLanguage = resolveLanguage(language)

  switch (stepKey) {
    case 'gender':
      return labels.gender[value as PlanningGender]
    case 'goal':
      return labels.goal[value as PlanningGoal]
    case 'activityLevel':
      return labels.activity[value as ActivityLevel]
    case 'heightCm':
      return `${Number(value)} cm`
    case 'weightKg':
    case 'targetWeightKg':
      return `${Number(value)} kg`
    case 'age':
      return resolvedLanguage === 'zh' ? `${Number(value)} 岁` : `${Number(value)} years`
    case 'mealsPerDay':
      return resolvedLanguage === 'zh' ? `${Number(value)} 餐` : `${Number(value)} meals`
    default:
      return normalizeText(value)
  }
}

export function buildPlanningPrompt(
  stepKey: PlanningStepKey,
  profileSnapshot: Partial<PlanningProfile>,
  language?: AppLanguage,
): string {
  const resolvedLanguage = resolveLanguage(language)
  const step = getPlanningStep(stepKey, resolvedLanguage)
  const existingValue = getPlanningAnswerFromProfile(profileSnapshot, stepKey)

  if (existingValue === undefined || existingValue === '') {
    return step.prompt
  }

  const answer = formatPlanningAnswer(stepKey, existingValue, resolvedLanguage)
  return resolvedLanguage === 'zh'
    ? `我先确认一下你的${step.label}。当前记录是“${answer}”，如果需要调整就直接改成新的值。`
    : `Let me confirm your ${step.label}. The current record is “${answer}”. If it needs adjustment, replace it with the new value.`
}

export function validatePlanningAnswer(
  stepKey: PlanningStepKey,
  value: PlanningAnswerValue | undefined,
  language?: AppLanguage,
): string | null {
  const resolvedLanguage = resolveLanguage(language)
  const step = getPlanningStep(stepKey, resolvedLanguage)

  if (step.inputType === 'number') {
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) {
      return resolvedLanguage === 'zh'
        ? `请填写有效的${step.label}。`
        : `Please enter a valid ${step.label}.`
    }

    if (typeof step.min === 'number' && numericValue < step.min) {
      return resolvedLanguage === 'zh'
        ? `${step.label}不能低于 ${step.min}${step.unit ?? ''}。`
        : `${step.label} cannot be below ${step.min}${step.unit ? ` ${step.unit}` : ''}.`
    }

    if (typeof step.max === 'number' && numericValue > step.max) {
      return resolvedLanguage === 'zh'
        ? `${step.label}不能高于 ${step.max}${step.unit ?? ''}。`
        : `${step.label} cannot be above ${step.max}${step.unit ? ` ${step.unit}` : ''}.`
    }
  }

  if (step.inputType === 'choice') {
    const normalizedValue = normalizeText(value)
    const validValues = new Set(step.options?.map((option) => option.value) ?? [])
    if (!validValues.has(normalizedValue)) {
      return resolvedLanguage === 'zh'
        ? `请选择一个有效的${step.label}。`
        : `Please choose a valid ${step.label}.`
    }
  }

  if (step.inputType === 'text' && !step.optional && !normalizeText(value)) {
    return resolvedLanguage === 'zh'
      ? `请填写${step.label}。`
      : `Please enter ${step.label}.`
  }

  return null
}

export function normalizePlanningAnswer(
  stepKey: PlanningStepKey,
  value: PlanningAnswerValue | undefined,
): PlanningAnswerValue {
  switch (stepKey) {
    case 'age':
    case 'heightCm':
    case 'mealsPerDay':
      return round(Number(value), 0)
    case 'weightKg':
    case 'targetWeightKg':
      return round(Number(value), 1)
    default:
      return normalizeText(value)
  }
}

export function getCompletedPlanningStepKeys(profile: Partial<PlanningProfile>): PlanningStepKey[] {
  return stepsFor('en').filter((step) => {
    const value = getPlanningAnswerFromProfile(profile, step.key)
    return value !== undefined && value !== ''
  }).map((step) => step.key)
}

export function getPlanningProgress(
  profile: Partial<PlanningProfile>,
  completedStepKeys: PlanningStepKey[] = [],
): PlanningProgress {
  const mergedKeys = new Set<PlanningStepKey>([
    ...getCompletedPlanningStepKeys(profile),
    ...completedStepKeys,
  ])
  const totalCount = stepsFor('en').length
  const completedCount = mergedKeys.size

  return {
    completedCount,
    totalCount,
    percent: totalCount === 0 ? 0 : round((completedCount / totalCount) * 100, 0),
  }
}

export function getInitialPlanningStepKey(
  profile: Partial<PlanningProfile>,
  completedStepKeys: PlanningStepKey[] = [],
): PlanningStepKey | null {
  const confirmedKeys = new Set<PlanningStepKey>([
    ...getCompletedPlanningStepKeys(profile),
    ...completedStepKeys,
  ])
  const nextStep = stepsFor('en').find((step) => !confirmedKeys.has(step.key))

  return nextStep?.key ?? null
}

export function buildPlanningFollowUps(
  profile: Partial<PlanningProfile>,
  existingCodes: PlanningFollowUpCode[],
  language?: AppLanguage,
): PlanningFollowUpQuestion[] {
  const resolvedLanguage = resolveLanguage(language)
  const knownCodes = new Set(existingCodes)
  const questions: PlanningFollowUpQuestion[] = []
  const age = profile.age
  const heightCm = profile.heightCm
  const weightKg = profile.weightKg
  const targetWeightKg = profile.targetWeightKg
  const goal = profile.goal
  const mealsPerDay = profile.mealsPerDay
  const bmi = heightCm && weightKg ? weightKg / ((heightCm / 100) ** 2) : null
  const text = {
    age_caution: {
      note: resolvedLanguage === 'zh'
        ? '年龄处于需要谨慎制定饮食计划的区间，需要补充特殊注意事项。'
        : 'Age is in a range where diet planning needs extra caution.',
      prompt: resolvedLanguage === 'zh'
        ? '你的年龄处在需要更谨慎制定饮食计划的范围里。请补充是否有医生建议、成长发育因素，或其他必须优先考虑的情况。'
        : 'Your age means the plan should be more cautious. Please add any medical advice, growth/development context, or other priority considerations.',
    },
    height_outlier: {
      note: resolvedLanguage === 'zh'
        ? '身高超出常见范围，需要确认单位或特殊情况。'
        : 'Height is outside the common range; unit or special context should be confirmed.',
      prompt: resolvedLanguage === 'zh'
        ? '你填写的身高在常见范围之外。请确认单位是厘米；如果数值无误，也可以补充一下特殊情况，避免我给出不合适的建议。'
        : 'The height you entered is outside the common range. Please confirm the unit is centimeters; if it is correct, add any special context so the plan stays appropriate.',
    },
    weight_outlier: {
      note: resolvedLanguage === 'zh'
        ? '体重超出常见范围，需要补充执行边界或健康背景。'
        : 'Weight is outside the common range; execution boundaries or health context should be added.',
      prompt: resolvedLanguage === 'zh'
        ? '你填写的体重比较特殊。为了让计划更稳妥，请补充一下是否有医生建议、正在治疗，或你希望我特别保守处理的地方。'
        : 'The weight you entered is unusual. To keep the plan steady, please add whether you have medical advice, active treatment, or areas where I should be especially conservative.',
    },
    bmi_low: {
      note: resolvedLanguage === 'zh'
        ? 'BMI 偏低，需要确认是否适合继续控卡。'
        : 'BMI appears low; confirm whether calorie restriction is appropriate.',
      prompt: resolvedLanguage === 'zh'
        ? '按你当前的身高体重估算，体型偏瘦一些。我需要确认一下：你是想增重/增肌，还是有医生建议、食欲问题、肠胃问题需要一起考虑？'
        : 'Based on your height and weight, you appear relatively lean. Are you aiming to gain weight/muscle, or should medical advice, appetite issues, or digestive concerns be considered?',
    },
    bmi_high: {
      note: resolvedLanguage === 'zh'
        ? 'BMI 偏高，需要确认运动限制和执行边界。'
        : 'BMI appears high; movement limits and execution boundaries should be confirmed.',
      prompt: resolvedLanguage === 'zh'
        ? '按你当前的身高体重估算，体重管理需要更稳一点。请补充一下是否有关节/代谢方面限制，或者医生已经给过饮食建议。'
        : 'Based on your height and weight, weight management should be steady. Please add any joint/metabolic limitations or diet advice already given by a clinician.',
    },
    target_gap_large: {
      note: resolvedLanguage === 'zh'
        ? '目标体重与当前体重差距较大，需要确认阶段目标和时间预期。'
        : 'Target weight is far from current weight; stage goals and timing should be confirmed.',
      prompt: resolvedLanguage === 'zh'
        ? '你的目标体重和当前体重差距比较大。请告诉我你是想分阶段完成，还是有明确时间点，这会影响计划节奏。'
        : 'Your target weight is quite far from your current weight. Should this be done in stages, or do you have a specific timeline? That affects the pace.',
    },
    goal_target_mismatch: {
      note: resolvedLanguage === 'zh'
        ? '目标方向与目标体重不完全一致，需要确认优先级。'
        : 'Goal direction and target weight do not fully align; priority should be confirmed.',
      prompt: resolvedLanguage === 'zh'
        ? '你填写的目标方向和目标体重看起来不完全一致。请告诉我你更在意体重数字、体脂变化，还是体型与状态。'
        : 'Your goal direction and target weight do not fully match. What matters more right now: scale weight, body-fat change, or shape and energy?',
    },
    meal_count_edge: {
      note: resolvedLanguage === 'zh'
        ? '每日餐次较少或较多，需要补充作息原因。'
        : 'Meal count is unusually low or high; schedule reason should be added.',
      prompt: resolvedLanguage === 'zh'
        ? '你的一天餐次安排比较特殊。请补充一下是因为作息、训练、夜班还是食欲问题，我会据此调整执行方案。'
        : 'Your meal frequency is unusual. Please add whether this is due to schedule, training, night shifts, or appetite so I can adjust execution.',
    },
  } satisfies Record<PlanningFollowUpCode, { note: string; prompt: string }>

  if ((age !== undefined && age < 18) || (age !== undefined && age > 70)) {
    if (!knownCodes.has('age_caution')) {
      questions.push(createFollowUpQuestion({ code: 'age_caution', targetField: 'medicalNotes', ...text.age_caution }))
      knownCodes.add('age_caution')
    }
  }

  if ((heightCm !== undefined && heightCm < 140) || (heightCm !== undefined && heightCm > 210)) {
    if (!knownCodes.has('height_outlier')) {
      questions.push(createFollowUpQuestion({ code: 'height_outlier', targetField: 'medicalNotes', ...text.height_outlier }))
      knownCodes.add('height_outlier')
    }
  }

  if ((weightKg !== undefined && weightKg < 35) || (weightKg !== undefined && weightKg > 180)) {
    if (!knownCodes.has('weight_outlier')) {
      questions.push(createFollowUpQuestion({ code: 'weight_outlier', targetField: 'medicalNotes', ...text.weight_outlier }))
      knownCodes.add('weight_outlier')
    }
  }

  if (bmi !== null && bmi < 18.5 && !knownCodes.has('bmi_low')) {
    questions.push(createFollowUpQuestion({ code: 'bmi_low', targetField: 'medicalNotes', ...text.bmi_low }))
    knownCodes.add('bmi_low')
  }

  if (bmi !== null && bmi > 30 && !knownCodes.has('bmi_high')) {
    questions.push(createFollowUpQuestion({ code: 'bmi_high', targetField: 'medicalNotes', ...text.bmi_high }))
    knownCodes.add('bmi_high')
  }

  if (weightKg !== undefined && targetWeightKg !== undefined) {
    const targetGap = Math.abs(targetWeightKg - weightKg)
    if (targetGap >= Math.max(12, weightKg * 0.15) && !knownCodes.has('target_gap_large')) {
      questions.push(createFollowUpQuestion({ code: 'target_gap_large', targetField: 'scheduleNotes', ...text.target_gap_large }))
      knownCodes.add('target_gap_large')
    }
  }

  if (goal && weightKg !== undefined && targetWeightKg !== undefined && !knownCodes.has('goal_target_mismatch')) {
    const mismatch =
      (goal === 'lose_fat' && targetWeightKg >= weightKg) ||
      (goal === 'gain_muscle' && targetWeightKg <= weightKg) ||
      (goal === 'maintain' && Math.abs(targetWeightKg - weightKg) >= 4)

    if (mismatch) {
      questions.push(createFollowUpQuestion({ code: 'goal_target_mismatch', targetField: 'scheduleNotes', ...text.goal_target_mismatch }))
      knownCodes.add('goal_target_mismatch')
    }
  }

  if ((mealsPerDay !== undefined && mealsPerDay <= 1) || (mealsPerDay !== undefined && mealsPerDay >= 6)) {
    if (!knownCodes.has('meal_count_edge')) {
      questions.push(createFollowUpQuestion({ code: 'meal_count_edge', targetField: 'scheduleNotes', ...text.meal_count_edge }))
      knownCodes.add('meal_count_edge')
    }
  }

  return questions
}

export function mergePlanningNote(
  currentValue: string | undefined,
  addition: string,
  language?: AppLanguage,
): string {
  const normalizedCurrent = normalizeText(currentValue)
  const normalizedAddition = normalizeText(addition)

  if (!normalizedAddition) {
    return normalizedCurrent
  }

  if (isEmptyText(normalizedCurrent)) {
    return normalizedAddition
  }

  if (normalizedCurrent.includes(normalizedAddition)) {
    return normalizedCurrent
  }

  return `${normalizedCurrent}${resolveLanguage(language) === 'zh' ? '；' : '; '}${normalizedAddition}`
}

export function summarizePlanningProfile(
  profile: Partial<PlanningProfile>,
  language?: AppLanguage,
): Array<{ label: string; value: string }> {
  const resolvedLanguage = resolveLanguage(language)
  const labels = labelsFor(resolvedLanguage)
  const items: Array<{ label: string; value: string | undefined }> = [
    {
      label: resolvedLanguage === 'zh' ? '年龄' : 'Age',
      value: profile.age !== undefined ? (resolvedLanguage === 'zh' ? `${profile.age} 岁` : `${profile.age} years`) : undefined,
    },
    {
      label: resolvedLanguage === 'zh' ? '身高' : 'Height',
      value: profile.heightCm !== undefined ? `${profile.heightCm} cm` : undefined,
    },
    {
      label: resolvedLanguage === 'zh' ? '体重' : 'Weight',
      value: profile.weightKg !== undefined ? `${profile.weightKg} kg` : undefined,
    },
    {
      label: resolvedLanguage === 'zh' ? '目标体重' : 'Target weight',
      value: profile.targetWeightKg !== undefined ? `${profile.targetWeightKg} kg` : undefined,
    },
    {
      label: resolvedLanguage === 'zh' ? '目标' : 'Goal',
      value: profile.goal ? labels.goal[profile.goal] : undefined,
    },
    {
      label: resolvedLanguage === 'zh' ? '活动量' : 'Activity',
      value: profile.activityLevel ? labels.activity[profile.activityLevel] : undefined,
    },
    {
      label: resolvedLanguage === 'zh' ? '每日餐次' : 'Meals per day',
      value: profile.mealsPerDay !== undefined
        ? (resolvedLanguage === 'zh' ? `${profile.mealsPerDay} 餐` : `${profile.mealsPerDay} meals`)
        : undefined,
    },
  ]

  return items
    .filter((item) => Boolean(item.value))
    .map((item) => ({
      label: item.label,
      value: item.value as string,
    }))
}

function formatProfileAuditValue(
  fieldKey: keyof PlanningProfile,
  profile: Partial<PlanningProfile>,
  language: AppLanguage,
): string | null {
  const value = profile[fieldKey]
  const labels = labelsFor(language)

  if (value === undefined || value === null || value === '') {
    return null
  }

  switch (fieldKey) {
    case 'age':
      return language === 'zh' ? `${value} 岁` : `${value} years`
    case 'heightCm':
      return `${value} cm`
    case 'weightKg':
    case 'targetWeightKg':
      return `${value} kg`
    case 'mealsPerDay':
      return language === 'zh' ? `${value} 餐` : `${value} meals`
    case 'gender':
      return labels.gender[value as PlanningGender]
    case 'goal':
      return labels.goal[value as PlanningGoal]
    case 'activityLevel':
      return labels.activity[value as ActivityLevel]
    default:
      return normalizeText(String(value))
  }
}

export function getPlanningProfileSummaryItems(
  profile: Partial<PlanningProfile>,
  language?: AppLanguage,
): PlanningProfileSummaryItem[] {
  const resolvedLanguage = resolveLanguage(language)

  return PROFILE_CHANGE_FIELDS[resolvedLanguage]
    .map((field) => {
      const value = formatProfileAuditValue(field.key, profile, resolvedLanguage)

      return value
        ? {
            key: field.key,
            label: field.label,
            value,
          }
        : null
    })
    .filter((item): item is PlanningProfileSummaryItem => item !== null)
}

export function getPlanGenerationLabel(
  plan: Pick<PersonalDietPlan, 'generationMode' | 'generatedWithModel'>,
  language?: AppLanguage,
): string {
  const resolvedLanguage = resolveLanguage(language)
  if (plan.generationMode === 'ai') {
    if (resolvedLanguage === 'zh') {
      return plan.generatedWithModel ? `模型生成 · ${plan.generatedWithModel}` : '模型生成'
    }
    return plan.generatedWithModel ? `AI generated · ${plan.generatedWithModel}` : 'AI generated'
  }

  return resolvedLanguage === 'zh' ? '本地模板' : 'Local template'
}

export function getPlanVersionDiff(
  currentPlan: PersonalDietPlan,
  previousPlan: PersonalDietPlan | null,
  language?: AppLanguage,
): PlanVersionDiff | null {
  if (!previousPlan) {
    return null
  }

  const resolvedLanguage = resolveLanguage(language)
  const metricChanges = PLAN_METRIC_FIELDS[resolvedLanguage]
    .map((metric) => {
      const currentValue = currentPlan[metric.key]
      const previousValue = previousPlan[metric.key]

      if (typeof currentValue !== 'number' || typeof previousValue !== 'number' || currentValue === previousValue) {
        return null
      }

      return {
        key: metric.key,
        label: metric.label,
        previous: previousValue,
        current: currentValue,
        delta: round(currentValue - previousValue, 1),
        unit: metric.unit,
      } satisfies PlanMetricChange
    })
    .filter((item): item is PlanMetricChange => item !== null)

  const profileChanges = PROFILE_CHANGE_FIELDS[resolvedLanguage]
    .map((field) => {
      const currentValue = formatProfileAuditValue(field.key, currentPlan.profileSnapshot, resolvedLanguage)
      const previousValue = formatProfileAuditValue(field.key, previousPlan.profileSnapshot, resolvedLanguage)

      if (currentValue === previousValue) {
        return null
      }

      return {
        key: field.key,
        label: field.label,
        previous: previousValue ?? (resolvedLanguage === 'zh' ? '未填写' : 'Not filled'),
        current: currentValue ?? (resolvedLanguage === 'zh' ? '未填写' : 'Not filled'),
      } satisfies PlanProfileChange
    })
    .filter((item): item is PlanProfileChange => item !== null)

  let summary = resolvedLanguage === 'zh'
    ? '当前版本与上一版本相比，主要是文案和提醒做了微调。'
    : 'Compared with the previous version, this version mainly adjusts wording and reminders.'

  if (metricChanges.length > 0 || profileChanges.length > 0) {
    const parts: string[] = []
    if (metricChanges.length > 0) {
      parts.push(
        resolvedLanguage === 'zh'
          ? `宏量目标调整了 ${metricChanges.length} 项`
          : `${metricChanges.length} nutrition target${metricChanges.length > 1 ? 's' : ''} changed`,
      )
    }
    if (profileChanges.length > 0) {
      parts.push(
        resolvedLanguage === 'zh'
          ? `用户档案变更了 ${profileChanges.length} 项`
          : `${profileChanges.length} profile field${profileChanges.length > 1 ? 's' : ''} changed`,
      )
    }
    summary = resolvedLanguage === 'zh'
      ? `当前版本与上一版本相比，${parts.join('，')}。`
      : `Compared with the previous version, ${parts.join(' and ')}.`
  }

  return {
    metricChanges,
    profileChanges,
    summary,
  }
}

export async function generatePlanningPlan(
  profile: PlanningProfile,
  language?: AppLanguage,
): Promise<PlanningPlanDraft> {
  const resolvedLanguage = resolveLanguage(language)
  const weightKg = profile.weightKg ?? 60
  const goal = profile.goal ?? 'health'
  const activityLevel = profile.activityLevel ?? 'medium'
  const bmi = profile.weightKg && profile.heightCm
    ? profile.weightKg / ((profile.heightCm / 100) ** 2)
    : 22
  const bmr = getBmr(profile)
  const tdee = bmr * getActivityMultiplier(activityLevel)
  const targetCalories = clamp(round(tdee + getGoalAdjustment(goal), 0), 1200, 3600)
  const proteinTarget = clamp(round((goal === 'gain_muscle' ? 1.8 : 1.5) * weightKg, 0), 60, 220)
  const fatTarget = clamp(round(Math.max(weightKg * 0.8, 45), 0), 45, 120)
  const remainingCalories = Math.max(targetCalories - proteinTarget * 4 - fatTarget * 9, 400)
  const carbsTarget = clamp(round(remainingCalories / 4, 0), 80, 450)
  const goalLabel = labelsFor(resolvedLanguage).goal[goal]

  const fallbackPlan: PlanningPlanDraft = {
    title: resolvedLanguage === 'zh'
      ? `${goalLabel}专属饮食计划`
      : `${goalLabel} Diet Plan`,
    summary: resolvedLanguage === 'zh'
      ? `建议先把日均热量控制在 ${targetCalories} kcal 左右，优先稳定餐次与蛋白质摄入，再根据体重和状态每 2 周复盘一次。`
      : `Start around ${targetCalories} kcal per day, stabilize meal timing and protein intake first, then review weight and energy every 2 weeks.`,
    dailyCalorieTarget: targetCalories,
    proteinTarget,
    carbsTarget,
    fatTarget,
    mealGuidance: buildBaseMealGuidance(profile, targetCalories, resolvedLanguage),
    cautionNotes: buildBaseCautionNotes(profile, bmi, resolvedLanguage),
    generationMode: 'local',
  }

  try {
    const aiPlan = await tryGenerateAiNarrative(profile, fallbackPlan, resolvedLanguage)
    return aiPlan ?? fallbackPlan
  } catch (error) {
    console.error('Failed to generate AI planning narrative:', error)
    return fallbackPlan
  }
}
