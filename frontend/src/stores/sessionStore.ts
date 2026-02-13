import { create } from 'zustand'
import * as api from '../services/api'
import type { Session } from '../services/types'

interface SessionState {
  sessions: Session[]
  currentSessionId: string | null
  isLoading: boolean
  error: string | null

  loadSessions: () => Promise<void>
  selectSession: (id: string | null) => void
  createSession: (name: string, workingDir?: string, provider?: string, model?: string, projectId?: string) => Promise<Session>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, name: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  isLoading: false,
  error: null,

  loadSessions: async () => {
    set({ isLoading: true })
    try {
      const sessions = await api.listSessions()
      set({ sessions, isLoading: false, error: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sessions'
      set({ error: msg, isLoading: false })
    }
  },

  selectSession: (id) => {
    set({ currentSessionId: id })
  },

  createSession: async (name, workingDir, provider, model, projectId) => {
    const session = await api.createSession(name, workingDir, provider, model, projectId)
    set((s) => ({ sessions: [session, ...s.sessions] }))
    return session
  },

  deleteSession: async (id) => {
    await api.deleteSession(id)
    const { currentSessionId } = get()
    set((s) => ({
      sessions: s.sessions.filter(sess => sess.id !== id),
      currentSessionId: currentSessionId === id ? null : currentSessionId,
    }))
  },

  renameSession: async (id, name) => {
    const updated = await api.updateSession(id, { name })
    set((s) => ({
      sessions: s.sessions.map(sess => sess.id === id ? { ...sess, ...updated } : sess),
    }))
  },
}))
