import { useEffect, useState } from 'react'
import { Plus, Settings, LogOut } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { useAuthStore } from '../../stores/authStore'
import { NewProjectDialog } from './NewProjectDialog'
import { cn } from '../../lib/utils'

interface ProjectStripProps {
  onSettingsClick: () => void
}

export function ProjectStrip({ onSettingsClick }: ProjectStripProps) {
  const { projects, activeProjectId, loadProjects, selectProject } = useProjectStore()
  const { displayName, username, role, logout } = useAuthStore()
  const [showNewProject, setShowNewProject] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleCreated = (id: string) => {
    setShowNewProject(false)
    selectProject(id)
  }

  const initial = (displayName || username || 'U')[0].toUpperCase()

  return (
    <>
      <div className="flex flex-col items-center w-16 bg-[var(--sidebar)] border-r border-[var(--border-weak)] py-3 flex-shrink-0">
        {/* Project icons */}
        <div className="flex-1 flex flex-col items-center gap-1.5 overflow-y-auto w-full px-2">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => selectProject(project.id)}
              title={project.name}
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold transition-all flex-shrink-0',
                activeProjectId === project.id
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--surface-raised)] text-[var(--text-weak)] hover:text-[var(--text-base)] hover:bg-[var(--surface-float)]'
              )}
            >
              {project.icon || project.name[0]?.toUpperCase() || '?'}
            </button>
          ))}

          {/* "All Sessions" option */}
          <button
            onClick={() => selectProject(null)}
            title="All Sessions"
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center text-xs font-medium transition-all flex-shrink-0',
              activeProjectId === null
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--surface-raised)] text-[var(--text-weak)] hover:text-[var(--text-base)] hover:bg-[var(--surface-float)]'
            )}
          >
            All
          </button>

          {/* New project button */}
          <button
            onClick={() => setShowNewProject(true)}
            title="New Project"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-weak)] hover:text-[var(--text-base)] hover:bg-[var(--surface-float)] transition-all flex-shrink-0 mt-1 border border-dashed border-[var(--border-base)]"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom section: settings + user */}
        <div className="flex flex-col items-center gap-2 pt-3 border-t border-[var(--border-weak)] w-full px-2">
          {role === 'admin' && (
            <button
              onClick={onSettingsClick}
              title="Settings"
              className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-weak)] hover:text-[var(--text-base)] hover:bg-[var(--surface-float)] transition-all"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={logout}
            title="Sign out"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-weak)] hover:text-[var(--text-base)] hover:bg-[var(--surface-float)] transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <div
            title={`${displayName || username} (${role})`}
            className="w-10 h-10 rounded-full bg-[var(--accent-primary)]/20 flex items-center justify-center text-sm font-semibold text-[var(--accent-primary)]"
          >
            {initial}
          </div>
        </div>
      </div>

      {showNewProject && (
        <NewProjectDialog onClose={() => setShowNewProject(false)} onCreated={handleCreated} />
      )}
    </>
  )
}
