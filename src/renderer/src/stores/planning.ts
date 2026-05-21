import Dexie, { type Table } from 'dexie'
import { emitMemoryUpdated, emitPlanningUpdated } from './events'

export type PlanStatus = 'accepted' | 'proposed' | 'dismissed'
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
  status?: PlanStatus
  sourcePlanId?: number
}

export type DailyPlanSuggestionType = 'supplement' | 'reduce' | 'maintain' | 'review'
export type DailyPlanAdjustmentResponse = 'accepted' | 'dismissed' | 'snoozed'
export type ProactiveEventResponse = 'accepted' | 'dismissed' | 'snoozed' | 'opened_chat' | 'disabled_rule'
export type UserMemoryType = 'preference' | 'allergy' | 'avoidance' | 'habit' | 'schedule' | 'health_note' | 'goal' | 'other'
export type UserMemorySource = 'user_explicit' | 'agent_inferred' | 'planning_profile' | 'manual'

export interface DailyPlanAdjustment {
  id?: number
  date: string
  sourcePlanId?: number
  ruleId: string
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  plannedCalories: number
  actualCalories: number
  deltaCalories: number
  suggestedCalories: number
  suggestionType: DailyPlanSuggestionType
  suggestionText: string
  recommendedMealWindow?: string
  userResponse?: DailyPlanAdjustmentResponse
  generatedBy: 'local_rule' | 'agent'
  createdAt: string
  updatedAt: string
}

export interface ProactiveEvent {
  id?: number
  ruleId: string
  trigger: 'cron' | 'context' | 'meal_log_update'
  priority: 'low' | 'medium' | 'high'
  firedAt: string
  delivered: boolean
  message: string
  userResponse?: ProactiveEventResponse
  cooldownUntil?: string
  payload: Record<string, unknown>
}

export type PlannedMealStatus = 'suggested' | 'confirmed' | 'skipped'
export type PlannedMealSource = 'ai_suggested' | 'manual'

export interface PlannedMealItem {
  recipeId?: string
  name: string
  emoji?: string
  servings: number
  estimatedCalories: number
  estimatedProtein: number
  estimatedCarbs: number
  estimatedFat: number
}

export interface PlannedMeal {
  id?: number
  date: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  items: PlannedMealItem[]
  totalCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
  source: PlannedMealSource
  status: PlannedMealStatus
  reasoning?: string
  suggestedByModel?: string
  createdAt: string
  updatedAt: string
}

export type AuditActor = 'system' | 'user' | 'agent'

export interface CoachingAuditEntry {
  id?: number
  actor: AuditActor
  action: string
  payload: Record<string, unknown>
  timestamp: string
}

export interface UserMemory {
  id?: number
  type: UserMemoryType
  content: string
  normalizedContent: string
  tags: string[]
  source: UserMemorySource
  confidence: number
  status: 'active' | 'archived' | 'pending_confirm'
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  mergedFromIds?: number[]
  archivedReason?: string
}

class PlanningDatabase extends Dexie {
  profiles!: Table<PlanningProfile, string>
  sessions!: Table<PlanningSession, number>
  plans!: Table<PersonalDietPlan, number>
  dailyPlanAdjustments!: Table<DailyPlanAdjustment, number>
  proactiveEvents!: Table<ProactiveEvent, number>
  memories!: Table<UserMemory, number>
  plannedMeals!: Table<PlannedMeal, number>
  coachingAuditLog!: Table<CoachingAuditEntry, number>

