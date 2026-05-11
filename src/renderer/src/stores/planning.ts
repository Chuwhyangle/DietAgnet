import Dexie, { type Table } from 'dexie'
import { emitPlanningUpdated } from './events'

export type PlanningGender = 'male' | 'female' | 'other'
export type PlanningGoal = 'lose_fat' | 'maintain' | 'gain_muscle' | 'health'
export type ActivityLevel = 'low' | 'medium' | 'high'
export type PlanningStepKey =
  | 'age'
  | 'gender'
  | 'heightCm'
  | 'weightKg'
  | 'targetWeightKg'
  | 'goal'
  | 'activityLevel'
  | 'mealsPerDay'
  | 'dietPreference'
  | 'allergies'
  | 'medicalNotes'
  | 'cookingPreference'
  | 'scheduleNotes'

export type PlanningFollowUpCode =
  | 'age_caution'
  | 'height_outlier'
  | 'weight_outlier'
  | 'bmi_low'
  | 'bmi_high'
  | 'target_gap_large'
  | 'goal_target_mismatch'
  | 'meal_count_edge'

export interface PlanningFollowUpQuestion {
  id: string
  code: PlanningFollowUpCode
  prompt: string
  note: string
  targetField?: 'medicalNotes' | 'scheduleNotes'
  createdAt: string
}

export interface PlanningProfile {
  id: 'current'
  age?: number
  gender?: PlanningGender
  heightCm?: number
  weightKg?: number
  targetWeightKg?: number
  goal?: PlanningGoal
  activityLevel?: ActivityLevel
  dietPreference?: string
  allergies?: string
  medicalNotes?: string
  mealsPerDay?: number
  cookingPreference?: string
  scheduleNotes?: string
  completionStatus: 'draft' | 'completed'
  updatedAt: string
}

export type PlanningMessageRole = 'assistant' | 'user' | 'tool' | 'system'

export interface PlanningTranscriptMessage {
  id: string
  role: PlanningMessageRole
  content: string
  createdAt: string
  kind?: 'message' | 'status' | 'warning'
}

export interface PlanningSession {
  id?: number
  status: 'active' | 'completed' | 'cancelled'
  createdAt: string
  updatedAt: string
  transcript: PlanningTranscriptMessage[]
  anomalyNotes: string[]
  profileSnapshot: Partial<PlanningProfile>
  currentStepKey?: PlanningStepKey | null
  completedStepKeys: PlanningStepKey[]
  pendingFollowUps: PlanningFollowUpQuestion[]
  resolvedFollowUpCodes: PlanningFollowUpCode[]
  latestPlanId?: number
}

export interface PersonalDietPlan {
  id?: number
  title: string
  summary: string
  dailyCalorieTarget?: number
  proteinTarget?: number
  carbsTarget?: number
  fatTarget?: number
  mealGuidance: string[]
  cautionNotes: string[]
  createdAt: string
  updatedAt: string
  profileSnapshot: PlanningProfile
  sourceSessionId?: number
  generationMode: 'ai' | 'local'
  generatedWithModel?: string
}

class PlanningDatabase extends Dexie {
  profiles!: Table<PlanningProfile, string>
  sessions!: Table<PlanningSession, number>
  plans!: Table<PersonalDietPlan, number>

  constructor() {
    super('diet-agent-planning')

    this.version(1).stores({
      profiles: 'id, updatedAt, completionStatus',
      sessions: '++id, status, updatedAt',
      plans: '++id, createdAt, updatedAt',
    })
  }
}

const planningDb = new PlanningDatabase()

function nowIsoString(): string {
  return new Date().toISOString()
}

function cloneTranscriptMessage(message: PlanningTranscriptMessage): PlanningTranscriptMessage {
  return {
    ...message,
  }
}

function cloneFollowUpQuestion(question: PlanningFollowUpQuestion): PlanningFollowUpQuestion {
  return {
    ...question,
  }
}

function clonePersonalDietPlan(plan: PersonalDietPlan): PersonalDietPlan {
  return {
    ...plan,
    mealGuidance: [...plan.mealGuidance],
    cautionNotes: [...plan.cautionNotes],
    profileSnapshot: { ...plan.profileSnapshot },
  }
}

function clonePlanningSession(session: PlanningSession): PlanningSession {
  return {
    ...session,
    transcript: (session.transcript ?? []).map(cloneTranscriptMessage),
    anomalyNotes: [...(session.anomalyNotes ?? [])],
    profileSnapshot: { ...(session.profileSnapshot ?? {}) },
    completedStepKeys: [...(session.completedStepKeys ?? [])],
    pendingFollowUps: (session.pendingFollowUps ?? []).map(cloneFollowUpQuestion),
    resolvedFollowUpCodes: [...(session.resolvedFollowUpCodes ?? [])],
  }
}

export function createPlanningMessage(
  role: PlanningMessageRole,
  content: string,
  kind: PlanningTranscriptMessage['kind'] = 'message',
): PlanningTranscriptMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    kind,
    createdAt: nowIsoString(),
  }
}

export async function getCurrentPlanningProfile(): Promise<PlanningProfile | null> {
  const profile = await planningDb.profiles.get('current')
  return profile ? { ...profile } : null
}

export async function savePlanningProfile(
  patch: Partial<Omit<PlanningProfile, 'id' | 'updatedAt'>>,
): Promise<PlanningProfile> {
  const currentProfile = await getCurrentPlanningProfile()
  const nextProfile: PlanningProfile = {
    ...currentProfile,
    ...patch,
    id: 'current',
    completionStatus: patch.completionStatus ?? currentProfile?.completionStatus ?? 'draft',
    updatedAt: nowIsoString(),
  }

  await planningDb.profiles.put(nextProfile)
  emitPlanningUpdated()
  return nextProfile
}

