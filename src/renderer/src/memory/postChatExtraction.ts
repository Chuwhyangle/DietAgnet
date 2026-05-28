import type { AgentChatRequest } from '../../../shared/agent'
import { getSettings } from '../stores/settings'
import {
  saveUserMemory,
  getUserMemories,
  type UserMemoryType,
} from '../stores/planning'
import { remember } from './manager'
import { areMemoriesSimilar, normalizeMemoryContent, normalizeMemoryTags } from './matcher'

const MEMORY_TYPES: UserMemoryType[] = [
  'preference',
  'allergy',
  'avoidance',
  'habit',
  'schedule',
  'health_note',
  'goal',
  'other',
]

/** 过敏 / 忌口不得自动入库，避免模型误判写入长期记忆。 */
const NO_AUTO_APPLY_TYPES = new Set<UserMemoryType>(['allergy', 'avoidance'])

const MAX_EXTRACTED_CONTENT_LENGTH = 400
const EXTRACTION_MIN_INTERVAL_MS = 10_000

let lastExtractionAttemptAt = 0

function stripMarkdownFences(text: string): string {
  let t = text.trim()
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im
  const m = t.match(fence)
  if (m) {
    t = m[1].trim()
  }
  return t
}

function extractJsonArrayLoose(text: string): string {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON array found')
  }

  return text.slice(start, end + 1)
}

function parseMemoryCandidatesJson(rawContent: string): unknown {
  const stripped = stripMarkdownFences(rawContent)

  try {
    if (stripped.startsWith('[')) {
      return JSON.parse(stripped) as unknown
    }
  } catch {
    /* fall through */
  }

  try {
    return JSON.parse(extractJsonArrayLoose(stripped)) as unknown
  } catch {
    try {
      return JSON.parse(extractJsonArrayLoose(rawContent)) as unknown
    } catch {
      throw new Error('parse failed')
    }
  }
}

function parseMemoryType(value: string): UserMemoryType | null {
  const trimmed = value.trim() as UserMemoryType
  return MEMORY_TYPES.includes(trimmed) ? trimmed : null
}

function isDuplicateCandidate(
  candidate: { type: UserMemoryType; normalizedContent: string; tags: string[] },
  existing: Awaited<ReturnType<typeof getUserMemories>>,
): boolean {
  return existing.some((memory) => areMemoriesSimilar(memory, candidate))
}

function clampExtractedContent(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length <= MAX_EXTRACTED_CONTENT_LENGTH) {
    return trimmed
  }

  return `${trimmed.slice(0, MAX_EXTRACTED_CONTENT_LENGTH)}…`
}

