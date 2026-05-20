import type {
  ExpressOnboardingInput,
  ExpressOnboardingResult,
  ValidationResult,
} from './types'
import type { CoachingAuditEntry, PersonalDietPlan, PlanningProfile } from '../stores/planning'
import { savePlanningProfile, savePersonalDietPlan } from '../stores/planning'
import { writeAuditEntry } from './auditLog'

const VALID_GENDERS: ExpressOnboardingInput['gender'][] = ['male', 'female', 'other']
const VALID_ACTIVITY_LEVELS: ExpressOnboardingInput['activityLevel'][] = ['low', 'medium', 'high']

const ACTIVITY_MULTIPLIERS: Record<ExpressOnboardingInput['activityLevel'], number> = {
  low: 1.2,
  medium: 1.55,
  high: 1.725,
}

/** Default age used for Mifflin-St Jeor since express onboarding doesn't collect age */
const DEFAULT_AGE = 30

/** Standard deficit for weight loss (kcal/day) */
const WEIGHT_LOSS_DEFICIT = 500

/**
 * Validates the 5 express onboarding fields.
 *
 * - heightCm: 100–250
 * - weightKg: 25–300
 * - targetWeightKg: 25–300
 * - activityLevel: 'low' | 'medium' | 'high'
 * - gender: 'male' | 'female' | 'other'
 */
export function validateExpressInput(input: ExpressOnboardingInput): ValidationResult {
  const errors: Array<{ field: string; message: string }> = []

  if (!VALID_GENDERS.includes(input.gender)) {
    errors.push({ field: 'gender', message: '性别必须是 male、female 或 other' })
  }

  if (typeof input.heightCm !== 'number' || !Number.isFinite(input.heightCm) || input.heightCm < 100 || input.heightCm > 250) {
    errors.push({ field: 'heightCm', message: '身高必须在 100–250 cm 之间' })
  }

  if (typeof input.weightKg !== 'number' || !Number.isFinite(input.weightKg) || input.weightKg < 25 || input.weightKg > 300) {
    errors.push({ field: 'weightKg', message: '体重必须在 25–300 kg 之间' })
  }

  if (typeof input.targetWeightKg !== 'number' || !Number.isFinite(input.targetWeightKg) || input.targetWeightKg < 25 || input.targetWeightKg > 300) {
    errors.push({ field: 'targetWeightKg', message: '目标体重必须在 25–300 kg 之间' })
  }

  if (!VALID_ACTIVITY_LEVELS.includes(input.activityLevel)) {
    errors.push({ field: 'activityLevel', message: '活动水平必须是 low、medium 或 high' })
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true }
}

/**
 * Computes Mifflin-St Jeor BMR.
 *
 * Male:   10 * weight + 6.25 * height - 5 * age - 161
 * Female: 10 * weight + 6.25 * height - 5 * age + 5
 * Other:  average of male and female
 */
function computeBMR(gender: ExpressOnboardingInput['gender'], weightKg: number, heightCm: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * DEFAULT_AGE
  if (gender === 'male') {
    return base - 161
  }
  if (gender === 'female') {
    return base + 5
  }
  // 'other': average of male and female
  const maleBMR = base - 161
  const femaleBMR = base + 5
  return (maleBMR + femaleBMR) / 2
}

/**
 * Computes the daily calorie target using Mifflin-St Jeor + activity multiplier + optional deficit.
 */
function computeCalorieTarget(input: ExpressOnboardingInput): number {
  const bmr = computeBMR(input.gender, input.weightKg, input.heightCm)
  const tdee = bmr * ACTIVITY_MULTIPLIERS[input.activityLevel]

  // Apply deficit only if target weight is less than current weight (weight loss)
  if (input.targetWeightKg < input.weightKg) {
    return Math.round(tdee - WEIGHT_LOSS_DEFICIT)
  }

  // Maintenance or gain: use TDEE as-is
  return Math.round(tdee)
}

/**
 * Runs the express onboarding flow:
 * 1. Validates input
 * 2. Computes calorie target via Mifflin-St Jeor
 * 3. Saves PlanningProfile
 * 4. Saves PersonalDietPlan
 * 5. Writes audit entry
 * 6. Returns the result
 */
export async function runExpressOnboarding(input: ExpressOnboardingInput): Promise<ExpressOnboardingResult> {
  const validation = validateExpressInput(input)
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors!.map((e) => e.message).join('; ')}`)
  }

  const dailyCalorieTarget = computeCalorieTarget(input)

  // Save planning profile with the 5 express fields
  const profile: PlanningProfile = await savePlanningProfile({
    gender: input.gender,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    targetWeightKg: input.targetWeightKg,
    activityLevel: input.activityLevel,
    completionStatus: 'completed',
  })

  // Save personal diet plan with computed calorie target
  const plan: PersonalDietPlan = await savePersonalDietPlan({
    title: '快速减脂计划',
    summary: `基于 Mifflin-St Jeor 公式计算，每日目标 ${dailyCalorieTarget} kcal`,
    dailyCalorieTarget,
    mealGuidance: [],
    cautionNotes: [],
    generationMode: 'local',
  })

  // Write audit entry
  const auditEntry: CoachingAuditEntry = await writeAuditEntry({
    actor: 'system',
    action: 'express_onboarding_completed',
    payload: {
      path: 'express',
      elapsedMs: 0,
      gender: input.gender,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      targetWeightKg: input.targetWeightKg,
      activityLevel: input.activityLevel,
      dailyCalorieTarget,
    },
  })

  return { profile, plan, auditEntry }
}
