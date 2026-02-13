import { useEffect, useCallback, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { useSessionStore } from './stores/sessionStore'
import { useMessageStore } from './stores/messageStore'
import { wsService } from './services/eventStream'
import * as api from './services/api'
import type { WsInMessage, WsAssistantChunk, WsMessageComplete, WsSessionStatus, ToolCall } from './services/types'

import { LoginScreen } from './components/Auth/LoginScreen'
import { ProjectStrip } from './components/Sidebar/ProjectStrip'
import { SessionPanel } from './components/Sidebar/SessionPanel'
import { SessionHeader } from './components/Session/SessionHeader'
import { MessageTimeline } from './components/Session/MessageTimeline'
import { PromptDock } from './components/Session/PromptDock'
import { UserManagement } from './components/Admin/UserManagement'

function App() {
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAuthStore()
  const { currentSessionId, selectSession, sessions, renameSession } = useSessionStore()
  const { addUserMessage, appendAssistantChunk, finalizeAssistant, setSessionStatus, setMessages, clearMessages, sessionStatus } = useMessageStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showUserMgmt, setShowUserMgmt] = useState(false)

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Connect WebSocket when authenticated
  useEffect(() => {
    if (!isAuthenticated) return
    wsService.connect()
    return () => wsService.disconnect()
  }, [isAuthenticated])

  // Handle WebSocket messages
  useEffect(() => {
    const unsubscribe = wsService.subscribe((msg: WsInMessage) => {
      if ('sessionId' in msg && msg.sessionId && msg.sessionId !== currentSessionId) {
        return
      }

      switch (msg.type) {
        case 'assistant_chunk': {
          const chunk = msg as WsAssistantChunk
          appendAssistantChunk(chunk.text, chunk.toolCalls as ToolCall[] | null)
          break
        }
        case 'message_complete': {
          const complete = msg as WsMessageComplete
          finalizeAssistant(complete.cost, complete.duration)
          setSessionStatus('ready')
          break
        }
        case 'session_status': {
          const status = msg as WsSessionStatus
          if (status.sessionId === currentSessionId || status.sessionId === '') {
            if (status.status === 'thinking') setSessionStatus('thinking')
            else if (status.status === 'ready') setSessionStatus('ready')
            else if (status.status === 'interrupted') setSessionStatus('ready')
            else if (status.status === 'disconnected' && status.sessionId !== '') {
              // After interrupt, the process dies and sends 'disconnected'.
              // Treat as 'ready' — a new process auto-spawns on next message.
              const currentStatus = useMessageStore.getState().sessionStatus
              if (currentStatus === 'ready') {
                // Already set to ready by 'interrupted' — stay ready
              } else {
                setSessionStatus('disconnected')
              }
            }
          }
          break
        }
        case 'user_message':
          break
        case 'error': {
          const err = msg as { type: 'error'; message: string }
          useMessageStore.getState().addErrorMessage(err.message)
          setSessionStatus('ready')
          break
        }
      }
    })

    return unsubscribe
  }, [currentSessionId, appendAssistantChunk, finalizeAssistant, setSessionStatus])

  // Load messages when session changes
  useEffect(() => {
    if (!currentSessionId) {
      clearMessages()
      return
    }

    wsService.send({ type: 'subscribe', sessionId: currentSessionId })

    const loadMessages = async () => {
      try {
        const { messages } = await api.getMessages(currentSessionId)
        const chatMessages = messages.map(m => ({
          id: `db-${m.id}`,
          type: m.role as 'user' | 'assistant',
          content: m.content,
          toolCalls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
          timestamp: new Date(m.created_at).getTime(),
        }))
        setMessages(chatMessages)
      } catch (err) {
        console.error('Failed to load messages:', err)
      }
    }

    loadMessages()

    return () => {
      wsService.send({ type: 'unsubscribe', sessionId: currentSessionId })
    }
  }, [currentSessionId, clearMessages, setMessages])

  const handleSendMessage = useCallback((content: string) => {
    if (!currentSessionId) return
    addUserMessage(content)
    setSessionStatus('thinking')
    wsService.send({ type: 'message', sessionId: currentSessionId, content })
  }, [currentSessionId, addUserMessage, setSessionStatus])

  const handleInterrupt = useCallback(() => {
    if (!currentSessionId) return
    // Finalize any in-progress streaming message before interrupt
    const state = useMessageStore.getState()
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.isStreaming) {
      state.finalizeAssistant(null, null)
    }
    wsService.send({ type: 'interrupt', sessionId: currentSessionId })
  }, [currentSessionId])

  const handleSelectSession = useCallback((id: string) => {
    selectSession(id)
  }, [selectSession])

  const handleRenameSession = useCallback(async (id: string, name: string) => {
    await renameSession(id, name)
  }, [renameSession])

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-base)' }}>
        <div className="text-[var(--text-weak)]">Loading...</div>
      </div>
    )
  }

  // Not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />
  }

  const currentSession = sessions.find(s => s.id === currentSessionId) || null

  return (
    <div className="flex h-screen" style={{ background: 'var(--surface-base)' }}>
      {/* Project icon strip — always visible */}
      <ProjectStrip onSettingsClick={() => setShowUserMgmt(true)} />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Session panel */}
      <div className={`
        fixed inset-y-0 left-16 z-50 lg:relative lg:left-0
        ${sidebarOpen ? 'block' : 'hidden lg:block'}
      `}>
        <SessionPanel
          isOpen={true}
          onToggle={() => setSidebarOpen(false)}
          onSelectSession={(id) => {
            handleSelectSession(id)
            setSidebarOpen(false)
          }}
        />
      </div>

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0">
        <SessionHeader
          session={currentSession}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onRename={handleRenameSession}
        />

        <MessageTimeline />

        {currentSessionId && (
          <PromptDock
            onSubmit={handleSendMessage}
            onInterrupt={handleInterrupt}
            disabled={!currentSessionId || sessionStatus === 'disconnected'}
            isThinking={sessionStatus === 'thinking'}
          />
        )}
      </main>

      {/* User Management dialog */}
      {showUserMgmt && <UserManagement onClose={() => setShowUserMgmt(false)} />}
    </div>
  )
}

export default App
