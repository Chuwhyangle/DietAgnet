import { knowledgeRecords } from './data'
import { rerankKnowledgeRecords } from './reranker'
import type { FoodCriteria, KnowledgeRecord, KnowledgeSearchResult } from './types'

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(Number(limit))) {
    return 6
  }

  return Math.min(Math.max(Math.floor(Number(limit)), 1), 20)
}

function byFoodName(name: string): (record: KnowledgeRecord) => boolean {
  const query = name.trim().toLowerCase()
  return (record) => {
    if (record.type !== 'food_nutrition') {
      return false
    }

    return record.title.toLowerCase().includes(query) ||
      record.aliases.some((alias) => alias.toLowerCase().includes(query) || query.includes(alias.toLowerCase()))
  }
}

export function searchKnowledgeBase(query: string, limit?: number): KnowledgeSearchResult[] {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return []
  }

  return rerankKnowledgeRecords(trimmedQuery, knowledgeRecords).slice(0, normalizeLimit(limit))
}

export function lookupFoodNutrition(name: string): KnowledgeRecord | null {
  const exact = knowledgeRecords.find(byFoodName(name))
  if (exact) {
    return exact
  }

  return searchKnowledgeBase(name, 1).find((result) => result.record.type === 'food_nutrition')?.record ?? null
}

export function findFoodsByCriteria(criteria: FoodCriteria): KnowledgeRecord[] {
  const tags = (criteria.tags ?? []).map((tag) => tag.toLowerCase())

  return knowledgeRecords
    .filter((record) => record.type === 'food_nutrition' && record.facts)
    .filter((record) => {
      const facts = record.facts
      if (!facts) {
        return false
      }

      if (typeof criteria.maxCalories === 'number' && facts.calories > criteria.maxCalories) {
        return false
      }

      if (typeof criteria.minProtein === 'number' && facts.protein < criteria.minProtein) {
        return false
      }

      if (typeof criteria.maxFat === 'number' && facts.fat > criteria.maxFat) {
        return false
      }

      if (tags.length > 0) {
        const recordTags = record.tags.map((tag) => tag.toLowerCase())
        return tags.some((tag) => recordTags.includes(tag))
      }

      return true
    })
    .sort((left, right) => {
      const leftProtein = left.facts?.protein ?? 0
      const rightProtein = right.facts?.protein ?? 0
      if (rightProtein !== leftProtein) {
        return rightProtein - leftProtein
      }
      return (left.facts?.calories ?? 0) - (right.facts?.calories ?? 0)
    })
    .slice(0, normalizeLimit(criteria.limit))
}

export function getGuidelineAdvice(topic: string): KnowledgeRecord[] {
  return searchKnowledgeBase(topic, 6)
    .map((result) => result.record)
    .filter((record) => record.type === 'guideline' || record.type === 'cooking_tip')
}
