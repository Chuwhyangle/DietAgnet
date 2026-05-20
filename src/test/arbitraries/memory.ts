/**
 * User-memory arbitrary (task 2.7, Requirement 3.8).
 *
 * The memory matcher (`memory/matcher.ts`) is required to be
 * order-insensitive: shuffling the active `UserMemory[]` input must
 * yield an equal match decision (Property 8). To exercise that across
 * the codebase, the arbitrary below covers **every `UserMemoryType`**
 * — `preference`, `allergy`, `avoidance`, `habit`, `schedule`,
 * `health_note`, `goal`, and `other` — and varies status across
 * `active`, `archived`, and `pending_confirm` so callers can opt
 * into a specific status via `.filter(...)` if they want to.
 *
 * The `confidence` field is generated as a finite double in `[0, 1]`,
 * matching the production constraint `Math.min(Math.max(c, 0), 1)`
 * applied by `updateUserMemoryConfidence`.
 *
 * The `id` field is left `undefined` so callers can hand the result
 * straight to `planningDb.memories.add(...)` without fighting Dexie's
 * auto-increment, mirroring the convention used by
 * `src/test/factories/userMemory.ts`.
 */

import * as fc from 'fast-check'
import type {
  UserMemory,
  UserMemorySource,
  UserMemoryType,
} from '../../renderer/src/stores/planning'

// ---------------------------------------------------------------------------
// Constants — every member of every union the production type allows.
// Exposed so property tests can iterate exhaustively if needed.
// ---------------------------------------------------------------------------

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

export const ALL_USER_MEMORY_SOURCES: readonly UserMemorySource[] = [
  'user_explicit',
  'agent_inferred',
  'planning_profile',
  'manual',
]

export const ALL_USER_MEMORY_STATUSES: readonly UserMemory['status'][] = [
  'active',
  'archived',
  'pending_confirm',
]

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const memoryTypeArb = fc.constantFrom(...ALL_USER_MEMORY_TYPES)
const memorySourceArb = fc.constantFrom(...ALL_USER_MEMORY_SOURCES)
const memoryStatusArb = fc.constantFrom(...ALL_USER_MEMORY_STATUSES)

const confidenceArb = fc
  .double({ min: 0, max: 1, noNaN: true })
  .filter((n) => Number.isFinite(n))

const contentArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim().length > 0)

const tagArb = fc
  .string({ minLength: 1, maxLength: 16 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.toLowerCase())

const isoTimestampArb = fc
  .date({
    min: new Date('2024-01-01T00:00:00Z'),
    max: new Date('2025-12-31T23:59:59Z'),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString())

function normalizeMemoryContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ')
}

// ---------------------------------------------------------------------------
// Public arbitrary
// ---------------------------------------------------------------------------

/**
 * Generate a `UserMemory` over **every** `UserMemoryType`, with
 * confidence in `[0, 1]` and status in
 * `'active' | 'archived' | 'pending_confirm'`.
 *
 * `id` is left `undefined`, `mergedFromIds` defaults to an empty
 * array, and `archivedReason` / `lastUsedAt` are populated only for a
 * subset of generated memories so tests see both shapes.
 *
 * **Validates: Requirement 3.8**
 */
export function arbUserMemory(): fc.Arbitrary<UserMemory> {
  return fc
    .record({
      type: memoryTypeArb,
      content: contentArb,
      tags: fc.array(tagArb, { minLength: 0, maxLength: 4 }),
      source: memorySourceArb,
      confidence: confidenceArb,
      status: memoryStatusArb,
      createdAt: isoTimestampArb,
      updatedAt: isoTimestampArb,
      lastUsedAt: fc.option(isoTimestampArb, { nil: undefined }),
      archivedReason: fc.option(
        fc.string({ minLength: 1, maxLength: 24 }),
        { nil: undefined },
      ),
    })
    .map((raw): UserMemory => ({
      id: undefined,
      type: raw.type,
      content: raw.content,
      normalizedContent: normalizeMemoryContent(raw.content),
      tags: [...raw.tags],
      source: raw.source,
      confidence: raw.confidence,
      status: raw.status,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      lastUsedAt: raw.lastUsedAt,
      mergedFromIds: undefined,
      archivedReason: raw.archivedReason,
    }))
}
