import { getSettings } from '../stores/settings'
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

export const GENDER_LABELS: Record<PlanningGender, string> = {
  male: '男',
  female: '女',
  other: '其他 / 不便说明',
}

export const GOAL_LABELS: Record<PlanningGoal, string> = {
  lose_fat: '减脂',
  maintain: '维持',
  gain_muscle: '增肌',
  health: '健康管理',
}

export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  low: '久坐少动',
  medium: '轻中度活动',
  high: '高频训练',
}

const STEP_SKIP_DEFAULTS: Partial<Record<PlanningStepKey, string | number>> = {
  dietPreference: '无特别偏好',
  allergies: '无',
  medicalNotes: '无',
  cookingPreference: '暂未说明',
  scheduleNotes: '暂无额外安排',
}

const PROFILE_CHANGE_FIELDS: Array<{ key: keyof PlanningProfile; label: string }> = [
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
]

const PLAN_METRIC_FIELDS: Array<{
  key: PlanMetricChange['key']
  label: string
  unit: string
}> = [
  { key: 'dailyCalorieTarget', label: '热量目标', unit: 'kcal' },
  { key: 'proteinTarget', label: '蛋白质', unit: 'g' },
  { key: 'carbsTarget', label: '碳水', unit: 'g' },
  { key: 'fatTarget', label: '脂肪', unit: 'g' },
]

const PLANNING_STEPS: PlanningStepDefinition[] = [
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
]

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

