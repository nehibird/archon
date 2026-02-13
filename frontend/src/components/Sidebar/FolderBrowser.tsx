import { useState } from 'react'
import { Folder, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import * as api from '../../services/api'

interface FolderBrowserProps {
  initialPath?: string
  onSelect: (path: string) => void
  onCancel: () => void
}

export function FolderBrowser({ initialPath, onSelect, onCancel }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [dirs, setDirs] = useState<{ name: string; path: string }[]>([])
  const [parent, setParent] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const browseTo = async (path?: string) => {
    try {
      const result = await api.browse(path)
      setCurrentPath(result.current)
      setDirs(result.dirs)
      setParent(result.parent)
      setLoaded(true)
    } catch {
      // Access denied or error
    }
  }

  // Auto-load on first render
  if (!loaded) {
    browseTo(initialPath || undefined)
  }

  const pathParts = currentPath.split('/').filter(Boolean)

  return (
    <div className="border border-[var(--border-focus)] rounded-lg overflow-hidden bg-[var(--surface-base)]">
      {/* Breadcrumb header */}
      <div className="px-3 py-2 border-b border-[var(--border-weak)] bg-[var(--surface-raised)] flex items-center gap-1 text-xs text-[var(--text-weak)] overflow-x-auto">
        <span className="font-mono truncate flex-1">{currentPath || '/'}</span>
      </div>

      {/* Directory listing */}
      <div className="max-h-52 overflow-y-auto">
        {parent && (
          <div
            className="px-3 py-2.5 hover:bg-[var(--surface-float)] cursor-pointer text-sm flex items-center gap-2 text-[var(--text-base)] border-b border-[var(--border-weak)]/50"
            onClick={() => browseTo(parent)}
          >
            <ChevronLeft className="w-3.5 h-3.5 text-[var(--text-weak)]" />
            <span className="text-[var(--text-weak)]">..</span>
          </div>
        )}
        {dirs.map((d) => (
          <div
            key={d.path}
            className="group flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-float)] border-b border-[var(--border-weak)]/30 last:border-b-0"
          >
            {/* Clicking folder name navigates into it */}
            <div
              className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
              onClick={() => browseTo(d.path)}
            >
              <Folder className="w-3.5 h-3.5 text-[var(--text-weak)] flex-shrink-0" />
              <span className="text-sm text-[var(--text-base)] truncate">{d.name}</span>
              <ChevronRight className="w-3 h-3 text-[var(--text-weak)] opacity-0 group-hover:opacity-100 flex-shrink-0" />
            </div>
            {/* Use button to select this specific directory */}
            <button
              type="button"
              onClick={() => onSelect(d.path)}
              className="opacity-0 group-hover:opacity-100 text-[10px] px-2 py-1 rounded bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/80 flex-shrink-0 transition-opacity"
            >
              Use
            </button>
          </div>
        ))}
        {dirs.length === 0 && loaded && (
          <div className="p-4 text-sm text-[var(--text-weak)] text-center">Empty directory</div>
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div className="px-3 py-2.5 border-t border-[var(--border-weak)] bg-[var(--surface-raised)] flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs text-[var(--text-weak)] hover:text-[var(--text-base)] hover:bg-[var(--surface-float)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSelect(currentPath)}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--accent-primary)] text-white text-xs font-medium hover:bg-[var(--accent-primary)]/80 transition-colors flex items-center justify-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          Use This Folder
        </button>
      </div>
    </div>
  )
}
