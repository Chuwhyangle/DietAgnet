export interface LexicalEmbedding {
  terms: string[]
}

const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu

export function tokenizeKnowledgeText(text: string): string[] {
  const normalized = text.toLowerCase()
  const matches = normalized.match(TOKEN_PATTERN) ?? []
  const chineseChars = Array.from(normalized.matchAll(/\p{Script=Han}/gu)).map((match) => match[0])

  return Array.from(new Set([...matches, ...chineseChars].filter((term) => term.trim().length > 0)))
}

export function embedKnowledgeText(text: string): LexicalEmbedding {
  return {
    terms: tokenizeKnowledgeText(text),
  }
}
