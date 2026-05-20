import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateExpressInput, runExpressOnboarding } from '../expressOnboarding'
import type { ExpressOnboardingInput } from '../types'

// Mock the planning store
vi.mock('../../stores/planning', () => ({
  savePlanningProfile: vi.fn(async (patch) => ({
    id: 'current',
    ...patch,
    completionStatus: patch.completionStatus ?? 'draft',
    updatedAt: new Date().toISOString(),
  })),
  savePersonalDietPlan: vi.fn(async (params) => ({
    id: 1,
    ...params,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profileSnapshot: { id: 'current' },
  })),
}))

// Mock the audit log
vi.mock('../auditLog', () => ({
  writeAuditEntry: vi.fn(async (entry) => ({
    id: 1,
    ...entry,
    timestamp: new Date().toISOString(),
  })),
}))

function validInput(): ExpressOnboardingInput {
  return {
    gender: 'male',
    heightCm: 175,
    weightKg: 80,
    targetWeightKg: 70,
    activityLevel: 'medium',
  }
}

describe('validateExpressInput', () => {
  it('accepts valid input', () => {
    const result = validateExpressInput(validInput())
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('rejects height below 100', () => {
    const result = validateExpressInput({ ...validInput(), heightCm: 99 })
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors![0].field).toBe('heightCm')
  })

  it('rejects height above 250', () => {
    const result = validateExpressInput({ ...validInput(), heightCm: 251 })
    expect(result.valid).toBe(false)
    expect(result.errors![0].field).toBe('heightCm')
  })

  it('accepts height at boundaries (100 and 250)', () => {
    expect(validateExpressInput({ ...validInput(), heightCm: 100 }).valid).toBe(true)
    expect(validateExpressInput({ ...validInput(), heightCm: 250 }).valid).toBe(true)
  })

  it('rejects weight below 25', () => {
    const result = validateExpressInput({ ...validInput(), weightKg: 24 })
    expect(result.valid).toBe(false)
    expect(result.errors![0].field).toBe('weightKg')
  })

  it('rejects weight above 300', () => {
    const result = validateExpressInput({ ...validInput(), weightKg: 301 })
    expect(result.valid).toBe(false)
    expect(result.errors![0].field).toBe('weightKg')
  })

  it('accepts weight at boundaries (25 and 300)', () => {
    expect(validateExpressInput({ ...validInput(), weightKg: 25 }).valid).toBe(true)
    expect(validateExpressInput({ ...validInput(), weightKg: 300 }).valid).toBe(true)
  })

  it('rejects target weight below 25', () => {
    const result = validateExpressInput({ ...validInput(), targetWeightKg: 24 })
    expect(result.valid).toBe(false)
    expect(result.errors![0].field).toBe('targetWeightKg')
  })

  it('rejects target weight above 300', () => {
    const result = validateExpressInput({ ...validInput(), targetWeightKg: 301 })
    expect(result.valid).toBe(false)
    expect(result.errors![0].field).toBe('targetWeightKg')
  })

  it('rejects invalid gender', () => {
    const result = validateExpressInput({ ...validInput(), gender: 'invalid' as any })
    expect(result.valid).toBe(false)
    expect(result.errors![0].field).toBe('gender')
  })

  it('accepts all valid genders', () => {
    expect(validateExpressInput({ ...validInput(), gender: 'male' }).valid).toBe(true)
    expect(validateExpressInput({ ...validInput(), gender: 'female' }).valid).toBe(true)
    expect(validateExpressInput({ ...validInput(), gender: 'other' }).valid).toBe(true)
  })

  it('rejects invalid activity level', () => {
    const result = validateExpressInput({ ...validInput(), activityLevel: 'extreme' as any })
    expect(result.valid).toBe(false)
    expect(result.errors![0].field).toBe('activityLevel')
  })

  it('accepts all valid activity levels', () => {
    expect(validateExpressInput({ ...validInput(), activityLevel: 'low' }).valid).toBe(true)
    expect(validateExpressInput({ ...validInput(), activityLevel: 'medium' }).valid).toBe(true)
    expect(validateExpressInput({ ...validInput(), activityLevel: 'high' }).valid).toBe(true)
  })

  it('collects multiple errors at once', () => {
    const result = validateExpressInput({
      gender: 'invalid' as any,
      heightCm: 50,
      weightKg: 10,
      targetWeightKg: 400,
      activityLevel: 'extreme' as any,
    })
    expect(result.valid).toBe(false)
    expect(result.errors!.length).toBe(5)
  })

  it('rejects NaN values', () => {
    const result = validateExpressInput({ ...validInput(), heightCm: NaN })
    expect(result.valid).toBe(false)
    expect(result.errors![0].field).toBe('heightCm')
  })
})

describe('runExpressOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns profile, plan, and audit entry on valid input', async () => {
    const result = await runExpressOnboarding(validInput())
    expect(result.profile).toBeDefined()
    expect(result.plan).toBeDefined()
    expect(result.auditEntry).toBeDefined()
  })

  it('throws on invalid input', async () => {
    await expect(runExpressOnboarding({ ...validInput(), heightCm: 50 })).rejects.toThrow('Validation failed')
  })

  it('calls savePlanningProfile with the 5 fields', async () => {
    const { savePlanningProfile } = await import('../../stores/planning')
    await runExpressOnboarding(validInput())
    expect(savePlanningProfile).toHaveBeenCalledWith({
      gender: 'male',
      heightCm: 175,
      weightKg: 80,
      targetWeightKg: 70,
      activityLevel: 'medium',
      completionStatus: 'completed',
    })
  })

  it('calls savePersonalDietPlan with computed calorie target', async () => {
    const { savePersonalDietPlan } = await import('../../stores/planning')
    await runExpressOnboarding(validInput())
    expect(savePersonalDietPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '快速减脂计划',
        generationMode: 'local',
        dailyCalorieTarget: expect.any(Number),
      }),
    )
  })

  it('applies 500 kcal deficit when target < current weight', async () => {
    const { savePersonalDietPlan } = await import('../../stores/planning')
    // Male, 175cm, 80kg, target 70kg, medium activity
    // BMR = 10*80 + 6.25*175 - 5*30 - 161 = 800 + 1093.75 - 150 - 161 = 1582.75
    // TDEE = 1582.75 * 1.55 = 2453.2625
    // Target = 2453.2625 - 500 = 1953.2625 → rounded to 1953
    await runExpressOnboarding(validInput())
    const call = (savePersonalDietPlan as any).mock.calls[0][0]
    expect(call.dailyCalorieTarget).toBe(1953)
  })

  it('does not apply deficit when target >= current weight', async () => {
    const { savePersonalDietPlan } = await import('../../stores/planning')
    const input = { ...validInput(), targetWeightKg: 85 }
    // Same BMR/TDEE but no deficit
    // TDEE = 1582.75 * 1.55 = 2453.2625 → rounded to 2453
    await runExpressOnboarding(input)
    const call = (savePersonalDietPlan as any).mock.calls[0][0]
    expect(call.dailyCalorieTarget).toBe(2453)
  })

  it('computes correct BMR for female', async () => {
    const { savePersonalDietPlan } = await import('../../stores/planning')
    const input: ExpressOnboardingInput = {
      gender: 'female',
      heightCm: 165,
      weightKg: 60,
      targetWeightKg: 55,
      activityLevel: 'low',
    }
    // Female BMR = 10*60 + 6.25*165 - 5*30 + 5 = 600 + 1031.25 - 150 + 5 = 1486.25
    // TDEE = 1486.25 * 1.2 = 1783.5
    // Target = 1783.5 - 500 = 1283.5 → rounded to 1284
    await runExpressOnboarding(input)
    const call = (savePersonalDietPlan as any).mock.calls[0][0]
    expect(call.dailyCalorieTarget).toBe(1284)
  })

  it('computes correct BMR for other (average of male and female)', async () => {
    const { savePersonalDietPlan } = await import('../../stores/planning')
    const input: ExpressOnboardingInput = {
      gender: 'other',
      heightCm: 170,
      weightKg: 70,
      targetWeightKg: 65,
      activityLevel: 'high',
    }
    // base = 10*70 + 6.25*170 - 5*30 = 700 + 1062.5 - 150 = 1612.5
    // maleBMR = 1612.5 - 161 = 1451.5
    // femaleBMR = 1612.5 + 5 = 1617.5
    // otherBMR = (1451.5 + 1617.5) / 2 = 1534.5
    // TDEE = 1534.5 * 1.725 = 2647.0125
    // Target = 2647.0125 - 500 = 2147.0125 → rounded to 2147
    await runExpressOnboarding(input)
    const call = (savePersonalDietPlan as any).mock.calls[0][0]
    expect(call.dailyCalorieTarget).toBe(2147)
  })

  it('writes audit entry with path "express"', async () => {
    const { writeAuditEntry } = await import('../auditLog')
    await runExpressOnboarding(validInput())
    expect(writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'system',
        action: 'express_onboarding_completed',
        payload: expect.objectContaining({
          path: 'express',
          elapsedMs: 0,
        }),
      }),
    )
  })
})
