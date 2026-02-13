import { useState, useCallback } from 'react'
import { PanelLeft } from 'lucide-react'
import { useMessageStore } from '../../stores/messageStore'
import type { Session } from '../../services/types'

interface SessionHeaderProps {
  session: Session | null
  onToggleSidebar: () => void
  onRename?: (id: string, name: string) => Promise<void>
}

export function SessionHeader({ session, onToggleSidebar, onRename }: SessionHeaderProps) {
  const { sessionStatus } = useMessageStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')

  const handleStartEdit = useCallback(() => {
    if (!session) return
    setEditName(session.name)
    setIsEditing(true)
  }, [session])

  const handleSaveEdit = useCallback(async () => {
    setIsEditing(false)
    if (!session || !editName.trim() || editName.trim() === session.name) return
    if (onRename) {
      await onRename(session.id, editName.trim())
    }
  }, [session, editName, onRename])

  const modelLabel = session?.model?.split('/').pop() || (session?.provider === 'claude' ? 'Claude Code' : null)

  return (
    <header className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-weak)] bg-[var(--surface-base)] flex-shrink-0">
      <button
        onClick={onToggleSidebar}
        className="w-8 h-8 rounded flex items-center justify-center text-[var(--text-weak)] hover:text-[var(--text-base)] hover:bg-[var(--surface-raised)] transition-colors lg:hidden"
      >
        <PanelLeft className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {session ? (
          <>
            {isEditing ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                className="text-sm font-medium bg-transparent border-b border-[var(--border-focus)] text-[var(--text-strong)] outline-none"
              />
            ) : (
              <span
                onClick={handleStartEdit}
                className="text-sm font-medium text-[var(--text-strong)] truncate cursor-pointer hover:text-[var(--accent-primary)]"
              >
                {session.name}
              </span>
            )}

            {modelLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-weak)] flex-shrink-0">
                {modelLabel}
              </span>
            )}

            {sessionStatus === 'thinking' && (
              <div className="flex items-center gap-1 ml-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse [animation-delay:300ms]" />
              </div>
            )}

            {sessionStatus === 'disconnected' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-error)]/20 text-[var(--accent-error)]">
                Disconnected
              </span>
            )}
          </>
        ) : (
          <span className="text-sm font-medium text-[var(--text-weak)]">ARCHON</span>
        )}
      </div>
    </header>
  )
}
