import type { ThreadSummary, Message } from '../types'

interface SessionInfo {
  sessionId: string
  expiresAt: number
  threadCount: number
}

export function useSession() {
  const sessionId = useState<string | null>('sessionId', () => null)
  const expiresAt = useState<number | null>('expiresAt', () => null)
  const threadCount = useState<number>('threadCount', () => 0)

  function setSession(info: SessionInfo) {
    sessionId.value = info.sessionId
    expiresAt.value = info.expiresAt
    threadCount.value = info.threadCount
    if (import.meta.client) {
      localStorage.setItem('sessionId', info.sessionId)
      localStorage.setItem('expiresAt', String(info.expiresAt))
    }
  }

  function clearSession() {
    sessionId.value = null
    expiresAt.value = null
    threadCount.value = 0
    if (import.meta.client) {
      localStorage.removeItem('sessionId')
      localStorage.removeItem('expiresAt')
    }
  }

  function restoreSession() {
    if (import.meta.client) {
      const id = localStorage.getItem('sessionId')
      const exp = localStorage.getItem('expiresAt')
      if (id && exp && Date.now() < Number(exp)) {
        sessionId.value = id
        expiresAt.value = Number(exp)
      } else {
        clearSession()
      }
    }
  }

  const isExpired = computed(() =>
    expiresAt.value !== null && Date.now() > expiresAt.value
  )

  async function fetchThreads(search = ''): Promise<ThreadSummary[]> {
    if (!sessionId.value) return []
    const params = search ? `?search=${encodeURIComponent(search)}` : ''
    const data = await $fetch<{ threads: ThreadSummary[] }>(
      `/api/sessions/${sessionId.value}/threads${params}`
    )
    return data.threads
  }

  async function fetchMessages(threadId: string, page = 1, pageSize = 50): Promise<{
    messages: Message[]
    totalPages: number
    totalMessages: number
    threadName: string
    participants: string[]
  }> {
    if (!sessionId.value) throw new Error('No session')
    return await $fetch(
      `/api/sessions/${sessionId.value}/threads/${threadId}/messages?page=${page}&pageSize=${pageSize}`
    )
  }

  function mediaUrl(uri: string): string {
    if (!sessionId.value) return ''
    const encoded = encodeURIComponent(uri)
    return `/media/${sessionId.value}/${encoded}`
  }

  async function deleteCurrentSession(): Promise<void> {
    if (!sessionId.value) return
    try {
      await $fetch(`/api/sessions/${sessionId.value}`, { method: 'DELETE' })
    } catch {
      // ignore – best effort
    }
    clearSession()
  }

  return {
    sessionId,
    expiresAt,
    threadCount,
    isExpired,
    setSession,
    clearSession,
    restoreSession,
    fetchThreads,
    fetchMessages,
    mediaUrl,
    deleteCurrentSession
  }
}
