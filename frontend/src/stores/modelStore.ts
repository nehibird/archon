import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as api from '../services/api'
import type { ModelOption } from '../services/types'

interface ModelState {
  selectedModel: string
  models: ModelOption[]
  isLoading: boolean
  error: string | null

  setSelectedModel: (modelId: string) => void
  fetchModels: () => Promise<void>
  getModelInfo: (modelId: string) => ModelOption | undefined
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      selectedModel: 'claude',
      models: [],
      isLoading: false,
      error: null,

      setSelectedModel: (modelId: string) => {
        set({ selectedModel: modelId })
      },

      fetchModels: async () => {
        const { models, isLoading } = get()
        if (isLoading || models.length > 0) return

        set({ isLoading: true, error: null })
        try {
          const data = await api.getModels()
          set({ models: data, isLoading: false })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          set({ error: msg, isLoading: false })
        }
      },

      getModelInfo: (modelId: string) => {
        return get().models.find(m => m.id === modelId)
      },
    }),
    {
      name: 'archon-model-selection',
      partialize: (state) => ({
        selectedModel: state.selectedModel,
      }),
    }
  )
)
