import { useState, type FormEvent } from 'react'
import { useAuthStore } from '../../stores/authStore'

export function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { login, error, isLoading } = useAuthStore()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    await login(username, password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-base)' }}>
      <div className="w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-[var(--accent-primary)] text-white text-3xl font-bold mb-4">
            A
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-strong)]">ARCHON</h1>
          <p className="text-[var(--text-weak)] text-sm mt-1">Claude Code Command Center</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              className="w-full bg-[var(--surface-raised)] border border-[var(--border-base)] rounded-md px-3 py-2.5 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-weak)] outline-none focus:border-[var(--border-focus)]"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full bg-[var(--surface-raised)] border border-[var(--border-base)] rounded-md px-3 py-2.5 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-weak)] outline-none focus:border-[var(--border-focus)]"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--accent-error)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !username || !password}
            className="w-full px-4 py-2.5 rounded-md bg-[var(--accent-primary)] text-white text-sm font-medium hover:bg-[var(--accent-primary)]/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
