import { recall } from './manager'
import type { UserMemory } from '../stores/planning'
import { buildRhythmSummaryStructured, formatRhythmSummaryForPrompt } from '../habits/rhythmSummary'
import { getSettings, type AppLanguage } from '../stores/settings'

function resolveLanguage(language?: AppLanguage): AppLanguage {
  return language ?? (getSettings().language === 'zh' ? 'zh' : 'en')
}

function getTypeLabel(type: UserMemory['type'], language: AppLanguage): string {
  if (language === 'en') {
    switch (type) {
      case 'preference':
        return 'Preference'
      case 'allergy':
        return 'Allergy'
      case 'avoidance':
        return 'Avoidance'
      case 'habit':
        return 'Habit'
      case 'schedule':
        return 'Schedule'
      case 'health_note':
        return 'Health note'
      case 'goal':
        return 'Goal'
      default:
        return 'Other'
    }
  }

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
  const language = resolveLanguage()
  const tags = memory.tags.length > 0 ? ` [${memory.tags.join(', ')}]` : ''
  return `- ${getTypeLabel(memory.type, language)}: ${memory.content}${tags} (confidence ${memory.confidence.toFixed(2)})`
}

export async function buildMemoryContextForPrompt(limit = 12, language?: AppLanguage): Promise<string> {
  const resolvedLanguage = resolveLanguage(language)
  const memories = await recall({
    limit,
  })

  const rhythmBlock = formatRhythmSummaryForPrompt(buildRhythmSummaryStructured(14)).trim()
  const parts: string[] = []

  if (rhythmBlock.length > 0) {
    parts.push(rhythmBlock)
  }

  if (memories.length > 0) {
    if (resolvedLanguage === 'zh') {
      parts.push(
        '## 已知长期记忆',
        ...memories.map(formatMemoryForPrompt),
        '',
        '使用这些记忆时要保持克制：过敏和忌口必须优先遵守；偏好和习惯用于改善建议，但如果用户这次明确表达了不同选择，以用户当前表达为准。',
      )
    } else {
      parts.push(
        '## Known Long-Term Memory',
        ...memories.map((memory) => {
          const tags = memory.tags.length > 0 ? ` [${memory.tags.join(', ')}]` : ''
          return `- ${getTypeLabel(memory.type, 'en')}: ${memory.content}${tags} (confidence ${memory.confidence.toFixed(2)})`
        }),
        '',
        'Use these memories carefully: allergies and avoidances must be respected first; preferences and habits can improve suggestions, but the user’s current explicit request overrides older memory.',
      )
    }
  }

  if (parts.length === 0) {
    return ''
  }

  return parts.join('\n')
}
