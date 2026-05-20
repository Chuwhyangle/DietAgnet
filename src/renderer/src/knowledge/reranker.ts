import { embedKnowledgeText } from './embedder'
import type { KnowledgeRecord, KnowledgeSearchResult } from './types'

function buildRecordText(record: KnowledgeRecord): string {
  return [
    record.title,
    record.aliases.join(' '),
    record.summary,
    record.tags.join(' '),
  ].join(' ')
}

export function rerankKnowledgeRecords(query: string, records: KnowledgeRecord[]): KnowledgeSearchResult[] {
  const queryTerms = embedKnowledgeText(query).terms

  return records
    .map((record) => {
      const recordText = buildRecordText(record).toLowerCase()
      const matchedTerms = queryTerms.filter((term) => recordText.includes(term))
      const aliasScore = record.aliases.some((alias) => query.includes(alias)) ? 4 : 0
      const titleScore = queryTerms.some((term) => record.title.toLowerCase().includes(term)) ? 3 : 0
      const tagScore = record.tags.filter((tag) => query.includes(tag)).length * 2
      const typeBoost = record.type === 'food_nutrition' && /营养|热量|卡|蛋白|脂肪|碳水/.test(query)
        ? 2
        : 0

      return {
        record,
        matchedTerms,
        score: matchedTerms.length + aliasScore + titleScore + tagScore + typeBoost,
      }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
}
