import { create } from 'zustand'
import * as api from '../services/api'

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  role: string | null
  userId: string | null
  username: string | null
  displayName: string | null
  error: string | null

  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  checkAuth: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  role: null,
  userId: null,
  username: null,
  displayName: null,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.login(username, password)
      if (res.ok) {
        // Fetch full identity
        const me = await api.getMe()
        set({
          isAuthenticated: true,
          isLoading: false,
          role: me.role,
          userId: me.userId || null,
          username: me.username || null,
          displayName: me.displayName || null,
        })
        return true
      }
      set({ isLoading: false, error: 'Login failed' })
      return false
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      set({ isLoading: false, error: msg })
      return false
    }
  },

  logout: async () => {
    try {
      await api.logout()
    } catch { /* ignore */ }
    set({
      isAuthenticated: false,
      role: null,
      userId: null,
      username: null,
      displayName: null,
    })
  },

  checkAuth: async () => {
    set({ isLoading: true })
    try {
      const me = await api.getMe()
      set({
        isAuthenticated: true,
        isLoading: false,
        role: me.role,
        userId: me.userId || null,
        username: me.username || null,
        displayName: me.displayName || null,
      })
      return true
    } catch {
      set({ isAuthenticated: false, isLoading: false })
      return false
    }
  },
}))