  constructor() {
    super('diet-agent-planning')

    this.version(1).stores({
      profiles: 'id, updatedAt, completionStatus',
      sessions: '++id, status, updatedAt',
      plans: '++id, createdAt, updatedAt',
    })

    this.version(2).stores({
      profiles: 'id, updatedAt, completionStatus',
      sessions: '++id, status, updatedAt',
      plans: '++id, createdAt, updatedAt',
      dailyPlanAdjustments: '++id, date, ruleId, createdAt, updatedAt, userResponse',
    })

    this.version(3).stores({
      profiles: 'id, updatedAt, completionStatus',
      sessions: '++id, status, updatedAt',
      plans: '++id, createdAt, updatedAt',
      dailyPlanAdjustments: '++id, date, ruleId, createdAt, updatedAt, userResponse',
      proactiveEvents: '++id, ruleId, firedAt, delivered, userResponse',
    })

    this.version(4).stores({
      profiles: 'id, updatedAt, completionStatus',
      sessions: '++id, status, updatedAt',
      plans: '++id, createdAt, updatedAt',
      dailyPlanAdjustments: '++id, date, ruleId, createdAt, updatedAt, userResponse',
      proactiveEvents: '++id, ruleId, firedAt, delivered, userResponse',
      memories: '++id, type, status, updatedAt, confidence, *tags',
    })

    this.version(5).stores({
      profiles: 'id, updatedAt, completionStatus',
      sessions: '++id, status, updatedAt',
      plans: '++id, createdAt, updatedAt',
      dailyPlanAdjustments: '++id, date, ruleId, createdAt, updatedAt, userResponse',
      proactiveEvents: '++id, ruleId, firedAt, delivered, userResponse',
      memories: '++id, type, status, updatedAt, confidence, *tags',
      plannedMeals: '++id, date, mealType, status, source, createdAt',
    })

    this.version(6).stores({
      profiles: 'id, updatedAt, completionStatus',
      sessions: '++id, status, updatedAt',
      plans: '++id, createdAt, updatedAt, status',
      dailyPlanAdjustments: '++id, date, ruleId, createdAt, updatedAt, userResponse',
      proactiveEvents: '++id, ruleId, firedAt, delivered, userResponse',
      memories: '++id, type, status, updatedAt, confidence, *tags',
      plannedMeals: '++id, date, mealType, status, source, createdAt',
      coachingAuditLog: '++id, actor, action, timestamp',
    })
  }
}

export const planningDb = new PlanningDatabase()

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

function cloneDailyPlanAdjustment(adjustment: DailyPlanAdjustment): DailyPlanAdjustment {
  return {
    ...adjustment,
  }
}

function cloneProactiveEvent(event: ProactiveEvent): ProactiveEvent {
  return {
    ...event,
    payload: { ...(event.payload ?? {}) },
  }
}