export async function runPostChatMemoryExtraction(params: {
  userMessage: string
  assistantMessage: string
}): Promise<void> {
  const settings = getSettings()
  if (settings.memoryPostChatExtraction === false) {
    return
  }

  const now = Date.now()
  if (now - lastExtractionAttemptAt < EXTRACTION_MIN_INTERVAL_MS) {
    return
  }

  const user = params.userMessage.trim()
  const assistant = params.assistantMessage.trim()
  if (user.length < 4 || assistant.length < 8) {
    return
  }

  const language = settings.language === 'zh' ? 'zh' : 'en'

  if (
    assistant.startsWith('喵呜，刚刚没处理成功') ||
    assistant.toLowerCase().startsWith('sorry, that did not work')
  ) {
    return
  }

  if (!settings.agent.apiBaseUrl.trim() || !settings.agent.model.trim()) {
    return
  }

  const apiStatus = await window.agent.getApiKeyStatus(settings.agent.provider)
  if (!apiStatus.configured) {
    return
  }

  lastExtractionAttemptAt = now

  const autoThreshold = Math.min(
    0.95,
    Math.max(0.55, settings.memoryPostChatAutoConfidence ?? 0.78),
  )
  const pendingMin = Math.min(
    autoThreshold - 0.01,
    Math.max(0.35, settings.memoryPostChatPendingMinConfidence ?? 0.52),
  )

  const systemPrompt = language === 'zh'
    ? [
      '你是饮食助手侧的「记忆抽取器」。只根据用户与助手的一段对话，判断是否出现值得长期保存的事实（偏好、忌口、过敏、作息、习惯、健康备注、目标等）。',
      '输出必须是严格 JSON 数组，最多 3 条；若没有值得保存的内容，输出 []。',
      '每条对象字段：type（必须是 preference|allergy|avoidance|habit|schedule|health_note|goal|other 之一）、content（一句独立可读的中文）、tags（字符串数组，可空）、confidence（0 到 1 的小数）、reason（可选，简短说明）。',
      '严格要求：',
      '- 仅当用户明确或强烈暗示「长期稳定」信息时才输出；不要记录一次性点餐，除非用户说「总是/通常/一直」。',
      '- 不要做医学诊断；不要替用户编造未提及的过敏或疾病。',
      '- content 不要用「同上」「如前」等指代。',
      '- 输出只包含 JSON 数组本体，不要额外解释文字；如需代码块，只包一层 ```json。',
    ].join('\n')
    : [
      'You are the Diet Agent memory extractor. From one user/assistant exchange only, decide whether there are facts worth storing long term: preferences, avoidances, allergies, schedule, habits, health notes, goals, and similar.',
      'Output a strict JSON array with at most 3 items. If nothing is worth saving, output [].',
      'Each object must have: type (one of preference|allergy|avoidance|habit|schedule|health_note|goal|other), content (one standalone readable English sentence), tags (string array, can be empty), confidence (0 to 1), reason (optional brief explanation).',
      'Rules:',
      '- Output only when the user clearly states or strongly implies stable long-term information; do not store one-off meal orders unless the user says always/usually/consistently.',
      '- Do not diagnose medical conditions and do not invent allergies or illnesses not mentioned by the user.',
      '- content must not use references like "same as above" or "as before".',
      '- Output only the JSON array. If you use a code fence, use a single ```json fence.',
    ].join('\n')

  const userPrompt = language === 'zh'
    ? `对话片段：\n用户：${user}\n助手：${assistant}`
    : `Conversation snippet:\nUser: ${user}\nAssistant: ${assistant}`

  let rawContent: string
  try {
    const response = await window.agent.chatCompletions({
      settings: settings.agent,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools: [],
      temperature: 0.2,
      maxTokens: 500,
    } satisfies AgentChatRequest)

    rawContent = response.content.trim()
    if (!rawContent) {
      return
    }
  } catch (error) {
    console.error('postChatMemoryExtraction: LLM call failed', error)
    return
  }

  let parsed: unknown
  try {
    parsed = parseMemoryCandidatesJson(rawContent)
  } catch {
    console.warn('postChatMemoryExtraction: parse failed', rawContent.slice(0, 200))
    return
  }

  if (!Array.isArray(parsed)) {
    return
  }

  const active = await getUserMemories({ status: 'active', limit: 200 })
  const pendingList = await getUserMemories({ status: 'pending_confirm', limit: 100 })
  const existing = [...active, ...pendingList]

  for (const item of parsed.slice(0, 3)) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const record = item as Record<string, unknown>
    const type = parseMemoryType(String(record.type ?? ''))
    const rawContentField = String(record.content ?? '').trim()
    const content = clampExtractedContent(rawContentField)
    const confidence = Number(record.confidence)

    if (!type || content.length < 3) {
      continue
    }

    if (!Number.isFinite(confidence) || confidence < pendingMin) {
      continue
    }

    const tags = Array.isArray(record.tags)
      ? record.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
      : []

    const normalizedContent = normalizeMemoryContent(content)
    const normalizedTags = normalizeMemoryTags(tags)

    if (isDuplicateCandidate({ type, normalizedContent, tags: normalizedTags }, existing)) {
      continue
    }

    const allowAutoApply = confidence >= autoThreshold && !NO_AUTO_APPLY_TYPES.has(type)

    const pendingConfidence = NO_AUTO_APPLY_TYPES.has(type)
      ? Math.min(Math.max(confidence, pendingMin), 0.94)
      : Math.min(Math.max(confidence, pendingMin), autoThreshold - 0.01)

    try {
      if (allowAutoApply) {
        const { memory } = await remember({
          type,
          content,
          tags: normalizedTags,
          source: 'agent_inferred',
          confidence: Math.min(confidence, 0.95),
        })
        existing.push(memory)
      } else {
        const memory = await saveUserMemory({
          type,
          content,
          normalizedContent,
          tags: normalizedTags,
          source: 'agent_inferred',
          confidence: pendingConfidence,
          status: 'pending_confirm',
          mergedFromIds: [],
        })
        existing.push(memory)
      }
    } catch (error) {
      console.warn('postChatMemoryExtraction: skip candidate', error)
    }
  }
}
