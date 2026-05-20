/**
 * Plan Drift Monitor
 *
 * Detects ≥3-day calorie drift from the accepted plan and proposes
 * a new plan version without overwriting the current one.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import dayjs from 'dayjs'
import { planningDb, type PersonalDietPlan } from '../stores/planning'
import { getDietLog, summarizeDietLog } from '../stores/dietLog'
import { writeAuditEntry } from './auditLog'
import type { PlanAdjustmentProposal } from './types'

/**
 * Compute the ISO week key (YYYY-Www) for a given date.
 * Uses the ISO 8601 definition: weeks start on Monday,
 * and the week containing the year's first Thursday is week 1.
 */
function getIsoWeekKey(date: dayjs.Dayjs): string {
  // dayjs .day() returns 0=Sun, 1=Mon, ..., 6=Sat
  // ISO weekday: Mon=1, Tue=2, ..., Sun=7
  const d = date.toDate()
  const tempDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = tempDate.getUTCDay() || 7
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const year = tempDate.getUTCFullYear()
  return `${year}-W${String(weekNo).padStart(2, '0')}`
}

/**
 * Get the latest accepted plan (status undefined or 'accepted').
 */
async function getLatestAcceptedPlan(): Promise<PersonalDietPlan | null> {
  const allPlans = await planningDb.plans.orderBy('createdAt').reverse().toArray()
  const accepted = allPlans.find(
    (plan) => plan.status === undefined || plan.status === 'accepted',
  )
  return accepted ?? null
}

/**
 * Check if a proposal already exists for the given ISO week.
 */
async function hasProposalThisWeek(isoWeekKey: string): Promise<boolean> {
  const allPlans = await planningDb.plans.toArray()
  return allPlans.some((plan) => {
    if (plan.status !== 'proposed' && plan.status !== 'dismissed') {
      return false
    }
    const planWeek = getIsoWeekKey(dayjs(plan.createdAt))
    return planWeek === isoWeekKey
  })
}

/**
 * Check plan drift over the last 3 logged days.
 *
 * - Gets the latest accepted PersonalDietPlan
 * - Gets the diet logs for the last 3 days
 * - Computes deviation: (actualCalories - dailyCalorieTarget) / dailyCalorieTarget
 * - If ALL 3 days deviate by ≥15% in the same direction, produce a proposal
 * - Enforce max 1 proposal per ISO week
 * - If fewer than 3 logged days exist, return null
 * - If no accepted plan exists, return null
 */
