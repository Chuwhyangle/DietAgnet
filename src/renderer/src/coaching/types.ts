/**
 * Coaching module type definitions.
 *
 * Types that reference store models (PersonalDietPlan, PlanningProfile, DietLog,
 * ProactiveEvent) use direct imports where safe. Generic `unknown` is used only
 * where circular imports would result.
 */

import type { DietLog, MealType } from '../stores/dietLog'
import type {
  CoachingAuditEntry,
  AuditActor,
  PersonalDietPlan,
  PlanningProfile,
  PlanStatus,
  ProactiveEvent,
} from '../stores/planning'

// Re-export store types used throughout coaching modules
export type { CoachingAuditEntry, AuditActor }

// ---------------------------------------------------------------------------
// Trust Dial
// ---------------------------------------------------------------------------

export type TrustMode = 'precision' | 'autopilot'

export interface CoachingSettings {
  trustMode: TrustMode
  /** Minimum confidence for auto-save in autopilot mode (default 0.7) */
  estimateAutoConfidence: number
}

// ---------------------------------------------------------------------------
// Photo Estimate
// ---------------------------------------------------------------------------

export interface PhotoEstimateItem {
  name: string
  servings: number
  calories: number
  protein: number
  carbs: number
  fat: number
  confidence: number
  recipeId?: string
}

export interface PhotoEstimateResult {
  name: string
  servings: number
  calories: number
  protein: number
  carbs: number
  fat: number
  confidence: number
  items: PhotoEstimateItem[]
}

// ---------------------------------------------------------------------------
// Text/Voice Estimate
// ---------------------------------------------------------------------------

export interface TextEstimateItem {
  name: string
  servings: number
  calories: number
  protein: number
  carbs: number
  fat: number
  confidence: number
  recipeId?: string
}

export interface TextEstimateResult {
  name: string
  servings: number
  calories: number
  protein: number
  carbs: number
  fat: number
  confidence: number
  items: TextEstimateItem[]
}

// ---------------------------------------------------------------------------
// Parse Errors
// ---------------------------------------------------------------------------

export interface PhotoParseError {
  code: 'schemaValidationFailed'
  reason: string
  offendingPath: string
}

export interface TextParseError {
  code: 'schemaValidationFailed'
  reason: string
  offendingPath: string
}

// ---------------------------------------------------------------------------
// One-Tap Logger
// ---------------------------------------------------------------------------

export interface OneTapLogError {
  code:
    | 'estimateInconsistent'
    | 'lowConfidence'
    | 'visionUnsupported'
    | 'allergyConflict'
    | 'noYesterdayMeal'
    | 'parseError'
  reason: string
  unrecognizedTokens?: string[]
  offendingPath?: string
}

export type LogEntrySource = 'photo' | 'text_voice' | 'same_as_yesterday' | 'common_chip'

export interface OneTapLogRequest {
  source: LogEntrySource
  date: string
  mealType: MealType
  /** Base64-encoded image for photo source */
  imageBase64?: string
  /** Raw text input for text/voice source */
  rawText?: string
  /** Recipe ID for common-chip source */
  chipRecipeId?: string
}

export interface OneTapLogResult {
  success: boolean
  dietLog?: DietLog
  error?: OneTapLogError
}

// ---------------------------------------------------------------------------
// Autopilot Planner
// ---------------------------------------------------------------------------

export interface MealCandidate {
  recipeId: string
  name: string
  emoji?: string
  estimatedCalories: number
  estimatedProtein: number
  estimatedCarbs: number
  estimatedFat: number
  score: number
  reasoning: string
}

export interface AutopilotSuggestionRound {
  date: string
  mealType: MealType
  candidates: MealCandidate[]
  fallback: boolean
  auditEntry: CoachingAuditEntry
}

// ---------------------------------------------------------------------------
// Plan Drift Monitor
// ---------------------------------------------------------------------------

export type { PlanStatus }

export interface PlanAdjustmentProposal {
  proposedPlan: PersonalDietPlan
  sourcePlanId: number
  driftDirection: 'over' | 'under'
  avgDriftPercent: number
  driftDays: string[]
}

// ---------------------------------------------------------------------------
// Desktop Notifier
// ---------------------------------------------------------------------------

export interface NotifyOptions {
  title: string
  body: string
  page: 'diet-log' | 'chat' | 'home'
  urgency?: 'low' | 'normal' | 'critical'
}

// ---------------------------------------------------------------------------
// Reminder Scheduler
// ---------------------------------------------------------------------------

export interface SchedulerTickResult {
  fired: ProactiveEvent | null
  escalated: boolean
  quietHoursActive: boolean
  cooldownActive: boolean
}

// ---------------------------------------------------------------------------
// Express Onboarding
// ---------------------------------------------------------------------------

export interface ExpressOnboardingInput {
  gender: 'male' | 'female' | 'other'
  heightCm: number
  weightKg: number
  targetWeightKg: number
  activityLevel: 'low' | 'medium' | 'high'
}

export interface ExpressOnboardingResult {
  profile: PlanningProfile
  plan: PersonalDietPlan
  auditEntry: CoachingAuditEntry
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean
  errors?: Array<{ field: string; message: string }>
}
