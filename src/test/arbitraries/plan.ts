/**
 * Personal-diet-plan arbitrary (task 2.7, Requirements 3.3, 3.7).
 *
 * `PersonalDietPlan` rows seed the property tests covering plan
 * immutability (`coaching/planImmutability.property.test.ts`) and the
 * daily-plan-gap arithmetic (Property 9). Production code in
 * `stores/planning.ts` requires every plan row to include:
 *
 *   - a stable `id` (test code uses small positive integers; Dexie
 *     auto-increment is bypassed in fast-check land).
 *   - a status of `'accepted'` or `'proposed'` for plans the suite
 *     reasons about (the `'dismissed'` branch is irrelevant to the
 *     invariants under test, so we omit it).
 *   - a `profileSnapshot` shaped as a fully-typed `PlanningProfile`,
 *     not the partial used by `PlanningSession.profileSnapshot`.
 *   - meal-target totals (`proteinTarget`, `carbsTarget`, `fatTarget`)
 *     consistent with `dailyCalorieTarget` within ±10% — same logic
 *     as the macro-calorie check, just at the plan level.
 *
 * The arbitrary picks `dailyCalorieTarget` first, then derives macro
 * targets that satisfy `4*p + 4*c + 9*f ≈ target ± 10%`. That keeps
 * generated plans realistic enough for the matcher / drift code to
 * reason about without ever producing plan rows the validator would
 * reject.
 */

import * as fc from 'fast-check'
import type {
  PersonalDietPlan,
  PlanningGender,
  PlanningGoal,
  PlanningProfile,
  PlanStatus,
} from '../../renderer/src/stores/planning'

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const titleArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0)

const summaryArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim().length > 0)

const guidanceArb = fc.array(
  fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => s.trim().length > 0),
  { minLength: 0, maxLength: 4 },
)

const cautionArb = fc.array(
  fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => s.trim().length > 0),
  { minLength: 0, maxLength: 3 },
)

const planStatusArb: fc.Arbitrary<PlanStatus> = fc.constantFrom(
  'accepted',
  'proposed',
)

const generationModeArb = fc.constantFrom<('ai' | 'local')[]>('ai', 'local')

const isoTimestampArb = fc
  .date({
    min: new Date('2024-01-01T00:00:00Z'),
    max: new Date('2025-12-31T23:59:59Z'),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString())

const genderArb: fc.Arbitrary<PlanningGender> = fc.constantFrom(
  'male',
  'female',
  'other',
)

const goalArb: fc.Arbitrary<PlanningGoal> = fc.constantFrom(
  'lose_fat',
  'maintain',
  'gain_muscle',
  'health',
)

/**
 * Build a minimal valid `PlanningProfile` snapshot to embed inside
 * generated plans. Realistic adult ranges keep downstream BMI / BMR
 * helpers from tripping over edge cases the property tests don't
 * care about.
 */
const profileSnapshotArb: fc.Arbitrary<PlanningProfile> = fc
  .record({
    age: fc.integer({ min: 18, max: 70 }),
    gender: genderArb,
    heightCm: fc.integer({ min: 150, max: 200 }),
    weightKg: fc.integer({ min: 45, max: 110 }),
    targetWeightKg: fc.integer({ min: 45, max: 110 }),
    goal: goalArb,
    activityLevel: fc.constantFrom('low', 'medium', 'high') as fc.Arbitrary<
      'low' | 'medium' | 'high'
    >,
    mealsPerDay: fc.integer({ min: 2, max: 5 }),
    updatedAt: isoTimestampArb,
  })
  .map(
    (raw): PlanningProfile => ({
      id: 'current',
      age: raw.age,
      gender: raw.gender,
      heightCm: raw.heightCm,
      weightKg: raw.weightKg,
      targetWeightKg: raw.targetWeightKg,
      goal: raw.goal,
      activityLevel: raw.activityLevel,
      mealsPerDay: raw.mealsPerDay,
      completionStatus: 'completed',
      updatedAt: raw.updatedAt,
    }),
  )

// ---------------------------------------------------------------------------
// Public arbitrary
// ---------------------------------------------------------------------------

/**
 * Generate a `PersonalDietPlan` with:
 *
 *   - `id` set to a small positive integer (stable across shrinks).
 *   - `status` ∈ `'accepted' | 'proposed'`.
 *   - `dailyCalorieTarget` between 1200 and 4000 kcal.
 *   - `proteinTarget` / `carbsTarget` / `fatTarget` such that
 *     `4*p + 4*c + 9*f` is within ±10% of `dailyCalorieTarget`.
 *   - A fully-typed `profileSnapshot`.
 *
 * **Validates: Requirements 3.3, 3.7**
 */
export function arbPersonalDietPlan(): fc.Arbitrary<PersonalDietPlan> {
  return fc
    .record({
      id: fc.integer({ min: 1, max: 10_000 }),
      title: titleArb,
      summary: summaryArb,
      dailyCalorieTarget: fc.integer({ min: 1200, max: 4000 }),
      // Macro proportions of total calories. Constrain each so the
      // total stays in a realistic 50–125% band; the post-map step
      // rescales them to land within ±10% of the target.
      proteinFraction: fc.double({ min: 0.15, max: 0.4, noNaN: true }),
      carbsFraction: fc.double({ min: 0.3, max: 0.6, noNaN: true }),
      fatFraction: fc.double({ min: 0.15, max: 0.4, noNaN: true }),
      mealGuidance: guidanceArb,
      cautionNotes: cautionArb,
      status: planStatusArb,
      generationMode: generationModeArb,
      createdAt: isoTimestampArb,
      updatedAt: isoTimestampArb,
      profileSnapshot: profileSnapshotArb,
    })
    .map((raw): PersonalDietPlan => {
      // Normalize the macro fractions so they sum to ~1, then map
      // back to grams of each macro at 4/4/9 kcal per gram.
      const sum = raw.proteinFraction + raw.carbsFraction + raw.fatFraction
      const safeSum = sum > 0 ? sum : 1
      const proteinKcal = (raw.dailyCalorieTarget * raw.proteinFraction) / safeSum
      const carbsKcal = (raw.dailyCalorieTarget * raw.carbsFraction) / safeSum
      const fatKcal = (raw.dailyCalorieTarget * raw.fatFraction) / safeSum
      const proteinTarget = Math.max(1, Math.round(proteinKcal / 4))
      const carbsTarget = Math.max(1, Math.round(carbsKcal / 4))
      const fatTarget = Math.max(1, Math.round(fatKcal / 9))

      return {
        id: raw.id,
        title: raw.title,
        summary: raw.summary,
        dailyCalorieTarget: raw.dailyCalorieTarget,
        proteinTarget,
        carbsTarget,
        fatTarget,
        mealGuidance: [...raw.mealGuidance],
        cautionNotes: [...raw.cautionNotes],
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        profileSnapshot: { ...raw.profileSnapshot },
        generationMode: raw.generationMode,
        status: raw.status,
      }
    })
}