function cloneUserMemory(memory: UserMemory): UserMemory {
  return {
    ...memory,
    tags: [...(memory.tags ?? [])],
    mergedFromIds: [...(memory.mergedFromIds ?? [])],
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

export async function saveDailyPlanAdjustment(
  input: Omit<DailyPlanAdjustment, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<DailyPlanAdjustment> {
  const timestamp = nowIsoString()
  const adjustment: DailyPlanAdjustment = {
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const id = await planningDb.dailyPlanAdjustments.add(adjustment)
  const savedAdjustment = {
    ...adjustment,
    id,
  }

  await planningDb.coachingAuditLog.add({
    actor: 'agent',
    action: 'daily_plan_adjustment.saved',
    timestamp,
    payload: {
      adjustmentId: id,
      date: savedAdjustment.date,
      ruleId: savedAdjustment.ruleId,
      mealType: savedAdjustment.mealType,
      suggestionType: savedAdjustment.suggestionType,
      plannedCalories: savedAdjustment.plannedCalories,
      actualCalories: savedAdjustment.actualCalories,
      deltaCalories: savedAdjustment.deltaCalories,
      generatedBy: savedAdjustment.generatedBy,
    },
  })

  emitPlanningUpdated()
  return savedAdjustment
}

export async function getDailyPlanAdjustments(date: string, limit = 8): Promise<DailyPlanAdjustment[]> {
  const safeLimit = Math.max(1, limit)
  const adjustments = await planningDb.dailyPlanAdjustments
    .where('date')
    .equals(date)
    .toArray()

  return adjustments
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, safeLimit)
    .map(cloneDailyPlanAdjustment)
}

export async function getLatestDailyPlanAdjustment(date: string): Promise<DailyPlanAdjustment | null> {
  const adjustments = await getDailyPlanAdjustments(date, 1)
  return adjustments[0] ?? null
}

export async function clearDailyPlanAdjustments(date: string): Promise<number> {
  const adjustments = await planningDb.dailyPlanAdjustments
    .where('date')
    .equals(date)
    .toArray()

  if (adjustments.length === 0) {
    return 0
  }

  const ids = adjustments
    .map((adjustment) => adjustment.id)
    .filter((id): id is number => typeof id === 'number')

  await planningDb.dailyPlanAdjustments.bulkDelete(ids)
  emitPlanningUpdated()
  return ids.length
}

export async function updateDailyPlanAdjustmentResponse(
  adjustmentId: number,
  userResponse: DailyPlanAdjustmentResponse,
): Promise<DailyPlanAdjustment | null> {
  const adjustment = await planningDb.dailyPlanAdjustments.get(adjustmentId)
  if (!adjustment) {
    return null
  }

  const nextAdjustment: DailyPlanAdjustment = {
    ...adjustment,
    userResponse,
    updatedAt: nowIsoString(),
  }

  await planningDb.dailyPlanAdjustments.put(nextAdjustment)
  await planningDb.coachingAuditLog.add({
    actor: 'user',
    action: 'daily_plan_adjustment.response',
    timestamp: nextAdjustment.updatedAt,
    payload: {
      adjustmentId,
      date: nextAdjustment.date,
      ruleId: nextAdjustment.ruleId,
      mealType: nextAdjustment.mealType,
      suggestionType: nextAdjustment.suggestionType,
      userResponse,
      deltaCalories: nextAdjustment.deltaCalories,
    },
  })
  emitPlanningUpdated()
  return cloneDailyPlanAdjustment(nextAdjustment)
}

export async function saveProactiveEvent(
  input: Omit<ProactiveEvent, 'id' | 'firedAt'> & { firedAt?: string },
): Promise<ProactiveEvent> {
  const event: ProactiveEvent = {
    ...input,
    firedAt: input.firedAt ?? nowIsoString(),
    payload: { ...(input.payload ?? {}) },
  }
  const id = await planningDb.proactiveEvents.add(event)
  const savedEvent = {
    ...event,
    id,
  }

  emitPlanningUpdated()
  return savedEvent
}

export async function getRecentProactiveEvents(limit = 12): Promise<ProactiveEvent[]> {
  const safeLimit = Math.max(1, limit)
  const events = await planningDb.proactiveEvents.orderBy('firedAt').reverse().limit(safeLimit).toArray()
  return events.map(cloneProactiveEvent)
}

export async function getLatestProactiveEventForRule(ruleId: string): Promise<ProactiveEvent | null> {
  const events = await planningDb.proactiveEvents
    .where('ruleId')
    .equals(ruleId)
    .toArray()
  const latestEvent = events.sort((left, right) => right.firedAt.localeCompare(left.firedAt))[0]
  return latestEvent ? cloneProactiveEvent(latestEvent) : null
}

export async function getRecentProactiveEventsForRule(
  ruleId: string,
  limit = 5,
): Promise<ProactiveEvent[]> {
  const safeLimit = Math.max(1, limit)
  const events = await planningDb.proactiveEvents
    .where('ruleId')
    .equals(ruleId)
    .toArray()

  return events
    .sort((left, right) => right.firedAt.localeCompare(left.firedAt))
    .slice(0, safeLimit)
    .map(cloneProactiveEvent)
}

export async function updateProactiveEventResponse(
  eventId: number,
  userResponse: ProactiveEventResponse,
  cooldownUntil?: string,
): Promise<ProactiveEvent | null> {
  const event = await planningDb.proactiveEvents.get(eventId)
  if (!event) {
    return null
  }

  const nextEvent: ProactiveEvent = {
    ...event,
    userResponse,
    cooldownUntil: cooldownUntil ?? event.cooldownUntil,
  }

  await planningDb.proactiveEvents.put(nextEvent)
  emitPlanningUpdated()
  return cloneProactiveEvent(nextEvent)
}

export async function saveUserMemory(
  input: Omit<UserMemory, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
    id?: number
    status?: UserMemory['status']
  },
): Promise<UserMemory> {
  const timestamp = nowIsoString()
  const memory: UserMemory = {
    ...input,
    status: input.status ?? 'active',
    tags: [...input.tags],
    mergedFromIds: [...(input.mergedFromIds ?? [])],
    createdAt: input.id ? (await planningDb.memories.get(input.id))?.createdAt ?? timestamp : timestamp,
    updatedAt: timestamp,
  }

  const id = input.id
    ? await planningDb.memories.put({ ...memory, id: input.id }).then(() => input.id as number)
    : await planningDb.memories.add(memory)
  const savedMemory = {
    ...memory,
    id,
  }

  emitMemoryUpdated()
  emitPlanningUpdated()
  return cloneUserMemory(savedMemory)
}

export async function getUserMemory(memoryId: number): Promise<UserMemory | null> {
  const memory = await planningDb.memories.get(memoryId)
  return memory ? cloneUserMemory(memory) : null
}

export async function getUserMemories(params: {
  status?: UserMemory['status']
  types?: UserMemoryType[]
  tags?: string[]
  limit?: number
} = {}): Promise<UserMemory[]> {
  const safeLimit = Math.max(1, params.limit ?? 50)
  const status = params.status ?? 'active'
  const normalizedTags = (params.tags ?? []).map((tag) => tag.toLowerCase())
  const memories = await planningDb.memories
    .where('status')
    .equals(status)
    .toArray()

  return memories
    .filter((memory) => !params.types || params.types.length === 0 || params.types.includes(memory.type))
    .filter((memory) => normalizedTags.length === 0 ||
      normalizedTags.some((tag) => memory.tags.map((item) => item.toLowerCase()).includes(tag)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, safeLimit)
    .map(cloneUserMemory)
}

export async function archiveUserMemory(memoryId: number, reason?: string): Promise<UserMemory | null> {
  const memory = await planningDb.memories.get(memoryId)
  if (!memory) {
    return null
  }

  const nextMemory: UserMemory = {
    ...memory,
    status: 'archived',
    archivedReason: reason?.trim() || memory.archivedReason,
    updatedAt: nowIsoString(),
  }

  await planningDb.memories.put(nextMemory)
  emitMemoryUpdated()
  emitPlanningUpdated()
  return cloneUserMemory(nextMemory)
}

export async function updateUserMemoryConfidence(memoryId: number, confidence: number): Promise<UserMemory | null> {
  const memory = await planningDb.memories.get(memoryId)
  if (!memory) {
    return null
  }

  const nextMemory: UserMemory = {
    ...memory,
    confidence: Math.min(Math.max(confidence, 0), 1),
    updatedAt: nowIsoString(),
  }

  await planningDb.memories.put(nextMemory)
  emitMemoryUpdated()
  emitPlanningUpdated()
  return cloneUserMemory(nextMemory)
}

export async function markUserMemoryUsed(memoryId: number): Promise<void> {
  const memory = await planningDb.memories.get(memoryId)
  if (!memory) {
    return
  }

  await planningDb.memories.put({
    ...memory,
    lastUsedAt: nowIsoString(),
  })
}

function clonePlannedMeal(meal: PlannedMeal): PlannedMeal {
  return {
    ...meal,
    items: meal.items.map((item) => ({ ...item })),
  }
}

export async function savePlannedMeal(
  input: Omit<PlannedMeal, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PlannedMeal> {
  const timestamp = nowIsoString()
  const meal: PlannedMeal = {
    ...input,
    items: input.items.map((item) => ({ ...item })),
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const id = await planningDb.plannedMeals.add(meal)
  emitPlanningUpdated()
  return clonePlannedMeal({ ...meal, id })
}

export async function getPlannedMealsForDate(date: string): Promise<PlannedMeal[]> {
  const meals = await planningDb.plannedMeals
    .where('date')
    .equals(date)
    .toArray()

  return meals
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map(clonePlannedMeal)
}

export async function getPlannedMeal(id: number): Promise<PlannedMeal | null> {
  const meal = await planningDb.plannedMeals.get(id)
  return meal ? clonePlannedMeal(meal) : null
}

export async function updatePlannedMealStatus(
  id: number,
  status: PlannedMealStatus,
): Promise<PlannedMeal | null> {
  const meal = await planningDb.plannedMeals.get(id)
  if (!meal) {
    return null
  }

  const nextMeal: PlannedMeal = {
    ...meal,
    status,
    updatedAt: nowIsoString(),
  }

  await planningDb.plannedMeals.put(nextMeal)
  emitPlanningUpdated()
  return clonePlannedMeal(nextMeal)
}

export async function getConfirmedPlannedMealsForDate(date: string): Promise<PlannedMeal[]> {
  const meals = await planningDb.plannedMeals
    .where('date')
    .equals(date)
    .toArray()

  return meals
    .filter((meal) => meal.status === 'confirmed')
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map(clonePlannedMeal)
}

export async function deletePlannedMeal(id: number): Promise<boolean> {
  const meal = await planningDb.plannedMeals.get(id)
  if (!meal) {
    return false
  }

  await planningDb.plannedMeals.delete(id)
  emitPlanningUpdated()
  return true
}
