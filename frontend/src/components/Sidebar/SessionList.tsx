import { useEffect, useState } from 'react'
import { Plus, Trash2, MessageSquare } from 'lucide-react'
import { Button } from '../ui/button'
import { useSessionStore } from '../../stores/sessionStore'
import { useAuthStore } from '../../stores/authStore'
import { NewChatDialog } from './NewChatDialog'
import { cn } from '../../lib/utils'

interface SessionListProps {
  onSelectSession: (id: string) => void
  onClose?: () => void
}

export function SessionList({ onSelectSession, onClose }: SessionListProps) {
  const { sessions, currentSessionId, loadSessions, selectSession, deleteSession } = useSessionStore()
  const { role, displayName, username, logout } = useAuthStore()
  const [showNewChat, setShowNewChat] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleSelect = (id: string) => {
    selectSession(id)
    onSelectSession(id)
    onClose?.()
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Delete this session?')) return
    setDeleting(id)
    try {
      await deleteSession(id)
    } finally {
      setDeleting(null)
    }
  }

  const handleCreated = (id: string) => {
    setShowNewChat(false)
    handleSelect(id)
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-lg">ARCHON</h2>
        <Button variant="ghost" size="icon" onClick={() => setShowNewChat(true)} title="New Chat">
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No sessions yet. Create one to start.
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => handleSelect(s.id)}
            className={cn(
              'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors group border-b border-border/50',
              currentSessionId === s.id && 'bg-accent'
            )}
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate text-sm">{s.name}</span>
                {s.provider === 'openrouter' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 flex-shrink-0">
                    {s.model?.split('/').pop() || 'OpenRouter'}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{formatTime(s.updated_at)}</span>
            </div>
            {(role === 'admin' || !s.owner_id) && (
              <button
                onClick={(e) => handleDelete(e, s.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-destructive"
                disabled={deleting === s.id}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Footer with user info */}
      <div className="p-4 border-t">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="font-medium">{displayName || username || 'Admin'}</span>
            <span className="text-xs text-muted-foreground ml-2 capitalize">{role}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>

      {/* New Chat Dialog */}
      {showNewChat && (
        <NewChatDialog onClose={() => setShowNewChat(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}
