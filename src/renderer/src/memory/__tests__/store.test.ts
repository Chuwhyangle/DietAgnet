/**
 * Example test for `memory/store.ts` (task 4.10, Requirement 2.4).
 *
 * `store.ts` is a thin re-export shim over `stores/planning`. The
 * test pins the public surface so a refactor that drops or renames a
 * re-export shows up as a typing failure here. Behavior of the
 * underlying functions is covered by `manager.test.ts` and the
 * planning-store tests (task 4.13).
 */

import { describe, it, expect } from 'vitest'

import * as memoryStore from '../store'
import * as planningStore from '../../stores/planning'

describe('memory/store re-exports', () => {
  it('re-exports every documented helper from stores/planning', () => {
    const names = [
      'archiveUserMemory',
      'getUserMemories',
      'getUserMemory',
      'markUserMemoryUsed',
      'saveUserMemory',
      'updateUserMemoryConfidence',
    ] as const

    for (const name of names) {
      expect((memoryStore as Record<string, unknown>)[name]).toBe(
        (planningStore as Record<string, unknown>)[name],
      )
    }
  })
})
