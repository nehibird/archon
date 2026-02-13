import type { Session, Project, ModelOption, MeResponse, User } from './types'

const BASE = ''  // same-origin

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    const err = new Error(body.error || `HTTP ${res.status}`) as Error & { statusCode: number }
    err.statusCode = res.status
    throw err
  }
  return res.json()
}

// Auth
export const login = (username: string, password: string) =>
  request<{ ok: boolean; role: string; displayName?: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const loginWithToken = (token: string) =>
  request<{ ok: boolean; role: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })

export const logout = () =>
  request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })

export const getMe = () =>
  request<MeResponse>('/api/me')

// Projects
export const listProjects = () =>
  request<Project[]>('/api/projects')

export const createProject = (name: string, workingDir?: string, icon?: string) =>
  request<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name, working_dir: workingDir, icon }),
  })

export const updateProject = (id: string, fields: Partial<{ name: string; icon: string; sort_order: number }>) =>
  request<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })

export const deleteProject = (id: string) =>
  request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' })

// Sessions
export const listSessions = () =>
  request<Session[]>('/api/sessions')

export const createSession = (name: string, workingDir?: string, provider?: string, model?: string, projectId?: string) =>
  request<Session>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ name, working_dir: workingDir, provider, model, project_id: projectId }),
  })

export const getSession = (id: string) =>
  request<Session>(`/api/sessions/${id}`)

export const updateSession = (id: string, fields: Partial<{ name: string; status: string }>) =>
  request<Session>(`/api/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })

export const deleteSession = (id: string) =>
  request<{ ok: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' })

// Messages
export const getMessages = (sessionId: string, limit = 100, offset = 0) =>
  request<{ messages: Array<{ id: number; session_id: string; role: string; content: string; tool_calls: string | null; created_at: string }>; total: number }>(
    `/api/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`
  )

// Models
export const getModels = () =>
  request<ModelOption[]>('/api/models')

// Browse
export const browse = (path?: string) =>
  request<{ current: string; parent: string | null; dirs: Array<{ name: string; path: string }> }>(
    `/api/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`
  )

// Users (admin)
export const listUsers = () => request<User[]>('/api/users')
export const createUser = (username: string, password: string, displayName?: string, role?: string) =>
  request<User>('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, displayName, role }),
  })
export const updateUser = (id: string, fields: Partial<{ display_name: string; role: string; password: string }>) =>
  request<User>(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
export const deleteUser = (id: string) =>
  request<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' })

// Tokens (admin)
export const listTokens = () =>
  request<Array<{ id: string; name: string; permissions: string; allowed_sessions: string[] | null; created_at: string }>>('/api/tokens')
export const createToken = (name: string, permissions = 'read_write') =>
  request<{ id: string; token: string; name: string }>('/api/tokens', {
    method: 'POST',
    body: JSON.stringify({ name, permissions }),
  })
export const deleteToken = (id: string) =>
  request<{ ok: boolean }>(`/api/tokens/${id}`, { method: 'DELETE' })
