import { rmSync } from 'node:fs'
import type { SessionIndex } from './types'

const SESSION_TTL_MS = 60 * 60 * 1000 // 1 hour

// In-memory session store
const store = new Map<string, SessionIndex>()

export function setSession(id: string, index: SessionIndex): void {
  store.set(id, index)
}

export function lookupSession(id: string): SessionIndex | undefined {
  return store.get(id)
}

export function deleteSession(id: string): void {
  const index = store.get(id)
  if (index) {
    try {
      rmSync(index.session.sessionDir, { recursive: true, force: true })
    } catch {
      // ignore filesystem errors during cleanup
    }
    store.delete(id)
  }
}

export function isExpired(index: SessionIndex): boolean {
  return Date.now() > index.session.expiresAt
}

export function getSessionTTL(): number {
  return SESSION_TTL_MS
}

/** Remove all expired sessions from the store (opportunistic cleanup). */
export function cleanupExpiredSessions(): void {
  for (const [id, index] of store.entries()) {
    if (isExpired(index)) {
      deleteSession(id)
    }
  }
}
