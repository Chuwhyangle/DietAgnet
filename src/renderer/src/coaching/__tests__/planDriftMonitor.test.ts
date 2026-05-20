import { describe, it, expect, vi, beforeEach } from 'vitest'
import dayjs from 'dayjs'
import { checkPlanDrift, acceptProposal, dismissProposal } from '../planDriftMonitor'

// Mock the planning store (Dexie)
const mockPlans: any[] = []
vi.mock('../../stores/planning', () => ({
  planningDb: {
    plans: {
      orderBy: vi.fn(() => ({
        reverse: vi.fn(() => ({
          toArray: vi.fn(async () => [...mockPlans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
        })),
      })),
      toArray: vi.fn(async () => [...mockPlans]),
      add: vi.fn(async (plan: any) => {
        const id = mockPlans.length + 100
        mockPlans.push({ ...plan, id })
        return id
      }),
      get: vi.fn(async (id: number) => mockPlans.find((p) => p.id === id) ?? undefined),
      put: vi.fn(async (plan: any) => {
        const idx = mockPlans.findIndex((p) => p.id === plan.id)
        if (idx >= 0) {
          mockPlans[idx] = { ...plan }
        }
      }),
    },
  },
}))

// Mock the diet log store
const mockDietLogs: Record<string, any> = {}
vi.mock('../../stores/dietLog', () => ({
  getDietLog: vi.fn((date: string) => mockDietLogs[date] ?? null),
  summarizeDietLog: vi.fn((log: any) => {
    if (!log || !log.meals) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, itemCount: 0 }
    }
    let calories = 0
    let itemCount = 0
    for (const meal of log.meals) {
      for (const item of meal.items) {
        calories += item.calories
        itemCount++
      }
    }
    return { calories, protein: 0, carbs: 0, fat: 0, mealCount: log.meals.length, itemCount }
  }),
}))

// Mock the audit log
vi.mock('../auditLog', () => ({
  writeAuditEntry: vi.fn(async (entry: any) => ({
    id: 1,
    ...entry,
    timestamp: new Date().toISOString(),
  })),
}))

function createAcceptedPlan(overrides: Partial<any> = {}): any {
  return {
    id: 1,
    title: 'Test Plan',
    summary: 'A test plan',
    dailyCalorieTarget: 2000,
    proteinTarget: 100,
    carbsTarget: 250,
    fatTarget: 70,
    mealGuidance: ['Eat well'],
    cautionNotes: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    profileSnapshot: { id: 'current', completionStatus: 'completed', updatedAt: '2024-01-01T00:00:00.000Z' },
    generationMode: 'local' as const,
    status: undefined, // undefined means accepted
    ...overrides,
  }
}

function createDietLog(date: string, totalCalories: number): any {
  return {
    date,
    meals: [
      {
        type: 'lunch',
        items: [{ recipeId: 'r1', name: 'Food', servings: 1, calories: totalCalories, protein: 50, carbs: 60, fat: 30 }],
      },
    ],
  }
}