export async function checkPlanDrift(
  now?: dayjs.Dayjs,
): Promise<PlanAdjustmentProposal | null> {
  const referenceDate = now ?? dayjs()

  // Get the latest accepted plan
  const acceptedPlan = await getLatestAcceptedPlan()
  if (!acceptedPlan || !acceptedPlan.dailyCalorieTarget || acceptedPlan.dailyCalorieTarget <= 0) {
    return null
  }

  // Enforce max 1 proposal per ISO week
  const currentWeekKey = getIsoWeekKey(referenceDate)
  if (await hasProposalThisWeek(currentWeekKey)) {
    return null
  }

  // Get the last 3 days of diet logs
  const target = acceptedPlan.dailyCalorieTarget
  const driftDays: string[] = []
  const deviations: number[] = []

  for (let i = 1; i <= 3; i++) {
    const date = referenceDate.subtract(i, 'day').format('YYYY-MM-DD')
    const log = getDietLog(date)
    const summary = summarizeDietLog(log)

    // Only count days that have actual logged items
    if (summary.itemCount === 0) {
      return null // fewer than 3 logged days
    }

    const deviation = (summary.calories - target) / target
    driftDays.push(date)
    deviations.push(deviation)
  }

  // Check if all 3 days deviate by ≥15% in the same direction
  const allOver = deviations.every((d) => d >= 0.15)
  const allUnder = deviations.every((d) => d <= -0.15)

  if (!allOver && !allUnder) {
    return null
  }

  const driftDirection: 'over' | 'under' = allOver ? 'over' : 'under'
  const avgDriftPercent =
    Math.round(
      (deviations.reduce((sum, d) => sum + Math.abs(d), 0) / deviations.length) * 10000,
    ) / 100 // percentage with 2 decimal places

  // Compute proposed calorie target: average of last 3 days' actual intake
  const totalActualCalories = driftDays.reduce((sum, date) => {
    const log = getDietLog(date)
    return sum + summarizeDietLog(log).calories
  }, 0)
  const proposedCalorieTarget = Math.round(totalActualCalories / 3)

  // Create the proposed plan as a new row (never mutate the existing plan)
  const timestamp = new Date().toISOString()
  const proposedPlan: PersonalDietPlan = {
    title: `${acceptedPlan.title} (调整建议)`,
    summary: `基于最近3天的实际摄入，建议将每日目标从 ${target} kcal 调整为 ${proposedCalorieTarget} kcal`,
    dailyCalorieTarget: proposedCalorieTarget,
    proteinTarget: acceptedPlan.proteinTarget,
    carbsTarget: acceptedPlan.carbsTarget,
    fatTarget: acceptedPlan.fatTarget,
    mealGuidance: [...acceptedPlan.mealGuidance],
    cautionNotes: [...acceptedPlan.cautionNotes],
    createdAt: timestamp,
    updatedAt: timestamp,
    profileSnapshot: { ...acceptedPlan.profileSnapshot },
    generationMode: 'local',
    status: 'proposed',
    sourcePlanId: acceptedPlan.id!,
  }

  const id = await planningDb.plans.add(proposedPlan)
  const savedPlan: PersonalDietPlan = { ...proposedPlan, id }

  // Write audit entry
  await writeAuditEntry({
    actor: 'system',
    action: 'plan_drift_proposal',
    payload: {
      sourcePlanId: acceptedPlan.id,
      proposedPlanId: id,
      driftDirection,
      avgDriftPercent,
      driftDays,
      previousTarget: target,
      proposedTarget: proposedCalorieTarget,
    },
  })

  return {
    proposedPlan: savedPlan,
    sourcePlanId: acceptedPlan.id!,
    driftDirection,
    avgDriftPercent,
    driftDays,
  }
}

/**
 * Accept a plan drift proposal.
 * Marks the proposal plan as 'accepted'.
 * Does NOT mutate the original accepted plan row.
 */
export async function acceptProposal(proposalId: number): Promise<PersonalDietPlan> {
  const proposal = await planningDb.plans.get(proposalId)
  if (!proposal) {
    throw new Error(`Proposal with id ${proposalId} not found`)
  }
  if (proposal.status !== 'proposed') {
    throw new Error(`Plan ${proposalId} is not a proposal (status: ${proposal.status})`)
  }

  const updatedPlan: PersonalDietPlan = {
    ...proposal,
    status: 'accepted',
    updatedAt: new Date().toISOString(),
  }

  await planningDb.plans.put(updatedPlan)

  await writeAuditEntry({
    actor: 'user',
    action: 'plan_drift_accept',
    payload: {
      proposalId,
      sourcePlanId: proposal.sourcePlanId,
      newCalorieTarget: proposal.dailyCalorieTarget,
    },
  })

  return updatedPlan
}

/**
 * Dismiss a plan drift proposal.
 * Marks the proposal plan as 'dismissed'.
 * Does NOT delete the row (kept for audit).
 */
export async function dismissProposal(proposalId: number): Promise<void> {
  const proposal = await planningDb.plans.get(proposalId)
  if (!proposal) {
    throw new Error(`Proposal with id ${proposalId} not found`)
  }
  if (proposal.status !== 'proposed') {
    throw new Error(`Plan ${proposalId} is not a proposal (status: ${proposal.status})`)
  }

  const updatedPlan: PersonalDietPlan = {
    ...proposal,
    status: 'dismissed',
    updatedAt: new Date().toISOString(),
  }

  await planningDb.plans.put(updatedPlan)

  await writeAuditEntry({
    actor: 'user',
    action: 'plan_drift_dismiss',
    payload: {
      proposalId,
      sourcePlanId: proposal.sourcePlanId,
    },
  })
}
