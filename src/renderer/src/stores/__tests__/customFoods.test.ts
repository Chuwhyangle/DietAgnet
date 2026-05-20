/**
 * Example tests for `stores/customFoods.ts` (task 4.13, Requirements
 * 2.5, 2.8).
 *
 * `customFoods.ts` persists user-defined recipes to `localStorage`
 * and exposes helpers that merge them on top of the bundled base
 * recipe set.
 */

import { describe, it, expect } from 'vitest'

import {
  getCustomFoods,
  saveCustomFood,
  getAllRecipesWithCustomFoods,
  findRecipeByIdWithCustomFoods,
} from '../customFoods'

const baseRecipes = [
  {
    id: 'r-base',
    name: '基础食物',
    emoji: '🍳',
    category: '主食',
    calories: 200,
    time: 10,
    ingredients: [{ name: 'A', amount: '1份' }],
    steps: ['cook'],
    nutrition: { protein: 10, carbs: 30, fat: 5 },
  },
] as never

describe('stores/customFoods', () => {
  it('returns an empty list when nothing is persisted', () => {
    expect(getCustomFoods()).toEqual([])
  })

  it('saveCustomFood persists a new entry and getCustomFoods returns it', () => {
    const saved = saveCustomFood({
      name: '自定义沙拉',
      calories: 300,
      protein: 20,
      carbs: 15,
      fat: 12,
    })
    expect(saved.id).toMatch(/^custom-/)
    expect(saved.source).toBe('manual')
    expect(saved.calories).toBe(300)
    expect(getCustomFoods()).toHaveLength(1)
  })

  it('saveCustomFood updates an existing entry by id rather than duplicating', () => {
    const first = saveCustomFood({
      name: '自定义沙拉',
      calories: 300,
      protein: 20,
      carbs: 15,
      fat: 12,
    })
    const updated = saveCustomFood({
      id: first.id,
      name: '自定义沙拉',
      calories: 350,
      protein: 22,
      carbs: 18,
      fat: 14,
    })
    expect(updated.id).toBe(first.id)
    expect(updated.calories).toBe(350)
    expect(getCustomFoods()).toHaveLength(1)
  })

  it('matches existing entries by case-insensitive name when no id is supplied', () => {
    const first = saveCustomFood({
      name: '自定义沙拉',
      calories: 300,
      protein: 20,
      carbs: 15,
      fat: 12,
    })
    const dup = saveCustomFood({
      name: '  自定义沙拉  ',
      calories: 320,
      protein: 21,
      carbs: 16,
      fat: 13,
    })
    expect(dup.id).toBe(first.id)
    expect(getCustomFoods()).toHaveLength(1)
  })

  it('getAllRecipesWithCustomFoods merges base + custom (custom appended)', () => {
    saveCustomFood({
      name: '自定义沙拉',
      calories: 300,
      protein: 20,
      carbs: 15,
      fat: 12,
    })
    const merged = getAllRecipesWithCustomFoods(baseRecipes)
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('r-base')
    expect(merged[1].id).toMatch(/^custom-/)
  })

  it('findRecipeByIdWithCustomFoods returns base or custom by id', () => {
    const saved = saveCustomFood({
      name: '自定义沙拉',
      calories: 300,
      protein: 20,
      carbs: 15,
      fat: 12,
    })
    expect(findRecipeByIdWithCustomFoods(baseRecipes, 'r-base')?.name)
      .toBe('基础食物')
    expect(findRecipeByIdWithCustomFoods(baseRecipes, saved.id)?.name)
      .toBe('自定义沙拉')
    expect(findRecipeByIdWithCustomFoods(baseRecipes, 'no-such-id'))
      .toBeUndefined()
  })
})
