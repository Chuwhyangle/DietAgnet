// 对话历史持久化

export interface PersistedChatMessage {
  id: string
  kind: 'assistant' | 'user' | 'tool'
  content: string
  timestamp: string
}

const STORAGE_KEY = 'diet-agent-chat-history'
const MAX_MESSAGES = 200

export function loadChatHistory(): PersistedChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (item: unknown): item is PersistedChatMessage =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as PersistedChatMessage).id === 'string' &&
        typeof (item as PersistedChatMessage).kind === 'string' &&
        typeof (item as PersistedChatMessage).content === 'string',
    )
  } catch (error) {
    console.error('Failed to load chat history:', error)
    return []
  }
}

export function saveChatHistory(messages: PersistedChatMessage[]): void {
  try {
    const trimmed = messages.slice(-MAX_MESSAGES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch (error) {
    console.error('Failed to save chat history:', error)
  }
}

export function clearChatHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear chat history:', error)
  }
}