describe('checkPlanDrift', () => {
  beforeEach(() => {
    mockPlans.length = 0
    Object.keys(mockDietLogs).forEach((key) => delete mockDietLogs[key])
    vi.clearAllMocks()
  })

  it('returns null when no accepted plan exists', async () => {
    const result = await checkPlanDrift(dayjs('2024-03-10'))
    expect(result).toBeNull()
  })

  it('returns null when accepted plan has no dailyCalorieTarget', async () => {
    mockPlans.push(createAcceptedPlan({ dailyCalorieTarget: undefined }))
    const result = await checkPlanDrift(dayjs('2024-03-10'))
    expect(result).toBeNull()
  })

  it('returns null when fewer than 3 logged days exist', async () => {
    mockPlans.push(createAcceptedPlan())
    const now = dayjs('2024-03-10')
    // Only 2 days logged
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 2500)
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 2500)
    // Day 3 missing

    const result = await checkPlanDrift(now)
    expect(result).toBeNull()
  })

  it('returns null when drift is below 15% threshold', async () => {
    mockPlans.push(createAcceptedPlan({ dailyCalorieTarget: 2000 }))
    const now = dayjs('2024-03-10')
    // 10% over — below threshold
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 2200)
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 2200)
    mockDietLogs['2024-03-07'] = createDietLog('2024-03-07', 2200)

    const result = await checkPlanDrift(now)
    expect(result).toBeNull()
  })

  it('returns null when drift direction is mixed', async () => {
    mockPlans.push(createAcceptedPlan({ dailyCalorieTarget: 2000 }))
    const now = dayjs('2024-03-10')
    // Mixed: 2 over, 1 under
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 2400) // +20%
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 2400) // +20%
    mockDietLogs['2024-03-07'] = createDietLog('2024-03-07', 1600) // -20%

    const result = await checkPlanDrift(now)
    expect(result).toBeNull()
  })

  it('produces a proposal when all 3 days drift over by ≥15%', async () => {
    mockPlans.push(createAcceptedPlan({ dailyCalorieTarget: 2000 }))
    const now = dayjs('2024-03-10')
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 2400) // +20%
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 2500) // +25%
    mockDietLogs['2024-03-07'] = createDietLog('2024-03-07', 2300) // +15%

    const result = await checkPlanDrift(now)
    expect(result).not.toBeNull()
    expect(result!.driftDirection).toBe('over')
    expect(result!.sourcePlanId).toBe(1)
    expect(result!.driftDays).toHaveLength(3)
    expect(result!.proposedPlan.status).toBe('proposed')
    expect(result!.proposedPlan.sourcePlanId).toBe(1)
    // Proposed target = average of 2400+2500+2300 = 7200/3 = 2400
    expect(result!.proposedPlan.dailyCalorieTarget).toBe(2400)
  })

  it('produces a proposal when all 3 days drift under by ≥15%', async () => {
    mockPlans.push(createAcceptedPlan({ dailyCalorieTarget: 2000 }))
    const now = dayjs('2024-03-10')
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 1600) // -20%
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 1500) // -25%
    mockDietLogs['2024-03-07'] = createDietLog('2024-03-07', 1700) // -15%

    const result = await checkPlanDrift(now)
    expect(result).not.toBeNull()
    expect(result!.driftDirection).toBe('under')
    // Proposed target = average of 1600+1500+1700 = 4800/3 = 1600
    expect(result!.proposedPlan.dailyCalorieTarget).toBe(1600)
  })

  it('enforces max 1 proposal per ISO week', async () => {
    // Add an existing proposal created this week
    mockPlans.push(createAcceptedPlan({ dailyCalorieTarget: 2000 }))
    mockPlans.push(
      createAcceptedPlan({
        id: 2,
        status: 'proposed',
        createdAt: '2024-03-07T12:00:00.000Z', // Thursday of same week
      }),
    )

    const now = dayjs('2024-03-10') // Sunday of same week (ISO week starts Monday)
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 2400)
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 2400)
    mockDietLogs['2024-03-07'] = createDietLog('2024-03-07', 2400)

    const result = await checkPlanDrift(now)
    expect(result).toBeNull()
  })

  it('allows a new proposal in a different ISO week', async () => {
    // Existing proposal from previous week
    mockPlans.push(createAcceptedPlan({ dailyCalorieTarget: 2000 }))
    mockPlans.push(
      createAcceptedPlan({
        id: 2,
        status: 'proposed',
        createdAt: '2024-03-01T12:00:00.000Z', // Previous week
      }),
    )

    const now = dayjs('2024-03-10') // New week
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 2400)
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 2400)
    mockDietLogs['2024-03-07'] = createDietLog('2024-03-07', 2400)

    const result = await checkPlanDrift(now)
    expect(result).not.toBeNull()
  })

  it('computes avgDriftPercent correctly', async () => {
    mockPlans.push(createAcceptedPlan({ dailyCalorieTarget: 2000 }))
    const now = dayjs('2024-03-10')
    // Deviations: +20%, +25%, +15% → avg = 20%
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 2400)
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 2500)
    mockDietLogs['2024-03-07'] = createDietLog('2024-03-07', 2300)

    const result = await checkPlanDrift(now)
    expect(result!.avgDriftPercent).toBe(20)
  })

  it('writes an audit entry on proposal creation', async () => {
    const { writeAuditEntry } = await import('../auditLog')
    mockPlans.push(createAcceptedPlan({ dailyCalorieTarget: 2000 }))
    const now = dayjs('2024-03-10')
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 2400)
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 2400)
    mockDietLogs['2024-03-07'] = createDietLog('2024-03-07', 2400)

    await checkPlanDrift(now)
    expect(writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'system',
        action: 'plan_drift_proposal',
        payload: expect.objectContaining({
          driftDirection: 'over',
          sourcePlanId: 1,
        }),
      }),
    )
  })

  it('uses the latest accepted plan (ignores proposed/dismissed)', async () => {
    // Older accepted plan
    mockPlans.push(createAcceptedPlan({ id: 1, dailyCalorieTarget: 2000, createdAt: '2024-01-01T00:00:00.000Z' }))
    // Newer proposed plan from a previous week (should be ignored for drift source)
    mockPlans.push(createAcceptedPlan({ id: 2, dailyCalorieTarget: 3000, status: 'proposed', createdAt: '2024-02-20T00:00:00.000Z' }))

    const now = dayjs('2024-03-10')
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 2400)
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 2400)
    mockDietLogs['2024-03-07'] = createDietLog('2024-03-07', 2400)

    const result = await checkPlanDrift(now)
    expect(result).not.toBeNull()
    expect(result!.sourcePlanId).toBe(1) // Uses the accepted plan, not the proposed one
  })

  it('treats status=undefined as accepted', async () => {
    mockPlans.push(createAcceptedPlan({ id: 1, status: undefined, dailyCalorieTarget: 2000 }))
    const now = dayjs('2024-03-10')
    mockDietLogs['2024-03-09'] = createDietLog('2024-03-09', 2400)
    mockDietLogs['2024-03-08'] = createDietLog('2024-03-08', 2400)
    mockDietLogs['2024-03-07'] = createDietLog('2024-03-07', 2400)

    const result = await checkPlanDrift(now)
    expect(result).not.toBeNull()
    expect(result!.sourcePlanId).toBe(1)
  })
})

