import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as api from '../services/api'
import type { Project } from '../services/types'

interface ProjectState {
  projects: Project[]
  activeProjectId: string | null
  isLoading: boolean
  error: string | null

  loadProjects: () => Promise<void>
  selectProject: (id: string | null) => void
  createProject: (name: string, workingDir?: string, icon?: string) => Promise<Project>
  updateProject: (id: string, fields: Partial<{ name: string; icon: string; sort_order: number }>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,
      isLoading: false,
      error: null,

      loadProjects: async () => {
        set({ isLoading: true })
        try {
          const projects = await api.listProjects()
          const { activeProjectId } = get()
          // If active project no longer exists, clear it
          const stillExists = projects.some(p => p.id === activeProjectId)
          set({
            projects,
            isLoading: false,
            error: null,
            activeProjectId: stillExists ? activeProjectId : (projects[0]?.id || null),
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to load projects'
          set({ error: msg, isLoading: false })
        }
      },

      selectProject: (id) => {
        set({ activeProjectId: id })
      },

      createProject: async (name, workingDir, icon) => {
        const project = await api.createProject(name, workingDir, icon)
        set((s) => ({ projects: [...s.projects, project] }))
        return project
      },

      updateProject: async (id, fields) => {
        const updated = await api.updateProject(id, fields)
        set((s) => ({
          projects: s.projects.map(p => p.id === id ? { ...p, ...updated } : p),
        }))
      },

      deleteProject: async (id) => {
        await api.deleteProject(id)
        const { activeProjectId } = get()
        set((s) => ({
          projects: s.projects.filter(p => p.id !== id),
          activeProjectId: activeProjectId === id ? null : activeProjectId,
        }))
      },
    }),
    {
      name: 'archon-active-project',
      partialize: (state) => ({
        activeProjectId: state.activeProjectId,
      }),
    }
  )
)