export async function createPlanningSession(): Promise<PlanningSession> {
  const currentProfile = await getCurrentPlanningProfile()
  const timestamp = nowIsoString()
  const session: PlanningSession = {
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    transcript: [],
    anomalyNotes: [],
    profileSnapshot: currentProfile ? { ...currentProfile } : {},
    currentStepKey: null,
    completedStepKeys: [],
    pendingFollowUps: [],
    resolvedFollowUpCodes: [],
  }

  const id = await planningDb.sessions.add(session)
  emitPlanningUpdated()
  return {
    ...session,
    id,
  }
}

export async function getPlanningSession(sessionId: number): Promise<PlanningSession | null> {
  const session = await planningDb.sessions.get(sessionId)
  return session ? clonePlanningSession(session) : null
}

export async function getLatestActivePlanningSession(): Promise<PlanningSession | null> {
  const sessions = await planningDb.sessions.where('status').equals('active').toArray()
  const latestSession = sessions
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]

  return latestSession ? clonePlanningSession(latestSession) : null
}

export async function appendPlanningMessages(
  sessionId: number,
  messages: PlanningTranscriptMessage[],
): Promise<PlanningSession | null> {
  const session = await planningDb.sessions.get(sessionId)
  if (!session) {
    return null
  }

  const nextSession: PlanningSession = {
    ...session,
    updatedAt: nowIsoString(),
    transcript: [...session.transcript, ...messages.map(cloneTranscriptMessage)],
  }

  await planningDb.sessions.put(nextSession)
  emitPlanningUpdated()
  return clonePlanningSession(nextSession)
}

export async function updatePlanningSession(
  sessionId: number,
  patch: Partial<Omit<PlanningSession, 'id' | 'createdAt' | 'transcript'>>,
): Promise<PlanningSession | null> {
  const session = await planningDb.sessions.get(sessionId)
  if (!session) {
    return null
  }

  const nextSession: PlanningSession = {
    ...session,
    ...patch,
    anomalyNotes: patch.anomalyNotes ? [...patch.anomalyNotes] : [...(session.anomalyNotes ?? [])],
    profileSnapshot: patch.profileSnapshot ? { ...patch.profileSnapshot } : { ...(session.profileSnapshot ?? {}) },
    completedStepKeys: patch.completedStepKeys ? [...patch.completedStepKeys] : [...(session.completedStepKeys ?? [])],
    pendingFollowUps: patch.pendingFollowUps
      ? patch.pendingFollowUps.map(cloneFollowUpQuestion)
      : (session.pendingFollowUps ?? []).map(cloneFollowUpQuestion),
    resolvedFollowUpCodes: patch.resolvedFollowUpCodes
      ? [...patch.resolvedFollowUpCodes]
      : [...(session.resolvedFollowUpCodes ?? [])],
    updatedAt: nowIsoString(),
  }

  await planningDb.sessions.put(nextSession)
  emitPlanningUpdated()
  return clonePlanningSession(nextSession)
}

export async function addPlanningAnomalies(
  sessionId: number,
  anomalyNotes: string[],
): Promise<PlanningSession | null> {
  if (anomalyNotes.length === 0) {
    return getPlanningSession(sessionId)
  }

  const session = await planningDb.sessions.get(sessionId)
  if (!session) {
    return null
  }

  const mergedAnomalies = Array.from(new Set([...session.anomalyNotes, ...anomalyNotes]))
  return updatePlanningSession(sessionId, {
    anomalyNotes: mergedAnomalies,
  })
}

export async function savePersonalDietPlan(params: {
  title: string
  summary: string
  dailyCalorieTarget?: number
  proteinTarget?: number
  carbsTarget?: number
  fatTarget?: number
  mealGuidance: string[]
  cautionNotes: string[]
  sourceSessionId?: number
  generationMode: 'ai' | 'local'
  generatedWithModel?: string
}): Promise<PersonalDietPlan> {
  const profile = await getCurrentPlanningProfile()
  if (!profile) {
    throw new Error('还没有可用的用户画像，暂时无法保存计划。')
  }

  const timestamp = nowIsoString()
  const plan: PersonalDietPlan = {
    title: params.title,
    summary: params.summary,
    dailyCalorieTarget: params.dailyCalorieTarget,
    proteinTarget: params.proteinTarget,
    carbsTarget: params.carbsTarget,
    fatTarget: params.fatTarget,
    mealGuidance: [...params.mealGuidance],
    cautionNotes: [...params.cautionNotes],
    createdAt: timestamp,
    updatedAt: timestamp,
    profileSnapshot: { ...profile },
    sourceSessionId: params.sourceSessionId,
    generationMode: params.generationMode,
    generatedWithModel: params.generatedWithModel,
  }

  const id = await planningDb.plans.add(plan)
  const savedPlan = {
    ...plan,
    id,
  }

  if (params.sourceSessionId) {
    await updatePlanningSession(params.sourceSessionId, {
      latestPlanId: id,
      profileSnapshot: { ...profile },
    })
  }

  emitPlanningUpdated()
  return savedPlan
}

export async function getLatestPersonalDietPlan(): Promise<PersonalDietPlan | null> {
  const plans = await planningDb.plans.orderBy('createdAt').reverse().limit(1).toArray()
  const latestPlan = plans[0]
  return latestPlan ? clonePersonalDietPlan(latestPlan) : null
}

export async function getRecentPersonalDietPlans(limit = 6): Promise<PersonalDietPlan[]> {
  const safeLimit = Math.max(1, limit)
  const plans = await planningDb.plans.orderBy('createdAt').reverse().limit(safeLimit).toArray()
  return plans.map(clonePersonalDietPlan)
}
