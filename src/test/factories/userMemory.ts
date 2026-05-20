/**
 * User memory factory for tests (task 2.6, Requirements 2.1, 2.2, 2.3,
 * 2.4).
 *
 * Production code under `src/renderer/src/stores/planning.ts` defines
 * `UserMemory`, `UserMemoryType`, and `UserMemorySource`. The factory
 * returns a valid `active` memory by default; per-type defaults
 * (content + tags + source) are documented below so tests covering
 * memory-matcher / autopilot-allergy logic get realistic content
 * without re-stating it inline.
 *
 *     makeUserMemory()                              // generic 'preference'
 *     makeUserMemory({ type: 'allergy' })          // peanut allergy
 *     makeUserMemory({ type: 'allergy', content: 'shellfish' })
 *
 * The `id` field defaults to `undefined` so callers can pass the
 * factory output straight to `planningDb.memories.add(...)` without
 * fighting Dexie's auto-increment.
 */

import type {
  UserMemory,
  UserMemorySource,
  UserMemoryType,
} from '../../renderer/src/stores/planning'

interface TypeDefaults {
  content: string
  tags: string[]
  source: UserMemorySource
}

const TYPE_DEFAULTS: Record<UserMemoryType, TypeDefaults> = {
  preference: {
    content: '喜欢清淡口味',
    tags: ['preference', 'flavor'],
    source: 'user_explicit',
  },
  allergy: {
    content: '花生过敏',
    tags: ['allergy', 'peanut'],
    source: 'user_explicit',
  },
  avoidance: {
    content: '不爱吃香菜',
    tags: ['avoidance', 'cilantro'],
    source: 'user_explicit',
  },
  habit: {
    content: '每天早上喝一杯黑咖啡',
    tags: ['habit', 'coffee', 'morning'],
    source: 'agent_inferred',
  },
  schedule: {
    content: '工作日 12:30 午餐',
    tags: ['schedule', 'lunch'],
    source: 'planning_profile',
  },
  health_note: {
    content: '医嘱低钠饮食',
    tags: ['health', 'sodium'],
    source: 'user_explicit',
  },
  goal: {
    content: '三个月内减重 4 公斤',
    tags: ['goal', 'weight_loss'],
    source: 'planning_profile',
  },
  other: {
    content: '冰箱常备鸡蛋和西红柿',
    tags: ['pantry'],
    source: 'manual',
  },
}

/**
 * Build a valid `UserMemory`.
 *
 * Defaults to an active 'preference' memory with realistic content,
 * tags, and source for that type. Override `type` to pick another
 * `UserMemoryType`; the factory swaps in that type's content / tags /
 * source defaults automatically. Any field can be overridden directly.
 *
 * Top-level fields are shallow-merged; the `tags` and `mergedFromIds`
 * arrays are replaced in full when provided.
 */
export function makeUserMemory(
  overrides: Partial<UserMemory> = {},
): UserMemory {
  const type: UserMemoryType = overrides.type ?? 'preference'
  const typeDefaults = TYPE_DEFAULTS[type]
  const content = overrides.content ?? typeDefaults.content
  const timestamp = '2024-06-15T08:00:00.000Z'

  return {
    id: undefined,
    type,
    content,
    normalizedContent:
      overrides.normalizedContent ?? normalizeMemoryContent(content),
    tags: overrides.tags ? [...overrides.tags] : [...typeDefaults.tags],
    source: overrides.source ?? typeDefaults.source,
    confidence: overrides.confidence ?? 0.85,
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
    lastUsedAt: overrides.lastUsedAt,
    mergedFromIds: overrides.mergedFromIds
      ? [...overrides.mergedFromIds]
      : undefined,
    archivedReason: overrides.archivedReason,
  }
}

/**
 * The list of every `UserMemoryType` the factory knows defaults for.
 * Exposed so property tests can iterate exhaustively.
 */
export const ALL_USER_MEMORY_TYPES: readonly UserMemoryType[] = [
  'preference',
  'allergy',
  'avoidance',
  'habit',
  'schedule',
  'health_note',
  'goal',
  'other',
]

function normalizeMemoryContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ')
}
