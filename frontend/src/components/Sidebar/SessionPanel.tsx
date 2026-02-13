import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronLeft } from 'lucide-react'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import { useAuthStore } from '../../stores/authStore'
import { NewChatDialog } from './NewChatDialog'
import { cn } from '../../lib/utils'

interface SessionPanelProps {
  isOpen: boolean
  onToggle: () => void
  onSelectSession: (id: string) => void
}

export function SessionPanel({ isOpen, onToggle, onSelectSession }: SessionPanelProps) {
  const { sessions, currentSessionId, loadSessions, selectSession, deleteSession } = useSessionStore()
  const { projects, activeProjectId, deleteProject, selectProject } = useProjectStore()
  const { role } = useAuthStore()
  const [showNewChat, setShowNewChat] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false)
  const activeProject = projects.find(p => p.id === activeProjectId)

  const handleDeleteProject = async () => {
    if (!activeProjectId) return
    await deleteProject(activeProjectId)
    selectProject(null)
    setConfirmDeleteProject(false)
  }

  // Filter sessions by active project
  const filteredSessions = activeProjectId === null
    ? sessions
    : sessions.filter(s => s.project_id === activeProjectId)

  const handleSelect = (id: string) => {
    selectSession(id)
    onSelectSession(id)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
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

  const getStatusDot = (s: { status: string; provider: string }) => {
    if (s.status === 'archived') return 'bg-[var(--text-weak)]'
    if (s.provider === 'claude') return 'bg-[var(--accent-success)]'
    return 'bg-[var(--accent-primary)]'
  }

  if (!isOpen) return null

  return (
    <div className="flex flex-col w-72 bg-[var(--surface-raised)] border-r border-[var(--border-weak)] flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-weak)]">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onToggle} className="text-[var(--text-weak)] hover:text-[var(--text-base)] lg:hidden">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="font-semibold text-sm text-[var(--text-strong)] truncate">
            {activeProject ? activeProject.name : 'All Sessions'}
          </h2>
          {activeProject && !confirmDeleteProject && (
            <button
              onClick={() => setConfirmDeleteProject(true)}
              title="Delete project"
              className="p-1 text-[var(--text-weak)] hover:text-[var(--accent-error)] transition-colors flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {confirmDeleteProject && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleDeleteProject}
                className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent-error)] text-white hover:bg-[var(--accent-error)]/80"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDeleteProject(false)}
                className="text-[10px] px-2 py-0.5 rounded bg-[var(--surface-float)] text-[var(--text-weak)] hover:text-[var(--text-base)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowNewChat(true)}
          title="New Session"
          className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-weak)] hover:text-[var(--text-base)] hover:bg-[var(--surface-float)] transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {filteredSessions.length === 0 && (
          <div className="px-4 py-8 text-center text-[var(--text-weak)] text-sm">
            No sessions yet
          </div>
        )}
        {filteredSessions.map((s) => (
          <div
            key={s.id}
            onClick={() => handleSelect(s.id)}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors group',
              currentSessionId === s.id
                ? 'bg-[var(--surface-float)]'
                : 'hover:bg-[var(--surface-base)]/50'
            )}
          >
            {/* Status dot */}
            <div className={cn('w-2 h-2 rounded-full flex-shrink-0', getStatusDot(s))} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-strong)] truncate">{s.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {s.model && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-float)] text-[var(--text-weak)]">
                    {s.model?.split('/').pop() || s.provider}
                  </span>
                )}
                {!s.model && s.provider === 'claude' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-float)] text-[var(--text-weak)]">
                    Claude Code
                  </span>
                )}
                <span className="text-[10px] text-[var(--text-weak)]">{formatTime(s.updated_at)}</span>
              </div>
            </div>

            {(role === 'admin' || !s.owner_id) && (
              <button
                onClick={(e) => handleDelete(e, s.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[var(--text-weak)] hover:text-[var(--accent-error)]"
                disabled={deleting === s.id}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* New Chat Dialog */}
      {showNewChat && (
        <NewChatDialog onClose={() => setShowNewChat(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}
