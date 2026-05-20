import type { UserMemory } from '../stores/planning'

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[\s,，。.!！?？;；、/\\|]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
}

export function normalizeMemoryContent(content: string): string {
  return normalizeText(content)
}

export function normalizeMemoryTags(tags: string[] = []): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => normalizeText(tag))
        .filter(Boolean),
    ),
  ).slice(0, 12)
}

export function getMemoryMatchScore(memory: UserMemory, query: {
  text?: string
  tags?: string[]
}): number {
  let score = 0
  const normalizedText = normalizeText(query.text ?? '')
  const queryTokens = tokenize(normalizedText)
  const memoryTokens = tokenize(`${memory.content} ${memory.tags.join(' ')}`)
  const normalizedTags = normalizeMemoryTags(query.tags)

  if (normalizedText && memory.normalizedContent.includes(normalizedText)) {
    score += 8
  }

  for (const token of queryTokens) {
    if (memoryTokens.includes(token)) {
      score += 2
    }
  }

  for (const tag of normalizedTags) {
    if (memory.tags.includes(tag)) {
      score += 4
    }
  }

  score += memory.confidence
  return score
}

export function areMemoriesSimilar(left: UserMemory, right: {
  type: UserMemory['type']
  normalizedContent: string
  tags: string[]
}): boolean {
  if (left.type !== right.type) {
    return false
  }

  if (left.normalizedContent === right.normalizedContent) {
    return true
  }

  const leftTokens = new Set(tokenize(left.normalizedContent))
  const rightTokens = tokenize(right.normalizedContent)
  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length
  const minTokenCount = Math.min(leftTokens.size, rightTokens.length)

  if (minTokenCount > 0 && overlap / minTokenCount >= 0.75) {
    return true
  }

  return right.tags.length > 0 && right.tags.some((tag) => left.tags.includes(tag)) &&
    left.normalizedContent.includes(right.normalizedContent)
}
