/**
 * Example test for `data/recipeExtensions.ts` (task 4.5, Requirement 2.3).
 *
 * `recipeExtensions.ts` is a compatibility shim that re-exports the
 * Chinese and Western recipe collections from their dedicated source
 * files. This test pins the public surface so a refactor that drops or
 * renames either re-export surfaces here.
 */

import { describe, it, expect } from 'vitest'

import {
  additionalChineseRecipes,
  westernRecipes,
} from '../recipeExtensions'
import { additionalChineseRecipes as directChinese } from '../chineseRecipes'
import { westernRecipes as directWestern } from '../westernRecipes'

describe('data/recipeExtensions', () => {
  it('re-exports the Chinese recipe collection unchanged', () => {
    expect(additionalChineseRecipes).toBe(directChinese)
    expect(Array.isArray(additionalChineseRecipes)).toBe(true)
    expect(additionalChineseRecipes.length).toBeGreaterThan(0)
  })

  it('re-exports the Western recipe collection unchanged', () => {
    expect(westernRecipes).toBe(directWestern)
    expect(Array.isArray(westernRecipes)).toBe(true)
    expect(westernRecipes.length).toBeGreaterThan(0)
  })

  it('does not duplicate ids between the two collections', () => {
    const ids = new Set<string>()
    for (const recipe of [...additionalChineseRecipes, ...westernRecipes]) {
      expect(ids.has(recipe.id)).toBe(false)
      ids.add(recipe.id)
    }
  })
})
