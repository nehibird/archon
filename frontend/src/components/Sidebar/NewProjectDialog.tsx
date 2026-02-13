import { useState, type FormEvent } from 'react'
import { X, Folder } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { FolderBrowser } from './FolderBrowser'

interface NewProjectDialogProps {
  onClose: () => void
  onCreated: (id: string) => void
}

export function NewProjectDialog({ onClose, onCreated }: NewProjectDialogProps) {
  const [name, setName] = useState('')
  const [workingDir, setWorkingDir] = useState('')
  const [showBrowser, setShowBrowser] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const { createProject, selectProject } = useProjectStore()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !workingDir.trim()) return
    setIsCreating(true)
    try {
      const project = await createProject(name.trim(), workingDir.trim())
      selectProject(project.id)
      onCreated(project.id)
    } catch (err) {
      console.error('Failed to create project:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleFolderSelect = (path: string) => {
    setWorkingDir(path)
    setShowBrowser(false)
    // Auto-fill name from directory basename if empty
    if (!name.trim()) {
      const basename = path.split('/').filter(Boolean).pop() || ''
      setName(basename)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-[var(--surface-raised)] rounded-lg border border-[var(--border-weak)] shadow-2xl w-full max-w-md p-6 mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-[var(--text-strong)]">New Project</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--surface-float)] rounded text-[var(--text-weak)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-weak)] mb-1 block">
              Project Folder <span className="text-[var(--accent-error)]">*</span>
            </label>
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
                onSelect={handleFolderSelect}
                onCancel={() => setShowBrowser(false)}
              />
            )}
            {!workingDir.trim() && !showBrowser && (
              <p className="text-[10px] text-[var(--accent-error)]/70 mt-1">Required — choose where this project lives on disk</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-weak)] mb-1 block">Project Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-filled from folder name"
              autoFocus
              className="w-full bg-[var(--surface-base)] border border-[var(--border-base)] rounded-md px-3 py-2 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-weak)] outline-none focus:border-[var(--border-focus)]"
            />
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
              disabled={!name.trim() || !workingDir.trim() || isCreating}
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
