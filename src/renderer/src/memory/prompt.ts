import { recall } from './manager'
import type { UserMemory } from '../stores/planning'
import { buildRhythmSummaryStructured, formatRhythmSummaryForPrompt } from '../habits/rhythmSummary'

function getTypeLabel(type: UserMemory['type']): string {
  switch (type) {
    case 'preference':
      return '偏好'
    case 'allergy':
      return '过敏'
    case 'avoidance':
      return '忌口'
    case 'habit':
      return '习惯'
    case 'schedule':
      return '作息'
    case 'health_note':
      return '健康备注'
    case 'goal':
      return '目标'
    default:
      return '其他'
  }
}

export function formatMemoryForPrompt(memory: UserMemory): string {
  const tags = memory.tags.length > 0 ? ` [${memory.tags.join(', ')}]` : ''
  return `- ${getTypeLabel(memory.type)}: ${memory.content}${tags} (confidence ${memory.confidence.toFixed(2)})`
}

export async function buildMemoryContextForPrompt(limit = 12): Promise<string> {
  const memories = await recall({
    limit,
  })

  const rhythmBlock = formatRhythmSummaryForPrompt(buildRhythmSummaryStructured(14)).trim()
  const parts: string[] = []

  if (rhythmBlock.length > 0) {
    parts.push(rhythmBlock)
  }

  if (memories.length > 0) {
    parts.push(
      '## 已知长期记忆',
      ...memories.map(formatMemoryForPrompt),
      '',
      '使用这些记忆时要保持克制：过敏和忌口必须优先遵守；偏好和习惯用于改善建议，但如果用户这次明确表达了不同选择，以用户当前表达为准。',
    )
  }

  if (parts.length === 0) {
    return ''
  }

  return parts.join('\n')
}
