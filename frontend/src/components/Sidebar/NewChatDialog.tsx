import { useState, useEffect, type FormEvent } from 'react'
import { X, Folder } from 'lucide-react'
import { useSessionStore } from '../../stores/sessionStore'
import { useProjectStore } from '../../stores/projectStore'
import { useModelStore } from '../../stores/modelStore'
import { FolderBrowser } from './FolderBrowser'

interface NewChatDialogProps {
  onClose: () => void
  onCreated: (id: string) => void
}

export function NewChatDialog({ onClose, onCreated }: NewChatDialogProps) {
  const [name, setName] = useState('')
  const [selectedModel, setSelectedModel] = useState('claude')
  const [isCreating, setIsCreating] = useState(false)
  const [workingDir, setWorkingDir] = useState('')
  const [showBrowser, setShowBrowser] = useState(false)

  const { createSession } = useSessionStore()
  const { projects, activeProjectId, loadProjects } = useProjectStore()
  const { models, fetchModels } = useModelStore()

  const activeProject = projects.find(p => p.id === activeProjectId)

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  // Pre-fill working dir from active project
  useEffect(() => {
    if (activeProject?.working_dir) {
      setWorkingDir(activeProject.working_dir)
    }
  }, [activeProject])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsCreating(true)
    try {
      const model = models.find(m => m.id === selectedModel)
      const provider = model?.provider || 'claude'
      const session = await createSession(
        name.trim(),
        workingDir || undefined,
        provider,
        selectedModel === 'claude' ? undefined : selectedModel,
        activeProjectId || undefined,
      )
      loadProjects()
      onCreated(session.id)
    } catch (err) {
      console.error('Failed to create session:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const claudeModels = models.filter(m => m.provider === 'claude')
  const openRouterModels = models.filter(m => m.provider === 'openrouter')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-[var(--surface-raised)] rounded-lg border border-[var(--border-weak)] shadow-2xl w-full max-w-md p-6 mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-sm text-[var(--text-strong)]">New Session</h3>
            {activeProject && (
              <p className="text-[10px] text-[var(--text-weak)] mt-0.5">
                in {activeProject.name} {activeProject.working_dir ? `(${activeProject.working_dir})` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--surface-float)] rounded text-[var(--text-weak)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-weak)] mb-1 block">Session Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bug Fix, Feature Work..."
              autoFocus
              className="w-full bg-[var(--surface-base)] border border-[var(--border-base)] rounded-md px-3 py-2 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-weak)] outline-none focus:border-[var(--border-focus)]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-weak)] mb-1 block">Working Directory</label>
            {!showBrowser ? (
              <div className="flex gap-2">
                <input
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  placeholder="/path/to/project"
                  className="flex-1 bg-[var(--surface-base)] border border-[var(--border-base)] rounded-md px-3 py-2 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-weak)] outline-none focus:border-[var(--border-focus)] font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowBrowser(true)}
                  className="px-3 h-9 rounded-md border border-[var(--border-base)] flex items-center gap-1.5 text-xs text-[var(--text-weak)] hover:text-[var(--text-base)] hover:bg-[var(--surface-float)]"
                >
                  <Folder className="w-3.5 h-3.5" />
                  Browse
                </button>
              </div>
            ) : (
              <FolderBrowser
                initialPath={workingDir || undefined}
                onSelect={(path) => { setWorkingDir(path); setShowBrowser(false) }}
                onCancel={() => setShowBrowser(false)}
              />
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-weak)] mb-1 block">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-[var(--surface-base)] border border-[var(--border-base)] rounded-md px-3 py-2 text-sm text-[var(--text-strong)] outline-none focus:border-[var(--border-focus)]"
            >
              {claudeModels.length > 0 && (
                <optgroup label="Claude Code">
                  {claudeModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              )}
              {openRouterModels.length > 0 && (
                <optgroup label="OpenRouter">
                  {openRouterModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {selectedModel === 'claude' && (
              <p className="text-[10px] text-[var(--text-weak)] mt-1">Full agent with file access and tool use</p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-md border border-[var(--border-base)] text-sm text-[var(--text-base)] hover:bg-[var(--surface-float)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCreating}
              className="flex-1 px-4 py-2 rounded-md bg-[var(--accent-primary)] text-white text-sm hover:bg-[var(--accent-primary)]/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
