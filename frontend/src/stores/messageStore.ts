import { create } from 'zustand'
import type { ToolCall } from '../services/types'

export interface ChatMessage {
  id: string
  type: 'user' | 'assistant' | 'event' | 'error'
  content: string
  toolCalls?: ToolCall[]
  cost?: number | null
  duration?: number | null
  timestamp: number
  isStreaming?: boolean
}

interface MessageState {
  messages: ChatMessage[]
  sessionStatus: 'ready' | 'thinking' | 'interrupted' | 'disconnected'

  setMessages: (messages: ChatMessage[]) => void
  addUserMessage: (content: string) => void
  addErrorMessage: (content: string) => void
  appendAssistantChunk: (text: string | null, toolCalls: ToolCall[] | null) => void
  finalizeAssistant: (cost: number | null, duration: number | null) => void
  setSessionStatus: (status: MessageState['sessionStatus']) => void
  clearMessages: () => void
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: [],
  sessionStatus: 'ready',

  setMessages: (messages) => set({ messages }),

  addUserMessage: (content) => set((s) => ({
    messages: [...s.messages, {
      id: `user-${Date.now()}`,
      type: 'user',
      content,
      timestamp: Date.now(),
    }],
  })),

  addErrorMessage: (content) => set((s) => ({
    messages: [...s.messages, {
      id: `error-${Date.now()}-${Math.random()}`,
      type: 'error',
      content,
      timestamp: Date.now(),
    }],
  })),

  appendAssistantChunk: (text, toolCalls) => set((s) => {
    const msgs = [...s.messages]
    const last = msgs[msgs.length - 1]

    if (last && last.type === 'assistant' && last.isStreaming) {
      // Append to existing streaming message
      const updated = { ...last }
      if (text) updated.content += text
      if (toolCalls) {
        updated.toolCalls = [...(updated.toolCalls || []), ...toolCalls]
      }
      updated.timestamp = Date.now()
      msgs[msgs.length - 1] = updated
    } else {
      // Start a new assistant message
      msgs.push({
        id: `assistant-${Date.now()}`,
        type: 'assistant',
        content: text || '',
        toolCalls: toolCalls || undefined,
        timestamp: Date.now(),
        isStreaming: true,
      })
    }

    return { messages: msgs }
  }),

  finalizeAssistant: (cost, duration) => set((s) => {
    const msgs = [...s.messages]
    const last = msgs[msgs.length - 1]
    if (last && last.type === 'assistant' && last.isStreaming) {
      msgs[msgs.length - 1] = { ...last, isStreaming: false, cost, duration }
    }
    return { messages: msgs }
  }),

  setSessionStatus: (status) => set({ sessionStatus: status }),

  clearMessages: () => set({ messages: [], sessionStatus: 'ready' }),
}))