describe('acceptProposal', () => {
  beforeEach(() => {
    mockPlans.length = 0
    vi.clearAllMocks()
  })

  it('marks a proposed plan as accepted', async () => {
    mockPlans.push(createAcceptedPlan({ id: 1, status: 'proposed', sourcePlanId: 0 }))

    const result = await acceptProposal(1)
    expect(result.status).toBe('accepted')
    expect(result.id).toBe(1)
  })

  it('does not mutate the original accepted plan', async () => {
    const originalPlan = createAcceptedPlan({ id: 1, status: undefined, dailyCalorieTarget: 2000 })
    const proposalPlan = createAcceptedPlan({ id: 2, status: 'proposed', sourcePlanId: 1, dailyCalorieTarget: 2400 })
    mockPlans.push(originalPlan)
    mockPlans.push(proposalPlan)

    await acceptProposal(2)

    // Original plan should be unchanged
    const original = mockPlans.find((p) => p.id === 1)
    expect(original.dailyCalorieTarget).toBe(2000)
    expect(original.status).toBeUndefined()
  })

  it('throws when proposal not found', async () => {
    await expect(acceptProposal(999)).rejects.toThrow('not found')
  })

  it('throws when plan is not a proposal', async () => {
    mockPlans.push(createAcceptedPlan({ id: 1, status: 'accepted' }))
    await expect(acceptProposal(1)).rejects.toThrow('not a proposal')
  })

  it('writes an audit entry on accept', async () => {
    const { writeAuditEntry } = await import('../auditLog')
    mockPlans.push(createAcceptedPlan({ id: 1, status: 'proposed', sourcePlanId: 0 }))

    await acceptProposal(1)
    expect(writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'user',
        action: 'plan_drift_accept',
        payload: expect.objectContaining({ proposalId: 1 }),
      }),
    )
  })
})

describe('dismissProposal', () => {
  beforeEach(() => {
    mockPlans.length = 0
    vi.clearAllMocks()
  })

  it('marks a proposed plan as dismissed', async () => {
    mockPlans.push(createAcceptedPlan({ id: 1, status: 'proposed', sourcePlanId: 0 }))

    await dismissProposal(1)

    const plan = mockPlans.find((p) => p.id === 1)
    expect(plan.status).toBe('dismissed')
  })

  it('does not delete the row (kept for audit)', async () => {
    mockPlans.push(createAcceptedPlan({ id: 1, status: 'proposed', sourcePlanId: 0 }))

    await dismissProposal(1)

    expect(mockPlans).toHaveLength(1)
    expect(mockPlans[0].id).toBe(1)
  })

  it('throws when proposal not found', async () => {
    await expect(dismissProposal(999)).rejects.toThrow('not found')
  })

  it('throws when plan is not a proposal', async () => {
    mockPlans.push(createAcceptedPlan({ id: 1, status: 'dismissed' }))
    await expect(dismissProposal(1)).rejects.toThrow('not a proposal')
  })

  it('writes an audit entry on dismiss', async () => {
    const { writeAuditEntry } = await import('../auditLog')
    mockPlans.push(createAcceptedPlan({ id: 1, status: 'proposed', sourcePlanId: 0 }))

    await dismissProposal(1)
    expect(writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'user',
        action: 'plan_drift_dismiss',
        payload: expect.objectContaining({ proposalId: 1 }),
      }),
    )
  })
})
