/**
 * Reusable Dexie reset + seed helpers for tests that exercise the
 * `diet-agent-planning` IndexedDB database (task 2.5, Requirements 2.7,
 * 4.6).
 *
 * Wired in via:
 *
 *     import { resetPlanningDb, seedPlanningDb } from '@/test/doubles/dexie'
 *
 *     beforeEach(async () => {
 *       await resetPlanningDb()
 *       await seedPlanningDb({
 *         profile: { age: 30, weightKg: 72 },
 *         plans: [makePlan()],
 *         proactiveEvents: [],
 *         memories: [makeMemory({ type: 'allergy', content: 'peanut' })],
 *         recipeCalibrations: [],
 *       })
 *     })
 *
 * Design notes (per design.md "Components and Interfaces" section
 * `src/test/doubles/dexie.ts`):
 *
 * - `resetPlanningDb()` closes the existing `planningDb` connection,
 *   calls `Dexie.delete('diet-agent-planning')` to drop the database,
 *   then reopens the singleton so subsequent calls hit a fresh schema.
 *   The shared `setup.ts` already walks `indexedDB.databases()` in
 *   `afterEach`, so most tests do not need to call `resetPlanningDb()`
 *   explicitly. Tests that opt out of the global afterEach (rare) or
 *   that need a known-empty state mid-test reach for this helper.
 *
 * - `seedPlanningDb()` uses the production `planningDb` tables
 *   directly (`put` for the singleton profile, `bulkAdd` for the
 *   list-shaped tables). This keeps the seed paths exercised by tests
 *   identical to the paths used by production code; we never bypass
 *   Dexie's schema validation.
 *
 * - `recipeCalibrations` is *not* a Dexie table. The production store
 *   in `src/renderer/src/stores/recipeCalibration.ts` persists records
 *   under `localStorage` key `diet-agent-recipe-calibrations`. The
 *   seeder writes to that key directly so tests that seed via this
 *   helper see the same records the production reader would surface
 *   via `getRecipeCalibrationRecords()` etc.
 */

import Dexie from 'dexie'

import {
  planningDb,
  type PersonalDietPlan,
  type PlanningProfile,
  type ProactiveEvent,
  type UserMemory,
} from '../../renderer/src/stores/planning'
import type { RecipeCalibrationRecord } from '../../renderer/src/stores/recipeCalibration'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlanningSeed {
  /**
   * Partial profile patch. Defaults supply the singleton `id: 'current'`,
   * `completionStatus: 'draft'`, and `updatedAt: <now>` so callers only
   * need to specify the fields under test.
   */
  profile?: Partial<PlanningProfile>
  plans?: PersonalDietPlan[]
  proactiveEvents?: ProactiveEvent[]
  memories?: UserMemory[]
  /**
   * Recipe calibration records to write into `localStorage` under the
   * production key. Requires a jsdom-style `localStorage` to be
   * available; throws otherwise.
   */
  recipeCalibrations?: RecipeCalibrationRecord[]
}

// ---------------------------------------------------------------------------
// Constants kept in sync with production code
// ---------------------------------------------------------------------------

/**
 * Mirrors the `name` passed to `super(...)` in `PlanningDatabase`'s
 * constructor (`src/renderer/src/stores/planning.ts`). If the
 * production database name ever changes, update this constant too.
 */
const PLANNING_DB_NAME = 'diet-agent-planning'

/**
 * Mirrors `RECIPE_CALIBRATIONS_KEY` in
 * `src/renderer/src/stores/recipeCalibration.ts`. Kept in sync by hand
 * because the production module does not export the constant.
 */
const RECIPE_CALIBRATIONS_LOCALSTORAGE_KEY = 'diet-agent-recipe-calibrations'

// ---------------------------------------------------------------------------
// resetPlanningDb
// ---------------------------------------------------------------------------

/**
 * Drop and recreate the `diet-agent-planning` database so the next
 * test starts from an empty schema.
 *
 * Sequence:
 *   1. If the singleton connection is open, close it so `Dexie.delete`
 *      can drop the underlying IndexedDB without a "blocked" race.
 *   2. Delete the database via the Dexie static API.
 *   3. Reopen the singleton; Dexie replays its versioned `stores(...)`
 *      definitions and recreates every table described in
 *      `PlanningDatabase`.
 */
export async function resetPlanningDb(): Promise<void> {
  if (planningDb.isOpen()) {
    planningDb.close()
  }
  await Dexie.delete(PLANNING_DB_NAME)
  await planningDb.open()
}

// ---------------------------------------------------------------------------
// seedPlanningDb
// ---------------------------------------------------------------------------

/**
 * Populate `planningDb` (and `localStorage` for recipe calibrations)
 * with the supplied seed payload.
 *
 * The function is additive: it does not clear existing rows. Callers
 * that need a known-empty state should pair this with
 * `resetPlanningDb()` (or rely on the shared `afterEach` cleanup in
 * `src/test/setup.ts`).
 */
export async function seedPlanningDb(seed: PlanningSeed): Promise<void> {
  if (!planningDb.isOpen()) {
    await planningDb.open()
  }

  if (seed.profile) {
    await planningDb.profiles.put(buildProfileRow(seed.profile))
  }

  if (seed.plans && seed.plans.length > 0) {
    await planningDb.plans.bulkAdd(seed.plans.map(clonePlan))
  }

  if (seed.proactiveEvents && seed.proactiveEvents.length > 0) {
    await planningDb.proactiveEvents.bulkAdd(
      seed.proactiveEvents.map(cloneProactiveEvent),
    )
  }

  if (seed.memories && seed.memories.length > 0) {
    await planningDb.memories.bulkAdd(seed.memories.map(cloneMemory))
  }

  if (seed.recipeCalibrations && seed.recipeCalibrations.length > 0) {
    if (typeof globalThis.localStorage === 'undefined') {
      throw new Error(
        'seedPlanningDb: localStorage is required to seed recipeCalibrations. ' +
          'Run this test under the jsdom environment.',
      )
    }
    globalThis.localStorage.setItem(
      RECIPE_CALIBRATIONS_LOCALSTORAGE_KEY,
      JSON.stringify(seed.recipeCalibrations.map(cloneCalibration)),
    )
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString()
}

function buildProfileRow(patch: Partial<PlanningProfile>): PlanningProfile {
  return {
    completionStatus: 'draft',
    updatedAt: nowIso(),
    ...patch,
    // Fixed last so callers cannot accidentally override the singleton id.
    id: 'current',
  }
}

function clonePlan(plan: PersonalDietPlan): PersonalDietPlan {
  return {
    ...plan,
    mealGuidance: [...plan.mealGuidance],
    cautionNotes: [...plan.cautionNotes],
    profileSnapshot: { ...plan.profileSnapshot },
  }
}

function cloneProactiveEvent(event: ProactiveEvent): ProactiveEvent {
  return {
    ...event,
    payload: { ...(event.payload ?? {}) },
  }
}

function cloneMemory(memory: UserMemory): UserMemory {
  return {
    ...memory,
    tags: [...(memory.tags ?? [])],
    mergedFromIds: [...(memory.mergedFromIds ?? [])],
  }
}

function cloneCalibration(
  record: RecipeCalibrationRecord,
): RecipeCalibrationRecord {
  return {
    ...record,
    originalNutrition: { ...record.originalNutrition },
    estimatedNutrition: { ...record.estimatedNutrition },
    riskNotes: [...record.riskNotes],
  }
}
