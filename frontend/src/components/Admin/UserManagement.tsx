import { useEffect, useState } from 'react'
import { X, Trash2, Plus, Shield, User as UserIcon } from 'lucide-react'
import * as api from '../../services/api'
import type { User } from '../../services/types'

interface UserManagementProps {
  onClose: () => void
}

export function UserManagement({ onClose }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadUsers = async () => {
    try {
      const data = await api.listUsers()
      setUsers(data)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleCreate = async () => {
    if (!newUsername || !newPassword) return
    setCreating(true)
    setError('')
    try {
      await api.createUser(newUsername, newPassword, newDisplayName || undefined, newRole)
      setNewUsername('')
      setNewPassword('')
      setNewDisplayName('')
      setNewRole('user')
      setShowCreate(false)
      loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    try {
      await api.deleteUser(id)
      loadUsers()
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface-raised)] border border-[var(--border-weak)] rounded-lg shadow-2xl w-full max-w-lg p-6 mx-4 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-[var(--text-strong)]">User Management</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--surface-float)] rounded text-[var(--text-weak)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-3 bg-[var(--surface-base)] rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center">
                  {u.role === 'admin' ? (
                    <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-[var(--text-weak)]" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-sm text-[var(--text-strong)]">{u.display_name || u.username}</div>
                  <div className="text-xs text-[var(--text-weak)]">
                    @{u.username}
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                      u.role === 'admin' ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]' : 'bg-[var(--surface-float)] text-[var(--text-weak)]'
                    }`}>
                      {u.role}
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(u.id, u.username)} className="p-1 text-[var(--text-weak)] hover:text-[var(--accent-error)]">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {users.length === 0 && (
            <div className="text-center text-[var(--text-weak)] text-sm py-8">No users yet</div>
          )}
        </div>

        {/* Create user form */}
        {showCreate ? (
          <div className="space-y-3 border-t border-[var(--border-weak)] pt-4">
            <input placeholder="Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} autoFocus
              className="w-full bg-[var(--surface-base)] border border-[var(--border-base)] rounded-md px-3 py-2 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-weak)] outline-none focus:border-[var(--border-focus)]" />
            <input placeholder="Display Name (optional)" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)}
              className="w-full bg-[var(--surface-base)] border border-[var(--border-base)] rounded-md px-3 py-2 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-weak)] outline-none focus:border-[var(--border-focus)]" />
            <input type="password" placeholder="Password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full bg-[var(--surface-base)] border border-[var(--border-base)] rounded-md px-3 py-2 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-weak)] outline-none focus:border-[var(--border-focus)]" />
            <select value={newRole} onChange={e => setNewRole(e.target.value)}
              className="w-full bg-[var(--surface-base)] border border-[var(--border-base)] rounded-md px-3 py-2 text-sm text-[var(--text-strong)] outline-none focus:border-[var(--border-focus)]">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            {error && <p className="text-sm text-[var(--accent-error)]">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2 rounded-md border border-[var(--border-base)] text-sm text-[var(--text-base)] hover:bg-[var(--surface-float)]">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={!newUsername || !newPassword || creating}
                className="flex-1 px-4 py-2 rounded-md bg-[var(--accent-primary)] text-white text-sm hover:bg-[var(--accent-primary)]/80 disabled:opacity-30 disabled:cursor-not-allowed">
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowCreate(true)}
            className="w-full px-4 py-2 rounded-md bg-[var(--accent-primary)] text-white text-sm font-medium hover:bg-[var(--accent-primary)]/80 flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            Add User
          </button>
        )}
      </div>
    </div>
  )
}