function buildAiNarrativePrompt(profile: PlanningProfile, fallbackPlan: PlanningPlanDraft): string {
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

function buildBaseCautionNotes(profile: PlanningProfile, bmi: number): string[] {
  const notes: string[] = []

  if (normalizeText(profile.allergies) && normalizeText(profile.allergies) !== '无') {
    notes.push(`计划中默认避开：${normalizeText(profile.allergies)}。`)
  }

  if (normalizeText(profile.medicalNotes) && normalizeText(profile.medicalNotes) !== '无') {
    notes.push(`存在额外健康备注：${normalizeText(profile.medicalNotes)}，执行前优先遵循医生建议。`)
  }

  if (bmi < 18.5) {
    notes.push('当前体重偏轻，建议不要继续激进控卡，优先保证蛋白质和总能量。')
  }

  if (bmi > 30) {
    notes.push('当前体重管理需要循序渐进，建议先保证规律进食和稳定活动量，不要极端节食。')
  }

  if (notes.length === 0) {
    notes.push('如果执行中出现明显乏力、头晕或肠胃不适，先停止激进调整，再观察和复盘。')
  }

  return notes.slice(0, 4)
}

function buildBaseMealGuidance(profile: PlanningProfile, calorieTarget: number): string[] {
  const mealsPerDay = profile.mealsPerDay ?? 3
  const goalLabel = GOAL_LABELS[profile.goal ?? 'health']
  const activityLabel = ACTIVITY_LEVEL_LABELS[profile.activityLevel ?? 'medium']
  const guidance: string[] = [
    `先按每天 ${mealsPerDay} 餐执行，把总热量控制在 ${calorieTarget} kcal 左右，避免白天不吃、晚上补偿。`,
    `每餐优先安排优质蛋白，目标全天约 ${round((profile.weightKg ?? 60) * 1.5)} g，来源可用鸡蛋、奶、豆制品、鱼虾或瘦肉。`,
    `当前目标是“${goalLabel}”，活动水平属于“${activityLabel}”，主食不要完全砍掉，训练前后适当留碳水。`,
  ]

  if (normalizeText(profile.dietPreference) && normalizeText(profile.dietPreference) !== '无特别偏好') {
    guidance.push(`饮食偏好已纳入计划：${normalizeText(profile.dietPreference)}。执行时优先选你更容易坚持的做法。`)
  } else {
    guidance.push('先用“固定早餐 + 稳定午餐 + 晚餐控油”的简单结构执行，比一次性追求完美更容易坚持。')
  }

  if (normalizeText(profile.cookingPreference) && normalizeText(profile.cookingPreference) !== '暂未说明') {
    guidance.push(`结合你的做饭习惯：${normalizeText(profile.cookingPreference)}，尽量提前准备可重复购买或复用的食材。`)
  }

  if (normalizeText(profile.scheduleNotes) && normalizeText(profile.scheduleNotes) !== '暂无额外安排') {
    guidance.push(`作息限制已记录：${normalizeText(profile.scheduleNotes)}。建议把最难控制的一餐提前做“默认选择”。`)
  }

  return guidance.slice(0, 6)
}

async function tryGenerateAiNarrative(
  profile: PlanningProfile,
  fallbackPlan: PlanningPlanDraft,
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
        content: '你是一个谨慎的饮食计划助手，只能输出严格 JSON。',
      },
      {
        role: 'user',
        content: buildAiNarrativePrompt(profile, fallbackPlan),
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

export function getPlanningSteps(): PlanningStepDefinition[] {
  return [...PLANNING_STEPS]
}

export function getPlanningStep(stepKey: PlanningStepKey): PlanningStepDefinition {
  const step = PLANNING_STEPS.find((item) => item.key === stepKey)
  if (!step) {
    throw new Error(`Unknown planning step: ${stepKey}`)
  }

  return step
}

export function getNextPlanningStepKey(currentStepKey: PlanningStepKey | null | undefined): PlanningStepKey | null {
  if (!currentStepKey) {
    return PLANNING_STEPS[0]?.key ?? null
  }

  const currentIndex = PLANNING_STEPS.findIndex((step) => step.key === currentStepKey)
  if (currentIndex === -1 || currentIndex === PLANNING_STEPS.length - 1) {
    return null
  }

  return PLANNING_STEPS[currentIndex + 1].key
}

export function getPreviousPlanningStepKey(currentStepKey: PlanningStepKey | null | undefined): PlanningStepKey | null {
  if (!currentStepKey) {
    return null
  }

  const currentIndex = PLANNING_STEPS.findIndex((step) => step.key === currentStepKey)
  if (currentIndex <= 0) {
    return null
  }

  return PLANNING_STEPS[currentIndex - 1].key
}

export function getPlanningStepSkipValue(stepKey: PlanningStepKey): string | number | undefined {
  return STEP_SKIP_DEFAULTS[stepKey]
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

export function formatPlanningAnswer(stepKey: PlanningStepKey, value: PlanningAnswerValue): string {
  switch (stepKey) {
    case 'gender':
      return GENDER_LABELS[value as PlanningGender]
    case 'goal':
      return GOAL_LABELS[value as PlanningGoal]
    case 'activityLevel':
      return ACTIVITY_LEVEL_LABELS[value as ActivityLevel]
    case 'heightCm':
      return `${Number(value)} cm`
    case 'weightKg':
    case 'targetWeightKg':
      return `${Number(value)} kg`
    case 'age':
      return `${Number(value)} 岁`
    case 'mealsPerDay':
      return `${Number(value)} 餐`
    default:
      return normalizeText(value)
  }
}

export function buildPlanningPrompt(
  stepKey: PlanningStepKey,
  profileSnapshot: Partial<PlanningProfile>,
): string {
  const step = getPlanningStep(stepKey)
  const existingValue = getPlanningAnswerFromProfile(profileSnapshot, stepKey)

  if (existingValue === undefined || existingValue === '') {
    return step.prompt
  }

  return `我先确认一下你的${step.label}。当前记录是“${formatPlanningAnswer(stepKey, existingValue)}”，如果需要调整就直接改成新的值。`
}

export function validatePlanningAnswer(
  stepKey: PlanningStepKey,
  value: PlanningAnswerValue | undefined,
): string | null {
  const step = getPlanningStep(stepKey)

  if (step.inputType === 'number') {
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) {
      return `请填写有效的${step.label}。`
    }

    if (typeof step.min === 'number' && numericValue < step.min) {
      return `${step.label}不能低于 ${step.min}${step.unit ?? ''}。`
    }

    if (typeof step.max === 'number' && numericValue > step.max) {
      return `${step.label}不能高于 ${step.max}${step.unit ?? ''}。`
    }
  }

  if (step.inputType === 'choice') {
    const normalizedValue = normalizeText(value)
    const validValues = new Set(step.options?.map((option) => option.value) ?? [])
    if (!validValues.has(normalizedValue)) {
      return `请选择一个有效的${step.label}。`
    }
  }

  if (step.inputType === 'text' && !step.optional && !normalizeText(value)) {
    return `请填写${step.label}。`
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
  return PLANNING_STEPS.filter((step) => {
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
  const totalCount = PLANNING_STEPS.length
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
  const nextStep = PLANNING_STEPS.find((step) => !confirmedKeys.has(step.key))

  return nextStep?.key ?? PLANNING_STEPS[0]?.key ?? null
}

export function buildPlanningFollowUps(
  profile: Partial<PlanningProfile>,
  existingCodes: PlanningFollowUpCode[],
): PlanningFollowUpQuestion[] {
  const knownCodes = new Set(existingCodes)
  const questions: PlanningFollowUpQuestion[] = []
  const age = profile.age
  const heightCm = profile.heightCm
  const weightKg = profile.weightKg
  const targetWeightKg = profile.targetWeightKg
  const goal = profile.goal
  const mealsPerDay = profile.mealsPerDay
  const bmi = heightCm && weightKg ? weightKg / ((heightCm / 100) ** 2) : null

  if ((age !== undefined && age < 18) || (age !== undefined && age > 70)) {
    if (!knownCodes.has('age_caution')) {
      questions.push(
        createFollowUpQuestion({
          code: 'age_caution',
          note: '年龄处于需要谨慎制定饮食计划的区间，需要补充特殊注意事项。',
          targetField: 'medicalNotes',
          prompt:
            '你的年龄处在需要更谨慎制定饮食计划的范围里。请补充是否有医生建议、成长发育因素，或其他必须优先考虑的情况。',
        }),
      )
      knownCodes.add('age_caution')
    }
  }

  if ((heightCm !== undefined && heightCm < 140) || (heightCm !== undefined && heightCm > 210)) {
    if (!knownCodes.has('height_outlier')) {
      questions.push(
        createFollowUpQuestion({
          code: 'height_outlier',
          note: '身高超出常见范围，需要确认单位或特殊情况。',
          targetField: 'medicalNotes',
          prompt:
            '你填写的身高在常见范围之外。请确认单位是厘米；如果数值无误，也可以补充一下特殊情况，避免我给出不合适的建议。',
        }),
      )
      knownCodes.add('height_outlier')
    }
  }

  if ((weightKg !== undefined && weightKg < 35) || (weightKg !== undefined && weightKg > 180)) {
    if (!knownCodes.has('weight_outlier')) {
      questions.push(
        createFollowUpQuestion({
          code: 'weight_outlier',
          note: '体重超出常见范围，需要补充执行边界或健康背景。',
          targetField: 'medicalNotes',
          prompt:
            '你填写的体重比较特殊。为了让计划更稳妥，请补充一下是否有医生建议、正在治疗，或你希望我特别保守处理的地方。',
        }),
      )
      knownCodes.add('weight_outlier')
    }
  }

  if (bmi !== null && bmi < 18.5 && !knownCodes.has('bmi_low')) {
    questions.push(
      createFollowUpQuestion({
        code: 'bmi_low',
        note: 'BMI 偏低，需要确认是否适合继续控卡。',
        targetField: 'medicalNotes',
        prompt:
          '按你当前的身高体重估算，体型偏瘦一些。我需要确认一下：你是想增重/增肌，还是有医生建议、食欲问题、肠胃问题需要一起考虑？',
      }),
    )
    knownCodes.add('bmi_low')
  }

  if (bmi !== null && bmi > 30 && !knownCodes.has('bmi_high')) {
    questions.push(
      createFollowUpQuestion({
        code: 'bmi_high',
        note: 'BMI 偏高，需要确认运动限制和执行边界。',
        targetField: 'medicalNotes',
        prompt:
          '按你当前的身高体重估算，体重管理需要更稳一点。请补充一下是否有关节/代谢方面限制，或者医生已经给过饮食建议。',
      }),
    )
    knownCodes.add('bmi_high')
  }

  if (weightKg !== undefined && targetWeightKg !== undefined) {
    const targetGap = Math.abs(targetWeightKg - weightKg)
    if (targetGap >= Math.max(12, weightKg * 0.15) && !knownCodes.has('target_gap_large')) {
      questions.push(
        createFollowUpQuestion({
          code: 'target_gap_large',
          note: '目标体重与当前体重差距较大，需要确认阶段目标和时间预期。',
          targetField: 'scheduleNotes',
          prompt:
            '你的目标体重和当前体重差距比较大。请告诉我你是想分阶段完成，还是有明确时间点，这会影响计划节奏。',
        }),
      )
      knownCodes.add('target_gap_large')
    }
  }

  if (goal && weightKg !== undefined && targetWeightKg !== undefined && !knownCodes.has('goal_target_mismatch')) {
    const mismatch =
      (goal === 'lose_fat' && targetWeightKg >= weightKg) ||
      (goal === 'gain_muscle' && targetWeightKg <= weightKg) ||
      (goal === 'maintain' && Math.abs(targetWeightKg - weightKg) >= 4)

    if (mismatch) {
      questions.push(
        createFollowUpQuestion({
          code: 'goal_target_mismatch',
          note: '目标方向与目标体重不完全一致，需要确认优先级。',
          targetField: 'scheduleNotes',
          prompt:
            '你填写的目标方向和目标体重看起来不完全一致。请告诉我你更在意体重数字、体脂变化，还是体型与状态。',
        }),
      )
      knownCodes.add('goal_target_mismatch')
    }
  }

  if ((mealsPerDay !== undefined && mealsPerDay <= 1) || (mealsPerDay !== undefined && mealsPerDay >= 6)) {
    if (!knownCodes.has('meal_count_edge')) {
      questions.push(
        createFollowUpQuestion({
          code: 'meal_count_edge',
          note: '每日餐次较少或较多，需要补充作息原因。',
          targetField: 'scheduleNotes',
          prompt:
            '你的一天餐次安排比较特殊。请补充一下是因为作息、训练、夜班还是食欲问题，我会据此调整执行方案。',
        }),
      )
      knownCodes.add('meal_count_edge')
    }
  }

  return questions
}

export function mergePlanningNote(currentValue: string | undefined, addition: string): string {
  const normalizedCurrent = normalizeText(currentValue)
  const normalizedAddition = normalizeText(addition)

  if (!normalizedAddition) {
    return normalizedCurrent
  }

  if (!normalizedCurrent || normalizedCurrent === '无' || normalizedCurrent === '暂无额外安排') {
    return normalizedAddition
  }

  if (normalizedCurrent.includes(normalizedAddition)) {
    return normalizedCurrent
  }

  return `${normalizedCurrent}；${normalizedAddition}`
}

export function summarizePlanningProfile(profile: Partial<PlanningProfile>): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string | undefined }> = [
    {
      label: '年龄',
      value: profile.age !== undefined ? `${profile.age} 岁` : undefined,
    },
    {
      label: '身高',
      value: profile.heightCm !== undefined ? `${profile.heightCm} cm` : undefined,
    },
    {
      label: '体重',
      value: profile.weightKg !== undefined ? `${profile.weightKg} kg` : undefined,
    },
    {
      label: '目标体重',
      value: profile.targetWeightKg !== undefined ? `${profile.targetWeightKg} kg` : undefined,
    },
    {
      label: '目标',
      value: profile.goal ? GOAL_LABELS[profile.goal] : undefined,
    },
    {
      label: '活动量',
      value: profile.activityLevel ? ACTIVITY_LEVEL_LABELS[profile.activityLevel] : undefined,
    },
    {
      label: '每日餐次',
      value: profile.mealsPerDay !== undefined ? `${profile.mealsPerDay} 餐` : undefined,
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
): string | null {
  const value = profile[fieldKey]

  if (value === undefined || value === null || value === '') {
    return null
  }

  switch (fieldKey) {
    case 'age':
      return `${value} 岁`
    case 'heightCm':
      return `${value} cm`
    case 'weightKg':
    case 'targetWeightKg':
      return `${value} kg`
    case 'mealsPerDay':
      return `${value} 餐`
    case 'gender':
      return GENDER_LABELS[value as PlanningGender]
    case 'goal':
      return GOAL_LABELS[value as PlanningGoal]
    case 'activityLevel':
      return ACTIVITY_LEVEL_LABELS[value as ActivityLevel]
    default:
      return normalizeText(String(value))
  }
}

export function getPlanGenerationLabel(plan: Pick<PersonalDietPlan, 'generationMode' | 'generatedWithModel'>): string {
  if (plan.generationMode === 'ai') {
    return plan.generatedWithModel ? `模型生成 · ${plan.generatedWithModel}` : '模型生成'
  }

  return '本地模板'
}

export function getPlanVersionDiff(
  currentPlan: PersonalDietPlan,
  previousPlan: PersonalDietPlan | null,
): PlanVersionDiff | null {
  if (!previousPlan) {
    return null
  }

  const metricChanges = PLAN_METRIC_FIELDS
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

  const profileChanges = PROFILE_CHANGE_FIELDS
    .map((field) => {
      const currentValue = formatProfileAuditValue(field.key, currentPlan.profileSnapshot)
      const previousValue = formatProfileAuditValue(field.key, previousPlan.profileSnapshot)

      if (currentValue === previousValue) {
        return null
      }

      return {
        key: field.key,
        label: field.label,
        previous: previousValue ?? '未填写',
        current: currentValue ?? '未填写',
      } satisfies PlanProfileChange
    })
    .filter((item): item is PlanProfileChange => item !== null)

  let summary = '当前版本与上一版本相比，主要是文案和提醒做了微调。'

  if (metricChanges.length > 0 || profileChanges.length > 0) {
    const parts: string[] = []
    if (metricChanges.length > 0) {
      parts.push(`宏量目标调整了 ${metricChanges.length} 项`)
    }
    if (profileChanges.length > 0) {
      parts.push(`用户档案变更了 ${profileChanges.length} 项`)
    }
    summary = `当前版本与上一版本相比，${parts.join('，')}。`
  }

  return {
    metricChanges,
    profileChanges,
    summary,
  }
}

export async function generatePlanningPlan(profile: PlanningProfile): Promise<PlanningPlanDraft> {
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

  const fallbackPlan: PlanningPlanDraft = {
    title: `${GOAL_LABELS[goal]}专属饮食计划`,
    summary: `建议先把日均热量控制在 ${targetCalories} kcal 左右，优先稳定餐次与蛋白质摄入，再根据体重和状态每 2 周复盘一次。`,
    dailyCalorieTarget: targetCalories,
    proteinTarget,
    carbsTarget,
    fatTarget,
    mealGuidance: buildBaseMealGuidance(profile, targetCalories),
    cautionNotes: buildBaseCautionNotes(profile, bmi),
    generationMode: 'local',
  }

  try {
    const aiPlan = await tryGenerateAiNarrative(profile, fallbackPlan)
    return aiPlan ?? fallbackPlan
  } catch (error) {
    console.error('Failed to generate AI planning narrative:', error)
    return fallbackPlan
  }
}
