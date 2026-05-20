import {
  archiveUserMemory,
  getUserMemories,
  getUserMemory,
  markUserMemoryUsed,
  saveUserMemory,
  updateUserMemoryConfidence,
  type UserMemory,
  type UserMemorySource,
  type UserMemoryType,
} from '../stores/planning'
import {
  areMemoriesSimilar,
  getMemoryMatchScore,
  normalizeMemoryContent,
  normalizeMemoryTags,
} from './matcher'

export interface RememberInput {
  type: UserMemoryType
  content: string
  tags?: string[]
  source?: UserMemorySource
  confidence?: number
}

export interface RememberResult {
  memory: UserMemory
  merged: boolean
}

export interface RecallQuery {
  text?: string
  types?: UserMemoryType[]
  tags?: string[]
  limit?: number
}

function clampConfidence(confidence?: number): number {
  if (!Number.isFinite(confidence)) {
    return 0.75
  }

  return Math.min(Math.max(confidence ?? 0.75, 0), 1)
}

function assertMemoryContent(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length < 2) {
    throw new Error('记忆内容太短，无法保存。')
  }
  return trimmed
}

export async function remember(input: RememberInput): Promise<RememberResult> {
  const content = assertMemoryContent(input.content)
  const normalizedContent = normalizeMemoryContent(content)
  const tags = normalizeMemoryTags(input.tags)
  const confidence = clampConfidence(input.confidence)
  const activeMemories = await getUserMemories({
    status: 'active',
    types: [input.type],
    limit: 200,
  })
  const similarMemory = activeMemories.find((memory) => areMemoriesSimilar(memory, {
    type: input.type,
    normalizedContent,
    tags,
  }))

  if (similarMemory?.id) {
    const mergedTags = normalizeMemoryTags([...similarMemory.tags, ...tags])
    const mergedMemory = await saveUserMemory({
      ...similarMemory,
      id: similarMemory.id,
      content: content.length > similarMemory.content.length ? content : similarMemory.content,
      normalizedContent: normalizeMemoryContent(content.length > similarMemory.content.length
        ? content
        : similarMemory.content),
      tags: mergedTags,
      confidence: Math.max(similarMemory.confidence, confidence),
      source: input.source ?? similarMemory.source,
      mergedFromIds: similarMemory.mergedFromIds ?? [],
    })

    return {
      memory: mergedMemory,
      merged: true,
    }
  }

  const memory = await saveUserMemory({
    type: input.type,
    content,
    normalizedContent,
    tags,
    source: input.source ?? 'user_explicit',
    confidence,
    mergedFromIds: [],
  })

  return {
    memory,
    merged: false,
  }
}

export async function recall(query: RecallQuery = {}): Promise<UserMemory[]> {
  const memories = await getUserMemories({
    status: 'active',
    types: query.types,
    tags: query.tags,
    limit: 200,
  })
  const rankedMemories = memories
    .map((memory) => ({
      memory,
      score: getMemoryMatchScore(memory, {
        text: query.text,
        tags: query.tags,
      }),
    }))
    .filter((entry) => !query.text && (!query.tags || query.tags.length === 0) ? true : entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return right.memory.updatedAt.localeCompare(left.memory.updatedAt)
    })
    .slice(0, Math.max(1, query.limit ?? 8))
    .map((entry) => entry.memory)

  await Promise.all(
    rankedMemories
      .map((memory) => memory.id)
      .filter((id): id is number => typeof id === 'number')
      .map((id) => markUserMemoryUsed(id)),
  )

  return rankedMemories
}

export async function forget(id: number, reason?: string): Promise<UserMemory> {
  const archivedMemory = await archiveUserMemory(id, reason)
  if (!archivedMemory) {
    throw new Error('没有找到要删除的记忆。')
  }
  return archivedMemory
}

export async function listUserFacts(params: {
  types?: UserMemoryType[]
  tags?: string[]
  includeArchived?: boolean
  limit?: number
} = {}): Promise<UserMemory[]> {
  const activeMemories = await getUserMemories({
    status: 'active',
    types: params.types,
    tags: params.tags,
    limit: params.limit ?? 100,
  })

  if (!params.includeArchived) {
    return activeMemories
  }

  const archivedMemories = await getUserMemories({
    status: 'archived',
    types: params.types,
    tags: params.tags,
    limit: params.limit ?? 100,
  })

  return [...activeMemories, ...archivedMemories]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, Math.max(1, params.limit ?? 100))
}

export async function updateMemoryConfidence(id: number, confidence: number): Promise<UserMemory> {
  const updatedMemory = await updateUserMemoryConfidence(id, clampConfidence(confidence))
  if (!updatedMemory) {
    throw new Error('没有找到要更新的记忆。')
  }
  return updatedMemory
}

export async function getMemoryById(id: number): Promise<UserMemory> {
  const memory = await getUserMemory(id)
  if (!memory) {
    throw new Error('没有找到对应的记忆。')
  }
  return memory
}

export async function confirmPendingMemory(memoryId: number): Promise<UserMemory> {
  const memory = await getUserMemory(memoryId)
  if (!memory || memory.status !== 'pending_confirm') {
    throw new Error('只能确认「待确认」状态的记忆。')
  }

  return saveUserMemory({
    ...memory,
    id: memoryId,
    status: 'active',
  })
}

export async function dismissPendingMemory(memoryId: number): Promise<UserMemory> {
  return forget(memoryId, 'user_dismissed_pending_extraction')
}
